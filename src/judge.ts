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

const VERDICT_SEVERITY: Record<string, number> = {
  safe: 0,
  "needs-verification": 1,
  suspicious: 2,
  misinformation: 3,
  scam: 4,
};

/** 严格多数门槛：misinformation/scam 需要 > 50% 票数才能通过，否则降级 */
function countVotes<T extends string>(items: T[]): T {
  const counts = new Map<T, number>();
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  // 按票数降序、同票时按严重度降序排列
  const sorted = Array.from(counts.entries()).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return (VERDICT_SEVERITY[b[0]] || 0) - (VERDICT_SEVERITY[a[0]] || 0);
  });

  const [best, bestCount] = sorted[0];

  // misinformation / scam 需要严格超过半数
  const strictThreshold = items.length / 2;
  if (
    (best === "misinformation" || best === "scam") &&
    bestCount <= strictThreshold
  ) {
    // 降级：在剩余选项中选票数最高的，同票时选严重度更低的（更不严重的）
    const remaining = sorted.slice(1).filter(([v]) => v !== "misinformation" && v !== "scam");
    if (remaining.length > 0) {
      remaining.sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return (VERDICT_SEVERITY[a[0]] || 0) - (VERDICT_SEVERITY[b[0]] || 0);
      });
      return remaining[0][0] as T;
    }
    // 如果全部投的 misinformation/scam，即便不满足严格多数也尊重
  }

  return best as T;
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

function pickBestField(
  votes: AnalysisResult[],
  targetVerdict: AnalysisResult["verdict"],
  getter: (v: AnalysisResult) => { zh: string; en: string }
): { zh: string; en: string } {
  const matching = votes.filter((v) => v.verdict === targetVerdict);
  const pool = matching.length > 0 ? matching : votes;
  const bestVote = pool.reduce((best, v) => {
    const curr = getter(v);
    const bestVal = getter(best);
    return curr.zh.length > bestVal.zh.length ? v : best;
  });
  return getter(bestVote);
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

  const bestElder = pickBestField(votes, verdict, (v) => v.elderExplanation);
  const bestAction = pickBestField(votes, verdict, (v) => v.actionSuggestion);
  const bestSummary = pickBestField(votes, verdict, (v) => v.summary);

  return {
    credibilityScore: score,
    verdict,
    redFlags,
    elderExplanation: bestElder,
    actionSuggestion: bestAction,
    summary: bestSummary,
  };
}
