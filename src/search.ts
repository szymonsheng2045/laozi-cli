/**
 * Search module: Tavily primary, SearXNG fallback.
 */

import type { SearchResult } from "./types.js";
import { loadConfig } from "./config.js";

const TAVILY_API_URL = "https://api.tavily.com/search";

const SEARXNG_INSTANCES = [
  // 优先国内实例（中文搜索质量好）
  "https://search.rhscz.eu",
  "https://search.bus-hit.me",
  "https://search.projectsegfault.com",
  "https://search.demoniak.ch",
  "https://search.sapti.me",
];

async function trySearchInstance(
  instance: string,
  query: string
): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `${instance}/search?q=${encoded}&format=json&safesearch=0`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
      engines?: string[];
    }>;
  };

  if (!Array.isArray(data.results)) {
    throw new Error("Invalid response format");
  }

  return data.results
    .slice(0, 5)
    .filter((r) => {
      if (!r.title || !(r.content || r.url)) return false;
      // Skip binary/document results that produce garbled snippets
      const url = r.url || "";
      if (/\.(docx?|pdf|xlsx?|pptx?|zip|rar|exe)\b/i.test(url)) return false;
      const content = (r.content || "").replace(/\s+/g, " ").trim();
      // Skip if content looks like binary garbage (high ratio of non-printable chars)
      if (content.length > 20) {
        const printable = content.replace(/[^\p{L}\p{N}\p{P}\p{Z}\p{Sc}]/gu, "");
        if (printable.length / content.length < 0.5) return false;
      }
      return true;
    })
    .map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: (r.content || "").replace(/\s+/g, " ").trim(),
    }));
}

export async function searxngSearch(query: string, maxResults = 3): Promise<SearchResult[]> {
  const errors: string[] = [];

  for (const instance of SEARXNG_INSTANCES) {
    try {
      const results = await trySearchInstance(instance, query);
      if (results.length > 0) {
        return results.slice(0, maxResults);
      }
    } catch (e: any) {
      errors.push(`${instance}: ${e.message || String(e)}`);
    }
  }

  throw new Error(`All SearXNG instances failed.\n${errors.slice(0, 3).join("\n")}`);
}

async function tavilySearch(query: string, apiKey: string, maxResults = 3): Promise<SearchResult[]> {
  const res = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      max_results: maxResults,
      include_answer: false,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily error (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
    }>;
  };

  if (!Array.isArray(data.results)) {
    throw new Error("Invalid Tavily response format");
  }

  return data.results
    .slice(0, maxResults)
    .filter((r) => r.title && (r.content || r.url))
    .map((r) => ({
      title: r.title || "",
      url: r.url || "",
      snippet: (r.content || "").replace(/\s+/g, " ").trim(),
    }));
}

/**
 * Unified web search: Tavily primary, SearXNG fallback.
 * Automatically reads tavilyApiKey from config.
 */
export async function webSearch(query: string, maxResults = 3): Promise<SearchResult[]> {
  const config = loadConfig();
  if (config.tavilyApiKey) {
    try {
      return await tavilySearch(query, config.tavilyApiKey, maxResults);
    } catch (e: any) {
      console.warn(`⚠ Tavily 搜索失败: ${e.message || String(e)}，fallback 到 SearXNG`);
    }
  }
  return searxngSearch(query, maxResults);
}

export function buildSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return "未找到相关网络搜索结果。";

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n摘要: ${r.snippet}`)
    .join("\n\n");
}
