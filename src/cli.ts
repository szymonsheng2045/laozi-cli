#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { analyzeContent, AnalysisResult } from "./analyzer.js";
import { createProvider, Provider } from "./providers/base.js";
import { listProviders } from "./providers/registry.js";
import { loadConfig, saveConfig, configPathDisplay } from "./config.js";
import { printError, printInfo, printResult, printFactCheck, printStage, printModelProgress } from "./printer.js";
import { transcribeAudio } from "./transcribe.js";
import { clearHistory, formatHistoryPreview, loadHistory, saveHistoryEntry } from "./history.js";
import { printBanner } from "./banner.js";
import { resolveProvider } from "./resolve-provider.js";
import { ensemble, runJudge } from "./judge.js";
import { startREPL } from "./repl.js";
import { runFactCheck } from "./fact-check.js";
import { extractStructured, Extraction } from "./extractor.js";
import { buildQuestions, Question } from "./questioner.js";

const program = new Command();

program
  .name("laozi")
  .description("LAOZI.CLI — 帮助家庭识别针对老人的网络虚假信息")
  .version("0.1.0");

async function getProvider() {
  const resolved = resolveProvider();
  const provider = createProvider({
    provider: resolved.meta.id,
    apiKey: resolved.apiKey,
    model: resolved.model,
  });

  if (provider.healthCheck) {
    const ok = await provider.healthCheck();
    if (!ok) {
      printError(
        `${provider.name} 服务未运行或无法连接。\n` +
          (resolved.meta.id === "ollama"
            ? "请确保 Ollama 已安装并运行: https://ollama.com"
            : resolved.meta.id === "llama-cpp"
            ? "请确保 llama.cpp server 已启动在 " + resolved.meta.baseURL
            : "请检查网络连接和 API 配置。")
      );
      process.exit(1);
    }
  }

  const config = loadConfig();
  return { provider, config, resolved };
}

program
  .command("check <text>")
  .description("分析一段文字内容的真实性")
  .option("-l, --lang <lang>", "输出语言: zh | en | bilingual", "bilingual")
  .option("--panel", "启用多模型委员会并行分析")
  .option("--no-panel", "禁用多模型委员会，使用单模型")
  .action(async (text: string, options: { lang: string; panel?: boolean; noPanel?: boolean }) => {
    const config = loadConfig();
    // --panel forces panel on; --no-panel forces panel off; default follows config
    const usePanel = options.panel !== false && (options.panel === true || config.judgePanel.length > 0);

    // Step 1: Fact-check layer
    const fcSpinner = ora("正在判断是否需要联网核查...").start();
    const factCheck = await runFactCheck(text);
    fcSpinner.stop();
    if (factCheck.needed) {
      printFactCheck(factCheck.query, factCheck.results);
    }

    if (usePanel) {
      const panelIds = config.judgePanel.length > 0 ? config.judgePanel : [config.provider];
      if (panelIds.length === 0 || (panelIds.length === 1 && panelIds[0] === "rule-based")) {
        printError(
          "多模型委员会模式需要配置至少一个 API provider。\n" +
            "示例: laozi config --judge-panel qwen,kimi,zhipu,minimax"
        );
        process.exit(1);
      }

      // Step 2: Extract structured facts using first provider
      printStage("正在提取结构化事实...", "◆");
      const firstResolved = resolveProvider(panelIds[0]);
      const firstProvider = createProvider({
        provider: firstResolved.meta.id,
        apiKey: firstResolved.apiKey,
        model: firstResolved.model,
      });

      const extraction = await extractStructured(firstProvider, text);
      console.log(`  ${chalk.green("✓")} 信息类型: ${extraction.message_type} · 声称: ${extraction.claims.length}条 · 缺口: ${extraction.gaps.length}个`);

      // Step 3: Ask follow-up questions (skip in non-TTY batch mode)
      let supplementary = "";
      if (extraction.gaps.length > 0 && process.stdin.isTTY) {
        const qSpinner = ora("正在生成追问问题...").start();
        const questions = await buildQuestions(firstProvider, extraction);
        qSpinner.stop();

        if (questions.length > 0) {
          printStage("需要补充一些信息", "?");
          const readline = await import("node:readline");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ask = (q: string): Promise<string> =>
            new Promise((resolve) => rl.question(`  ${q} `, (a: string) => resolve(a.trim())));

          const answers: string[] = [];
          for (const q of questions) {
            const a = await ask(q.zh);
            if (a) answers.push(`${q.zh}\n回答: ${a}`);
          }
          rl.close();
          if (answers.length > 0) {
            supplementary = answers.join("\n\n");
            console.log(`  ${chalk.green("✓")} 已收集 ${answers.length} 条补充信息\n`);
          }
        }
      }

      // Step 4: Parallel judge with per-model progress
      printStage(`启动 ${panelIds.length} 模型委员会分析`, "◆");
      try {
        const providers: Provider[] = [];
        for (const id of panelIds) {
          const resolved = resolveProvider(id);
          providers.push(createProvider({ provider: resolved.meta.id, apiKey: resolved.apiKey, model: resolved.model }));
        }

        const searchCtx = factCheck.needed ? factCheck.summary : undefined;
        const modelStatuses = new Map<string, "running" | "done" | "error">();
        providers.forEach((p) => modelStatuses.set(p.name, "running"));

        // Initial display
        providers.forEach((p) => {
          printModelProgress(p.name, "running");
        });

        const results = await Promise.all(
          providers.map(async (p) => {
            try {
              const r = await runJudge(p, text, extraction, supplementary || undefined, undefined);
              modelStatuses.set(p.name, "done");
              return r;
            } catch (e: any) {
              modelStatuses.set(p.name, "error");
              return null;
            }
          })
        );

        // Redraw final status
        console.log("");
        providers.forEach((p) => {
          printModelProgress(p.name, modelStatuses.get(p.name) || "running");
        });
        console.log("");

        const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
        if (validResults.length === 0) {
          printError("所有模型分析均失败。");
          process.exit(1);
        }

        const result = ensemble(validResults);
        printResult(result, options.lang || config.language);
        saveHistoryEntry({
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          inputType: "text",
          inputPreview: text,
          result,
        });
      } catch (err: any) {
        printError(err.message || String(err));
        process.exit(1);
      }
      return;
    }

    // Single-provider / rule-based mode
    const { provider } = await getProvider();
    const spinner = ora("正在分析内容...").start();

    try {
      const result = await analyzeContent(provider, config, text);
      spinner.stop();
      printResult(result as AnalysisResult, options.lang || config.language);
      saveHistoryEntry({
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
        inputType: "text",
        inputPreview: text,
        result,
      });
    } catch (err: any) {
      spinner.stop();
      printError(err.message || String(err));
      process.exit(1);
    }
  });

program
  .command("voice <filepath>")
  .description("将语音文件转文字后分析其真实性")
  .option("-l, --lang <lang>", "输出语言: zh | en | bilingual", "bilingual")
  .option("--panel", "启用多模型委员会并行分析")
  .option("--no-panel", "禁用多模型委员会，使用单模型")
  .action(async (filepath: string, options: { lang: string; panel?: boolean; noPanel?: boolean }) => {
    const config = loadConfig();
    // --panel forces panel on; --no-panel forces panel off; default follows config
    const usePanel = options.panel !== false && (options.panel === true || config.judgePanel.length > 0);

    if (!existsSync(filepath)) {
      printError(`文件不存在: ${filepath}`);
      process.exit(1);
    }

    // Whisper currently requires OpenAI-compatible API key
    if (!config.apiKey) {
      printError(
        `语音转录需要配置 OpenAI 兼容 API Key。\n` +
          `您可以：\n` +
          `1. 手动将语音转为文字后使用 "laozi check <文字>"\n` +
          `2. 或配置 API key 用于语音转录：\n` +
          `   laozi config --api-key <key>`
      );
      process.exit(1);
    }

    let spinner = ora("正在转录语音...").start();
    let transcript: string;
    try {
      const { createClient } = await import("./llm.js");
      const client = createClient(config);
      transcript = await transcribeAudio(client, config, filepath);
      spinner.stop();
      printInfo(`语音转文字结果: ${transcript}`);
    } catch (err: any) {
      spinner.stop();
      printError(err.message || String(err));
      process.exit(1);
    }

    // Reuse the same pipeline as check command
    if (usePanel) {
      const panelIds = config.judgePanel.length > 0 ? config.judgePanel : [config.provider];
      if (panelIds.length === 0 || (panelIds.length === 1 && panelIds[0] === "rule-based")) {
        printError(
          "多模型委员会模式需要配置至少一个 API provider。\n" +
            "示例: laozi config --judge-panel qwen,kimi,zhipu,minimax"
        );
        process.exit(1);
      }

      // Extract
      printStage("正在提取结构化事实...", "◆");
      const firstResolved = resolveProvider(panelIds[0]);
      const firstProvider = createProvider({
        provider: firstResolved.meta.id,
        apiKey: firstResolved.apiKey,
        model: firstResolved.model,
      });

      let extraction: Extraction;
      try {
        extraction = await extractStructured(firstProvider, transcript);
      } catch (extractErr: any) {
        printError(`结构化提取失败: ${extractErr.message}`);
        printInfo("正在 fallback 到本地规则引擎...");
        const { provider } = await getProvider();
        const result = await analyzeContent(provider, config, transcript);
        printResult(result, options.lang || config.language);
        process.exit(0);
      }
      console.log(`  ${chalk.green("✓")} 信息类型: ${extraction.message_type} · 声称: ${extraction.claims.length}条 · 缺口: ${extraction.gaps.length}个`);

      // Voice mode skips interactive follow-up questions in non-TTY
      let supplementary = "";
      if (extraction.gaps.length > 0 && process.stdin.isTTY) {
        const qSpinner = ora("正在生成追问问题...").start();
        let questions: Question[] = [];
        try {
          questions = await buildQuestions(firstProvider, extraction);
        } catch {
          questions = [];
        }
        qSpinner.stop();

        if (questions.length > 0) {
          printInfo("消息里缺了一些关键信息，需要您补充一下：");
          const readline = await import("node:readline");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ask = (q: string): Promise<string> =>
            new Promise((resolve) => rl.question(`  ${q} `, (a: string) => resolve(a.trim())));

          const answers: string[] = [];
          for (const q of questions) {
            const a = await ask(q.zh);
            if (a) answers.push(`${q.zh}\n回答: ${a}`);
          }
          rl.close();
          if (answers.length > 0) supplementary = answers.join("\n\n");
        }
      }

      // Parallel judge
      printStage(`启动 ${panelIds.length} 模型委员会分析`, "◆");
      const providers = [];
      for (const id of panelIds) {
        try {
          const resolved = resolveProvider(id);
          providers.push(createProvider({ provider: resolved.meta.id, apiKey: resolved.apiKey, model: resolved.model }));
        } catch {
          console.log(`  ${chalk.yellow("⚠")} ${id.padEnd(18)} 配置缺失，跳过`);
        }
      }

      if (providers.length === 0) {
        printError("所有模型配置均不可用，fallback 到本地规则引擎。");
        const { provider } = await getProvider();
        const result = await analyzeContent(provider, config, transcript);
        printResult(result, options.lang || config.language);
        process.exit(0);
      }

      providers.forEach((p) => printModelProgress(p.name, "running"));

      const results = await Promise.all(
        providers.map(async (p) => {
          try {
            const r = await runJudge(p, transcript, extraction, supplementary || undefined);
            return r;
          } catch (e: any) {
            console.log(`    ${chalk.red("✗")} ${p.name.padEnd(18)} ${chalk.gray(e.message || "失败")}`);
            return null;
          }
        })
      );

      console.log("");
      providers.forEach((p, i) => {
        printModelProgress(p.name, results[i] ? "done" : "error");
      });
      console.log("");

      const validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);
      if (validResults.length === 0) {
        printError("所有模型分析均失败，fallback 到本地规则引擎。");
        const { provider } = await getProvider();
        const result = await analyzeContent(provider, config, transcript);
        printResult(result, options.lang || config.language);
        process.exit(0);
      }

      const result = ensemble(validResults);
      printResult(result, options.lang || config.language);
      saveHistoryEntry({
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
        inputType: "voice",
        inputPreview: transcript,
        result,
      });
      process.exit(0);
    }

    // Single-provider / rule-based mode
    const { provider } = await getProvider();
    spinner = ora("正在分析内容...").start();
    try {
      const result = await analyzeContent(provider, config, transcript);
      spinner.stop();
      printResult(result, options.lang || config.language);
      saveHistoryEntry({
        id: Math.random().toString(36).slice(2),
        timestamp: new Date().toISOString(),
        inputType: "voice",
        inputPreview: transcript,
        result,
      });
    } catch (err: any) {
      spinner.stop();
      printError(err.message || String(err));
      process.exit(1);
    }
  });

program
  .command("config")
  .description("配置 CLI 参数")
  .option("--provider <name>", "模型提供者: rule-based, qwen, kimi, deepseek, zhipu, minimax, openai, anthropic, gemini, ollama, llama-cpp")
  .option("--api-key <key>", "设置全局 API Key")
  .option("--key <provider:key>", "设置指定 provider 的 API Key，格式: qwen:sk-xxx")
  .option("--base-url <url>", "设置 API Base URL")
  .option("--model <model>", "设置分析用模型")
  .option("--whisper-model <model>", "设置语音转文字模型")
  .option("--language <lang>", "默认输出语言: zh | en | bilingual")
  .option("--judge-panel <list>", "多模型委员会，逗号分隔，如 qwen,kimi,zhipu,minimax")
  .action((options) => {
    const updates: any = {};
    if (options.provider !== undefined) updates.provider = options.provider;
    if (options.apiKey !== undefined) updates.apiKey = options.apiKey;
    if (options.baseUrl !== undefined) updates.baseURL = options.baseUrl;
    if (options.model !== undefined) updates.model = options.model;
    if (options.whisperModel !== undefined) updates.whisperModel = options.whisperModel;
    if (options.language !== undefined) updates.language = options.language;
    if (options.judgePanel !== undefined) {
      updates.judgePanel = options.judgePanel
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
    }

    // Provider-specific key: --key qwen:sk-xxx
    if (options.key !== undefined) {
      const parts = options.key.split(":");
      if (parts.length >= 2) {
        const providerId = parts[0];
        const keyValue = parts.slice(1).join(":");
        const current = loadConfig();
        updates.keys = { ...current.keys, [providerId]: keyValue };
      } else {
        printError("--key 格式错误，应为: provider:key，例如: qwen:sk-xxx");
        process.exit(1);
      }
    }

    if (Object.keys(updates).length === 0) {
      printInfo(`当前配置文件: ${configPathDisplay()}`);
      console.log(JSON.stringify(loadConfig(), null, 2));
      return;
    }

    saveConfig(updates);
    printInfo(`配置已保存到: ${configPathDisplay()}`);
  });

program
  .command("models")
  .description("列出所有支持的模型提供商")
  .action(() => {
    const cn = listProviders().filter((p) => p.region === "cn");
    const global_ = listProviders().filter((p) => p.region === "global");

    console.log(`\n${" ".repeat(4)}中国大陆模型 / China Mainland`);
    cn.forEach((p) => {
      console.log(`  ${p.id.padEnd(12)} ${p.name.padEnd(18)} 默认: ${p.defaultModel}`);
    });

    console.log(`\n${" ".repeat(4)}国际模型 / Global`);
    global_.forEach((p) => {
      console.log(`  ${p.id.padEnd(12)} ${p.name.padEnd(18)} 默认: ${p.defaultModel}`);
    });

    console.log(`\n  ${" ".repeat(4)}离线引擎 / Offline`);
    console.log(`  ${"rule-based".padEnd(12)} 本地规则引擎 (零配置，无需网络)`);
    console.log("");
  });

program
  .command("history")
  .description("查看历史分析记录")
  .option("--clear", "清空历史记录")
  .action((options: { clear?: boolean }) => {
    if (options.clear) {
      clearHistory();
      printInfo("历史记录已清空");
      return;
    }
    const history = loadHistory();
    if (history.length === 0) {
      printInfo("暂无历史记录");
      return;
    }
    console.log("\n最近分析记录：\n");
    history.forEach((entry, i) => {
      console.log(`  ${i + 1}. ${formatHistoryPreview(entry)}`);
    });
    console.log("");
  });

program
  .command("export [filepath]")
  .description("导出最近一次分析结果为 Markdown")
  .action((filepath: string = "laozi-report.md") => {
    const history = loadHistory();
    if (history.length === 0) {
      printError("暂无历史记录可导出");
      process.exit(1);
    }
    const entry = history[0];
    const r = entry.result;
    const md = `# LAOZI.CLI 分析报告

> 分析时间: ${new Date(entry.timestamp).toLocaleString("zh-CN")}  
> 输入类型: ${entry.inputType === "text" ? "文字" : "语音"}  
> 输入内容: ${entry.inputPreview}

---

## 可信度评分

**${r.credibilityScore}/100** — ${r.verdict}

## 主要疑点

${r.redFlags.map((f, i) => `${i + 1}. ${f.zh}\n   ${f.en}`).join("\n\n")}

## 给老人的解释

${r.elderExplanation.zh}

${r.elderExplanation.en}

## 建议操作

${r.actionSuggestion.zh}

${r.actionSuggestion.en}

## 总结

${r.summary.zh}

${r.summary.en}
`;
    writeFileSync(filepath, md, "utf-8");
    printInfo(`报告已导出: ${filepath}`);
  });

// 默认行为：无参数时进入 REPL 交互模式
program.action(async () => {
  printBanner();
  await startREPL();
});

program.parse();
