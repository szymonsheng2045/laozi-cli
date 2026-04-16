import { Provider } from "./providers/base.js";
import { loadPrompt } from "./prompts.js";
import { Extraction } from "./extractor.js";

export interface Question {
  zh: string;
  en: string;
  target_gap: string;
}

function extractJson(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const block = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (block) {
    const inner = block[1].trim();
    if (inner.startsWith("{")) return inner;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("No JSON object found in questioner response");
}

export async function buildQuestions(
  provider: Provider,
  extraction: Extraction
): Promise<Question[]> {
  if (extraction.gaps.length === 0) return [];

  const systemPrompt = loadPrompt("questioner");
  const userContent = JSON.stringify(extraction, null, 2);

  const raw = await provider.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ]);

  const jsonStr = extractJson(raw);
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed.questions)) return [];
  return parsed.questions.slice(0, 2).map((q: any) => ({
    zh: q.zh || "",
    en: q.en || "",
    target_gap: q.target_gap || "",
  })).filter((q: Question) => q.zh);
}
