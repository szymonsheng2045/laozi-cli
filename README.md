# LAOZI.CLI

A lightweight command-line tool to help families identify misinformation, scams, and pseudo-science targeting elderly internet users.

> **Less noise, more essence.**

## Why

Elderly people are often the primary targets of health misinformation, phishing scams, and emotional manipulation on platforms like WeChat and short-video apps. Their children and grandchildren usually spot the red flags—but explaining it in a way the elder can understand is hard.

LAOZI.CLI bridges that gap. Paste (or voice-transcribe) the suspicious content, and get:

- A **credibility score** and verdict
- **Specific red flags** identified by an LLM or local rule engine
- A **warm, plain-language explanation** you can copy-paste directly into the family chat
- **Bilingual output** (Chinese + English) for multi-generational or overseas families

## Install

### One-line install

> macOS / Linux only

```bash
curl -fsSL https://laozi.art/install.sh | bash
```

### Manual install

```bash
git clone https://github.com/szymonsheng2045/laozi-cli.git ~/.laozi-cli
cd ~/.laozi-cli
npm install
npm run build
npm link
```

### Windows (PowerShell)

```powershell
git clone https://github.com/szymonsheng2045/laozi-cli.git $HOME\.laozi-cli
cd $HOME\.laozi-cli
npm install
npm run build
npm link
```

### Update an existing Windows install

```powershell
cd $HOME\.laozi-cli
git pull origin main
npm install
npm run build
npm link
```

## Quick Start (Zero Config)

LAOZI.CLI works **out of the box** with LAOZI Cloud. No API key or model download is required.

```bash
laozi check "专家说每天喝醋能软化血管，群里都在转发"
```

By default, the text you analyze is sent to `https://laozi.art/api/analyze` for cloud analysis. If you want a fully local, no-network mode:

```bash
laozi config --provider rule-based
```

## Upgrade to AI Analysis

The hosted cloud mode is the easiest starting point. You can also switch to a local or self-managed model:

### Option 1: Local Ollama (Free, Private)

1. Install [Ollama](https://ollama.com)
2. Pull a Chinese-capable model (recommended: **Qwen2.5 7B**):
   ```bash
   ollama pull qwen2.5:7b
   ```
3. Configure LAOZI.CLI:
   ```bash
   laozi config --provider ollama --model qwen2.5:7b
   ```

### Option 2: Local llama.cpp server (Free, Private)

1. Start [llama.cpp server](https://github.com/ggerganov/llama.cpp/blob/master/examples/server/README.md) with your GGUF model
2. Configure:
   ```bash
   laozi config --provider llama-cpp --base-url http://localhost:8080 --model local
   ```

### Option 3: OpenAI-compatible API

```bash
laozi config --provider openai --api-key <YOUR_KEY> --base-url https://api.openai.com/v1 --model gpt-4o-mini
```

Other compatible services: DeepSeek, Moonshot (Kimi), Qwen, etc.

### Option 4: LAOZI Cloud (Default)

```bash
laozi config --provider laozi-cloud
```

The API key is kept on the `laozi.art` server. CLI users do not receive or need the key.

### Optional: Four-model judge panel via Bailian

If you have an Alibaba Cloud Bailian / DashScope-compatible key, one key can route the default China-mainland panel:

```bash
laozi config --bailian-key <DASHSCOPE_API_KEY>
```

The panel keeps each provider's default model (`qwen3.5-plus`, `kimi-k2.5`, `glm-5`, `MiniMax-M2.5`) and then merges the votes with the built-in judge ensemble.

Check whether the panel is actually enabled:

```bash
laozi doctor
```

If `doctor` says `Panel: disabled`, LAOZI.CLI is still in local/single-provider mode and will not run the `structured extraction -> multi-model judge` workflow.

### API Key Safety

- API keys are stored in `~/.laozi/config.json`, not in the repository.
- Prefer environment variables for shared or demo machines:
  - `DASHSCOPE_API_KEY`
  - `OPENAI_API_KEY`
  - `DEEPSEEK_API_KEY`
  - `GEMINI_API_KEY`
- `laozi config` and REPL `/config` mask secrets before printing them.
- Never commit `~/.laozi/config.json`, screenshots of `/config`, or shell history containing keys.

## Usage

### Analyze text

```bash
laozi check "专家说每天喝醋能软化血管，群里都在转发"
```

### Analyze a voice message

> Note: Voice transcription currently requires an OpenAI-compatible API (local Whisper support is planned).

```bash
laozi voice ~/Downloads/grandma_voice.m4a
```

### Change output language

```bash
laozi check "..." --lang zh        # Chinese only
laozi check "..." --lang en        # English only
laozi check "..." --lang bilingual # Both (default)
```

### View history

```bash
laozi history          # list recent checks
laozi history --clear  # clear all history
```

### Export report

```bash
laozi export                    # export latest to laozi-report.md
laozi export ~/Desktop/report.md
```

### Clipboard Support

- macOS: built-in
- Windows: built-in via PowerShell `Set-Clipboard`
- Linux: requires `xclip`

## Example Output

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  可信度分析 / Credibility Analysis
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  🔴 可信度 / Score: 15/100 [虚假信息 / Misinformation]

  主要疑点 / Red Flags:
    1. "软化血管"不是医学概念，动脉粥样硬化不可逆
       "Softening blood vessels" is not a medical concept
    2. 未提供具体姓名、机构和文献来源，属于典型的'权威嫁接'
       No specific name or source — classic false authority appeal
    3. 利用从众心理和道德绑架，与内容真实性无关
       Exploits bandwagon psychology, unrelated to truth

  给老人的一句话 / For the Elder:
  血管变硬就像水管老化，喝醋洗不干净，喝多了反而伤胃。医院大夫没这么说过。
  Hardened blood vessels are like aging pipes; vinegar won't clean them, and too much can hurt your stomach.

  建议操作 / Suggested Action:
  提醒老人不要相信此类养生偏方，如有血管问题应去医院就诊。
  Remind the elder not to believe such folk remedies. Go to the hospital for real issues.

  总结 / Summary:
  典型的健康养生谣言，利用老年人对心血管疾病的恐惧进行传播，没有科学依据。
  A typical health hoax exploiting elderly anxiety, with no scientific basis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Architecture

Inspired by [OpenCode](https://opencode.ai) and [BettaFish](https://github.com/Dorenbos/xnvs) — minimal, pluggable, local-first.

```
laozi-cli
├── src/
│   ├── cli.ts              # Commander entrypoint
│   ├── config.ts           # ~/.laozi/config.json
│   ├── history.ts          # ~/.laozi/history.json persistence
│   ├── analyzer.ts         # Prompt engineering + JSON parsing
│   ├── printer.ts          # Terminal formatting with Chalk
│   ├── llm.ts              # OpenAI client for voice/API mode
│   ├── transcribe.ts       # Whisper transcription
│   └── providers/
│       ├── base.ts         # Provider interface + factory
│       ├── rule-based.ts   # Zero-config local rule engine
│       ├── ollama.ts       # Ollama local LLM
│       ├── llama-cpp.ts    # llama.cpp server
│       └── openai.ts       # OpenAI-compatible API
```

Core design principles:
- **Local-first**. Rule engine works offline instantly.
- **Pluggable providers**. Swap from rules → local LLM → API without changing commands.
- **Bilingual-first**. Output designed for copy-paste into family chats.
- **History & export**. Every analysis is saved and exportable to Markdown.

## License

MIT
