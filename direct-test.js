#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
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

// Shuffle
for (let i = allCases.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [allCases[i], allCases[j]] = [allCases[j], allCases[i]];
}

async function analyzeOne(text) {
  const r = resolveProvider("qwen");
  const provider = createProvider({ provider: r.meta.id, apiKey: r.apiKey, model: r.model });

  const extraction = await extractStructured(provider, text);
  const result = await runJudge(provider, text, extraction);

  return {
    score: result.credibilityScore,
    verdict: result.verdict,
    redFlags: result.redFlags.length,
    summary: result.summary.zh,
  };
}

async function main() {
  const results = [];
  const total = allCases.length;

  for (let i = 0; i < total; i++) {
    const tc = allCases[i];
    console.log(`\n[${i + 1}/${total}] ${tc.category.toUpperCase()}: ${tc.text.slice(0, 50)}...`);

    const start = Date.now();
    try {
      const r = await analyzeOne(tc.text);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  => ${r.score}/100 ${r.verdict} | ${r.redFlags} flags | ${elapsed}s`);
      results.push({ ...tc, ...r, elapsed, error: null });
    } catch (e) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  => ERROR: ${e.message} | ${elapsed}s`);
      results.push({ ...tc, score: null, verdict: "ERROR", redFlags: 0, summary: "", elapsed, error: e.message });
    }

    // Incremental save
    writeFileSync(join(__dirname, "direct-results.json"), JSON.stringify(results, null, 2));
  }

  // Summary
  console.log("\n========== BATCH TEST COMPLETE ==========\n");

  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    const valid = items.filter((i) => i.score !== null);
    const scores = valid.map((i) => i.score);
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "N/A";
    const errors = items.filter((i) => i.error).length;
    const verdicts = {};
    for (const i of valid) {
      verdicts[i.verdict] = (verdicts[i.verdict] || 0) + 1;
    }
    console.log(`${cat}: n=${items.length}, avg=${avg}, errors=${errors}, verdicts=${JSON.stringify(verdicts)}`);
  }

  // Accuracy
  console.log("\n--- Accuracy Check ---");
  let correct = 0;
  let totalCheck = 0;
  for (const r of results) {
    if (r.error || r.category === "boundary") continue;
    totalCheck++;
    let ok = false;
    if (r.category === "factual" && r.score >= 70) ok = true;
    if (r.category === "exaggerated" && r.score >= 40 && r.score < 80) ok = true;
    if (r.category === "misinformation" && r.score < 40) ok = true;
    if (ok) correct++;
    console.log(`${ok ? "✓" : "✗"} [${r.category}] ${r.score}/100 ${r.verdict} | ${r.text.slice(0, 40)}`);
  }
  console.log(`\nAccuracy: ${correct}/${totalCheck} = ${totalCheck > 0 ? ((correct / totalCheck) * 100).toFixed(1) : 0}%`);
}

main().catch(console.error);
