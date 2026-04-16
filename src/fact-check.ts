import { searxngSearch, buildSearchContext, SearchResult } from "./search.js";

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
];

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

export interface FactCheckContext {
  needed: boolean;
  query: string;
  results: SearchResult[];
  summary: string;
}

export async function runFactCheck(text: string): Promise<FactCheckContext> {
  const needed = needsFactCheck(text);
  if (!needed) {
    return {
      needed: false,
      query: "",
      results: [],
      summary: "",
    };
  }

  const query = extractSearchQuery(text);
  try {
    const results = await searxngSearch(query, 3);
    return {
      needed: true,
      query,
      results,
      summary: buildSearchContext(results),
    };
  } catch (e: any) {
    return {
      needed: true,
      query,
      results: [],
      summary: `尝试搜索时出错: ${e.message || String(e)}`,
    };
  }
}
