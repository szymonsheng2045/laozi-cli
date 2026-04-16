# LAOZI.CLI

A lightweight command-line tool to help families identify misinformation, scams, and pseudo-science targeting elderly internet users.

> **Less noise, more essence.**

## Why

Elderly people are often the primary targets of health misinformation, phishing scams, and emotional manipulation on platforms like WeChat and short-video apps. Their children and grandchildren usually spot the red flags—but explaining it in a way the elder can understand is hard.

LAOZI.CLI bridges that gap. Paste (or voice-transcribe) the suspicious content, and get:

- A **credibility score** and verdict
- **Specific red flags** identified by an LLM
- A **warm, plain-language explanation** you can copy-paste directly into the family chat
- **Bilingual output** (Chinese + English) for multi-generational or overseas families

## Install

```bash
npm install -g laozi-cli
```

Or install directly from GitHub:

```bash
npm install -g github:szymonsheng2045/laozi-cli
```

## Configure

LAOZI.CLI uses any **OpenAI-compatible API**. Popular choices:

- OpenAI
- DeepSeek
- Moonshot (Kimi)
- Qwen
- Self-hosted models (vLLM, llama.cpp server, etc.)

```bash
laozi config --api-key <YOUR_KEY> --base-url https://api.deepseek.com/v1 --model deepseek-chat
```

View current config:

```bash
laozi config
```

## Usage

### Analyze text

```bash
laozi check "专家说每天喝醋能软化血管，群里都在转发"
```

### Analyze a voice message

```bash
laozi voice ~/Downloads/grandma_voice.m4a
```

The voice file is first transcribed to text (via Whisper API), then analyzed.

### Change output language

```bash
laozi check "..." --lang zh        # Chinese only
laozi check "..." --lang en        # English only
laozi check "..." --lang bilingual # Both (default)
```

## Example Output

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  可信度分析 / Credibility Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🔴 可信度 / Score: 23/100 [虚假信息 / Misinformation]

  主要疑点 / Red Flags:
    1. "专家说" — 未提供具体姓名和机构，典型的权威嫁接
       "Expert says" without naming anyone — classic appeal to false authority
    2. "软化血管" — 医学上不存在这个概念，动脉硬化不可逆
       "Softens blood vessels" is not a real medical concept; atherosclerosis is irreversible
    3. "群里都在转发" — 从众效应，与事实真伪无关
       "Everyone is forwarding it" — bandwagon fallacy, unrelated to truth

  给老人的一句话 / For the Elder:
  奶奶，血管变硬就像水管老化，喝醋洗不干净，喝多了反而伤胃。医院大夫没这么说过。
  Grandma, hardened blood vessels are like aging pipes; vinegar won't clean them, and too much can hurt your stomach. Doctors don't say this.

  建议操作 / Suggested Action:
  提醒老人不要购买相关保健品，必要时带去医院咨询医生。
  Remind the elder not to buy related health products. Take them to a doctor if needed.

  总结 / Summary:
  这是一条典型的健康养生谣言，利用老年人对健康的焦虑进行传播，内容没有科学依据。
  A typical health hoax exploiting elderly anxiety, with no scientific basis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Architecture

```
laozi-cli
├── src/cli.ts           # Commander entrypoint
├── src/config.ts        # ~/.laozi/config.json management
├── src/llm.ts           # OpenAI-compatible chat client
├── src/transcribe.ts    # Whisper transcription
├── src/analyzer.ts      # Prompt engineering + JSON parsing
└── src/printer.ts       # Terminal formatting with Chalk
```

Core design principles:
- **No heavy local models**. All intelligence is delegated to a remote LLM.
- **Minimal dependencies**. Fast install, small footprint.
- **Bilingual-first**. Output designed for copy-paste into family chats.

## License

MIT
