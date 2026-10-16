// evals/runGuards.mjs — Offline guard fixture runner (S1-04 P2b).
// node evals/runGuards.mjs [--json]
// Reads evals/guards.jsonl, runs llm/guards.js checkReply (+ positive check
// for authorised reveals), prints per-category recall/pass-rate plus overall
// precision/recall. No network, no model. Positive class = expect "fail".
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkReply, checkPositiveReveal } from "../llm/guards.js";

const dir = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(dir, "..", "scenarios", "missed_deadline.json"), "utf8"));
const lines = readFileSync(join(dir, "guards.jsonl"), "utf8").split("\n").filter((l) => l.trim().length > 0);

function factText(fid) {
  const f = (scenario.facts || []).find((x) => x.id === fid);
  return f ? f.content.en : "";
}

const rows = [];
for (const line of lines) {
  const c = JSON.parse(line);
  const revealedTexts = (c.revealedForNpc || []).map(factText);
  const authorised = c.authorised ? { factId: c.authorised, owner: c.npc, act: c.act } : null;
  const res = checkReply(c.reply, {
    scenario, npcId: c.npc, act: c.act, locale: "en",
    userSaid: c.userSaid || [], revealedTexts,
    commitments: c.commitments || [], revealedIds: c.revealedForNpc || [],
    authorised, activeCommitment: c.activeCommitment || null,
    clockDay: 0, bounds: { minDay: 3, cutoffDay: 3 },
  });
  let verdict = res.ok ? "pass" : "fail";
  let positive = null;
  if (c.authorised && res.ok) {
    positive = checkPositiveReveal(c.reply, scenario, c.authorised, "en").ok;
    if (!positive) verdict = "fail";
  }
  rows.push({ id: c.id, category: c.category, expect: c.expect, verdict, positive, codes: res.failures.map((f) => f.code + (f.factId ? ":" + f.factId : "")) });
}

const cats = {};
for (const r of rows) {
  const c = (cats[r.category] = cats[r.category] || { n: 0, tp: 0, fn: [], fp: [] });
  c.n += 1;
  if (r.expect === "fail" && r.verdict === "fail") c.tp += 1;
  if (r.expect === "fail" && r.verdict === "pass") c.fn.push(r.id);
  if (r.expect === "pass" && r.verdict === "fail") c.fp.push(r.id);
}

const table = Object.entries(cats).map(([category, c]) => {
  const fails = rows.filter((r) => r.category === category && r.expect === "fail").length;
  const passes = c.n - fails;
  const recall = fails ? `${c.tp}/${fails}` : "n/a";
  const passRate = passes ? `${passes - c.fp.length}/${passes}` : "n/a";
  return { category, n: c.n, recall_fail: recall, pass_rate: passRate, missed: c.fn, false_positives: c.fp };
});

const totalFail = rows.filter((r) => r.expect === "fail");
const totalPass = rows.filter((r) => r.expect === "pass");
const caught = totalFail.filter((r) => r.verdict === "fail").length;
const falseAlarms = totalPass.filter((r) => r.verdict === "fail").length;
const flagged = caught + falseAlarms;
const summary = {
  n: rows.length,
  recall: totalFail.length ? caught / totalFail.length : null,
  precision: flagged ? caught / flagged : null,
  false_positive_rate: totalPass.length ? falseAlarms / totalPass.length : null,
  known_gaps: [
    "Pure paraphrase with zero shared keywords/tokens and no date/count/agreement claim can pass (e.g. DL11/DL12): local lexical guard, no model authorised.",
    "Single common-word keywords (half/pair/review/cutoff) rely on echo/confirm context; hostile rewording may need semantic tuning.",
    "Day labels outside the SC-01 vocabulary resolve as unverified only when no weekday name matches; novel date phrasing is fail-closed via canon_date only for recognised forms.",
  ],
};

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ table, summary, rows }, null, 1));
} else {
  console.log("category              n  recall(fail)  pass-rate  missed/false-pos");
  for (const t of table) {
    console.log(
      `${t.category.padEnd(20)} ${String(t.n).padStart(2)}  ${t.recall_fail.padStart(6)}      ${t.pass_rate.padStart(6)}   ${(t.missed.concat(t.false_positives)).join(",") || "-"}`,
    );
  }
  console.log(`\noverall: n=${summary.n} recall=${summary.recall} precision=${summary.precision} fpr=${summary.false_positive_rate}`);
  console.log("known gaps:");
  for (const g of summary.known_gaps) console.log(" - " + g);
}
