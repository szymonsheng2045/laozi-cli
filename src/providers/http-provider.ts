import { Provider, ChatMessage } from "./base.js";
import { ProviderMeta } from "./registry.js";

export class HttpProvider implements Provider {
  name: string;

  constructor(
    private meta: ProviderMeta,
    private apiKey: string,
    private model: string
  ) {
    this.name = meta.id;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);

    try {
      const res = await fetch(`${this.meta.baseURL}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.3,
          max_tokens: 2048,
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`${this.meta.name} error (${res.status}): ${text}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`Empty response from ${this.meta.name}`);
      return content.trim();
    } catch (err: any) {
      clearTimeout(timeout);
      if (err.name === "AbortError") {
        throw new Error(`${this.meta.name} request timed out after 60s`);
      }
      throw err;
    }
  }
}
