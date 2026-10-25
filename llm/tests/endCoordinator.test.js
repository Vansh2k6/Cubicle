import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { captureRun, createEndCoordinator } from "../../src/endCoordinator.js";
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
  assert.ok(source.includes("function startRetrySession(sliders = state.appliedSettings || DEFAULT_SLIDERS, resumeNpc = null, previousSessionId = state.previousSessionId || null, npcSliders = state.appliedNpcSettings)"));
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

test("a failed same-settings retry retains the originating draft for recovery", async () => {
  const settings = { assertiveness: 0, patience: 100, warmth: 25, forthcomingness: 75 };
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  const fn = (name) => {
    const start = source.indexOf(`function ${name}(`);
    let depth = 0, end = source.indexOf("{", source.indexOf(") {", start));
    for (let i = end; i < source.length; i++) { if (source[i] === "{") depth++; else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1); }
    throw new Error(`missing ${name}`);
  };
  let reject, calls = 0, recovered;
  const state = { dialogue: null, textMode: false, text: null, paused: false, startingSession: false, sessionId: "old", scenario: "deadline", threads: {}, sharedGoals: [], sharedHint: "", round: 0, score: 0, appliedSettings: null, appliedNpcSettings: null, settingsDrafts: {} };
  const run = Function("state", "DEFAULT_SLIDERS", "captureRun", "createSession", "closeConversation", "office", "updateScenario", "closeModal", "toast", "$", "renderTextDialogue", "updatePublicGuidance", `
    const selectorScenarioId = (id) => id === "workplace_intimidation" ? "email" : id;
    const isTypedScenario = (id) => ["deadline", "email"].includes(id);
    const apiScenarioId = (id) => id === "email" ? "workplace_intimidation" : id;
    const currentPeople = () => ({maya: {}}), syncPeople = () => {}, loadScenarioMetadata = () => {}, parseScenarioMetadata = (data) => data;
    ${fn("freshThread")} ${fn("threadsFor")} ${fn("resetTextRun")} ${fn("startRetrySession")} ${fn("restartTextRun")} ${fn("startTextSession")}
    return { restartTextRun, startTextSession, threadsFor };
  `)(state, { assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 50 }, () => () => true,
    (...args) => { calls++; if (calls === 1) return new Promise((_, r) => { reject = r; }); recovered = args; return Promise.resolve({session_id: "recovered", public_state: {goals: [], next_hint: ""}, settings}); }, () => {}, { reset() {} }, () => {}, () => {}, () => {}, (selector) => ({ value: "deadline" }), () => {}, () => {});
  run.restartTextRun(false, "deadline", settings);
  reject(new Error("offline"));
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(state.appliedSettings, settings);
  state.dialogue = "maya"; state.textMode = true; state.text = run.threadsFor().maya;
  run.startTextSession();
  assert.deepEqual(recovered.slice(0, 2), ["deadline", settings]);
});

test("progress comparison escaping keeps server-reported zero metric values", () => {
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  const body = source.match(/function escapeHtml\(s\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(body, "escapeHtml helper missing");
  const escapeHtml = Function(`${body}; return escapeHtml;`)();
  assert.equal(escapeHtml(0), "0");
  assert.equal(escapeHtml(null), "");
  assert.match(source, /Communication \(AI-assessed\)/);
  assert.match(source, /escapeHtml\(displayAttemptMetric\(comparison\.first, metric\.id\)\)/);
});

test("text session retry keeps loading state only for its current thread", async () => {
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  const fn = (name) => {
    const start = source.indexOf(`function ${name}(`);
    let depth = 0, end = source.indexOf("{", source.indexOf(") {", start));
    for (let i = end; i < source.length; i++) { if (source[i] === "{") depth++; else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1); }
    throw new Error(`missing ${name}`);
  };
  const make = () => {
    const thread = { loadError: null };
    const state = { sessionId: null, scenario: "deadline", threads: { maya: thread }, textMode: true, text: thread, startingSession: false, appliedSettings: null, sharedGoals: [], sharedHint: "" };
    let resolve, reject, renders = 0;
    const startTextSession = Function("state", "captureRun", "createSession", "DEFAULT_SLIDERS", "renderTextDialogue", "updatePublicGuidance", "threadsFor", `
      const syncPeople = () => {};
      ${fn("startTextSession")}
      return startTextSession;
    `)(state, captureRun, () => new Promise((res, rej) => { resolve = res; reject = rej; }), {}, () => { renders++; }, () => {}, () => state.threads);
    return { state, thread, startTextSession, resolve: (value) => resolve(value), reject: (error) => reject(error), renders: () => renders };
  };
  const success = make();
  success.startTextSession();
  assert.equal(success.state.startingSession, true);
  assert.equal(success.renders(), 1);
  success.resolve({ session_id: "ready", public_state: { goals: [], next_hint: "Next" }, settings: {} });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(success.state.startingSession, false);
  assert.equal(success.state.sessionId, "ready");
  assert.equal(success.renders(), 2);

  const failed = make();
  failed.startTextSession();
  failed.reject(new Error("offline"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(failed.state.startingSession, false);
  assert.equal(failed.thread.loadError, "offline");
  assert.equal(failed.renders(), 2);

  const stale = make();
  stale.startTextSession();
  stale.state.threads = {}; stale.state.sessionId = "new"; stale.state.startingSession = true;
  stale.resolve({ session_id: "late", public_state: {}, settings: {} });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(stale.state.startingSession, true);
  assert.equal(stale.state.sessionId, "new");
});

test("setup-load retry preserves the approached colleague before direct-session recovery", async () => {
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  const fn = (name) => {
    const start = source.indexOf(`function ${name}(`);
    let depth = 0, end = source.indexOf("{", start);
    for (let i = end; i < source.length; i++) { if (source[i] === "{") depth++; else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1); }
    throw new Error(`missing ${name}`);
  };
  const state = { near: "maya", entry: "selection", paused: false, sessionId: null, scenario: "email", threads: null, startingSession: false, appliedSettings: null, sharedGoals: [], sharedHint: "", settingsDrafts: {}, setupPerson: null };
  const briefing = {}, retry = {}, intro = {}, entry = {setAttribute() {}}, scenario = {}, cards = {};
  let getCalls = 0;
  const getScenario = () => {
    getCalls++;
    return Promise.reject(new Error("offline"));
  };
  const $ = (selector) => ({ ".entry-intro": intro, "#entry-screen": entry, "#scenario": scenario, "#scenario-cards": cards, "#entry-prototype": {}, "#scenario-briefing": briefing, "#briefing-back": {}, "#briefing-retry": retry }[selector] || null);
  const { showCastSetup } = Function("state", "$", "scenarios", "getScenario", `
    const showSelection = () => {};
    ${fn("showCastSetup")}
    return { showCastSetup };
  `)(state, $, {deadline: {title: "Deadline", description: "Brief", goal: "Goal"}}, getScenario);
  showCastSetup("deadline");
  await Promise.resolve(); await Promise.resolve();
  assert.equal(typeof retry.onclick, "function");
  retry.onclick();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(getCalls, 2);
  assert.equal(state.near, "maya");
  assert.equal(state.sessionId, null);
});

test("production config and server manifest use NPC v6 public boundary", async () => {
  const { loadConfig } = await import("../config.js");
  assert.equal(loadConfig({}).npc.promptVersion, "v6");
  const source = readFileSync(new URL("../../services/api/server.js", import.meta.url), "utf8");
  assert.ok(source.includes('npc: { model: "offline-stub:store-v1", promptVersion: "v6"'));
});
