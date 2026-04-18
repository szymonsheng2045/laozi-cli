import { Provider } from "./providers/base.js";
import { loadPrompt } from "./prompts.js";
import { extractJson } from "./utils.js";

export interface Extraction {
  message_type: "health" | "policy" | "scam" | "emotion" | "chat" | "other";
  claims: string[];
  entities: {
    people: string[];
    organizations: string[];
    products: string[];
  };
  manipulation_signals: {
    urgency: boolean;
    fear: boolean;
    authority_appeal: boolean;
    bandwagon: boolean;
    free_offer: boolean;
    personal_threat: boolean;
  };
  gaps: string[];
  source: {
    channel: string;
    named_source: string;
    verifiable: boolean;
  };
  calls_to_action: string[];
}

export async function extractStructured(provider: Provider, content: string): Promise<Extraction> {
  const systemPrompt = loadPrompt("extract");
  const raw = await provider.chat([
    { role: "system", content: systemPrompt },
    { role: "user", content: content },
  ]);

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
}
