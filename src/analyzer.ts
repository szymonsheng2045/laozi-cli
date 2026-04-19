import { Provider } from "./providers/base.js";
import { Config } from "./config.js";

export interface AnalysisResult {
  credibilityScore: number;
  verdict: "safe" | "suspicious" | "misinformation" | "scam";
  redFlags: { zh: string; en: string }[];
  elderExplanation: { zh: string; en: string };
  actionSuggestion: { zh: string; en: string };
  summary: { zh: string; en: string };
}

const systemPrompt = `You are a digital safety assistant for families. Your job is to analyze messages, articles, or voice transcripts that elderly people (60+) might encounter on the Chinese internet (WeChat, Douyin, short videos, health groups, etc.).

You must output strictly valid JSON with the following structure:
{
  "credibilityScore": number from 0 to 100,
  "verdict": one of ["safe", "suspicious", "misinformation", "scam"],
  "redFlags": [
    { "zh": "简短的中文疑点说明", "en": "Short English explanation of the red flag" }
  ],
  "elderExplanation": {
    "zh": "一句温暖、通俗、可以直接转发给老人的中文解释（30-60字）",
    "en": "A warm, plain-language English sentence that a grandchild could read to an elderly person (30-60 words)"
  },
  "actionSuggestion": {
    "zh": "建议晚辈采取的下一步行动",
    "en": "Suggested next step for the family member"
  },
  "summary": {
    "zh": "对整段内容的简短中文总结",
    "en": "Brief English summary of the overall content"
  }
}

Guidelines:
- Be kind but firm. Do not fear-monger.
- redFlags should identify specific manipulation tactics (e.g. fake experts, emotional blackmail, pseudo-science, urgency, "everyone is doing it").
- elderExplanation must be suitable to copy-paste into a family chat. Use simple vocabulary. Avoid medical or legal jargon unless you explain it.
- If the content is safe, still give a brief reassuring summary.

Output ONLY the JSON. No markdown code blocks, no extra text before or after.`;

function extractJson(raw: string): string {
  // Try direct parse first
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  // Try extracting from markdown code block
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    const inner = codeBlockMatch[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  // Try finding first { and last }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("No JSON object found in response");
}

function normalizeResult(parsed: Record<string, unknown>): AnalysisResult {
  const score = typeof parsed.credibilityScore === "number" ? parsed.credibilityScore : 50;
  const verdictStr = typeof parsed.verdict === "string" ? parsed.verdict : "";
  const verdict: AnalysisResult["verdict"] = ["safe", "suspicious", "misinformation", "scam"].includes(verdictStr)
    ? (verdictStr as AnalysisResult["verdict"])
    : "suspicious";

  const safeObj = (v: unknown): { zh: string; en: string } => {
    if (v && typeof v === "object" && "zh" in v && "en" in v) {
      const o = v as Record<string, unknown>;
      return { zh: String(o.zh), en: String(o.en) };
    }
    return { zh: "", en: "" };
  };

  return {
    credibilityScore: Math.max(0, Math.min(100, Math.round(score))),
    verdict,
    redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
    elderExplanation: safeObj(parsed.elderExplanation) || { zh: "请谨慎对待该内容。", en: "Please treat this content with caution." },
    actionSuggestion: safeObj(parsed.actionSuggestion) || { zh: "与家人讨论后再做决定。", en: "Discuss with family before acting." },
    summary: safeObj(parsed.summary) || { zh: "无法生成总结。", en: "Unable to generate summary." },
  };
}

export async function analyzeContent(
  provider: Provider,
  config: Config,
  content: string
): Promise<AnalysisResult> {
  const raw = await provider.chat([
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Please analyze the following content and return JSON only.\n\n---\n${content}\n---`,
    },
  ]);

  try {
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr);
    return normalizeResult(parsed);
  } catch (e: any) {
    // Fallback: if JSON parse fails, try to use regex extraction as a last resort
    throw new Error("Failed to parse model response as JSON.\nRaw response:\n" + raw);
  }
}
