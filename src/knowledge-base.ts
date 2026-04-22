import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");

export interface PiyaoEntry {
  title: string;
  claim: string;
  truth: string;
  sourceUrl: string;
  publishDate: string;
  source: string;
}

let piyaoEntries: PiyaoEntry[] | null = null;

function loadPiyaoEntries(): PiyaoEntry[] {
  if (piyaoEntries) return piyaoEntries;
  try {
    const raw = readFileSync(join(DATA_DIR, "piyao-entries.json"), "utf-8");
    piyaoEntries = JSON.parse(raw) as PiyaoEntry[];
  } catch {
    piyaoEntries = [];
  }
  return piyaoEntries;
}

function extractKeywords(text: string): { word: string; weight: number }[] {
  // 移除标点、空格
  const cleaned = text
    .replace(/[\s\u3000\n\r\t]+/g, " ")
    .replace(/[，。？！；：""''（）【〓\[\]\(\)!?;:,,.]/g, " ")
    .trim()
    .toLowerCase();

  const words: { word: string; weight: number }[] = [];

  // 对中文使用 3-gram (权重1.0) 和 2-gram (权重0.3)
  const chineseSegments = cleaned.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seg of chineseSegments) {
    if (seg.length >= 2) {
      for (let i = 0; i <= seg.length - 2; i++) {
        words.push({ word: seg.slice(i, i + 2), weight: 0.3 });
      }
    }
    if (seg.length >= 3) {
      for (let i = 0; i <= seg.length - 3; i++) {
        words.push({ word: seg.slice(i, i + 3), weight: 1.0 });
      }
    }
  }

  // 对英文/数字按空格分词 (权重1.0)
  const otherParts = cleaned.split(/\s+/).filter(w => w.length >= 2 && !/[\u4e00-\u9fff]/.test(w));
  for (const w of otherParts) {
    words.push({ word: w, weight: 1.0 });
  }

  // 去除常见停用词
  const stopWords = new Set([
    "我", "你", "他", "她", "它", "们", "的", "是", "了", "在", "有", "和", "与", "对", "这", "那",
    "一", "个", "不", "人", "为", "以", "可", "能", "但", "来", "到", "说", "要", "会", "还", "而",
    "于", "被", "把", "给", "让", "向", "从", "之", "其", "及", "等", "都", "也", "就", "都",
    "听说", "网传", "有人", "说", "记得", "看到", "朋友", "家里", "老人", "群里",
    "是真", "是假", "真的", "假的"
  ]);

  // 去重并过滤停用词，保留最高权重
  const seen = new Map<string, number>();
  for (const { word, weight } of words) {
    if (stopWords.has(word)) continue;
    seen.set(word, Math.max(seen.get(word) || 0, weight));
  }

  return Array.from(seen.entries()).map(([word, weight]) => ({ word, weight }));
}

/**
 * 简单关键词匹配检索：将3-gram和2-gram分解后检查 claim/truth 中是否包含。
 * 匹配度 = 命中权重 / 总权重。
 */
function scoreMatch(query: string, entry: PiyaoEntry): number {
  const qWords = extractKeywords(query);
  const claimLower = entry.claim.toLowerCase();
  const truthLower = entry.truth.toLowerCase();

  if (qWords.length === 0) return 0;

  let hitWeight = 0;
  let totalWeight = 0;
  for (const { word, weight } of qWords) {
    totalWeight += weight;
    if (claimLower.includes(word) || truthLower.includes(word)) {
      hitWeight += weight;
    }
  }

  return totalWeight > 0 ? hitWeight / totalWeight : 0;
}

/**
 * 检索辟谣知识库，返回最相关的 Top-K 条记录。
 * 策略：命中度 >= 0.3 才算相关。
 */
export function searchPiyao(query: string, topK: number = 3): PiyaoEntry[] {
  const entries = loadPiyaoEntries();
  if (entries.length === 0 || !query || query.length < 3) return [];

  const scored = entries
    .map(e => ({ entry: e, score: scoreMatch(query, e) }))
    .filter(s => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return scored.map(s => s.entry);
}

/**
 * 将匹配结果格式化为 prompt 可用的文本。
 */
export function formatPiyaoMatches(matches: PiyaoEntry[]): string {
  if (matches.length === 0) return "暂无相关辟谣记录。";

  return matches
    .map((m, i) => {
      const truth = m.truth.length > 300 ? m.truth.slice(0, 300) + "..." : m.truth;
      return `${i + 1}. 谣言：${m.claim}\n   真相：${truth}\n   来源：${m.source} (${m.publishDate})`;
    })
    .join("\n\n");
}

/**
 * 检查是否存在高置信度的直接匹配（命中度 >= 0.6）。
 */
export function hasDirectMatch(query: string): { matched: boolean; entry?: PiyaoEntry } {
  const entries = loadPiyaoEntries();
  if (entries.length === 0 || !query || query.length < 3) return { matched: false };

  for (const e of entries) {
    if (scoreMatch(query, e) >= 0.7) {
      return { matched: true, entry: e };
    }
  }
  return { matched: false };
}
