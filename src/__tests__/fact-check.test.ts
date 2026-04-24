import { buildSearchBasedResult } from "../fact-check.js";

describe("buildSearchBasedResult", () => {
  it("does not mark content safe based on search coverage alone", () => {
    const result = buildSearchBasedResult({
      needed: true,
      query: "某地突发消息",
      results: [
        { title: "报道一", url: "https://www.cctv.com/a", snippet: "相关报道" },
        { title: "报道二", url: "https://www.people.com.cn/b", snippet: "相关报道" },
      ],
      summary: "搜索摘要",
      authorityCount: 2,
      authoritySources: ["cctv.com", "people.com.cn"],
    });

    expect(result).not.toBeNull();
    expect(result?.verdict).toBe("needs-verification");
    expect(result?.credibilityScore).toBeLessThan(80);
  });
});
