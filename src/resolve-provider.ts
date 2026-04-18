import { loadConfig } from "./config.js";
import { getProviderMeta, ProviderMeta } from "./providers/registry.js";

export interface ResolvedProvider {
  meta: ProviderMeta;
  apiKey: string;
  model: string;
}

export function resolveProvider(
  providerId?: string,
  apiKey?: string,
  model?: string
): ResolvedProvider {
  const config = loadConfig();
  const finalProviderId = providerId || config.provider;

  // Special case: rule-based provider
  if (finalProviderId === "rule-based") {
    return {
      meta: {
        id: "rule-based",
        name: "本地规则引擎",
        type: "local",
        baseURL: "",
        defaultModel: "local-rules",
        envKey: "",
        region: "global",
      },
      apiKey: "",
      model: model || config.model || "local-rules",
    };
  }

  const meta = getProviderMeta(finalProviderId);

  if (!meta) {
    throw new Error(`Unknown provider: ${finalProviderId}`);
  }

  // Priority: explicit arg > provider-specific key > global config key > env var
  let finalKey = apiKey || "";
  if (!finalKey && config.keys && config.keys[meta.id]) {
    finalKey = config.keys[meta.id];
  }
  if (!finalKey) {
    finalKey = config.apiKey || "";
  }
  if (!finalKey && meta.envKey) {
    finalKey = process.env[meta.envKey] || "";
  }

  // Local models don't require API keys
  if (meta.type !== "local" && !finalKey) {
    const sources = meta.envKey
      ? `config file (keys.${meta.id} or apiKey) or environment variable ${meta.envKey}`
      : "config file";
    throw new Error(
      `Provider "${meta.name}" requires an API key.\n` +
        `Please configure it via: laozi config --api-key <key>\n` +
        `Or set the ${sources}.`
    );
  }

  const rawModel = model || config.model;
  const finalModel =
    rawModel && rawModel !== "local-rules" ? rawModel : meta.defaultModel;

  return {
    meta,
    apiKey: finalKey,
    model: finalModel,
  };
}
