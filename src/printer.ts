import chalk from "chalk";
import { AnalysisResult } from "./analyzer.js";

function getVerdictColor(verdict: AnalysisResult["verdict"]) {
  switch (verdict) {
    case "safe":
      return chalk.green;
    case "suspicious":
      return chalk.yellow;
    case "misinformation":
      return chalk.hex("#FF8800");
    case "scam":
      return chalk.red;
    default:
      return chalk.gray;
  }
}

function getVerdictLabel(verdict: AnalysisResult["verdict"]) {
  const map: Record<string, { zh: string; en: string }> = {
    safe: { zh: "安全", en: "Safe" },
    suspicious: { zh: "可疑", en: "Suspicious" },
    misinformation: { zh: "虚假信息", en: "Misinformation" },
    scam: { zh: "诈骗", en: "Scam" },
  };
  return map[verdict] ?? { zh: verdict, en: verdict };
}

function scoreToEmoji(score: number) {
  if (score >= 80) return "🟢";
  if (score >= 50) return "🟡";
  if (score >= 25) return "🟠";
  return "🔴";
}

export function printResult(result: AnalysisResult, language: string) {
  const vColor = getVerdictColor(result.verdict);
  const vLabel = getVerdictLabel(result.verdict);
  const line = chalk.gray("━".repeat(50));

  console.log("\n" + line);
  console.log(chalk.bold("  可信度分析 / Credibility Analysis"));
  console.log(line);

  console.log(
    `\n  ${scoreToEmoji(result.credibilityScore)} ${chalk.bold("可信度 / Score:")} ${result.credibilityScore}/100 ${vColor(`[${vLabel.zh} / ${vLabel.en}]`)}`
  );

  if (result.redFlags.length > 0) {
    console.log(`\n  ${chalk.bold("主要疑点 / Red Flags:")}`);
    result.redFlags.forEach((flag, i) => {
      if (language === "bilingual") {
        console.log(`    ${i + 1}. ${flag.zh}`);
        console.log(`       ${chalk.gray(flag.en)}`);
      } else if (language === "zh") {
        console.log(`    ${i + 1}. ${flag.zh}`);
      } else {
        console.log(`    ${i + 1}. ${flag.en}`);
      }
    });
  }

  console.log(`\n  ${chalk.bold("给老人的一句话 / For the Elder:")}`);
  if (language === "bilingual") {
    console.log(`  ${chalk.cyan(result.elderExplanation.zh)}`);
    console.log(`  ${chalk.gray(result.elderExplanation.en)}`);
  } else if (language === "zh") {
    console.log(`  ${chalk.cyan(result.elderExplanation.zh)}`);
  } else {
    console.log(`  ${chalk.cyan(result.elderExplanation.en)}`);
  }

  console.log(`\n  ${chalk.bold("建议操作 / Suggested Action:")}`);
  if (language === "bilingual") {
    console.log(`  ${result.actionSuggestion.zh}`);
    console.log(`  ${chalk.gray(result.actionSuggestion.en)}`);
  } else if (language === "zh") {
    console.log(`  ${result.actionSuggestion.zh}`);
  } else {
    console.log(`  ${result.actionSuggestion.en}`);
  }

  console.log(`\n  ${chalk.bold("总结 / Summary:")}`);
  if (language === "bilingual") {
    console.log(`  ${result.summary.zh}`);
    console.log(`  ${chalk.gray(result.summary.en)}`);
  } else if (language === "zh") {
    console.log(`  ${result.summary.zh}`);
  } else {
    console.log(`  ${result.summary.en}`);
  }

  console.log("\n" + line + "\n");
}

export function printError(msg: string) {
  console.error(chalk.red("\n✖ Error: " + msg + "\n"));
}

export function printInfo(msg: string) {
  console.log(chalk.blue("ℹ " + msg));
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
