import OpenAI from "openai";
import { Config } from "./config.js";

export function createClient(config: Config) {
  // voice 转录需要确定当前 provider 对应的 key 和 baseURL
  // 优先级：provider-specific key > 全局 apiKey > 空
  const resolved = (() => {
    const metaBase = config.baseURL;
    if (config.provider !== "rule-based" && config.keys?.[config.provider]) {
      return {
        apiKey: config.keys[config.provider],
        baseURL: metaBase,
      };
    }
    return {
      apiKey: config.apiKey,
      baseURL: metaBase,
    };
  })();

  return new OpenAI({
    apiKey: resolved.apiKey,
    baseURL: resolved.baseURL || undefined,
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
