#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveProvider } from "./dist/resolve-provider.js";
import { createProvider } from "./dist/providers/base.js";
import { extractStructured } from "./dist/extractor.js";
import { runJudge } from "./dist/judge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(__dirname, "test-cases.json"), "utf-8"));

const allCases = [
  ...cases.factual.map((t) => ({ text: t, category: "factual", expected: "safe" })),
  ...cases.exaggerated.map((t) => ({ text: t, category: "exaggerated", expected: "suspicious" })),
  ...cases.misinformation.map((t) => ({ text: t, category: "misinformation", expected: "misinformation" })),
  ...cases.boundary.map((t) => ({ text: t, category: "boundary", expected: "mixed" })),
];

// Shuffle deterministically
for (let i = allCases.length - 1; i > 0; i--) {
  const j = (i * 7 + 13) % (i + 1);
  [allCases[i], allCases[j]] = [allCases[j], allCases[i]];
}

const workerId = parseInt(process.argv[2] || "0");
const totalWorkers = parseInt(process.argv[3] || "4");
const chunkSize = Math.ceil(allCases.length / totalWorkers);
const start = workerId * chunkSize;
const end = Math.min(start + chunkSize, allCases.length);

const outFile = join(__dirname, `parallel-results-${workerId}.json`);

async function analyzeOne(text, provider) {
  const extraction = await extractStructured(provider, text);
  return await runJudge(provider, text, extraction);
}

async function main() {
  const r = resolveProvider("qwen");
  const provider = createProvider({ provider: r.meta.id, apiKey: r.apiKey, model: r.model });

  let results = [];
  if (existsSync(outFile)) {
    try { results = JSON.parse(readFileSync(outFile, "utf-8")); } catch {}
  }

  // Resume from where we left off
  const alreadyDone = new Set(results.map((x) => x.i));

  for (let i = start; i < end; i++) {
    if (alreadyDone.has(i)) {
      console.log(`[W${workerId}] SKIP ${i} (already done)`);
      continue;
    }

    const tc = allCases[i];
    console.log(`[W${workerId}] [${i + 1}/100] ${tc.category}: ${tc.text.slice(0, 45)}`);

    const startTime = Date.now();
    try {
      const res = await analyzeOne(tc.text, provider);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[W${workerId}]   => ${res.credibilityScore}/100 ${res.verdict} | ${elapsed}s`);
      results.push({ i, cat: tc.category, text: tc.text, score: res.credibilityScore, verdict: res.verdict, flags: res.redFlags.length, ok: true, elapsed });
    } catch (e) {
      console.log(`[W${workerId}]   => ERROR: ${e.message}`);
      results.push({ i, cat: tc.category, text: tc.text, error: e.message, ok: false });
    }

    writeFileSync(outFile, JSON.stringify(results, null, 2));
  }

  console.log(`[W${workerId}] DONE`);
}

main().catch(console.error);
