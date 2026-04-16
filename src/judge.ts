import { Provider, ChatMessage } from "./providers/base.js";
import { AnalysisResult } from "./analyzer.js";

export interface JudgeVote {
  provider: string;
  credibilityScore: number;
  verdict: string;
  redFlags: { zh: string; en: string }[];
  elderExplanation: { zh: string; en: string };
  actionSuggestion: { zh: string; en: string };
  summary: { zh: string; en: string };
}

const systemPrompt = `You are one member of a digital-safety panel helping families identify misinformation targeting elderly internet users.

Your task: analyze the submitted content and return strictly valid JSON.
Be concise but specific. Focus on manipulation tactics visible IN THE TEXT (fake experts, pseudo-science, urgency, fear, bandwagon, scams, etc.).

Output format:
{
  "credibilityScore": number 0-100,
  "verdict": one of ["safe", "suspicious", "misinformation", "scam"],
  "redFlags": [
    { "zh": "中文疑点", "en": "English red flag" }
  ],
  "elderExplanation": {
    "zh": "一句可以直接发给老人的温暖解释（30-60字）",
    "en": "A warm, plain-language sentence for the elder (30-60 words)"
  },
  "actionSuggestion": {
    "zh": "建议晚辈的下一步行动",
    "en": "Suggested next step for family member"
  },
  "summary": {
    "zh": "简短中文总结",
    "en": "Brief English summary"
  }
}

Output ONLY JSON. No markdown code blocks, no extra text.`;

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
  throw new Error("No JSON object found");
}

export async function runSingleJudge(
  provider: Provider,
  content: string
): Promise<JudgeVote> {
  const raw = await provider.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: `Analyze the following content and return JSON only.\n\n---\n${content}\n---` },
  ]);

  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);

  return {
    provider: provider.name,
    credibilityScore:
      typeof parsed.credibilityScore === "number"
        ? Math.max(0, Math.min(100, Math.round(parsed.credibilityScore)))
        : 50,
    verdict: ["safe", "suspicious", "misinformation", "scam"].includes(parsed.verdict)
      ? parsed.verdict
      : "suspicious",
    redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
    elderExplanation: parsed.elderExplanation || {
      zh: "请谨慎对待该内容。",
      en: "Please treat this content with caution.",
    },
    actionSuggestion: parsed.actionSuggestion || {
      zh: "与家人讨论后再做决定。",
      en: "Discuss with family before acting.",
    },
    summary: parsed.summary || {
      zh: "无法生成总结。",
      en: "Unable to generate summary.",
    },
  };
}

function countVotes<T extends string>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }
  let best = items[0];
  let bestCount = 0;
  for (const [item, count] of counts.entries()) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

function trimmedMean(scores: number[]): number {
  if (scores.length <= 2) {
    return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const trimmed = sorted.slice(1, -1);
  return Math.round(trimmed.reduce((a, b) => a + b, 0) / trimmed.length);
}

function dedupeFlags(
  flags: { zh: string; en: string }[]
): { zh: string; en: string }[] {
  const seen = new Set<string>();
  return flags.filter((f) => {
    const key = f.zh.slice(0, 20);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function ensemble(votes: JudgeVote[]): AnalysisResult {
  if (votes.length === 0) {
    throw new Error("No judge votes to ensemble");
  }
  if (votes.length === 1) {
    const v = votes[0];
    return {
      credibilityScore: v.credibilityScore,
      verdict: v.verdict as AnalysisResult["verdict"],
      redFlags: v.redFlags,
      elderExplanation: v.elderExplanation,
      actionSuggestion: v.actionSuggestion,
      summary: v.summary,
    };
  }

  const score = trimmedMean(votes.map((v) => v.credibilityScore));
  const verdict = countVotes(votes.map((v) => v.verdict)) as AnalysisResult["verdict"];
  const redFlags = dedupeFlags(votes.flatMap((v) => v.redFlags));

  // Pick the longest elderExplanation as the most informative
  const bestElder = votes.reduce((best, v) =>
    v.elderExplanation.zh.length > best.elderExplanation.zh.length
      ? v
      : best
  );

  const bestAction = votes.reduce((best, v) =>
    v.actionSuggestion.zh.length > best.actionSuggestion.zh.length
      ? v
      : best
  );

  const bestSummary = votes.reduce((best, v) =>
    v.summary.zh.length > best.summary.zh.length
      ? v
      : best
  );

  return {
    credibilityScore: score,
    verdict,
    redFlags,
    elderExplanation: bestElder.elderExplanation,
    actionSuggestion: bestAction.actionSuggestion,
    summary: bestSummary.summary,
  };
}
