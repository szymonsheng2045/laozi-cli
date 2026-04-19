import { RuleBasedProvider } from "../providers/rule-based.js";

const provider = new RuleBasedProvider();

async function analyze(text: string) {
  const raw = await provider.chat([{ role: "user", content: text }]);
  return JSON.parse(raw);
}

describe("rule-based provider", () => {
  it("flags health misinformation", async () => {
    const result = await analyze("专家说了，每天喝醋能软化血管，我已经喝了三个月");
    expect(result.verdict).toBe("misinformation");
    expect(result.redFlags.length).toBeGreaterThan(0);
  });

  it("flags acid-base pseudoscience", async () => {
    const result = await analyze("酸性体质容易得癌症，要多吃碱性食物");
    expect(result.verdict).toBe("misinformation");
    expect(result.credibilityScore).toBeLessThan(20);
  });

  it("flags cancer food misinformation", async () => {
    const result = await analyze("千万别吃这个蔬菜，吃了会得癌，快转发给家人");
    expect(result.verdict).toBe("misinformation");
    expect(result.credibilityScore).toBeLessThan(30);
  });

  it("returns suspicious for unmatched text", async () => {
    const result = await analyze("今天天气不错，适合出去散步");
    expect(result.verdict).toBe("suspicious");
    expect(result.credibilityScore).toBe(60);
  });

  it("returns suspicious for unknown claims", async () => {
    const result = await analyze("听说最近有一种新发现可以治百病");
    expect(result.verdict).toBe("suspicious");
  });
});
