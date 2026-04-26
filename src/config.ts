import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ProviderId =
  | "rule-based"
  | "laozi-cloud"
  | "qwen"
  | "kimi"
  | "deepseek"
  | "zhipu"
  | "minimax"
  | "openai"
  | "anthropic"
  | "gemini"
  | "ollama"
  | "llama-cpp";

export interface Config {
  version: number;
  provider: ProviderId;
  apiKey: string;
  keys: Record<string, string>;
  baseURL: string;
  model: string;
  whisperModel: string;
  language: "zh" | "en" | "bilingual";
  judgePanel: string[];
  tavilyApiKey: string;
}

const configDir = join(homedir(), ".laozi");
const configPath = join(configDir, "config.json");

export const defaultConfig: Config = {
  version: 1,
  provider: "laozi-cloud",
  apiKey: "",
  keys: {},
  baseURL: "",
  model: "laozi-cloud",
  whisperModel: "whisper-1",
  language: "bilingual",
  judgePanel: [],
  tavilyApiKey: "",
};

export function loadConfig(): Config {
  if (!existsSync(configPath)) {
    return { ...defaultConfig };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw);
    // Migrate old configs without version
    if (typeof parsed.version !== "number") {
      parsed.version = 1;
    }
    // Migrate old configs without keys
    if (!parsed.keys || typeof parsed.keys !== "object") {
      parsed.keys = {};
    }
    // Migrate old configs without judgePanel default
    if (!Array.isArray(parsed.judgePanel)) {
      parsed.judgePanel = defaultConfig.judgePanel;
    }
    // Migrate old configs without tavilyApiKey
    if (typeof parsed.tavilyApiKey !== "string") {
      parsed.tavilyApiKey = defaultConfig.tavilyApiKey;
    }
    return { ...defaultConfig, ...parsed };
  } catch {
    return { ...defaultConfig };
  }
}

export function saveConfig(config: Partial<Config>): void {
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const current = loadConfig();
  const next = { ...current, ...config };
  writeFileSync(configPath, JSON.stringify(next, null, 2), "utf-8");
  try {
    chmodSync(configPath, 0o600);
  } catch {
    // Ignore permission errors on Windows
  }
}

export function configPathDisplay(): string {
  return configPath;
}

function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "***";
  return `${value.slice(0, 6)}***${value.slice(-2)}`;
}

export function getRedactedConfig(config: Config): Config {
  return {
    ...config,
    apiKey: maskSecret(config.apiKey),
    keys: Object.fromEntries(
      Object.entries(config.keys || {}).map(([provider, key]) => [provider, maskSecret(key)])
    ),
    tavilyApiKey: maskSecret(config.tavilyApiKey),
  };
}
