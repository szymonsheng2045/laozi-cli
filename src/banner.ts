import chalk from "chalk";

export function printBanner() {
  const banner = `
${chalk.hex("#c9a961")("    __    _       __   ____    ________   ._____")}
${chalk.hex("#c9a961")("   / /   / \\     / /  / __ \\  /  ____/ \\  |  __ \\")}
${chalk.hex("#e8e0d5")("  / /   / _ \\   / /  / / / / /  / __   \\  | |  | |")}
${chalk.hex("#e8e0d5")(" / /___/ ___ \\ / /  / /_/ / /  /_/ /   /  | |__| |")}
${chalk.hex("#888888")("/_____/_/   \\_\\/_/   \\____/  \\_____/   /   |_____/")}
`;

  console.log(banner);
  console.log(`  ${chalk.dim("v0.1.0")}  ·  ${chalk.hex("#c9a961")("帮助家庭识别针对老人的网络虚假信息")}`);
  console.log(`         ${chalk.dim("Helping families spot misinformation targeting elders")}`);
  console.log("");
  console.log(`  ${chalk.bold("用法 / Usage:")}`);
  console.log(`    ${chalk.cyan("laozi check <text>")}          分析文字内容的真实性`);
  console.log(`    ${chalk.cyan("laozi voice <filepath>")}      分析语音消息的真实性`);
  console.log(`    ${chalk.cyan("laozi history")}               查看历史分析记录`);
  console.log(`    ${chalk.cyan("laozi export [filepath]")}     导出最近一次报告为 Markdown`);
  console.log(`    ${chalk.cyan("laozi config")}                配置 API Key 和模型`);
  console.log("");
  console.log(`  ${chalk.bold("快速开始 / Quick Start:")}`);
  console.log(`    ${chalk.dim("# 零配置，即用即走（本地规则引擎）")}`);
  console.log(`    ${chalk.yellow("laozi check \"专家说每天喝醋能软化血管\"")}`);
  console.log("");
  console.log(`    ${chalk.dim("# 升级到本地 AI 模型（Ollama）")}`);
  console.log(`    ${chalk.yellow("laozi config --provider ollama --model qwen2.5:7b")}`);
  console.log(`    ${chalk.yellow("laozi check \"群里转发的养生文章\"")}`);
  console.log("");
}
