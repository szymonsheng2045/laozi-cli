import { ensemble } from "../judge.js";

describe("ensemble", () => {
  it("averages middle scores and votes by majority", () => {
    const results = [
      { credibilityScore: 20, verdict: "misinformation" as const, redFlags: [{ zh: "a", en: "a" }], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
      { credibilityScore: 25, verdict: "misinformation" as const, redFlags: [{ zh: "b", en: "b" }], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
      { credibilityScore: 30, verdict: "misinformation" as const, redFlags: [{ zh: "c", en: "c" }], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
      { credibilityScore: 80, verdict: "safe" as const, redFlags: [], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
    ];
    const result = ensemble(results);
    // Drops highest (80) and lowest (20), averages 25+30 = 27.5
    expect(result.credibilityScore).toBe(28);
    expect(result.verdict).toBe("misinformation");
  });

  it("handles unanimous safe", () => {
    const results = [
      { credibilityScore: 85, verdict: "safe" as const, redFlags: [], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
      { credibilityScore: 90, verdict: "safe" as const, redFlags: [], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
      { credibilityScore: 88, verdict: "safe" as const, redFlags: [], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
    ];
    const result = ensemble(results);
    expect(result.verdict).toBe("safe");
    expect(result.credibilityScore).toBeGreaterThan(80);
  });

  it("deduplicates red flags", () => {
    const results = [
      { credibilityScore: 30, verdict: "misinformation" as const, redFlags: [{ zh: "专家 unnamed", en: "a" }, { zh: "无依据", en: "b" }], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
      { credibilityScore: 35, verdict: "misinformation" as const, redFlags: [{ zh: "专家 unnamed", en: "a" }, { zh: "恐慌", en: "c" }], elderExplanation: { zh: "", en: "" }, actionSuggestion: { zh: "", en: "" }, summary: { zh: "", en: "" } },
    ];
    const result = ensemble(results);
    // Should deduplicate "专家 unnamed"
    expect(result.redFlags.length).toBeLessThanOrEqual(4);
  });

  it("keeps rich explanation fields from the winning verdict bucket", () => {
    const results = [
      {
        credibilityScore: 26,
        verdict: "misinformation" as const,
        redFlags: [{ zh: "a", en: "a" }],
        elderExplanation: { zh: "短说明", en: "short" },
        actionSuggestion: { zh: "短建议", en: "short" },
        summary: { zh: "短总结", en: "short" },
      },
      {
        credibilityScore: 28,
        verdict: "misinformation" as const,
        redFlags: [{ zh: "b", en: "b" }],
        elderExplanation: { zh: "这是一段更完整的解释", en: "longer explanation" },
        actionSuggestion: { zh: "这是更完整的建议", en: "longer action" },
        summary: { zh: "这是更完整的总结", en: "longer summary" },
      },
      {
        credibilityScore: 70,
        verdict: "needs-verification" as const,
        redFlags: [{ zh: "c", en: "c" }],
        elderExplanation: { zh: "别选我", en: "do not pick me" },
        actionSuggestion: { zh: "别选我", en: "do not pick me" },
        summary: { zh: "别选我", en: "do not pick me" },
      },
    ];

    const result = ensemble(results);
    expect(result.verdict).toBe("misinformation");
    expect(result.elderExplanation.zh).toBe("这是一段更完整的解释");
    expect(result.actionSuggestion.zh).toBe("这是更完整的建议");
    expect(result.summary.zh).toBe("这是更完整的总结");
  });
});
