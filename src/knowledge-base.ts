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
let dictionary: Set<string> | null = null;

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

/* ── 自动词典构建：从知识库提取高频 2-4 字词组 ───────────────── */

const STOP_WORDS = new Set([
  "的", "是", "了", "在", "有", "和", "与", "对", "这", "那", "一", "个", "不", "人", "为", "以", "可", "能", "但", "来", "到", "说", "要", "会", "还", "而",
  "于", "被", "把", "给", "让", "向", "从", "之", "其", "及", "等", "都", "也", "就", "着", "过", "下", "上", "中", "大", "小",
  "多", "少", "好", "很", "非常", "已经", "正在", "进行", "根据", "通过", "关于", "随着", "由于", "因此", "如果", "虽然", "但是", "因为", "所以", "或者",
  "并且", "不仅", "而且", "只要", "只有", "无论", "不管", "即使", "尽管", "然而", "从而", "进而", "反而", "另外", "此外", "同时", "其次",
  "最后", "首先", "总之", "综上所述", "据此", "据了解", "报道称", "表示", "认为", "指出", "强调", "介绍", "称", "该", "此", "本", "各", "每", "某",
  "听说", "网传", "有人", "记得", "看到", "朋友", "家里", "老人", "群里", "是真", "是假", "真的", "假的",
  "明天", "今天", "昨天", "前天", "日子", "时候", "时间", "一下", "一点", "一些",
]);

function buildDictionary(entries: PiyaoEntry[]): Set<string> {
  if (dictionary) return dictionary;
  const freq = new Map<string, number>();

  for (const e of entries) {
    const text = (e.title + " " + e.claim + " " + e.truth).toLowerCase();
    // 先按标点切分成短句，避免超长 seg 产生天文数字的 n-gram
    const fragments = text.split(/[\s\u3000\n\r\t，。？！；：""''（）【〓\[\]\(\)!?;:,,.]+/);
    for (const frag of fragments) {
      const seg = frag.replace(/[^\u4e00-\u9fff]/g, "");
      if (seg.length < 2) continue;
      // 只提取 2-4 gram，超长词由手动词典补充
      for (let len = 2; len <= Math.min(4, seg.length); len++) {
        for (let i = 0; i <= seg.length - len; i++) {
          const word = seg.slice(i, i + len);
          // 过滤以停用词开头或结尾的词
          if (STOP_WORDS.has(word[0]) || STOP_WORDS.has(word[word.length - 1])) continue;
          freq.set(word, (freq.get(word) || 0) + 1);
        }
      }
    }
  }

  dictionary = new Set<string>();
  for (const [word, count] of freq) {
    // 保留出现 >= 5 次的高频词，或长度 >= 4 且出现 >= 3 次
    if (count >= 5 || (word.length >= 4 && count >= 3)) {
      dictionary.add(word);
    }
  }

  // 清理重叠：如果一个词是另一个词的子串，删除短的
  const sorted = Array.from(dictionary).sort((a, b) => b.length - a.length);
  const cleaned = new Set<string>();
  for (const word of sorted) {
    let isSubstring = false;
    for (const existing of cleaned) {
      if (existing.includes(word) && existing !== word) {
        isSubstring = true;
        break;
      }
    }
    if (!isSubstring) cleaned.add(word);
  }
  dictionary = cleaned;

  // 手动补充一些重要领域词
  const manualTerms = [
    "贷款", "催收", "征信", "逾期", "短信", "链接", "还款", "诈骗",
    "保险", "医保", "社保", "养老金", "退税", "补贴", "骗局",
    "致癌", "排毒", "养生", "保健品", "偏方", "软化血管", "血管",
    "疫苗", "核辐射", "转基因", "味精", "隔夜菜", "微波炉", "银饰",
    "淋巴", "拍打", "洋葱", "宿便", "百塞", "垃圾分类", "登月",
    "新冠", "疫情", "核酸", "检测", "阴性", "阳性", "隔离",
  ];
  for (const t of manualTerms) dictionary.add(t);

  return dictionary;
}

/** 用词典做正向最大匹配分词 */
function segmentWithDict(text: string, dict: Set<string>): string[] {
  const cleaned = text.toLowerCase().replace(/[^\u4e00-\u9fff]/g, " ");
  const words: string[] = [];

  for (const seg of cleaned.split(/\s+/).filter(s => s.length >= 2)) {
    let i = 0;
    while (i < seg.length) {
      let matched = false;
      // 优先匹配最长词
      for (let len = Math.min(8, seg.length - i); len >= 2; len--) {
        const sub = seg.slice(i, i + len);
        if (dict.has(sub)) {
          words.push(sub);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // 没匹配到，滑动一个字，作为单字或者丢弃
        i++;
      }
    }
  }

  return words;
}

// 高风险关键词：短 query 中至少命中一个才值得查知识库
const RISK_KEYWORDS = new Set([
  "贷款", "催收", "征信", "逾期", "短信", "链接", "还款", "诈骗",
  "保险", "医保", "社保", "养老金", "退税", "补贴", "骗局",
  "致癌", "排毒", "养生", "保健品", "偏方", "软化血管", "血管",
  "疫苗", "核辐射", "转基因", "味精", "隔夜菜", "微波炉", "银饰",
  "淋巴", "拍打", "洋葱", "宿便", "百塞", "登月",
  "新冠", "疫情", "核酸", "检测", "阴性", "阳性", "隔离",
  "中奖", "红包", "免费", "抽奖", "幸运", "紧急", "通知", "删除",
  "政府", "国家", "政策", "秘密", "内幕", "股票", "收益", "投资",
  "快递", "包裹", "到达", "异常", "点击", "确认", "地址",
  "漂白", "放血", "泥鳅", "磁疗", "磁铁", "磁石",
  "生姜", "脚底", "韭菜", "壮阳", "芹菜", "降压", "绿豆汤",
  "方便面", "千滚水", "亚硝酸盐", "猪油", "植物油",
  "不孕不育", "有害", "食物相克", "螃蟹", "柿子",
  "红糖", "痛经", "喝茶", "解酒", "喝醉", "眼镜", "近视", "度数",
  "白头发", "摇晃", "婴儿", "脑瘫", "天线宝宝", "洗脑",
  "月球", "背面", "外星人", "基地", "艾滋病", "军方",
  "板蓝根", "双黄连", "吸烟", "预防", "抢盐", "辐射", "碘盐", "海带",
  "生吃", "茄子", "治百病", "张悟本", "5G", "基站", "地平",
  "摄影棚", "911", "自导自演", "罚款", " Gluten", " gluten",
]);

/* ── 关键词匹配检索 ────────────────────────────────── */

function extractKeywords(text: string): { word: string; weight: number }[] {
  // 在停用词处切开，只对有意义的连续片段提取 n-gram，避免跨词噪声
  const cleaned = text
    .replace(/[\s\u3000\n\r\t]+/g, " ")
    .replace(/[，。？！；：""''（）【〓\[\]\(\)!?;:,,.]/g, " ")
    .trim()
    .toLowerCase();

  const words: { word: string; weight: number }[] = [];
  const multiCharStops = Array.from(STOP_WORDS).filter(w => w.length > 1);

  // 将中文按停用词切分成片段
  const chineseSegments = cleaned.match(/[\u4e00-\u9fff]+/g) || [];
  for (const seg of chineseSegments) {
    // 先替换多字停用词为空格
    let processed = seg;
    for (const sw of multiCharStops) {
      processed = processed.split(sw).join(" ");
    }

    // 再按单字停用词和空格切开
    const fragments: string[] = [];
    let current = "";
    for (const char of processed) {
      if (char === " " || STOP_WORDS.has(char)) {
        if (current.length >= 2) fragments.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    if (current.length >= 2) fragments.push(current);

    // 对每个片段提取 n-gram
    for (const frag of fragments) {
      if (frag.length >= 2) {
        for (let i = 0; i <= frag.length - 2; i++) {
          words.push({ word: frag.slice(i, i + 2), weight: 0.3 });
        }
      }
      if (frag.length >= 3) {
        for (let i = 0; i <= frag.length - 3; i++) {
          words.push({ word: frag.slice(i, i + 3), weight: 1.0 });
        }
      }
    }
  }

  // 对英文/数字按空格分词 (权重1.0)
  const otherParts = cleaned.split(/\s+/).filter(w => w.length >= 2 && !/[\u4e00-\u9fff]/.test(w));
  for (const w of otherParts) {
    words.push({ word: w, weight: 1.0 });
  }

  // 去除常见停用词，保留最高权重
  const seen = new Map<string, number>();
  for (const { word, weight } of words) {
    if (STOP_WORDS.has(word)) continue;
    seen.set(word, Math.max(seen.get(word) || 0, weight));
  }

  return Array.from(seen.entries()).map(([word, weight]) => ({ word, weight }));
}

/**
 * 智能匹配计分：n-gram + 词典分词 + Jaccard
 * 返回 0-1 的相关度分数
 */
function scoreMatch(query: string, entry: PiyaoEntry, dict?: Set<string>, entries?: PiyaoEntry[]): number {
  const ent = entries || loadPiyaoEntries();
  const d = dict || buildDictionary(ent);

  // 方法1: n-gram 匹配（保留）
  const qWords = extractKeywords(query);
  const claimLower = entry.claim.toLowerCase();
  const truthLower = entry.truth.toLowerCase();

  let ngramHitWeight = 0;
  let ngramTotalWeight = 0;
  for (const { word, weight } of qWords) {
    ngramTotalWeight += weight;
    if (claimLower.includes(word) || truthLower.includes(word)) {
      ngramHitWeight += weight;
    }
  }
  const ngramScore = ngramTotalWeight > 0 ? ngramHitWeight / ngramTotalWeight : 0;

  // 方法2: 词典分词 + Jaccard
  const qTokens = segmentWithDict(query, d);
  const eTokens = segmentWithDict(entry.claim + " " + entry.truth, d);

  if (qTokens.length === 0 || eTokens.length === 0) {
    return ngramScore;
  }

  const qSet = new Set(qTokens);
  const eSet = new Set(eTokens);

  let intersection = 0;
  let union = eSet.size;
  for (const w of qSet) {
    if (eSet.has(w)) {
      intersection++;
    } else {
      union++;
    }
  }

  const jaccardScore = union > 0 ? intersection / union : 0;

  // 方法3: 关键词命中加权（长词命中加分更多）
  let keywordHitScore = 0;
  let keywordTotalScore = 0;
  for (const w of qTokens) {
    const wScore = w.length; // 长词权重更高
    keywordTotalScore += wScore;
    if (eSet.has(w)) {
      keywordHitScore += wScore;
    }
  }
  const keywordScore = keywordTotalScore > 0 ? keywordHitScore / keywordTotalScore : 0;

  // 组合: 取最高分，关键词匹配给更高权重
  // 短 query（tokens < 3）时 Jaccard 容易误匹，降低权重
  const jaccardWeight = qTokens.length < 3 ? 0.2 : 0.7;
  const finalScore = Math.max(ngramScore * 0.6, jaccardScore * jaccardWeight, keywordScore * 0.9);

  return Math.min(finalScore, 1.0);
}

/**
 * 检索辟谣知识库，返回最相关的 Top-K 条记录。
 * 策略：命中度 >= 0.35 才算相关。
 * 短 query 若无风险关键词则跳过，避免日常内容误报。
 */
export function searchPiyao(query: string, topK: number = 3): PiyaoEntry[] {
  const entries = loadPiyaoEntries();
  if (entries.length === 0 || !query || query.length < 3) return [];

  const dict = buildDictionary(entries);
  const qTokens = segmentWithDict(query, dict);

  // 无有效分词结果时直接返回空
  if (qTokens.length === 0) return [];
  if (qTokens.length < 2) return [];

  // 短日常 query（如"明天下雨，记得带伞"）无风险关键词时跳过知识库匹配
  const hasRiskToken = qTokens.some(t => RISK_KEYWORDS.has(t));
  const hasLongToken = qTokens.some(t => t.length >= 3);
  if (query.length < 15 && qTokens.length < 3 && !hasRiskToken && !hasLongToken) {
    return [];
  }

  const scored = entries
    .map(e => ({ entry: e, score: scoreMatch(query, e, dict, entries) }))
    .filter(s => s.score >= 0.35)
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

  const dict = buildDictionary(entries);

  // 短 query 不走直接匹配，避免单个词误命中
  const queryTokens = segmentWithDict(query, dict);
  if (queryTokens.length < 3) return { matched: false };

  for (const e of entries) {
    if (scoreMatch(query, e, dict, entries) >= 0.6) {
      return { matched: true, entry: e };
    }
  }
  return { matched: false };
}
