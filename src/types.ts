// ─────────────────────────────────────────────────────────────
// 统一类型定义 — 消除多个文件重复定义 AnalysisResult 的问题
// ─────────────────────────────────────────────────────────────

export interface AnalysisResult {
  credibilityScore: number;
  verdict: "safe" | "suspicious" | "misinformation" | "scam" | "needs-verification";
  redFlags: { zh: string; en: string }[];
  elderExplanation: { zh: string; en: string };
  actionSuggestion: { zh: string; en: string };
  summary: { zh: string; en: string };
}

export interface Extraction {
  message_type: "health" | "policy" | "scam" | "emotion" | "chat" | "other";
  claims: string[];
  entities: {
    people: string[];
    organizations: string[];
    products: string[];
  };
  manipulation_signals: {
    urgency: boolean;
    fear: boolean;
    authority_appeal: boolean;
    bandwagon: boolean;
    free_offer: boolean;
    personal_threat: boolean;
  };
  gaps: string[];
  source: {
    channel: string;
    named_source: string;
    verifiable: boolean;
  };
  calls_to_action: string[];
}

export interface Question {
  zh: string;
  en: string;
  target_gap: string;
}

export interface FollowUpAnswer {
  answerZh: string;
  answerEn: string;
  needsMoreContext: boolean;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface FactCheckContext {
  needed: boolean;
  query: string;
  results: SearchResult[];
  summary: string;
  /** 搜索结果中权威媒体的数量 */
  authorityCount: number;
  /** 权威媒体域名列表 */
  authoritySources: string[];
  /** 本地辟谣知识库匹配结果 */
  localMatches?: { title: string; claim: string; truth: string; sourceUrl: string; publishDate: string }[];
  /** 本地知识库匹配文本，用于注入 prompt */
  localContext?: string;
}
