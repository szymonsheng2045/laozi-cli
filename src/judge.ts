import { Provider } from "./providers/base.js";
import { loadPrompt } from "./prompts.js";
import { Extraction } from "./extractor.js";
import { extractJson } from "./utils.js";

export interface AnalysisResult {
  credibilityScore: number;
  verdict: "safe" | "suspicious" | "misinformation" | "scam";
  redFlags: { zh: string; en: string }[];
  elderExplanation: { zh: string; en: string };
  actionSuggestion: { zh: string; en: string };
  summary: { zh: string; en: string };
}

async function runSubJudge<T>(
  provider: Provider,
  promptName: string,
  userContent: string,
  fallback: T,
  maxRetries = 1
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const raw = await provider.chat([
        { role: "system", content: loadPrompt(promptName) },
        { role: "user", content: userContent },
      ]);
      const jsonStr = extractJson(raw);
      return JSON.parse(jsonStr) as T;
    } catch {
      if (attempt >= maxRetries) {
        return fallback;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  return fallback;
}

function buildUserContent(
  originalText: string,
  extraction: Extraction,
  supplementary?: string,
  sessionContext?: string
): string {
  let content = "";
  if (sessionContext) {
    content += `## Conversation Context\n${sessionContext}\n\n`;
  }
  content += `## Original Message\n${originalText}\n\n`;
  content += `## Structured Extraction\n${JSON.stringify(extraction, null, 2)}\n\n`;
  if (supplementary) {
    content += `## Supplementary User Answers\n${supplementary}\n\n`;
  }
  return content;
}

export async function runJudge(
  provider: Provider,
  originalText: string,
  extraction: Extraction,
  supplementary?: string,
  sessionContext?: string
): Promise<AnalysisResult> {
  const baseContent = buildUserContent(originalText, extraction, supplementary, sessionContext);

  // Run 4 focused sub-judges in parallel
  const [redFlagsRes, factCheckRes, explanationRes, verdictRes] = await Promise.all([
    runSubJudge(provider, "judge_red_flags", baseContent, { redFlags: [] }),
    runSubJudge(provider, "judge_fact_check", baseContent, { claimChecks: [], overallFactStatus: "unverifiable" }),
    runSubJudge(provider, "judge_explanation", baseContent, { elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" } }),
    runSubJudge(provider, "judge_verdict", baseContent, { credibilityScore: 50, verdict: "suspicious", summary: { zh: "", en: "" } }),
  ]);

  const redFlags = Array.isArray(redFlagsRes?.redFlags) ? redFlagsRes.redFlags : [];
  const elderExplanation = explanationRes?.elderExplanation || { zh: "请谨慎对待该内容。", en: "Please treat this content with caution." };
  const actionSuggestion = explanationRes?.actionSuggestion || { zh: "与家人讨论后再做决定。", en: "Discuss with family before acting." };
  const score = typeof verdictRes?.credibilityScore === "number"
    ? Math.max(0, Math.min(100, Math.round(verdictRes.credibilityScore)))
    : 50;
  const verdict: AnalysisResult["verdict"] = ["safe", "suspicious", "misinformation", "scam"].includes(verdictRes?.verdict)
    ? (verdictRes.verdict as AnalysisResult["verdict"])
    : "suspicious";
  const summary = verdictRes?.summary || { zh: "无法生成总结。", en: "Unable to generate summary." };

  return {
    credibilityScore: score,
    verdict,
    redFlags,
    elderExplanation,
    actionSuggestion,
    summary,
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

export function ensemble(votes: AnalysisResult[]): AnalysisResult {
  if (votes.length === 0) {
    throw new Error("No judge votes to ensemble");
  }
  if (votes.length === 1) {
    return votes[0];
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
