#!/usr/bin/env node
import { Command } from "commander";
import { existsSync, writeFileSync } from "node:fs";
import ora from "ora";
import { analyzeContent, AnalysisResult } from "./analyzer.js";
import { createProvider, Provider } from "./providers/base.js";
import { listProviders } from "./providers/registry.js";
import { loadConfig, saveConfig, configPathDisplay } from "./config.js";
import { printError, printInfo, printResult } from "./printer.js";
import { transcribeAudio } from "./transcribe.js";
import { clearHistory, formatHistoryPreview, loadHistory, saveHistoryEntry } from "./history.js";
import { printBanner } from "./banner.js";
import { resolveProvider } from "./resolve-provider.js";
import { ensemble, runSingleJudge } from "./judge.js";
import { startREPL } from "./repl.js";

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
  .action(async (text: string, options: { lang: string; panel?: boolean }) => {
    const config = loadConfig();
    const usePanel = options.panel || config.judgePanel.length > 0;

    if (usePanel) {
      const panelIds = config.judgePanel.length > 0 ? config.judgePanel : [config.provider];
      if (panelIds.length === 0 || (panelIds.length === 1 && panelIds[0] === "rule-based")) {
        printError(
          "多模型委员会模式需要配置至少一个 API provider。\n" +
            "示例: laozi config --judge-panel qwen,kimi,zhipu,minimax"
        );
        process.exit(1);
      }

      const spinner = ora(`正在启动 ${panelIds.length} 模型委员会分析...`).start();
      try {
        const providers: Provider[] = [];
        for (const id of panelIds) {
          const resolved = resolveProvider(id);
          providers.push(createProvider({ provider: resolved.meta.id, apiKey: resolved.apiKey, model: resolved.model }));
        }

        const votes = await Promise.all(
          providers.map((p) => runSingleJudge(p, text).catch((e) => {
            return { provider: p.name, error: e.message || String(e) } as any;
          }))
        );

        const validVotes = votes.filter((v) => !v.error);
        if (validVotes.length === 0) {
          spinner.stop();
          printError("所有模型分析均失败。\n" + votes.map((v) => `${v.provider}: ${v.error}`).join("\n"));
          process.exit(1);
        }

        const result = ensemble(validVotes);
        spinner.stop();
        printResult(result, options.lang || config.language);
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
  .action(async (filepath: string, options: { lang: string }) => {
    const { provider, config } = await getProvider();
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
          `   laozi config --provider qwen --api-key <key>`
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

    spinner = ora("正在分析内容...").start();
    try {
      const result = await analyzeContent(provider, config, transcript);
      spinner.stop();
      printResult(result as AnalysisResult, options.lang || config.language);
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
  .option("--api-key <key>", "设置 API Key")
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
