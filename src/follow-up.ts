import { Provider } from "./providers/base.js";
import { Extraction } from "./extractor.js";
import { AnalysisResult } from "./judge.js";

const FOLLOW_UP_SYSTEM = `你是一个耐心的数字安全顾问。老人（或其家人）基于刚才的分析结果提出了追问，请直接、简洁、温暖地回答。

要求：
- 回答要口语化，像在和老人聊天
- 如果有不确定的地方，诚实说"这个我不太确定"
- 不要重复之前已经说过的内容
- 中文回答控制在 100 字以内，不要太长
- 如果用户的问题和之前分析无关，礼貌地引导回正题

输出格式：
{
  "answerZh": "中文回答",
  "answerEn": "English translation",
  "needsMoreContext": false
}`;

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) {
    const inner = block[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("No JSON found");
}

export interface FollowUpAnswer {
  answerZh: string;
  answerEn: string;
  needsMoreContext: boolean;
}

export async function runFollowUp(
  provider: Provider,
  originalText: string,
  extraction: Extraction,
  previousResult: AnalysisResult,
  followUpQuestion: string,
  round: number
): Promise<FollowUpAnswer> {
  const userContent = `## 原始消息
${originalText}

## 结构化提取
${JSON.stringify(extraction, null, 2)}

## 上一轮分析结论
- 可信度：${previousResult.credibilityScore}/100
- 判定：${previousResult.verdict}
- 疑点：${previousResult.redFlags.map((f) => f.zh).join("；")}

## 追问（第 ${round} 轮）
${followUpQuestion}

请回答老人的追问。`;

  const raw = await provider.chat([
    { role: "system", content: FOLLOW_UP_SYSTEM },
    { role: "user", content: userContent },
  ]);

  try {
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr);
    return {
      answerZh: parsed.answerZh || "让我再想想这个问题。",
      answerEn: parsed.answerEn || "Let me think about this.",
      needsMoreContext: !!parsed.needsMoreContext,
    };
  } catch {
    // Fallback: treat raw text as answer
    return {
      answerZh: raw.trim().slice(0, 200),
      answerEn: "",
      needsMoreContext: false,
    };
  }
}
