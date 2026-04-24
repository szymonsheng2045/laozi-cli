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

  private supportsSearch(): boolean {
    // 只有阿里云百炼统一入口支持 enable_search
    return this.meta.baseURL.includes("dashscope");
  }

  async chat(messages: ChatMessage[], signal?: AbortSignal, options?: { enableSearch?: boolean }): Promise<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: 0.3,
      max_tokens: 4096,
    };
    if (options?.enableSearch !== false && this.supportsSearch()) {
      body.enable_search = true;
    }

    const doRequest = async (useSearch: boolean): Promise<string> => {
      const reqBody = { ...body };
      if (useSearch) {
        reqBody.enable_search = true;
      } else {
        delete reqBody.enable_search;
      }

      const controller = new AbortController();
      let abortedByTimeout = false;
      const timeout = setTimeout(() => {
        abortedByTimeout = true;
        controller.abort();
      }, 60000);

      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timeout);
          controller.abort();
        });
      }

      try {
        const res = await fetch(`${this.meta.baseURL}/chat/completions`, {
          method: "POST",
          signal: controller.signal,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify(reqBody),
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
          if (abortedByTimeout) {
            throw new Error(`${this.meta.name} request timed out after 60s`);
          }
          throw new Error(`${this.meta.name} request aborted (caller timeout)`);
        }
        throw err;
      }
    };

    try {
      return await doRequest(this.supportsSearch());
    } catch (err: any) {
      if (err.message?.includes("does not support enable_search") && this.supportsSearch()) {
        return doRequest(false);
      }
      throw err;
    }
  }

  async healthCheck(): Promise<boolean> {
    // Some providers (e.g. Aliyun DashScope coding plan) do not expose /models endpoint.
    // Fall back to a lightweight chat completion probe.
    // Note: qwen3.5-plus can be very slow (>8s even for a tiny probe), so use a generous timeout.
    try {
      const res = await fetch(`${this.meta.baseURL}/models`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
      // If /models returns 404, try a minimal chat completion as health probe
      if (res.status === 404) {
        const probe = await fetch(`${this.meta.baseURL}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          signal: AbortSignal.timeout(25000),
          body: JSON.stringify({
            model: this.model,
            messages: [{ role: "user", content: "hi" }],
            max_tokens: 5,
          }),
        });
        return probe.ok;
      }
      return false;
    } catch {
      return false;
    }
  }
}
