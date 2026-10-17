import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEndCoordinator } from "../../src/endCoordinator.js";
test("delayed End ignores restarted/switched runs and suppresses duplicate submission", async () => {
  const end = createEndCoordinator();
  let resolve, calls = 0, current = "old";
  const request = () => { calls++; return new Promise((r) => { resolve = r; }); };
  const pending = end.run("old", "deadline", request, (id) => id === current);
  assert.equal(end.busy("old", "deadline"), true);
  assert.equal(await end.run("old", "deadline", request, () => true), null);
  current = "new";
  resolve({ ended: true });
  assert.equal(await pending, null);
  assert.equal(calls, 1);
  assert.equal(end.busy("new", "deadline"), false);
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  assert.ok(source.includes("ending.run(sessionId, scenarioId, endSession, current)"));
  assert.ok(source.includes("thread.over || ending.busy(state.sessionId, state.scenario)"));
});

test("a stale turn/create response cannot mutate a new run", async () => {
  const { captureRun } = await import("../../src/endCoordinator.js");
  for (const sessionId of ["old", null]) {
    const state = { sessionId, scenario: "deadline", threads: {} };
    const current = captureRun(state);
    let resolve;
    const pending = new Promise((r) => { resolve = r; }).then(() => { if (current()) state.ended = true; });
    state.sessionId = "new"; state.threads = {};
    resolve(); await pending;
    assert.equal(state.ended, undefined);
  }
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  assert.ok(source.includes("const data = await sendTurn(sessionId, npcId, text, key)"));
  assert.ok(source.includes("if (!current()) return;"));
  assert.ok(source.includes("function startRetrySession()"));
  assert.ok(source.includes("const current = captureRun(state);"));
  assert.ok(source.includes("if (!current() || state.threads !== threads || state.sessionId) return;"));
});

test("Restart cancels a pending retry create and a following fresh create may settle", async () => {
  const { captureRun } = await import("../../src/endCoordinator.js");
  const state = { sessionId: null, scenario: "deadline", threads: {}, startingSession: true, round: 2, score: 3 };
  const oldThreads = state.threads;
  const oldCurrent = captureRun(state);
  let resolveOld, rejectOld;
  const lateResolve = new Promise((resolve) => { resolveOld = resolve; }).then((data) => {
    if (!oldCurrent() || state.threads !== oldThreads || state.sessionId) return false;
    state.sessionId = data.session_id; state.startingSession = false; return true;
  });
  const lateReject = new Promise((resolve) => { rejectOld = resolve; }).then(() => {
    if (!oldCurrent() || state.threads !== oldThreads) return false;
    state.startingSession = false; return true;
  });
  state.sessionId = null; state.threads = null; state.startingSession = false; state.round = 0; state.score = 0;
  resolveOld({ session_id: "late" }); rejectOld();
  assert.deepEqual(await Promise.all([lateResolve, lateReject]), [false, false]);
  assert.equal(state.startingSession, false);
  const freshThreads = state.threads = {};
  const freshCurrent = captureRun(state);
  state.startingSession = true;
  if (freshCurrent() && state.threads === freshThreads && !state.sessionId) { state.sessionId = "fresh"; state.startingSession = false; }
  assert.equal(state.sessionId, "fresh");
  assert.equal(state.startingSession, false);
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  assert.match(source, /\$\("#restart"\)\.onclick = \(\) => \{\s+resetTextRun\(\);/);
  assert.match(source, /state\.scenario = e\.target\.value;\s+resetTextRun\(\);/);
});

test("progress comparison escaping keeps server-reported zero metric values", () => {
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  const body = source.match(/function escapeHtml\(s\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(body, "escapeHtml helper missing");
  const escapeHtml = Function(`${body}; return escapeHtml;`)();
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(null), "");
  assert.match(source, /<td>\$\{escapeHtml\(metric\.first\)\}<\/td>/);
});

test("production config and server manifest use NPC v2 moves", async () => {
  const { loadConfig } = await import("../config.js");
  assert.equal(loadConfig({}).npc.promptVersion, "v2");
  const source = readFileSync(new URL("../../services/api/server.js", import.meta.url), "utf8");
  assert.ok(source.includes('npc: { model: "offline-stub:store-v1", promptVersion: "v2"'));
});
