import { RuleBasedProvider } from "./rule-based.js";
import { HttpProvider } from "./http-provider.js";
import { getProviderMeta } from "./registry.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface Provider {
  name: string;
  chat(messages: ChatMessage[]): Promise<string>;
  healthCheck?(): Promise<boolean>;
}

export function createProvider(config: {
  provider: string;
  apiKey?: string;
  model: string;
}): Provider {
  if (config.provider === "rule-based") {
    return new RuleBasedProvider();
  }

  const meta = getProviderMeta(config.provider);
  if (!meta) {
    throw new Error(`Unknown provider: ${config.provider}`);
  }

  if (meta.type === "anthropic") {
    // Anthropic native SDK can be added later; for now fall back to HTTP if possible
    throw new Error(
      `Provider "${meta.name}" is not yet supported in this version. ` +
        `Please use an OpenAI-compatible provider like qwen, kimi, or deepseek.`
    );
  }

  return new HttpProvider(meta, config.apiKey || "", config.model);
}
