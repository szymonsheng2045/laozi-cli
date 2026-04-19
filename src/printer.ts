import chalk from "chalk";

export function printError(msg: string) {
  console.error(chalk.red("\n✖ Error: " + msg + "\n"));
}

export function printInfo(msg: string) {
  console.log(chalk.blue("ℹ " + msg));
}

function scoreBar(score: number): string {
  const filled = Math.round(score / 5);
  const empty = 20 - filled;
  let color = chalk.green;
  if (score < 80) color = chalk.yellow;
  if (score < 50) color = chalk.hex("#FFA500");
  if (score < 25) color = chalk.red;
  return color("█".repeat(filled)) + chalk.gray("░".repeat(empty));
}

function verdictEmoji(verdict: string): string {
  switch (verdict) {
    case "safe": return "🟢";
    case "suspicious": return "🟡";
    case "misinformation": return "🟠";
    case "scam": return "🔴";
    default: return "⚪";
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function verdictColor(verdict: string): any {
  switch (verdict) {
    case "safe": return chalk.green;
    case "suspicious": return chalk.yellow;
    case "misinformation": return chalk.hex("#FFA500");
    case "scam": return chalk.red;
    default: return chalk.gray;
  }
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "safe": return "安全 / Safe";
    case "suspicious": return "可疑 / Suspicious";
    case "misinformation": return "虚假信息 / Misinformation";
    case "scam": return "诈骗 / Scam";
    default: return verdict;
  }
}

export interface AnalysisResult {
  credibilityScore: number;
  verdict: "safe" | "suspicious" | "misinformation" | "scam";
  redFlags: { zh: string; en: string }[];
  elderExplanation: { zh: string; en: string };
  actionSuggestion: { zh: string; en: string };
  summary: { zh: string; en: string };
}

export function printResult(result: AnalysisResult, lang: string = "bilingual") {
  const line = chalk.hex("#c9a961")("━".repeat(50));
  console.log("\n" + line);
  console.log(chalk.bold("  可信度分析 / Credibility Analysis"));
  console.log(line);

  console.log("");
  const vLabel = verdictLabel(result.verdict);
  const vEmoji = verdictEmoji(result.verdict);
  const vColor = verdictColor(result.verdict);
  console.log(`  ${vEmoji} ${vColor.bold(result.credibilityScore + "/100")} ${vColor(`[${vLabel}]`)}`);
  console.log(`  ${scoreBar(result.credibilityScore)}`);

  if (result.redFlags.length > 0) {
    console.log("");
    console.log(chalk.bold("  主要疑点 / Red Flags:"));
    result.redFlags.forEach((f, i) => {
      if (lang === "zh" || lang === "bilingual") {
        console.log(`    ${i + 1}. ${f.zh}`);
      }
      if (lang === "en" || lang === "bilingual") {
        console.log(`       ${chalk.gray(f.en)}`);
      }
    });
  }

  console.log("");
  console.log(chalk.bold("  给老人的一句话 / For the Elder:"));
  if (lang === "zh" || lang === "bilingual") {
    console.log(`  ${result.elderExplanation.zh}`);
  }
  if (lang === "en" || lang === "bilingual") {
    console.log(`  ${chalk.gray(result.elderExplanation.en)}`);
  }

  console.log("");
  console.log(chalk.bold("  建议操作 / Suggested Action:"));
  if (lang === "zh" || lang === "bilingual") {
    console.log(`  ${result.actionSuggestion.zh}`);
  }
  if (lang === "en" || lang === "bilingual") {
    console.log(`  ${chalk.gray(result.actionSuggestion.en)}`);
  }

  console.log("");
  console.log(chalk.bold("  总结 / Summary:"));
  if (lang === "zh" || lang === "bilingual") {
    console.log(`  ${result.summary.zh}`);
  }
  if (lang === "en" || lang === "bilingual") {
    console.log(`  ${chalk.gray(result.summary.en)}`);
  }

  console.log("\n" + line + "\n");
}

export function printFactCheck(query: string, results: { title: string; url: string; snippet: string }[]) {
  const line = chalk.gray("━".repeat(50));
  console.log("\n" + line);
  console.log(chalk.bold("  联网事实核查 / Web Fact Check"));
  console.log(chalk.gray(`  搜索词: ${query}`));
  console.log(line);
  if (results.length === 0) {
    console.log(`  ${chalk.yellow("⚠ 暂未获取到搜索结果，将基于模型知识库继续分析。")}`);
    console.log(`  ${chalk.gray("Search returned no results; continuing with model knowledge base.")}`);
  } else {
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${chalk.cyan(r.title)}`);
      console.log(`     ${chalk.gray(r.snippet.slice(0, 80))}${r.snippet.length > 80 ? "…" : ""}`);
      console.log(`     ${chalk.dim(r.url)}`);
    });
  }
  console.log(line + "\n");
}

export function printStage(label: string, icon: string = "◆") {
  console.log(`  ${chalk.hex("#c9a961")(icon)} ${chalk.bold(label)}`);
}

export function printModelProgress(name: string, status: "running" | "done" | "error") {
  const icon = status === "running" ? chalk.yellow("◌") : status === "done" ? chalk.green("✓") : chalk.red("✗");
  const label = status === "running" ? chalk.gray("分析中...") : status === "done" ? chalk.gray("完成") : chalk.gray("失败");
  console.log(`    ${icon} ${name.padEnd(18)} ${label}`);
}
