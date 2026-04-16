import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { AnalysisResult } from "./analyzer.js";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  inputType: "text" | "voice";
  inputPreview: string;
  result: AnalysisResult;
}

const historyDir = join(homedir(), ".laozi");
const historyPath = join(historyDir, "history.json");

function ensureDir() {
  if (!existsSync(historyDir)) {
    mkdirSync(historyDir, { recursive: true });
  }
}

export function loadHistory(): HistoryEntry[] {
  ensureDir();
  if (!existsSync(historyPath)) {
    return [];
  }
  try {
    return JSON.parse(readFileSync(historyPath, "utf-8")) as HistoryEntry[];
  } catch {
    return [];
  }
}

export function saveHistoryEntry(entry: HistoryEntry): void {
  ensureDir();
  const history = loadHistory();
  history.unshift(entry);
  // 只保留最近 50 条
  const trimmed = history.slice(0, 50);
  writeFileSync(historyPath, JSON.stringify(trimmed, null, 2), "utf-8");
}

export function clearHistory(): void {
  ensureDir();
  writeFileSync(historyPath, "[]", "utf-8");
}

export function formatHistoryPreview(entry: HistoryEntry): string {
  const date = new Date(entry.timestamp).toLocaleString("zh-CN");
  const score = entry.result.credibilityScore;
  const verdict = entry.result.verdict;
  const preview = entry.inputPreview.length > 20 ? entry.inputPreview.slice(0, 20) + "…" : entry.inputPreview;
  return `[${date}] ${score}分 ${verdict} | ${preview}`;
}
