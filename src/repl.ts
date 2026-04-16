import readline from "node:readline";
import chalk from "chalk";
import { loadConfig } from "./config.js";
import { createProvider, Provider } from "./providers/base.js";
import { resolveProvider } from "./resolve-provider.js";
import { analyzeContent } from "./analyzer.js";
import { printResult, printInfo, printError, printFactCheck } from "./printer.js";
import { ensemble, runSingleJudge } from "./judge.js";
import { saveHistoryEntry } from "./history.js";
import { runFactCheck } from "./fact-check.js";
import ora from "ora";

export async function startREPL() {
  const config = loadConfig();
  const usePanel = config.judgePanel.length > 0;

  console.log(chalk.hex("#c9a961")("\n欢迎来到 laozi.cli — 输入文字即可分析，输入 /quit 退出\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.hex("#c9a961")("laozi ") + chalk.gray("> "),
  });

  rl.prompt();

  rl.on("line", async (input) => {
    const text = input.trim();
    if (!text) {
      rl.prompt();
      return;
    }
    if (text === "/quit" || text === "/exit" || text === "/q") {
      console.log(chalk.gray("\n再见。\n"));
      rl.close();
      return;
    }
    if (text === "/help") {
      console.log("");
      console.log("  /quit    退出");
      console.log("  /config  查看当前配置");
      console.log("  /history 查看分析历史");
      console.log("");
      rl.prompt();
      return;
    }
    if (text === "/config") {
      console.log("");
      console.log(JSON.stringify(config, null, 2));
      console.log("");
      rl.prompt();
      return;
    }
    if (text === "/history") {
      const { loadHistory, formatHistoryPreview } = await import("./history.js");
      const history = loadHistory();
      if (history.length === 0) {
        printInfo("暂无历史记录");
      } else {
        console.log("\n最近分析记录：\n");
        history.forEach((entry, i) => {
          console.log(`  ${i + 1}. ${formatHistoryPreview(entry)}`);
        });
        console.log("");
      }
      rl.prompt();
      return;
    }

    // Analyze the input
    try {
      // Step 1: Fact-check layer
      const fcSpinner = ora("正在判断是否需要联网核查...").start();
      const factCheck = await runFactCheck(text);
      fcSpinner.stop();
      if (factCheck.needed) {
        printFactCheck(factCheck.query, factCheck.results);
      }

      if (usePanel) {
        const panelIds = config.judgePanel;
        if (panelIds.length === 1 && panelIds[0] === "rule-based") {
          printError("多模型委员会模式需要配置至少一个 API provider。\n示例: laozi config --judge-panel qwen,kimi,zhipu,minimax");
          rl.prompt();
          return;
        }

        const spinner = ora(`正在启动 ${panelIds.length} 模型委员会分析...`).start();
        const providers: Provider[] = [];
        for (const id of panelIds) {
          const resolved = resolveProvider(id);
          providers.push(createProvider({ provider: resolved.meta.id, apiKey: resolved.apiKey, model: resolved.model }));
        }

        const searchCtx = factCheck.needed ? factCheck.summary : undefined;
        const votes = await Promise.all(
          providers.map((p) => runSingleJudge(p, text, searchCtx).catch((e) => {
            return { provider: p.name, error: e.message || String(e) } as any;
          }))
        );

        const validVotes = votes.filter((v) => !v.error);
        if (validVotes.length === 0) {
          spinner.stop();
          printError("所有模型分析均失败。\n" + votes.map((v) => `${v.provider}: ${v.error}`).join("\n"));
          rl.prompt();
          return;
        }

        const result = ensemble(validVotes);
        spinner.stop();
        printResult(result, config.language);
        saveHistoryEntry({
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          inputType: "text",
          inputPreview: text,
          result,
        });
      } else {
        const { provider } = await getSingleProvider();
        const spinner = ora("正在分析内容...").start();
        const result = await analyzeContent(provider, config, text);
        spinner.stop();
        printResult(result, config.language);
        saveHistoryEntry({
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          inputType: "text",
          inputPreview: text,
          result,
        });
      }
    } catch (err: any) {
      printError(err.message || String(err));
    }

    rl.prompt();
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

async function getSingleProvider() {
  const resolved = resolveProvider();
  const provider = createProvider({
    provider: resolved.meta.id,
    apiKey: resolved.apiKey,
    model: resolved.model,
  });

  if (provider.healthCheck) {
    const ok = await provider.healthCheck();
    if (!ok) {
      printError(`${provider.name} 服务未运行或无法连接。`);
      process.exit(1);
    }
  }

  return { provider };
}
