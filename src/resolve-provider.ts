import type { Config } from "./config.js";
import { loadConfig } from "./config.js";
import { getProviderMeta, ProviderMeta } from "./providers/registry.js";

export interface ResolvedProvider {
  meta: ProviderMeta;
  apiKey: string;
  model: string;
}

export function resolveProviderFromConfig(
  config: Config,
  providerId?: string,
  apiKey?: string,
  model?: string
): ResolvedProvider {
  const finalProviderId = providerId || config.provider;
  const applyConfiguredOverrides = providerId === undefined || finalProviderId === config.provider;

  // Special case: rule-based provider
  if (finalProviderId === "rule-based") {
    const modelOverride = model || (applyConfiguredOverrides ? config.model : "");
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
      model: modelOverride || "local-rules",
    };
  }

  const registryMeta = getProviderMeta(finalProviderId);

  if (!registryMeta) {
    throw new Error(`Unknown provider: ${finalProviderId}`);
  }

  // Priority: explicit arg > provider-specific key > global config key > env var
  let finalKey = apiKey || "";
  if (!finalKey && config.keys && config.keys[registryMeta.id]) {
    finalKey = config.keys[registryMeta.id];
  }
  if (!finalKey) {
    finalKey = config.apiKey || "";
  }
  if (!finalKey && registryMeta.envKey) {
    finalKey = process.env[registryMeta.envKey] || "";
  }

  // Local models don't require API keys
  if (registryMeta.type !== "local" && !finalKey) {
    const sources = registryMeta.envKey
      ? `config file (keys.${registryMeta.id} or apiKey) or environment variable ${registryMeta.envKey}`
      : "config file";
    throw new Error(
      `Provider "${registryMeta.name}" requires an API key.\n` +
        `Please configure it via: laozi config --api-key <key>\n` +
        `Or set the ${sources}.`
    );
  }

  const rawModel = model || (applyConfiguredOverrides ? config.model : "");
  const finalModel =
    rawModel && rawModel !== "local-rules" ? rawModel : registryMeta.defaultModel;
  const finalBaseURL =
    (applyConfiguredOverrides ? config.baseURL : "") || registryMeta.baseURL;
  const meta =
    finalBaseURL === registryMeta.baseURL
      ? registryMeta
      : { ...registryMeta, baseURL: finalBaseURL };

  return {
    meta,
    apiKey: finalKey,
    model: finalModel,
  };
}

export function resolveProvider(
  providerId?: string,
  apiKey?: string,
  model?: string
): ResolvedProvider {
  return resolveProviderFromConfig(loadConfig(), providerId, apiKey, model);
}
