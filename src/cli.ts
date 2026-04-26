#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import chalk from "chalk";
import ora from "ora";
import { analyzeContent } from "./analyzer.js";
import type { AnalysisResult } from "./types.js";
import { createProvider, Provider } from "./providers/base.js";
import { listProviders } from "./providers/registry.js";
import { loadConfig, saveConfig, configPathDisplay, getRedactedConfig } from "./config.js";
import { printError, printInfo, printResult, printFactCheck, printStage, printModelProgress } from "./printer.js";
import { transcribeAudio } from "./transcribe.js";
import { clearHistory, formatHistoryPreview, loadHistory, saveHistoryEntry } from "./history.js";
import { printBanner } from "./banner.js";
import { resolveProvider } from "./resolve-provider.js";
import { ensemble, runJudge } from "./judge.js";
import { startREPL } from "./repl.js";
import { runFactCheck, buildSearchBasedResult } from "./fact-check.js";
import { searchPiyao, formatPiyaoMatches } from "./knowledge-base.js";
import { extractStructured, Extraction } from "./extractor.js";
import { buildQuestions, Question } from "./questioner.js";

const program = new Command();
const BAILIAN_PANEL = ["qwen", "kimi", "zhipu", "minimax"] as const;

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
    baseURL: resolved.meta.baseURL,
  });

  if (provider.healthCheck) {
    const ok = await provider.healthCheck();
    if (!ok) {
      throw new Error(
        `${provider.name} 服务未运行或无法连接。\n` +
          (resolved.meta.id === "ollama"
            ? "请确保 Ollama 已安装并运行: https://ollama.com"
            : resolved.meta.id === "llama-cpp"
            ? "请确保 llama.cpp server 已启动在 " + resolved.meta.baseURL
            : "请检查网络连接和 API 配置。")
      );
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
  .option("--debug-panel", "调试模式：显示各模型独立输出")
  .action(async (text: string, options: { lang: string; panel?: boolean; debugPanel?: boolean }) => {
    const config = loadConfig();
    // --panel forces panel on; --no-panel forces panel off; default follows config
    const usePanel = options.panel === false ? false : options.panel === true || config.judgePanel.length > 0;

    // Step 1: Fact-check layer
    let factCheck = {
      needed: false as boolean,
      query: "",
      results: [] as { title: string; url: string; snippet: string }[],
      summary: "",
      authorityCount: 0,
      authoritySources: [] as string[],
      localMatches: [] as { title: string; claim: string; truth: string; sourceUrl: string; publishDate: string }[],
      localContext: "" as string,
    };

    // 检索本地辟谣知识库（纯本地计算，不消耗 API 预算）
    const localMatches = searchPiyao(text, 3);
    if (localMatches.length > 0) {
      factCheck.localMatches = localMatches.map(m => ({
        title: m.title,
        claim: m.claim,
        truth: m.truth,
        sourceUrl: m.sourceUrl,
        publishDate: m.publishDate,
      }));
      factCheck.localContext = formatPiyaoMatches(localMatches);
    }

    // Panel 模式下也执行网络搜索：权威媒体命中可直接返回 safe，反而节省模型 API 预算
    if (usePanel) {
      try {
        const webFactCheck = await runFactCheck(text);
        factCheck.needed = webFactCheck.needed;
        factCheck.query = webFactCheck.query;
        factCheck.results = webFactCheck.results;
        factCheck.summary = webFactCheck.summary;
        factCheck.authorityCount = webFactCheck.authorityCount;
        factCheck.authoritySources = webFactCheck.authoritySources;
        if (webFactCheck.localMatches) {
          factCheck.localMatches = webFactCheck.localMatches;
        }
        if (webFactCheck.localContext) {
          factCheck.localContext = webFactCheck.localContext;
        }

      } catch {
        // 搜索失败不影响主流程
      }
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

      // Step 2: Extract structured facts — prioritize fast models, serial fallback
      printStage("正在提取结构化事实...", "◆");
      let firstProvider: Provider | null = null;
      let extraction!: Extraction;
      let extractErrors: string[] = [];
      let extractionSucceeded = false;

      // Fast models first to avoid waiting for slow ones (qwen often >60s)
      const fastModels = new Set(["kimi", "minimax"]);
      const extractionOrder = [...panelIds].sort((a, b) => {
        const aFast = fastModels.has(a) ? 0 : 1;
        const bFast = fastModels.has(b) ? 0 : 1;
        return aFast - bFast;
      });

      for (const id of extractionOrder) {
        try {
          const resolved = resolveProvider(id);
          const provider = createProvider({
            provider: resolved.meta.id,
            apiKey: resolved.apiKey,
            model: resolved.model,
            baseURL: resolved.meta.baseURL,
          });
          extraction = await extractStructured(provider, text, 18000);
          firstProvider = provider;
          extractionSucceeded = true;
          console.log(`  ${chalk.green("✓")} ${provider.name} 提取成功 | 信息类型: ${extraction.message_type} · 声称: ${extraction.claims.length}条 · 缺口: ${extraction.gaps.length}个`);
          break;
        } catch (e: any) {
          const msg = e instanceof Error ? e.message : String(e);
          extractErrors.push(`${id}: ${msg}`);
          console.log(`  ${chalk.yellow("⚠")} ${id} 提取失败: ${msg.slice(0, 60)}`);
        }
      }

      if (!extractionSucceeded || !firstProvider) {
        printError(`所有模型提取均失败:\n${extractErrors.slice(0, 3).join("\n")}`);

        // 优先基于搜索结果直接判定（权威媒体 safe / 有结果 70分），避免规则引擎信息丢失
        const searchResult = buildSearchBasedResult(factCheck, options.lang || config.language);
        if (searchResult) {
          printResult(searchResult, options.lang || config.language);
          saveHistoryEntry({
            id: Math.random().toString(36).slice(2),
            timestamp: new Date().toISOString(),
            inputType: "text",
            inputPreview: text,
            result: searchResult,
          });
          process.exit(0);
        }

        printInfo("正在 fallback 到本地规则引擎...");
        try {
          const provider = createProvider({ provider: "rule-based", model: "local-rules" });
          const result = await analyzeContent(provider, config, text);
          printResult(result as AnalysisResult, options.lang || config.language);
          process.exit(0);
        } catch (fbErr: any) {
          printError("本地规则引擎也无法启动: " + (fbErr.message || String(fbErr)));
          process.exit(1);
        }
      }

      // Step 3: Ask follow-up questions (skip in non-TTY batch mode)
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
          printStage("需要补充一些信息", "?");
          const readline = await import("node:readline");
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          const ask = (q: string): Promise<string> =>
            new Promise((resolve) => rl.question(`\n  ${q} `, (a: string) => resolve(a.trim())));

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
      let results: (AnalysisResult | null)[] = [];
      let validResults: AnalysisResult[] = [];
      try {
        const providers: Provider[] = [];
        for (const id of panelIds) {
          try {
            const resolved = resolveProvider(id);
            providers.push(
              createProvider({
                provider: resolved.meta.id,
                apiKey: resolved.apiKey,
                model: resolved.model,
                baseURL: resolved.meta.baseURL,
              })
            );
          } catch {
            console.log(`  ${chalk.yellow("⚠")} ${id.padEnd(18)} 配置缺失，跳过`);
          }
        }

        const searchCtx = factCheck.needed ? factCheck.summary : undefined;
        const localCtx = factCheck.localContext || undefined;
        const modelStatuses = new Map<string, "running" | "done" | "error">();
        providers.forEach((p) => modelStatuses.set(p.name, "running"));

        // Initial display
        providers.forEach((p) => {
          printModelProgress(p.name, "running");
        });

        // 35s overall fuse: don't wait forever for the slowest provider
        const PANEL_TIMEOUT_MS = 45000;
        results = new Array(providers.length).fill(null);

        const judgePromises = providers.map(async (p, i) => {
          try {
            const r = await runJudge(p, text, extraction, supplementary || undefined, undefined, searchCtx, localCtx);
            modelStatuses.set(p.name, "done");
            results[i] = r;
          } catch {
            modelStatuses.set(p.name, "error");
          }
        });

        // Race: 所有 judge 完成后继续，或超时后继续。清除 dangling timer 避免资源泄漏。
        let raceTimeout: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<void>((resolve) => {
          raceTimeout = setTimeout(() => resolve(), PANEL_TIMEOUT_MS);
        });

        await Promise.race([Promise.all(judgePromises), timeoutPromise]);
        clearTimeout(raceTimeout!);

        // Redraw final status
        console.log("");
        providers.forEach((p) => {
          printModelProgress(p.name, modelStatuses.get(p.name) || "running");
        });
        console.log("");

        validResults = results.filter((r): r is NonNullable<typeof r> => r !== null);

        // Debug mode: print each model's raw output
        if (options.debugPanel) {
          console.log("\n" + chalk.hex("#c9a961")("──────────────────────────────────────────────────────────────────"));
          console.log(chalk.bold("  【debug-panel 各模型独立输出】\n"));
          providers.forEach((p, i) => {
            const r = results[i];
            if (r) {
              console.log(`  ${chalk.green("●")} ${p.name}`);
              console.log(`    verdict: ${r.verdict}, score: ${r.credibilityScore}`);
              console.log(`    flags: ${r.redFlags.map((f: { zh: string }) => f.zh).join("; ") || "无"}`);
              console.log(`    summary: ${r.summary?.zh || ""}`);
            } else {
              console.log(`  ${chalk.red("○")} ${p.name} — 失败`);
            }
            console.log("");
          });
          console.log(chalk.hex("#c9a961")("──────────────────────────────────────────────────────────────────\n"));
        }

        if (validResults.length === 0) {
          printError("所有模型分析均失败，尝试单模型 fallback...");
          throw new Error("panel-fallback-to-single");
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
        process.exit(0);
      } catch (err: any) {
        if (err.message === "panel-fallback-to-single") {
          // Fallback to single-provider analysis
        } else {
          printError(err.message || String(err));
          process.exit(1);
        }
      }

      if (validResults.length === 0) {
        // Direct fallback to rule-based: single-provider would likely hit the same slowness
        printInfo("模型分析超时，直接 fallback 到本地规则引擎...");
        try {
          const provider = createProvider({ provider: "rule-based", model: "local-rules" });
          const result = await analyzeContent(provider, config, text);
          printResult(result as AnalysisResult, options.lang || config.language);
          saveHistoryEntry({
            id: Math.random().toString(36).slice(2),
            timestamp: new Date().toISOString(),
            inputType: "text",
            inputPreview: text,
            result,
          });
          process.exit(0);
        } catch (fbErr: any) {
          printError("本地规则引擎也无法启动: " + (fbErr.message || String(fbErr)));
          process.exit(1);
        }
      }

      return;
    }

    // Single-provider / rule-based mode
    let provider: Provider;
    try {
      const resolved = await getProvider();
      provider = resolved.provider;
    } catch (resolveErr: unknown) {
      const msg = resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
      printError(msg);
      // Fallback to rule-based if configured provider fails
      printInfo("配置的模型不可用，尝试本地规则引擎...");
      try {
        provider = createProvider({ provider: "rule-based", model: "local-rules" });
      } catch (fbErr: any) {
        printError("本地规则引擎也无法启动: " + (fbErr.message || String(fbErr)));
        process.exit(1);
      }
    }

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
    } catch (err: unknown) {
      spinner.stop();
      const msg = err instanceof Error ? err.message : String(err);
      printError(`分析失败: ${msg}`);
      // Final fallback: rule-based
      printInfo("尝试本地规则引擎 fallback...");
      try {
        const fallbackProvider = createProvider({ provider: "rule-based", model: "local-rules" });
        const result = await analyzeContent(fallbackProvider, config, text);
        printResult(result as AnalysisResult, options.lang || config.language);
        saveHistoryEntry({
          id: Math.random().toString(36).slice(2),
          timestamp: new Date().toISOString(),
          inputType: "text",
          inputPreview: text,
          result,
        });
      } catch (fbErr: any) {
        printError("本地规则引擎也无法启动: " + (fbErr.message || String(fbErr)));
        process.exit(1);
      }
    }
  });

program
  .command("voice <filepath>")
  .description("将语音文件转文字后分析其真实性")
  .option("-l, --lang <lang>", "输出语言: zh | en | bilingual", "bilingual")
  .option("--panel", "启用多模型委员会并行分析")
  .option("--no-panel", "禁用多模型委员会，使用单模型")
  .action(async (filepath: string, options: { lang: string; panel?: boolean }) => {
    const config = loadConfig();
    // --panel forces panel on; --no-panel forces panel off; default follows config
    const usePanel = options.panel === false ? false : options.panel === true || config.judgePanel.length > 0;

    if (!existsSync(filepath)) {
      printError(`文件不存在: ${filepath}`);
      process.exit(1);
    }

    // Whisper currently requires OpenAI-compatible API key
    const hasAnyKey = config.apiKey || Object.values(config.keys || {}).some((k) => k);
    if (!hasAnyKey) {
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

      // 检索本地辟谣知识库 + 网络搜索（结果复用，避免重复调用）
      let voiceLocalContext: string | undefined;
      let voiceFactCheck: import("./types.js").FactCheckContext | undefined;
      try {
        voiceFactCheck = await runFactCheck(transcript);
        voiceLocalContext = voiceFactCheck.localContext || undefined;
      } catch {
        // 忽略错误，继续无本地匹配
      }

      // Extract
      printStage("正在提取结构化事实...", "◆");
      let firstProvider: Provider;
      let extraction: Extraction;
      try {
        const firstResolved = resolveProvider(panelIds[0]);
        firstProvider = createProvider({
          provider: firstResolved.meta.id,
          apiKey: firstResolved.apiKey,
          model: firstResolved.model,
          baseURL: firstResolved.meta.baseURL,
        });
        extraction = await extractStructured(firstProvider, transcript);
      } catch (extractErr: unknown) {
        const msg = extractErr instanceof Error ? extractErr.message : String(extractErr);
        printError(`结构化提取失败: ${msg}`);

        // voice 命令 fallback：复用之前搜索结果做判定
        if (voiceFactCheck) {
          const searchResult = buildSearchBasedResult(voiceFactCheck, options.lang || config.language);
          if (searchResult) {
            printResult(searchResult, options.lang || config.language);
            saveHistoryEntry({
              id: Math.random().toString(36).slice(2),
              timestamp: new Date().toISOString(),
              inputType: "voice",
              inputPreview: transcript,
              result: searchResult,
            });
            process.exit(0);
          }
        }

        printInfo("正在 fallback 到本地规则引擎...");
        try {
          const provider = createProvider({ provider: "rule-based", model: "local-rules" });
          const result = await analyzeContent(provider, config, transcript);
          printResult(result, options.lang || config.language);
          process.exit(0);
        } catch (fbErr: any) {
          printError("本地规则引擎也无法启动: " + (fbErr.message || String(fbErr)));
          process.exit(1);
        }
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
            new Promise((resolve) => rl.question(`\n  ${q} `, (a: string) => resolve(a.trim())));

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
          providers.push(
            createProvider({
              provider: resolved.meta.id,
              apiKey: resolved.apiKey,
              model: resolved.model,
              baseURL: resolved.meta.baseURL,
            })
          );
        } catch {
          console.log(`  ${chalk.yellow("⚠")} ${id.padEnd(18)} 配置缺失，跳过`);
        }
      }

      if (providers.length === 0) {
        printError("所有模型配置均不可用，fallback 到本地规则引擎。");
        try {
          const provider = createProvider({ provider: "rule-based", model: "local-rules" });
          const result = await analyzeContent(provider, config, transcript);
          printResult(result, options.lang || config.language);
          process.exit(0);
        } catch {
          printError("本地规则引擎也无法启动。");
          process.exit(1);
        }
      }

      providers.forEach((p) => printModelProgress(p.name, "running"));

      const results = await Promise.all(
        providers.map(async (p) => {
          try {
            const r = await runJudge(p, transcript, extraction, supplementary || undefined, undefined, undefined, voiceLocalContext);
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
        try {
          const provider = createProvider({ provider: "rule-based", model: "local-rules" });
          const result = await analyzeContent(provider, config, transcript);
          printResult(result, options.lang || config.language);
          process.exit(0);
        } catch {
          printError("本地规则引擎也无法启动。");
          process.exit(1);
        }
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
    let provider: Provider;
    try {
      const resolved = await getProvider();
      provider = resolved.provider;
    } catch (resolveErr: unknown) {
      const msg = resolveErr instanceof Error ? resolveErr.message : String(resolveErr);
      printError(msg);
      process.exit(1);
    }
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
  .option("--provider <name>", "模型提供者: rule-based, laozi-cloud, qwen, kimi, deepseek, zhipu, minimax, openai, anthropic, gemini, ollama, llama-cpp")
  .option("--api-key <key>", "设置全局 API Key")
  .option("--key <provider:key>", "设置指定 provider 的 API Key，格式: qwen:sk-xxx")
  .option("--bailian-key <key>", "一键配置阿里云百炼四模型委员会 API Key")
  .option("--dashscope-key <key>", "同 --bailian-key，兼容 DashScope 命名")
  .option("--base-url <url>", "设置 API Base URL")
  .option("--model <model>", "设置分析用模型")
  .option("--whisper-model <model>", "设置语音转文字模型")
  .option("--language <lang>", "默认输出语言: zh | en | bilingual")
  .option("--judge-panel <list>", "多模型委员会，逗号分隔，如 qwen,kimi,zhipu,minimax")
  .option("--tavily-api-key <key>", "设置 Tavily 搜索 API Key（用于事实核查联网搜索）")
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
    if (options.tavilyApiKey !== undefined) updates.tavilyApiKey = options.tavilyApiKey;

    const bailianKey = options.bailianKey || options.dashscopeKey;
    if (bailianKey !== undefined) {
      const current = loadConfig();
      updates.provider = "qwen";
      updates.model = "local-rules";
      updates.baseURL = "";
      updates.judgePanel = [...BAILIAN_PANEL];
      updates.keys = {
        ...current.keys,
        ...Object.fromEntries(BAILIAN_PANEL.map((providerId) => [providerId, bailianKey])),
      };
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
      console.log(JSON.stringify(getRedactedConfig(loadConfig()), null, 2));
      return;
    }

    saveConfig(updates);
    printInfo(`配置已保存到: ${configPathDisplay()}`);
    if (bailianKey !== undefined) {
      printInfo("已启用百炼四模型委员会: qwen,kimi,zhipu,minimax");
    }
  });

program
  .command("doctor")
  .description("诊断安装、配置和多模型委员会状态")
  .action(() => {
    const config = loadConfig();
    const redacted = getRedactedConfig(config);
    const panelIds = config.judgePanel || [];
    const panelEnabled = panelIds.length > 0;

    console.log("\nLAOZI.CLI Doctor\n");
    console.log(`  Platform: ${process.platform} ${process.arch}`);
    console.log(`  Node.js:  ${process.version}`);
    console.log(`  Config:   ${configPathDisplay()}`);
    console.log(`  Provider: ${config.provider}`);
    console.log(`  Model:    ${config.model}`);
    console.log(`  Language: ${config.language}`);
    console.log(`  Panel:    ${panelEnabled ? panelIds.join(",") : "disabled (local/single-provider mode)"}`);

    if (panelEnabled) {
      console.log("\n  Panel providers:");
      for (const id of panelIds) {
        try {
          const resolved = resolveProvider(id);
          const keyLabel = redacted.keys[id] || (redacted.apiKey ? redacted.apiKey : "");
          console.log(`    ✓ ${id.padEnd(8)} model=${resolved.model} key=${keyLabel || "missing"}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message.split("\n")[0] : String(err);
          console.log(`    ✗ ${id.padEnd(8)} ${msg}`);
        }
      }
    } else if (config.provider === "laozi-cloud") {
      console.log("\n  当前会使用 LAOZI Cloud 单模型云分析。");
      console.log("  注意：待分析文本会发送到 laozi.art；如需完全本地，请执行：");
      console.log("    laozi config --provider rule-based");
      console.log("  如需本机直连百炼四模型委员会，请执行：");
      console.log("    laozi config --bailian-key <DASHSCOPE_API_KEY>");
    } else {
      console.log("\n  当前不会进入“结构化提取 + 多模型裁决”流程。");
      console.log("  如需启用百炼四模型委员会，请执行：");
      console.log("    laozi config --bailian-key <DASHSCOPE_API_KEY>");
    }

    console.log("");
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
