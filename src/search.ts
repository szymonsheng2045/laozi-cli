/**
 * Lightweight DuckDuckGo search module.
 * No API key required. Parses HTML search results.
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function duckduckgoSearch(query: string, maxResults = 3): Promise<SearchResult[]> {
  const encoded = encodeURIComponent(query);
  const url = `https://html.duckduckgo.com/html/?q=${encoded}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html",
    },
  });

  if (!res.ok) {
    throw new Error(`DuckDuckGo search failed: ${res.status}`);
  }

  const html = await res.text();
  return parseDuckDuckGoHTML(html, maxResults);
}

function parseDuckDuckGoHTML(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // DuckDuckGo HTML results are in .result elements
  const resultBlocks = html.split('<div class="result results_links results_links_deep web-result ">');

  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];

    const titleMatch = block.match(/<a[^>]+class="result__a"[^>]*>([\s\S]*?)<\/a>/);
    const urlMatch = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"/);
    const snippetMatch = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);

    if (titleMatch && snippetMatch) {
      const title = stripHtml(titleMatch[1]).trim();
      const snippet = stripHtml(snippetMatch[1]).trim();
      const rawUrl = urlMatch ? urlMatch[1] : "";
      const url = decodeDuckDuckGoUrl(rawUrl);

      if (title && snippet) {
        results.push({ title, url, snippet });
      }
    }
  }

  return results;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function decodeDuckDuckGoUrl(url: string): string {
  // DuckDuckGo wraps URLs like: /l/?uddg=https%3A%2F%2Fexample.com
  const match = url.match(/uddg=([^&]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return url;
    }
  }
  return url;
}

export function buildSearchContext(results: SearchResult[]): string {
  if (results.length === 0) return "未找到相关网络搜索结果。";

  return results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n摘要: ${r.snippet}`)
    .join("\n\n");
}
