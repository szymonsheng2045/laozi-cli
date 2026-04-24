import OpenAI from "openai";
import { Config } from "./config.js";
import { resolveProviderFromConfig } from "./resolve-provider.js";

export function createClient(config: Config) {
  // voice 转录优先复用当前 provider 的认证与 baseURL；
  // 若当前仍是 rule-based，则退回到全局 OpenAI-compatible 配置。
  const resolved =
    config.provider !== "rule-based"
      ? resolveProviderFromConfig(config)
      : {
          apiKey: config.apiKey,
          baseURL: config.baseURL || "",
        };

  return new OpenAI({
    apiKey: resolved.apiKey,
    baseURL: ("meta" in resolved ? resolved.meta.baseURL : resolved.baseURL) || undefined,
    timeout: 60000,
    maxRetries: 2,
  });
}

export async function chatCompletion(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[]
): Promise<string> {
  const res = await client.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from LLM");
  return content;
}
