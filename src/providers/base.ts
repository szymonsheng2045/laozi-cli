import { RuleBasedProvider } from "./rule-based.js";

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
  baseURL?: string;
  apiKey?: string;
  model: string;
}): Provider {
  switch (config.provider) {
    case "rule-based":
      return new RuleBasedProvider();
    case "ollama":
      return new OllamaProvider(config.baseURL || "http://localhost:11434", config.model);
    case "llama-cpp":
      return new LlamaCppProvider(config.baseURL || "http://localhost:8080");
    case "openai":
      return new OpenAIProvider(config.baseURL || "https://api.openai.com/v1", config.apiKey || "", config.model);
    default:
      throw new Error(`Unknown provider: ${config.provider}`);
  }
}

// Ollama Provider
class OllamaProvider implements Provider {
  name = "ollama";
  constructor(
    private baseURL: string,
    private model: string
  ) {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseURL}/api/tags`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseURL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        messages,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 1024,
        },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Ollama error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { message?: { content?: string } };
    const content = data.message?.content;
    if (!content) throw new Error("Empty response from Ollama");
    return content.trim();
  }
}

// llama.cpp server Provider
class LlamaCppProvider implements Provider {
  name = "llama-cpp";
  constructor(private baseURL: string) {}

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseURL}/health`, { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    // llama.cpp server uses /completion with a prompt
    const prompt = this.buildPrompt(messages);
    const res = await fetch(`${this.baseURL}/completion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        temperature: 0.3,
        n_predict: 1024,
        stop: ["<|im_end|>", "<|endoftext|>", "###"],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`llama.cpp error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as { content?: string };
    const content = data.content;
    if (!content) throw new Error("Empty response from llama.cpp");
    return content.trim();
  }

  private buildPrompt(messages: ChatMessage[]): string {
    // Simple chat template for models like Qwen, Llama-3, etc.
    let prompt = "";
    for (const m of messages) {
      if (m.role === "system") {
        prompt += `<|im_start|>system\n${m.content}<|im_end|>\n`;
      } else if (m.role === "user") {
        prompt += `<|im_start|>user\n${m.content}<|im_end|>\n`;
      } else {
        prompt += `<|im_start|>assistant\n${m.content}<|im_end|>\n`;
      }
    }
    prompt += "<|im_start|>assistant\n";
    return prompt;
  }
}

// OpenAI compatible Provider
class OpenAIProvider implements Provider {
  name = "openai";
  constructor(
    private baseURL: string,
    private apiKey: string,
    private model: string
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseURL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI error (${res.status}): ${text}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error("Empty response from OpenAI");
    return content.trim();
  }
}
