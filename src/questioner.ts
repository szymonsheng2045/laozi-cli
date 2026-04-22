import { Provider } from "./providers/base.js";
import { loadPrompt } from "./prompts.js";
import { Extraction } from "./extractor.js";
import { extractJson } from "./utils.js";
import type { Question } from "./types.js";
export type { Question } from "./types.js";

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
  return parsed.questions.slice(0, 2).map((q: { zh: string; en: string; target_gap: string }) => ({
    zh: q.zh || "",
    en: q.en || "",
    target_gap: q.target_gap || "",
  })).filter((q: Question) => q.zh);
}
