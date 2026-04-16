import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Config {
  provider: "rule-based" | "ollama" | "llama-cpp" | "openai";
  apiKey: string;
  baseURL: string;
  model: string;
  whisperModel: string;
  language: "zh" | "en" | "bilingual";
}

const configDir = join(homedir(), ".laozi");
const configPath = join(configDir, "config.json");

export const defaultConfig: Config = {
  provider: "rule-based",
  apiKey: "",
  baseURL: "",
  model: "local-rules",
  whisperModel: "whisper-1",
  language: "bilingual",
};

export function loadConfig(): Config {
  if (!existsSync(configPath)) {
    return { ...defaultConfig };
  }
  try {
    const raw = readFileSync(configPath, "utf-8");
    return { ...defaultConfig, ...JSON.parse(raw) };
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
}

export function configPathDisplay(): string {
  return configPath;
}
