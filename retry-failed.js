#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolveProvider } from "./dist/resolve-provider.js";
import { createProvider } from "./dist/providers/base.js";
import { extractStructured } from "./dist/extractor.js";
import { runJudge } from "./dist/judge.js";

// Collect failed cases from all workers
const failedCases = [];
for (let i = 0; i < 4; i++) {
  try {
    const data = JSON.parse(readFileSync(`parallel-results-${i}.json`, "utf-8"));
    for (const r of data) {
      if (!r.ok) failedCases.push(r);
    }
  } catch {}
}

console.log(`Retrying ${failedCases.length} failed cases with 2 workers...`);

const workerId = parseInt(process.argv[2] || "0");
const totalWorkers = 2;
const chunkSize = Math.ceil(failedCases.length / totalWorkers);
const myCases = failedCases.slice(workerId * chunkSize, (workerId + 1) * chunkSize);

const outFile = `retry-results-${workerId}.json`;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function analyzeWithRetry(text, maxRetries = 3) {
  const r = resolveProvider("qwen");
  const provider = createProvider({ provider: r.meta.id, apiKey: r.apiKey, model: r.model });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const ex = await extractStructured(provider, text);
      return await runJudge(provider, text, ex);
    } catch (e) {
      if (e.message?.includes("429") || e.message?.includes("throttling")) {
        const delay = 5000 * (attempt + 1);
        console.log(`  429, retry ${attempt + 1}/${maxRetries} after ${delay}ms`);
        await sleep(delay);
      } else {
        throw e;
      }
    }
  }
  throw new Error("Max retries exceeded");
}

async function main() {
  const results = [];

  for (let i = 0; i < myCases.length; i++) {
    const tc = myCases[i];
    console.log(`[W${workerId}] [${i + 1}/${myCases.length}] ${tc.cat}: ${tc.text.slice(0, 45)}`);

    const startTime = Date.now();
    try {
      const res = await analyzeWithRetry(tc.text);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[W${workerId}]   => ${res.credibilityScore}/100 ${res.verdict} | ${elapsed}s`);
      results.push({ ...tc, score: res.credibilityScore, verdict: res.verdict, flags: res.redFlags.length, ok: true, elapsed, error: null });
    } catch (e) {
      console.log(`[W${workerId}]   => FINAL ERROR: ${e.message}`);
      results.push({ ...tc, ok: false, error: e.message });
    }

    writeFileSync(outFile, JSON.stringify(results, null, 2));

    // Rate limit: wait 3s between calls to avoid 429
    if (i < myCases.length - 1) {
      await sleep(3000);
    }
  }

  console.log(`[W${workerId}] DONE`);
}

main().catch(console.error);
