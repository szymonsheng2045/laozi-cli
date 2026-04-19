import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = join(__dirname, "..", "prompts");
const DATA_DIR = join(__dirname, "..", "data");

const cache = new Map<string, string>();

let knowledgeBase: Record<string, unknown> | null = null;

function loadKnowledgeBase(): Record<string, unknown> {
  if (knowledgeBase) return knowledgeBase;
  try {
    const raw = readFileSync(join(DATA_DIR, "knowledge-base.json"), "utf-8");
    knowledgeBase = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    knowledgeBase = {};
  }
  return knowledgeBase;
}

function renderTemplate(text: string): string {
  const kb = loadKnowledgeBase();

  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = kb[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return `- ${item}`;
          if (typeof item === "object" && item !== null) {
            const obj = item as Record<string, unknown>;
            const parts: string[] = [];
            if (obj.category) parts.push(`**${String(obj.category)}**`);
            if (obj.keywords) parts.push(`关键词: ${JSON.stringify(obj.keywords)}`);
            if (obj.defense) parts.push(`防范: ${String(obj.defense)}`);
            return `- ${parts.join(" | ")}`;
          }
          return `- ${String(item)}`;
        })
        .join("\n");
    }
    if (value !== undefined) {
      return String(value);
    }
    return `<!-- missing: ${key} -->`;
  });
}

export function loadPrompt(name: string): string {
  if (cache.has(name)) return cache.get(name)!;
  const path = join(PROMPTS_DIR, `${name}.md`);
  const raw = readFileSync(path, "utf-8");
  const text = renderTemplate(raw);
  cache.set(name, text);
  return text;
}

export function resetPromptCache(): void {
  cache.clear();
  knowledgeBase = null;
}
