import { createProvider } from "../providers/base.js";
import { resolveProviderFromConfig } from "../resolve-provider.js";

describe("resolveProviderFromConfig", () => {
  const baseConfig = {
    version: 1,
    provider: "openai" as const,
    apiKey: "global-key",
    keys: {},
    baseURL: "https://custom.example/v1",
    model: "gpt-custom",
    whisperModel: "whisper-1",
    language: "bilingual" as const,
    judgePanel: [],
    tavilyApiKey: "",
  };

  it("applies custom model and baseURL only to the active provider", () => {
    const current = resolveProviderFromConfig(baseConfig);
    const panelPeer = resolveProviderFromConfig(baseConfig, "kimi");

    expect(current.model).toBe("gpt-custom");
    expect(current.meta.baseURL).toBe("https://custom.example/v1");
    expect(panelPeer.model).toBe("kimi-k2.5");
    expect(panelPeer.meta.baseURL).toBe("https://coding.dashscope.aliyuncs.com/v1");
  });

  it("passes baseURL overrides into provider creation", () => {
    const provider = createProvider({
      provider: "openai",
      apiKey: "key",
      model: "gpt-4o-mini",
      baseURL: "https://proxy.example/v1",
    }) as any;

    expect(provider.meta.baseURL).toBe("https://proxy.example/v1");
  });
});
