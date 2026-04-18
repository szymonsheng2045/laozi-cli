#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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

function runCheck(text) {
  return new Promise((resolve) => {
    const proc = spawn("node", [join(__dirname, "dist/cli.js"), "check", text, "--no-panel"], {
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
      timeout: 180000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ code: -1, stdout, stderr: err.message });
    });
  });
}

function parseResult(stdout) {
  const scoreMatch = stdout.match(/(\d{1,3})\/100/);
  const verdictMatch = stdout.match(/\[(.+?)\]/);
  const summaryMatch = stdout.match(/总结 \/ Summary:[\s\S]*?  (.+)/);
  return {
    score: scoreMatch ? parseInt(scoreMatch[1]) : null,
    verdict: verdictMatch ? verdictMatch[1].split(" /")[0].trim() : null,
    summary: summaryMatch ? summaryMatch[1].trim() : null,
  };
}

async function main() {
  const results = [];
  const total = allCases.length;

  for (let i = 0; i < total; i++) {
    const tc = allCases[i];
    console.log(`\n[${i + 1}/${total}] ${tc.category.toUpperCase()}`);
    console.log(`Text: ${tc.text.slice(0, 60)}${tc.text.length > 60 ? "..." : ""}`);

    const start = Date.now();
    const { code, stdout, stderr } = await runCheck(tc.text);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    if (code !== 0) {
      console.log(`  ERROR (${elapsed}s): ${stderr.slice(0, 100)}`);
      results.push({ ...tc, error: stderr.slice(0, 200), elapsed });
      continue;
    }

    const parsed = parseResult(stdout);
    console.log(`  Result: ${parsed.score}/100 ${parsed.verdict} (${elapsed}s)`);
    results.push({ ...tc, ...parsed, elapsed });

    // Save incremental results
    writeFileSync(join(__dirname, "batch-results.json"), JSON.stringify(results, null, 2));
  }

  // Summary
  console.log("\n========== BATCH TEST COMPLETE ==========\n");

  const byCategory = {};
  for (const r of results) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  for (const [cat, items] of Object.entries(byCategory)) {
    const scores = items.filter((i) => i.score !== null).map((i) => i.score);
    const avg = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : "N/A";
    const errors = items.filter((i) => i.error).length;
    const verdicts = {};
    for (const i of items) {
      if (i.verdict) verdicts[i.verdict] = (verdicts[i.verdict] || 0) + 1;
    }
    console.log(`${cat}: avg=${avg}, errors=${errors}, verdicts=${JSON.stringify(verdicts)}`);
  }

  // Accuracy analysis
  console.log("\n--- Accuracy ---");
  for (const r of results) {
    if (r.error) continue;
    let correct = false;
    if (r.category === "factual" && r.score >= 70) correct = true;
    if (r.category === "exaggerated" && r.score >= 40 && r.score < 80) correct = true;
    if (r.category === "misinformation" && r.score < 40) correct = true;
    if (r.category === "boundary") correct = true; // boundary is subjective
    console.log(`${correct ? "✓" : "✗"} [${r.category}] ${r.score} ${r.verdict} | ${r.text.slice(0, 40)}`);
  }
}

main().catch(console.error);
