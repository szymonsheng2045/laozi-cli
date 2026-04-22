import { Provider } from "./providers/base.js";
import { loadPrompt } from "./prompts.js";
import { Extraction } from "./extractor.js";
import { extractJson } from "./utils.js";
import type { AnalysisResult } from "./types.js";

async function runSubJudge<T>(
  provider: Provider,
  promptName: string,
  userContent: string,
  fallback: T,
  maxRetries = 1,
  enableSearch = false
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60000);

      const raw = await provider.chat([
        { role: "system", content: loadPrompt(promptName) },
        { role: "user", content: userContent },
      ], controller.signal, { enableSearch });

      clearTimeout(timeout);
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
  sessionContext?: string,
  searchContext?: string,
  localContext?: string,
  timeoutMs = 30000
): Promise<AnalysisResult> {
  let userContent = "";
  if (sessionContext) {
    userContent += `## Conversation Context\n${sessionContext}\n\n`;
  }
  if (localContext) {
    userContent += `## Local Knowledge Base Matches (from 中国互联网联合辟谣平台)\n${localContext}\n\n`;
  }
  if (searchContext) {
    userContent += `## Web Search Results\n${searchContext}\n\n`;
  }
  userContent += `## Original Message\n${originalText}\n\n`;
  userContent += `## Structured Extraction\n${JSON.stringify(extraction, null, 2)}\n\n`;
  if (supplementary) {
    userContent += `## Supplementary User Answers\n${supplementary}\n\n`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const raw = await provider.chat([
      { role: "system", content: loadPrompt("judge_unified") },
      { role: "user", content: userContent },
    ], controller.signal, { enableSearch: false });

    clearTimeout(timeout);
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr);

    const score = typeof parsed.credibilityScore === "number"
      ? Math.max(0, Math.min(100, Math.round(parsed.credibilityScore)))
      : 50;
    const verdictStr = typeof parsed.verdict === "string" ? parsed.verdict : "";
    const verdict: AnalysisResult["verdict"] = ["safe", "suspicious", "misinformation", "scam", "needs-verification"].includes(verdictStr)
      ? (verdictStr as AnalysisResult["verdict"])
      : "suspicious";

    const safeObj = (v: unknown): { zh: string; en: string } => {
      if (v && typeof v === "object" && "zh" in v && "en" in v) {
        const o = v as Record<string, unknown>;
        return {
          zh: o.zh !== undefined && o.zh !== null ? String(o.zh) : "",
          en: o.en !== undefined && o.en !== null ? String(o.en) : "",
        };
      }
      return { zh: "", en: "" };
    };

    return {
      credibilityScore: score,
      verdict,
      redFlags: Array.isArray(parsed.redFlags) ? parsed.redFlags : [],
      elderExplanation: safeObj(parsed.elderExplanation).zh ? safeObj(parsed.elderExplanation) : { zh: "请谨慎对待该内容。", en: "Please treat this content with caution." },
      actionSuggestion: safeObj(parsed.actionSuggestion).zh ? safeObj(parsed.actionSuggestion) : { zh: "与家人讨论后再做决定。", en: "Discuss with family before acting." },
      summary: safeObj(parsed.summary).zh ? safeObj(parsed.summary) : { zh: "无法生成总结。", en: "Unable to generate summary." },
    };
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      throw new Error(`${provider.name} judge timed out after 120s`);
    }
    throw err;
  }
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
