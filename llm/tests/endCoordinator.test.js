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
});

test("production config and server manifest use NPC v2 moves", async () => {
  const { loadConfig } = await import("../config.js");
  assert.equal(loadConfig({}).npc.promptVersion, "v2");
  const source = readFileSync(new URL("../../services/api/server.js", import.meta.url), "utf8");
  assert.ok(source.includes('npc: { model: "offline-stub:store-v1", promptVersion: "v2"'));
});
