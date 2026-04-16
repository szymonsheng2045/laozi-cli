import OpenAI from "openai";
import { Config } from "./config.js";

export function createClient(config: Config) {
  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
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
    response_format: { type: "json_object" },
  });
  const content = res.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from LLM");
  return content;
}
