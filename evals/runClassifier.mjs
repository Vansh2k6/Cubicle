// evals/runClassifier.mjs — Live classifier eval (NOT RUN offline).
// Refuses without a server-side provider: needs LLM_PROVIDER env.
// Usage: LLM_PROVIDER=https://... node evals/runClassifier.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyTurn, buildClassifierInput } from "../llm/classifier.js";
import { loadConfig } from "../llm/config.js";
import { createManifest } from "../llm/manifest.js";

const root = dirname(fileURLToPath(import.meta.url));

if (!process.env.LLM_PROVIDER) {
  console.log("LIVE EVAL NOT RUN: no server-side provider configured");
  process.exit(2);
}

const endpoint = process.env.LLM_PROVIDER;
const provider = async ({ role, system, messages, temperature }) => {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role, system, messages, temperature }),
  });
  if (!res.ok) throw { code: "PROVIDER_ERROR" };
  const body = await res.json();
  if (typeof body.text !== "string") throw { code: "PROVIDER_ERROR" };
  return { text: body.text, tokens: body.tokens };
};

const config = loadConfig(process.env);
const manifest = createManifest(config);

const lines = readFileSync(join(root, "events.jsonl"), "utf8")
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l.length > 0)
  .map((l) => JSON.parse(l));

const tp = {};
const fp = {};
const fn = {};
function bump(map, k) {
  map[k] = (map[k] || 0) + 1;
}

for (const row of lines) {
  const input = buildClassifierInput({ text: row.utterance, lastTurns: [], userKnown: [], clock: { day: 0 } });
  let out;
  try {
    out = await classifyTurn({ provider, manifestId: manifest.id }, input);
  } catch (e) {
    console.log(`${row.id}: ERROR ${e && e.code ? e.code : e}`);
    continue;
  }
  const got = new Set(out.events.map((e) => e.type));
  for (const exp of row.expected_events || []) {
    if (got.has(exp)) bump(tp, exp);
    else bump(fn, exp);
  }
  for (const g of got) {
    if (!(row.expected_events || []).includes(g)) bump(fp, g);
  }
}

const report = { manifestId: manifest.id, perEvent: {}, lines: lines.length };
for (const ev of new Set([...Object.keys(tp), ...Object.keys(fp), ...Object.keys(fn)])) {
  const p = (tp[ev] || 0) + (fp[ev] || 0);
  const r = (tp[ev] || 0) + (fn[ev] || 0);
  report.perEvent[ev] = {
    recall: r === 0 ? null : (tp[ev] || 0) / r,
    precision: p === 0 ? null : (tp[ev] || 0) / p,
  };
  console.log(`${ev}: recall=${report.perEvent[ev].recall} precision=${report.perEvent[ev].precision}`);
}
console.log(`manifestId=${manifest.id}`);

const date = new Date().toISOString().slice(0, 10);
mkdirSync(join(root, "reports"), { recursive: true });
writeFileSync(join(root, "reports", `${date}-p2a-classifier.json`), JSON.stringify(report, null, 2));
console.log(`report written: evals/reports/${date}-p2a-classifier.json`);
