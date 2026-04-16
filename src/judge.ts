import { Provider } from "./providers/base.js";
import { loadPrompt } from "./prompts.js";
import { Extraction } from "./extractor.js";

export interface JudgeVote {
  provider: string;
  credibilityScore: number;
  verdict: string;
  redFlags: { zh: string; en: string }[];
  elderExplanation: { zh: string; en: string };
  actionSuggestion: { zh: string; en: string };
  summary: { zh: string; en: string };
}

export interface AnalysisResult {
  credibilityScore: number;
  verdict: "safe" | "suspicious" | "misinformation" | "scam";
  redFlags: { zh: string; en: string }[];
  elderExplanation: { zh: string; en: string };
  actionSuggestion: { zh: string; en: string };
  summary: { zh: string; en: string };
}

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
  throw new Error("No JSON object found in response");
}

function buildJudgeSystemPrompt(): string {
  const redFlagsPrompt = loadPrompt("judge_red_flags");
  const factCheckPrompt = loadPrompt("judge_fact_check");
  const explanationPrompt = loadPrompt("judge_explanation");
  const verdictPrompt = loadPrompt("judge_verdict");

  return `You are a member of a digital-safety panel helping families identify misinformation targeting elderly internet users.

You must perform FOUR sub-tasks in a single JSON response:

1. RED FLAGS (${redFlagsPrompt.split("\n")[2]})
2. FACT CHECK (${factCheckPrompt.split("\n")[2]})
3. EXPLANATION (${explanationPrompt.split("\n")[2]})
4. VERDICT (${verdictPrompt.split("\n")[2]})

Output strictly valid JSON in this exact format:
{
  "redFlags": [
    { "zh": "...", "en": "..." }
  ],
  "claimChecks": [
    { "claim": "...", "status": "true|false|unverified|misleading", "reasonZh": "...", "reasonEn": "..." }
  ],
  "overallFactStatus": "mostly_true|mixed|mostly_false|unverifiable",
  "elderExplanation": { "zh": "...", "en": "..." },
  "actionSuggestion": { "zh": "...", "en": "..." },
  "credibilityScore": 0-100,
  "verdict": "safe|suspicious|misinformation|scam",
  "summary": { "zh": "...", "en": "..." }
}

No markdown code blocks, no extra text before or after.`;
}

export async function runJudge(
  provider: Provider,
  originalText: string,
  extraction: Extraction,
  supplementary?: string,
  sessionContext?: string
): Promise<JudgeVote> {
  const systemPrompt = buildJudgeSystemPrompt();

  let userContent = "";
  if (sessionContext) {
    userContent += `## Conversation Context\n${sessionContext}\n\n`;
  }
  userContent += `## Original Message\n${originalText}\n\n`;
  userContent += `## Structured Extraction\n${JSON.stringify(extraction, null, 2)}\n\n`;
  if (supplementary) {
    userContent += `## Supplementary User Answers\n${supplementary}\n\n`;
  }
  userContent += "Please analyze the above message based on the structured extraction and return JSON only.";

  const raw = await provider.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
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

function normalizeFlagKey(zh: string): string {
  return zh
    .replace(/[\s"'「」【】]/g, "")
    .replace(/专家/g, "")
    .replace(/群里/g, "")
    .replace(/转发/g, "")
    .slice(0, 25);
}

function dedupeFlags(
  flags: { zh: string; en: string }[],
  max = 6
): { zh: string; en: string }[] {
  const seen = new Set<string>();
  const out: { zh: string; en: string }[] = [];
  for (const f of flags) {
    const key = normalizeFlagKey(f.zh);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
    if (out.length >= max) break;
  }
  return out;
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

  const bestElder = votes.reduce((best, v) =>
    v.elderExplanation.zh.length > best.elderExplanation.zh.length ? v : best
  );

  const bestAction = votes.reduce((best, v) =>
    v.actionSuggestion.zh.length > best.actionSuggestion.zh.length ? v : best
  );

  const bestSummary = votes.reduce((best, v) =>
    v.summary.zh.length > best.summary.zh.length ? v : best
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
