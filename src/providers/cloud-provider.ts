import { ChatMessage, Provider } from "./base.js";
import { ProviderMeta } from "./registry.js";

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function extractSection(message: string, start: string, end?: string): string {
  const startIndex = message.indexOf(start);
  if (startIndex === -1) return "";
  const contentStart = startIndex + start.length;
  const endIndex = end ? message.indexOf(end, contentStart) : -1;
  return message.slice(contentStart, endIndex === -1 ? undefined : endIndex).trim();
}

function extractAnalyzePayload(messages: ChatMessage[]): { content: string; context: string } {
  const userMessage = [...messages].reverse().find((message) => message.role === "user")?.content || "";
  const localContext = extractSection(
    userMessage,
    "## Local Knowledge Base Matches (from 中国互联网联合辟谣平台)",
    "\n\n---"
  );

  const firstFence = userMessage.indexOf("---");
  const lastFence = userMessage.lastIndexOf("---");
  const content =
    firstFence !== -1 && lastFence > firstFence
      ? userMessage.slice(firstFence + 3, lastFence).trim()
      : userMessage.trim();

  return { content, context: localContext };
}

export class CloudProvider implements Provider {
  name: string;

  constructor(private meta: ProviderMeta) {
    this.name = meta.id;
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal): Promise<string> {
    const { content, context } = extractAnalyzePayload(messages);
    const baseURL = trimTrailingSlash(process.env.LAOZI_CLOUD_URL || this.meta.baseURL);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 50_000);
    if (signal) {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
    try {
      const res = await fetch(`${baseURL}/api/analyze`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "laozi-cli",
        },
        body: JSON.stringify({ content, context }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`LAOZI Cloud error (${res.status}): ${text}`);
      }

      const data = (await res.json()) as { result?: unknown };
      if (!data.result) {
        throw new Error("LAOZI Cloud returned an empty result.");
      }
      return JSON.stringify(data.result);
    } finally {
      clearTimeout(timeout);
    }
  }
}
