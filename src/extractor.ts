import { Provider } from "./providers/base.js";
import { loadPrompt } from "./prompts.js";
import { extractJson } from "./utils.js";
import type { Extraction } from "./types.js";
export type { Extraction } from "./types.js";

export async function extractStructured(provider: Provider, content: string, timeoutMs = 60000): Promise<Extraction> {
  const systemPrompt = loadPrompt("extract");

  async function tryOnce(ms: number): Promise<Extraction> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);

    try {
      const raw = await provider.chat([
        { role: "system", content: systemPrompt },
        { role: "user", content: content },
      ], controller.signal, { enableSearch: false });

      clearTimeout(timeout);
      const jsonStr = extractJson(raw);
      const parsed = JSON.parse(jsonStr);

      return {
        message_type: parsed.message_type || "other",
        claims: Array.isArray(parsed.claims) ? parsed.claims : [],
        entities: {
          people: Array.isArray(parsed.entities?.people) ? parsed.entities.people : [],
          organizations: Array.isArray(parsed.entities?.organizations) ? parsed.entities.organizations : [],
          products: Array.isArray(parsed.entities?.products) ? parsed.entities.products : [],
        },
        manipulation_signals: {
          urgency: !!parsed.manipulation_signals?.urgency,
          fear: !!parsed.manipulation_signals?.fear,
          authority_appeal: !!parsed.manipulation_signals?.authority_appeal,
          bandwagon: !!parsed.manipulation_signals?.bandwagon,
          free_offer: !!parsed.manipulation_signals?.free_offer,
          personal_threat: !!parsed.manipulation_signals?.personal_threat,
        },
        gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
        source: {
          channel: parsed.source?.channel || "未知",
          named_source: parsed.source?.named_source || "",
          verifiable: !!parsed.source?.verifiable,
        },
        calls_to_action: Array.isArray(parsed.calls_to_action) ? parsed.calls_to_action : [],
      };
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        throw new Error(`结构化提取超时 (${ms}ms)`);
      }
      throw err;
    }
  }

  // First attempt
  try {
    return await tryOnce(timeoutMs);
  } catch (firstErr: any) {
    // One retry for transient failures
    try {
      return await tryOnce(timeoutMs);
    } catch (secondErr: any) {
      throw new Error(`结构化提取失败 (已重试1次): ${secondErr.message || String(secondErr)}`);
    }
  }
}
