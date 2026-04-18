import readline from "node:readline";
import chalk from "chalk";
import { loadConfig } from "./config.js";
import { createProvider, Provider } from "./providers/base.js";
import { resolveProvider } from "./resolve-provider.js";
import { printResult, printInfo, printError, printFactCheck, printStage, printModelProgress } from "./printer.js";
import { ensemble, runJudge, AnalysisResult } from "./judge.js";
import { saveHistoryEntry } from "./history.js";
import { runFactCheck } from "./fact-check.js";
import { SessionMemory } from "./session.js";
import { extractStructured, Extraction } from "./extractor.js";
import { buildQuestions } from "./questioner.js";
import { runFollowUp } from "./follow-up.js";
import ora from "ora";

const COMMANDS = ["/quit", "/exit", "/q", "/help", "/config", "/history", "/copy", "/done"];

function completer(line: string): [string[], string] {
  if (line.startsWith("/")) {
    const hits = COMMANDS.filter((c) => c.startsWith(line));
    if (hits.length === 0) return [[], line];
    return [hits, line];
  }
  return [[], line];
}

async function animateExtraction(provider: Provider, text: string): Promise<Extraction> {
  const hints = [
    "正在识别信息类型...",
    "正在提取声称的事实...",
    "正在识别人物与机构...",
    "正在检测操纵信号...",
    "正在评估信息完整性...",
    "正在整理结构化数据...",
  ];

  let current = 0;
  let stopped = false;

  // Print first hint
  console.log(`  ${chalk.yellow("◌")} ${hints[0]}`);

  const interval = setInterval(() => {
    if (stopped) return;
    current = (current + 1) % hints.length;
    console.log(`  ${chalk.yellow("◌")} ${hints[current]}`);
  }, 2500);

  try {
    const extraction = await extractStructured(provider, text);
    stopped = true;
    clearInterval(interval);
    return extraction;
  } catch (err) {
    stopped = true;
    clearInterval(interval);
    throw err;
  }
}

export async function startREPL() {
  const config = loadConfig();
  const usePanel = config.judgePanel.length > 0;
  const session = new SessionMemory();

  // Follow-up state
  let lastExtraction: Extraction | null = null;
  let lastResult: AnalysisResult | null = null;
  let lastOriginalText = "";
  let followUpRound = 0;

  console.log(chalk.hex("#c9a961")("\n欢迎来到 laozi.cli — 输入文字即可分析，输入 /quit 退出\n"));
  console.log(chalk.gray("  提示：输入 / 后按 Tab 键可查看可用命令\n"));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.hex("#c9a961")("laozi ") + chalk.gray("> "),
    completer,
  });

  const askQuestion = (q: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(chalk.hex("#c9a961")(`  [追问] `) + chalk.bold(q) + " ", (answer) => {
        resolve(answer.trim());
      });
    });
  };

  rl.prompt();

  rl.on("line", async (input) => {
    const text = input.trim();

    // Show command list if user typed just "/"
    if (text === "/") {
      console.log("");
      console.log(chalk.bold("  可用命令 / Available Commands:"));
      console.log(`  ${chalk.hex("#c9a961")("/quit")}     退出程序`);
      console.log(`  ${chalk.hex("#c9a961")("/config")}   查看当前配置`);
      console.log(`  ${chalk.hex("#c9a961")("/history")}  查看分析历史`);
      console.log(`  ${chalk.hex("#c9a961")("/copy")}    复制最近一次结果到剪贴板`);
      console.log(`  ${chalk.hex("#c9a961")("/done")}    结束追问，回到主分析模式`);
      console.log("");
      rl.prompt();
      return;
    }

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
      console.log("  /copy    复制最近一次分析结果到剪贴板");
      console.log("  /done    结束当前追问，回到主分析模式");
      console.log("  提示：输入 / 后按 Tab 键可补全命令");
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
    if (text === "/copy") {
      const { loadHistory } = await import("./history.js");
      const history = loadHistory();
      if (history.length === 0) {
        printError("暂无历史记录可复制");
      } else {
        const entry = history[0];
        const r = entry.result;
        const textToCopy = `【laozi.cli 分析报告】
可信度：${r.credibilityScore}/100 — ${r.verdict}
疑点：${r.redFlags.map((f: any) => f.zh).join("；")}
给老人：${r.elderExplanation.zh}
建议：${r.actionSuggestion.zh}
总结：${r.summary.zh}`;
        try {
          const { execSync } = await import("node:child_process");
          execSync(`echo ${JSON.stringify(textToCopy)} | pbcopy`);
          printInfo("分析结果已复制到剪贴板");
        } catch {
          printError("复制失败，请手动复制上方内容");
        }
      }
      rl.prompt();
      return;
    }
    if (text === "/done") {
      followUpRound = 0;
      lastExtraction = null;
      lastResult = null;
      printInfo("已结束追问模式，下一个输入将视为新话题重新分析。");
      rl.prompt();
      return;
    }

    // ── Follow-up mode ──
    if (followUpRound > 0 && followUpRound <= 5 && lastExtraction && lastResult) {
      followUpRound++;
      const roundLabel = followUpRound - 1;
      printStage(`追问第 ${roundLabel}/5 轮`, "?");

      const resolved = resolveProvider(config.provider !== "rule-based" ? config.provider : "qwen");
      const provider = createProvider({ provider: resolved.meta.id, apiKey: resolved.apiKey, model: resolved.model });

      try {
        const answer = await runFollowUp(provider, lastOriginalText, lastExtraction, lastResult, text, roundLabel);
        console.log("");
        console.log(`  ${chalk.hex("#c9a961")("→")} ${answer.answerZh}`);
        if (answer.answerEn) {
          console.log(`    ${chalk.gray(answer.answerEn)}`);
        }
        console.log("");

        if (followUpRound > 5) {
          console.log(chalk.gray("  — 追问已达5轮上限，下一个输入将视为新话题 —\n"));
          followUpRound = 0;
        } else {
          console.log(chalk.gray("  您可以继续追问，或输入 /done 结束\n"));
        }
      } catch (err: any) {
        printError(err.message || String(err));
      }

      rl.prompt();
      return;
    }

    // ── Full analysis pipeline ──
    try {
      session.pushUser(text);
      lastOriginalText = text;

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

        // Step 2: Extract with animated hints
        printStage("正在提取结构化事实...", "◆");
        const firstResolved = resolveProvider(panelIds[0]);
        const firstProvider = createProvider({
          provider: firstResolved.meta.id,
          apiKey: firstResolved.apiKey,
          model: firstResolved.model,
        });

        const extraction = await animateExtraction(firstProvider, text);
        lastExtraction = extraction;
        console.log(`  ${chalk.green("✓")} 信息类型: ${extraction.message_type} · 声称: ${extraction.claims.length}条 · 缺口: ${extraction.gaps.length}个`);

        // Step 3: Ask follow-up questions
        let supplementary = "";
        if (extraction.gaps.length > 0) {
          const qsSpinner = ora("正在生成追问问题...").start();
          const questions = await buildQuestions(firstProvider, extraction);
          qsSpinner.stop();

          if (questions.length > 0) {
            printStage("需要补充一些信息", "?");
            const answers: string[] = [];
            for (const q of questions) {
              const a = await askQuestion(q.zh);
              if (a) answers.push(`${q.zh}\n回答: ${a}`);
            }
            if (answers.length > 0) {
              supplementary = answers.join("\n\n");
              console.log(`  ${chalk.green("✓")} 已收集 ${answers.length} 条补充信息\n`);
            }
          }
        }

        // Step 4: Parallel judge
        printStage(`启动 ${panelIds.length} 模型委员会分析`, "◆");
        const providers: Provider[] = [];
        for (const id of panelIds) {
          const resolved = resolveProvider(id);
          providers.push(createProvider({ provider: resolved.meta.id, apiKey: resolved.apiKey, model: resolved.model }));
        }

        const searchCtx = factCheck.needed ? factCheck.summary : undefined;
        const sessionCtx = session.formatContext();

        const modelStatuses = new Map<string, "running" | "done" | "error">();
        providers.forEach((p) => modelStatuses.set(p.name, "running"));
        providers.forEach((p) => printModelProgress(p.name, "running"));

        const results = await Promise.all(
          providers.map(async (p) => {
            try {
              const r = await runJudge(p, text, extraction, supplementary || undefined, sessionCtx);
              modelStatuses.set(p.name, "done");
              return r;
            } catch (e: any) {
              modelStatuses.set(p.name, "error");
              return null;
            }
          })
        );

        console.log("");
        providers.forEach((p) => {
          printModelProgress(p.name, modelStatuses.get(p.name) || "running");
        });
        console.log("");

        const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
        if (validResults.length === 0) {
          printError("所有模型分析均失败。");
          rl.prompt();
          return;
        }

        const result = ensemble(validResults);
        lastResult = result;
        printResult(result, config.language);

        const assistantSummary = `判定：${result.verdict}，${result.credibilityScore}分，核心：${result.redFlags.map((f) => f.zh).join("；")}`;
        session.pushAssistant(assistantSummary);
        saveHistoryEntry({
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          inputType: "text",
          inputPreview: text,
          result,
        });

        // Enter follow-up mode
        followUpRound = 1;
        console.log(chalk.hex("#c9a961")("  ★ 分析完成。您可以继续追问（最多5轮），或输入 /done 结束\n"));
      } else {
        // Single-provider / rule-based mode
        const { provider } = await getSingleProvider();
        const spinner = ora("正在分析内容...").start();
        const { analyzeContent } = await import("./analyzer.js");
        const result = await analyzeContent(provider, config, text);
        spinner.stop();
        printResult(result, config.language);
        const assistantSummary = `判定：${result.verdict}，${result.credibilityScore}分，核心：${result.redFlags.map((f: any) => f.zh).join("；")}`;
        session.pushAssistant(assistantSummary);
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
