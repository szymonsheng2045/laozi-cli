/**
 * Lightweight search module using SearXNG public instances.
 * Falls back through multiple instances automatically.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

const SEARXNG_INSTANCES = [
  "https://search.sapti.me",
  "https://search.bus-hit.me",
  "https://search.projectsegfault.com",
  "https://search.demoniak.ch",
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
    .filter((r) => r.title && (r.content || r.url))
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

export function buildSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return "未找到相关网络搜索结果。";

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n摘要: ${r.snippet}`)
    .join("\n\n");
}
