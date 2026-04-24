import { RuleBasedProvider } from "./rule-based.js";
import { HttpProvider } from "./http-provider.js";
import { getProviderMeta } from "./registry.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Provider {
  name: string;
  chat(messages: ChatMessage[], signal?: AbortSignal, options?: { enableSearch?: boolean }): Promise<string>;
  healthCheck?(): Promise<boolean>;
}

export function createProvider(config: {
  provider: string;
  apiKey?: string;
  model: string;
  baseURL?: string;
}): Provider {
  if (config.provider === "rule-based") {
    return new RuleBasedProvider();
  }

  const meta = getProviderMeta(config.provider);
  if (!meta) {
    throw new Error(`Unknown provider: ${config.provider}`);
  }

  const resolvedMeta =
    config.baseURL && config.baseURL !== meta.baseURL
      ? { ...meta, baseURL: config.baseURL }
      : meta;

  if (resolvedMeta.type === "anthropic") {
    // Anthropic native SDK can be added later; for now fall back to HTTP if possible
    throw new Error(
      `Provider "${resolvedMeta.name}" is not yet supported in this version. ` +
        `Please use an OpenAI-compatible provider like qwen, kimi, or deepseek.`
    );
  }

  return new HttpProvider(resolvedMeta, config.apiKey || "", config.model);
}
