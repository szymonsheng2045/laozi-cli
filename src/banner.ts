import chalk from "chalk";

const GRAY = chalk.hex("#888888");
const DIM = chalk.dim;

// 内容区宽度
const CONTENT_WIDTH = 40;
const BASE_PAD = "  ";

// Figlet "small" font — 统一宽度 25，确保块整体居中
const LOGO_WIDTH = 25;
const LOGO_PAD = " ".repeat(Math.floor((CONTENT_WIDTH - LOGO_WIDTH) / 2)); // 7 空格

const LOGO_LINES = [
  { text: "_      _   ___ _______   ", color: "#e8d5a3" },   // 浅金
  { text: "| |    /_\\ / _ \\_  /_ _|", color: "#c9a961" },  // 中金
  { text: "| |__ / _ \\ (_) / / | | ", color: "#a08040" },  // 暗金
  { text: "|____/_/ \\____/___|___| ", color: "#6b4e0a" }, // 深褐
];

export function printBanner() {
  console.log("");

  // Logo — 块整体居中 + 从亮到暗的渐变金色
  for (const line of LOGO_LINES) {
    console.log(BASE_PAD + LOGO_PAD + chalk.hex(line.color)(line.text));
  }

  console.log("");

  // 标语居中
  const tagline = "帮助家人识别网络谣言  ·  laozi.art";
  const taglineWidth = 34; // 10中文×2 + 5符号 + 9英文 = 34（East Asian Width）
  const taglinePad = " ".repeat(Math.floor((CONTENT_WIDTH - taglineWidth) / 2));
  console.log(BASE_PAD + taglinePad + GRAY(tagline));

  console.log("");
  console.log(chalk.hex("#4a3f2a")(BASE_PAD + "=".repeat(CONTENT_WIDTH)));
  console.log("");
  console.log(`${BASE_PAD}${DIM("v0.1.0")}  ·  ${chalk.hex("#c9a961")("laozi.cli")}`);
  console.log("");

  console.log(`${BASE_PAD}${chalk.bold("用法 / Usage:")}`);
  console.log(`${BASE_PAD}  ${chalk.cyan("laozi check <text>")}          分析文字内容的真实性`);
  console.log(`${BASE_PAD}  ${chalk.cyan("laozi voice <filepath>")}      分析语音消息的真实性`);
  console.log(`${BASE_PAD}  ${chalk.cyan("laozi history")}               查看历史分析记录`);
  console.log(`${BASE_PAD}  ${chalk.cyan("laozi export [filepath]")}     导出最近一次报告为 Markdown`);
  console.log(`${BASE_PAD}  ${chalk.cyan("laozi config")}                配置 API Key 和模型`);
  console.log("");
  console.log(`${BASE_PAD}${chalk.bold("快速开始 / Quick Start:")}`);
  console.log(`${BASE_PAD}  ${DIM("# 零配置，即用即走（默认 LAOZI Cloud）")}`);
  console.log(`${BASE_PAD}  ${chalk.yellow('laozi check "专家说每天喝醋能软化血管"')}`);
  console.log("");
  console.log(`${BASE_PAD}  ${DIM("# 完全本地模式（不发送到云端）")}`);
  console.log(`${BASE_PAD}  ${chalk.yellow("laozi config --provider rule-based")}`);
  console.log("");
  console.log(`${BASE_PAD}  ${DIM("# 升级到本地 AI 模型（Ollama）")}`);
  console.log(`${BASE_PAD}  ${chalk.yellow("laozi config --provider ollama --model qwen2.5:7b")}`);
  console.log(`${BASE_PAD}  ${chalk.yellow('laozi check "群里转发的养生文章"')}`);
  console.log("");
}
