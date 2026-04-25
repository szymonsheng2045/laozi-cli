import { hasDirectMatch, searchPiyao } from "../knowledge-base.js";

describe("knowledge-base search", () => {
  it("does not turn unrelated entertainment news into a debunking match", () => {
    const query = "权力的游戏最新一季今年秋天回归！";
    expect(hasDirectMatch(query).matched).toBe(false);
    expect(searchPiyao(query, 3)).toHaveLength(0);
  });

  it("still matches high-risk scam messages", () => {
    const query = "收到短信说贷款逾期要影响征信，点击链接还款";
    const direct = hasDirectMatch(query);
    const matches = searchPiyao(query, 3);

    expect(direct.matched).toBe(true);
    expect(direct.entry?.claim).toContain("贷款催收");
    expect(matches[0]?.claim).toContain("贷款催收");
  });

  it("prioritizes claim topics over incidental body text", () => {
    const matches = searchPiyao("专家说每天喝醋能软化血管", 3);
    expect(matches[0]?.claim).toContain("软化血管");
  });
});
