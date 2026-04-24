import { webSearch, buildSearchContext } from "./search.js";
import { searchPiyao, formatPiyaoMatches } from "./knowledge-base.js";
import type { SearchResult, FactCheckContext } from "./types.js";

// 快速判断用户输入是否包含需要事实核查的时效性/具体性内容
const FACT_CHECK_TRIGGERS = [
  /新冠|疫情|病毒|流感|疫苗|病例/,
  /地震|洪水|台风|火灾|爆炸|事故|灾难/,
  /新政策|新规定|国家宣布|政府通知|社保|医保|养老金/,
  /去世了|死了|猝逝|离世|讣告/,
  /最新研究|最新发现|刚刚公布|紧急通知/,
  /某某说|某专家说|网传| reportedly/,
  /涨价|降价|免费|补贴|发放|领取/,
  /202[4-9]|今年|最近|刚刚|昨天|今天/,
  // 具体数字 + 排名/统计/人口/数量
  /第一名|第二名|第三名|排名|第\d+|名第\d+|前\d+名/,
  /\d+\.?\d*万人|约\d+万|数量|人口|统计|排行/,
  // 地理/政治/社会类具体声明
  /在中国的|在北京|在上海|在香港|在日本|在美国/,
];

// 权威媒体域名列表
const AUTHORITATIVE_DOMAINS = [
  "cctv.com",
  "xinhuanet.com",
  "people.com.cn",
  "china.com.cn",
  "chinadaily.com.cn",
  "gov.cn",
  "sina.com.cn",
  "sohu.com",
  "163.com",
  "qq.com",
  "ifeng.com",
  "thepaper.cn",
  "xhby.net",
  "21jingji.com",
  "caixin.com",
  "yicai.com",
  "ce.cn",
];

function isAuthoritative(url: string): boolean {
  return AUTHORITATIVE_DOMAINS.some((d) => url.includes(d));
}

export function needsFactCheck(text: string): boolean {
  return FACT_CHECK_TRIGGERS.some((p) => p.test(text));
}

export function extractSearchQuery(text: string): string {
  // 简单提取：去掉口语化前缀，保留核心实体
  let q = text
    .replace(/^(我爸|我妈|我奶奶|我爷爷|家里老人|朋友|群里)听说[,，]?/, "")
    .replace(/^(有人说|听说|网传|据说)/, "")
    .replace(/[，,。！!？?]$/, "")
    .trim();

  // 如果太短，加一些限定词提高搜索质量
  if (q.length < 10) {
    q = q + " 辟谣";
  }
  return q;
}

export function analyzeAuthority(results: SearchResult[]): {
  count: number;
  sources: string[];
} {
  const sources = results
    .filter((r) => isAuthoritative(r.url))
    .map((r) => {
      // 提取域名作为来源名
      try {
        const domain = new URL(r.url).hostname.replace(/^www\./, "");
        return domain;
      } catch {
        return r.url.slice(0, 30);
      }
    });
  // 去重
  const unique = [...new Set(sources)];
  return { count: unique.length, sources: unique };
}

import type { AnalysisResult } from "./types.js";

/**
 * 基于搜索结果直接生成判定，避免 fallback 到规则引擎时信息丢失。
 * - 权威媒体 ≥2 → needs-verification 78分（搜索可作为参考，但不足以直接判真）
 * - 有搜索结果但无权威来源 → 70分，提示"网上有讨论但无法确认"
 * - 无搜索结果 → null（走规则引擎）
 */
export function buildSearchBasedResult(
  factCheck: FactCheckContext,
  lang: string = "bilingual"
): AnalysisResult | null {
  if (!factCheck.needed) return null;

  // 搜索结果只能提供背景证据，不能替代最终判定。
  if (factCheck.authorityCount >= 2) {
    const sourcesText = factCheck.authoritySources.join("、");
    return {
      credibilityScore: 78,
      verdict: "needs-verification",
      redFlags: [
        {
          zh: `有 ${sourcesText} 等权威来源在报道相关话题，但仅凭搜索结果还不能直接确认转发内容的细节`,
          en: `Authoritative outlets including ${sourcesText} discuss the topic, but search results alone cannot verify the forwarded claim in full.`,
        },
      ],
      elderExplanation: {
        zh: `这件事网上有比较可靠的报道，但你转来的这段话有没有添油加醋，还得再核实一下。`,
        en: `Reliable outlets are covering this topic, but we still need to verify whether the forwarded wording adds or distorts details.`,
      },
      actionSuggestion: {
        zh: "优先查看原始报道或官方通报，再决定是否转发。",
        en: "Check the original report or official notice before sharing.",
      },
      summary: {
        zh: `权威媒体报道过相关话题，但搜索结果本身不足以直接判定转发内容完全属实。`,
        en: `Authoritative outlets cover the topic, but search results alone are not enough to mark the forwarded content as true.`,
      },
    };
  }

  // 有搜索结果但无权威来源 → 中立判定（不是"可疑"，而是"信息有限"）
  if (factCheck.results.length >= 1) {
    const resultCount = factCheck.results.length;
    return {
      credibilityScore: 70,
      verdict: "needs-verification",
      redFlags: [
        {
          zh: `网络上存在相关讨论（搜到 ${resultCount} 条结果），但内容细节尚无法完全核实`,
          en: `Related discussions found online (${resultCount} results), but details cannot be fully verified.`,
        },
      ],
      elderExplanation: {
        zh: "这个话题网上确实有人在说，但具体对不对还不太确定，咱们先不急着信。",
        en: "People are talking about this online, but I can't fully confirm the details. Let's not rush to believe it.",
      },
      actionSuggestion: {
        zh: "可以点开上面的搜索结果链接看看，或等更多信息出来再说。",
        en: "Check the search result links above, or wait for more information.",
      },
      summary: {
        zh: `网络上存在关于该话题的讨论，但缺乏权威来源确认，建议谨慎对待。`,
        en: `Related discussions exist online, but no authoritative confirmation yet. Treat with caution.`,
      },
    };
  }

  return null;
}

export async function runFactCheck(text: string): Promise<FactCheckContext> {
  const needed = needsFactCheck(text);
  if (!needed) {
    return {
      needed: false,
      query: "",
      results: [],
      summary: "",
      authorityCount: 0,
      authoritySources: [],
    };
  }

  const query = extractSearchQuery(text);
  
  // 1. 先检索本地辟谣知识库
  const localMatches = searchPiyao(query, 3);
  const localContext = formatPiyaoMatches(localMatches);
  
  // 如果本地有高置信度匹配，仍然执行网络搜索作为补充，但将本地结果传递给后续流程
  try {
    const results = await webSearch(query, 3);
    const { count, sources } = analyzeAuthority(results);
    return {
      needed: true,
      query,
      results,
      summary: buildSearchContext(results),
      authorityCount: count,
      authoritySources: sources,
      localMatches: localMatches.map(m => ({
        title: m.title,
        claim: m.claim,
        truth: m.truth,
        sourceUrl: m.sourceUrl,
        publishDate: m.publishDate,
      })),
      localContext,
    };
  } catch (e: any) {
    return {
      needed: true,
      query,
      results: [],
      summary: `尝试搜索时出错: ${e.message || String(e)}`,
      authorityCount: 0,
      authoritySources: [],
      localMatches: localMatches.map(m => ({
        title: m.title,
        claim: m.claim,
        truth: m.truth,
        sourceUrl: m.sourceUrl,
        publishDate: m.publishDate,
      })),
      localContext,
    };
  }
}
