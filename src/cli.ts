#!/usr/bin/env node
import { Command } from "commander";
import { existsSync } from "node:fs";
import ora from "ora";
import { analyzeContent, AnalysisResult } from "./analyzer.js";
import { createClient } from "./llm.js";
import { loadConfig, saveConfig, configPathDisplay } from "./config.js";
import { printError, printInfo, printResult } from "./printer.js";
import { transcribeAudio } from "./transcribe.js";

const program = new Command();

program
  .name("laozi")
  .description("LAOZI.CLI — 帮助家庭识别针对老人的网络虚假信息")
  .version("0.1.0");

program
  .command("check <text>")
  .description("分析一段文字内容的真实性")
  .option("-l, --lang <lang>", "输出语言: zh | en | bilingual", "bilingual")
  .action(async (text: string, options: { lang: string }) => {
    const config = loadConfig();
    if (!config.apiKey) {
      printError(`请先设置 API Key: laozi config --api-key <your-key>`);
      process.exit(1);
    }

    const client = createClient(config);
    const spinner = ora("正在分析内容...").start();

    try {
      const result = await analyzeContent(client, config, text);
      spinner.stop();
      printResult(result as AnalysisResult, options.lang || config.language);
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
    const config = loadConfig();
    if (!config.apiKey) {
      printError(`请先设置 API Key: laozi config --api-key <your-key>`);
      process.exit(1);
    }
    if (!existsSync(filepath)) {
      printError(`文件不存在: ${filepath}`);
      process.exit(1);
    }

    const client = createClient(config);

    let spinner = ora("正在转录语音...").start();
    let transcript: string;
    try {
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
      const result = await analyzeContent(client, config, transcript);
      spinner.stop();
      printResult(result as AnalysisResult, options.lang || config.language);
    } catch (err: any) {
      spinner.stop();
      printError(err.message || String(err));
      process.exit(1);
    }
  });

program
  .command("config")
  .description("配置 CLI 参数")
  .option("--api-key <key>", "设置 OpenAI 兼容 API Key")
  .option("--base-url <url>", "设置 API Base URL")
  .option("--model <model>", "设置分析用模型")
  .option("--whisper-model <model>", "设置语音转文字模型")
  .option("--language <lang>", "默认输出语言: zh | en | bilingual")
  .action((options) => {
    const updates: any = {};
    if (options.apiKey !== undefined) updates.apiKey = options.apiKey;
    if (options.baseUrl !== undefined) updates.baseURL = options.baseUrl;
    if (options.model !== undefined) updates.model = options.model;
    if (options.whisperModel !== undefined) updates.whisperModel = options.whisperModel;
    if (options.language !== undefined) updates.language = options.language;

    if (Object.keys(updates).length === 0) {
      printInfo(`当前配置文件: ${configPathDisplay()}`);
      console.log(JSON.stringify(loadConfig(), null, 2));
      return;
    }

    saveConfig(updates);
    printInfo(`配置已保存到: ${configPathDisplay()}`);
  });

program.parse();
