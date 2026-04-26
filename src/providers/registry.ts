export interface ProviderMeta {
  id: string;
  name: string;
  type: "openai" | "anthropic" | "local" | "cloud";
  baseURL: string;
  defaultModel: string;
  envKey: string;
  region: "cn" | "global";
}

export const PROVIDERS: Record<string, ProviderMeta> = {
  // LAOZI.CLI hosted analysis service. The API key stays on laozi.art.
  "laozi-cloud": {
    id: "laozi-cloud",
    name: "LAOZI Cloud",
    type: "cloud",
    baseURL: "https://laozi.art",
    defaultModel: "laozi-cloud",
    envKey: "",
    region: "global",
  },
  // 阿里云百炼统一入口（Coding Plan 推荐）
  // 一个 API Key 调用 Qwen / Kimi / GLM / MiniMax 四家模型
  qwen: {
    id: "qwen",
    name: "通义千问 (Qwen)",
    type: "openai",
    baseURL: "https://coding.dashscope.aliyuncs.com/v1",
    defaultModel: "qwen3.5-plus",
    envKey: "DASHSCOPE_API_KEY",
    region: "cn",
  },
  kimi: {
    id: "kimi",
    name: "Kimi (Moonshot)",
    type: "openai",
    baseURL: "https://coding.dashscope.aliyuncs.com/v1",
    defaultModel: "kimi-k2.5",
    envKey: "DASHSCOPE_API_KEY",
    region: "cn",
  },
  zhipu: {
    id: "zhipu",
    name: "智谱 (GLM)",
    type: "openai",
    baseURL: "https://coding.dashscope.aliyuncs.com/v1",
    defaultModel: "glm-5",
    envKey: "DASHSCOPE_API_KEY",
    region: "cn",
  },
  minimax: {
    id: "minimax",
    name: "MiniMax",
    type: "openai",
    baseURL: "https://coding.dashscope.aliyuncs.com/v1",
    defaultModel: "MiniMax-M2.5",
    envKey: "DASHSCOPE_API_KEY",
    region: "cn",
  },
  // 其他中国大陆模型
  deepseek: {
    id: "deepseek",
    name: "DeepSeek",
    type: "openai",
    baseURL: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    envKey: "DEEPSEEK_API_KEY",
    region: "cn",
  },
  // 国际主流模型
  openai: {
    id: "openai",
    name: "OpenAI",
    type: "openai",
    baseURL: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini",
    envKey: "OPENAI_API_KEY",
    region: "global",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic Claude",
    type: "anthropic",
    baseURL: "https://api.anthropic.com/v1",
    defaultModel: "claude-3-5-sonnet-20241022",
    envKey: "ANTHROPIC_API_KEY",
    region: "global",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    type: "openai",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    defaultModel: "gemini-2.0-flash",
    envKey: "GEMINI_API_KEY",
    region: "global",
  },
  // 本地模型
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    type: "openai",
    baseURL: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:7b",
    envKey: "",
    region: "global",
  },
  "llama-cpp": {
    id: "llama-cpp",
    name: "llama.cpp (Local)",
    type: "openai",
    baseURL: "http://localhost:8080/v1",
    defaultModel: "local",
    envKey: "",
    region: "global",
  },
};

export function getProviderMeta(id: string): ProviderMeta | undefined {
  return PROVIDERS[id];
}

export function listProviders(): ProviderMeta[] {
  return Object.values(PROVIDERS);
}

export function listProviderIds(): string[] {
  return Object.keys(PROVIDERS);
}
