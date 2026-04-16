import OpenAI from "openai";
import { chatCompletion } from "./llm.js";
import { Config } from "./config.js";

export interface AnalysisResult {
  credibilityScore: number; // 0-100
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
`;

export async function analyzeContent(
  client: OpenAI,
  config: Config,
  content: string
): Promise<AnalysisResult> {
  const res = await chatCompletion(client, config.model, [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Please analyze the following content and return JSON only.\n\n---\n${content}\n---`,
    },
  ]);

  try {
    const parsed = JSON.parse(res) as AnalysisResult;
    // Normalize score
    if (typeof parsed.credibilityScore !== "number") {
      parsed.credibilityScore = 50;
    }
    parsed.credibilityScore = Math.max(0, Math.min(100, Math.round(parsed.credibilityScore)));
    return parsed;
  } catch (e) {
    throw new Error("Failed to parse LLM response as JSON.\n" + res);
  }
}
