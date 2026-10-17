import test from "node:test";
import assert from "node:assert/strict";
import { compareAttempts, loadProgress, readProgress, saveProgress, summaryFromDebrief, upsertAttempt } from "../../src/progress.js";

const debrief = (total = 60, version = 2, provisional = false) => ({
  total, band: "Strong", scoring_version: version, total_status: provisional ? "provisional" : "assessed",
  breakdown: ["goals", "hidden_facts", "integrity", "relationship", "rubric"].map((id, points) => ({ id, points })),
});

test("progress keeps only an allowlisted debrief summary and replaces a feedback retry", () => {
  const first = summaryFromDebrief("A", "deadline", debrief(), "2026-10-18T00:00:00.000Z");
  assert.deepEqual(Object.keys(first).sort(), ["band", "date", "metrics", "provisional", "scenario", "scoring_version", "session_id", "total"]);
  assert.deepEqual(Object.keys(first.metrics).sort(), ["goals", "hidden_facts", "integrity", "relationship", "rubric"]);
  const updated = summaryFromDebrief("A", "deadline", debrief(85), "2026-10-18T01:00:00.000Z");
  const progress = upsertAttempt(upsertAttempt({ attempts: [] }, first), updated);
  assert.equal(progress.attempts.length, 1);
  assert.equal(progress.attempts[0].total, 85);
  assert.equal(progress.attempts[0].date, "2026-10-18T00:00:00.000Z");
});

test("progress reads legacy completions, rejects malformed storage, and handles quota failures", () => {
  assert.deepEqual(loadProgress('{"deadline":{"date":"2026-10-18T00:00:00.000Z","score":3,"mode":"scripted","transcript":"never saved"}}', ["deadline", "email"]).complete, { deadline: { date: "2026-10-18T00:00:00.000Z", score: 3, mode: "scripted" } });
  assert.deepEqual(loadProgress("{bad", ["deadline"]).attempts, []);
  assert.deepEqual(loadProgress(JSON.stringify({ attempts: [{ session_id: "", scenario: "deadline", date: "not-a-date", total: 101, band: "", scoring_version: 0, metrics: {} }] }), ["deadline"]).attempts, []);
  assert.deepEqual(readProgress({ getItem() { throw new Error("denied"); } }, ["deadline"]), { complete: {}, attempts: [] });
  const deniedProperty = { get localStorage() { throw new Error("SecurityError"); } };
  assert.deepEqual(readProgress(() => deniedProperty.localStorage, ["deadline"]), { complete: {}, attempts: [] });
  let stored;
  assert.equal(saveProgress({ setItem(_key, value) { stored = JSON.parse(value); } }, { complete: { deadline: { date: "2026-10-18T00:00:00.000Z", score: 2, transcript: "never saved" } }, attempts: [] }, ["deadline"]), true);
  assert.deepEqual(stored.complete.deadline, { date: "2026-10-18T00:00:00.000Z", score: 2 });
  let writes = 0;
  assert.equal(saveProgress({ setItem() { writes++; throw new Error("quota"); } }, { complete: {}, attempts: [] }, ["deadline"]), false);
  assert.equal(writes, 1);
  assert.equal(saveProgress(() => deniedProperty.localStorage, { complete: {}, attempts: [] }, ["deadline"]), false);
});

test("comparison preserves server values and labels cross-version and provisional attempts", () => {
  const a = summaryFromDebrief("A", "deadline", debrief(60, 2), "2026-10-18T00:00:00.000Z");
  const b = summaryFromDebrief("B", "deadline", debrief(85, 3, true), "2026-10-19T00:00:00.000Z");
  const comparison = compareAttempts(a, b);
  assert.equal(comparison.crossVersion, true);
  assert.equal(comparison.provisional, true);
  assert.deepEqual(comparison.metrics.map((row) => [row.id, row.first, row.second]), [["goals", 0, 0], ["hidden_facts", 1, 1], ["integrity", 2, 2], ["relationship", 3, 3], ["rubric", 4, 4]]);
});
