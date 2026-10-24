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
  assert.ok(source.includes("function startRetrySession(sliders = state.appliedSettings || DEFAULT_SLIDERS, resumeNpc = null)"));
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
    let depth = 0, end = source.indexOf("{", start);
    for (let i = end; i < source.length; i++) { if (source[i] === "{") depth++; else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1); }
    throw new Error(`missing ${name}`);
  };
  let reject, opened;
  const state = { near: "maya", dialogue: null, paused: false, startingSession: false, sessionId: "old", scenario: "deadline", threads: {}, sharedGoals: [], sharedHint: "", round: 0, score: 0, appliedSettings: null };
  const run = Function("state", "DEFAULT_SLIDERS", "captureRun", "createSession", "closeConversation", "office", "updateScenario", "closeModal", "toast", "openSettings", "chime", "$", "renderTextDialogue", `
    const currentPeople = () => ({maya: {}}), physicalActorId = (id) => id, loadScenarioMetadata = () => {}, syncPeople = () => {};
    ${fn("freshThread")} ${fn("threadsFor")} ${fn("resetTextRun")} ${fn("startRetrySession")} ${fn("restartTextRun")} ${fn("openTextConversation")}
    return { restartTextRun, openTextConversation };
  `)(state, { assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 50 }, () => () => true,
    () => new Promise((_, r) => { reject = r; }), () => {}, { reset() {} }, () => {}, () => {}, () => {}, (draft) => { opened = draft; }, () => {}, (selector) => selector === "#talk-prompt" ? { classList: { add() {} } } : { value: "deadline" }, () => {});
  run.restartTextRun(false, "deadline", settings);
  reject(new Error("offline"));
  await Promise.resolve(); await Promise.resolve();
  state.near = "maya";
  run.openTextConversation();
  assert.deepEqual(opened, settings);
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
    let depth = 0, end = source.indexOf("{", start);
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

test("setup-load retry preserves the approached colleague through loading and create failure", async () => {
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  const fn = (name) => {
    const start = source.indexOf(`function ${name}(`);
    let depth = 0, end = source.indexOf("{", start);
    for (let i = end; i < source.length; i++) { if (source[i] === "{") depth++; else if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1); }
    throw new Error(`missing ${name}`);
  };
  const state = { near: "maya", dialogue: "maya", textMode: true, text: {}, paused: false, sessionId: null, scenario: "deadline", threads: null, startingSession: false, appliedSettings: null, sharedGoals: [], sharedHint: "" };
  const box = {}, start = {}, retry = {}, preview = {}, talk = { classList: { add() {} } };
  let getCalls = 0, rejectCreate, renders = 0;
  const getScenario = () => {
    getCalls++;
    return getCalls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve({ title: "Deadline", briefing: "Brief", goals: [] });
  };
  const $ = (selector) => ({ "#setup-content": box, "#setup-start": start, "#setup-retry": retry, "#setup-preview": preview, "#talk-prompt": talk }[selector] || null);
  const { openSettings } = Function("state", "DEFAULT_SLIDERS", "presetsEnabled", "settingsPreview", "showModal", "captureRun", "$", "PRESETS", "presetName", "presetSettings", "document", "getScenario", "closeModal", "createSession", "renderTextDialogue", "updatePublicGuidance", "toast", `
    const people = {maya: {sceneAnchor: "maya"}}, personFor = (id) => people[id], currentPeople = () => people, physicalActorId = (id) => id, remoteContact = () => null, syncPeople = () => {}, parseScenarioMetadata = (data) => data;
    ${fn("escapeHtml")}
    ${fn("freshThread")}
    ${fn("threadsFor")}
    ${fn("startRetrySession")}
    ${fn("openSettings").replace("import.meta.env.VITE_PRESETS", "undefined")}
    return { openSettings };
  `)(
    state, { assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 50 }, () => false, () => "Preview", () => { state.dialogue = null; state.textMode = false; state.text = null; state.paused = true; }, captureRun, $, {}, () => "Custom", () => null, { querySelectorAll: () => [] }, getScenario, () => { state.paused = false; }, () => new Promise((_resolve, reject) => { rejectCreate = reject; }), () => { renders++; }, () => {}, () => {},
  );
  openSettings({}, "maya");
  await Promise.resolve(); await Promise.resolve();
  assert.equal(typeof retry.onclick, "function");
  retry.onclick();
  await Promise.resolve(); await Promise.resolve();
  // The retry's real handler retains resumeNpc and reaches the extracted create flow.
  start.onclick();
  assert.equal(state.dialogue, "maya");
  assert.equal(state.textMode, true);
  assert.equal(state.startingSession, true);
  assert.equal(renders, 1);
  rejectCreate(new Error("offline"));
  await Promise.resolve(); await Promise.resolve();
  assert.equal(state.startingSession, false);
  assert.equal(state.text.loadError, "Could not reach the conversation server.");
  assert.equal(renders, 2);
});

test("production config and server manifest use NPC v5 public boundary", async () => {
  const { loadConfig } = await import("../config.js");
  assert.equal(loadConfig({}).npc.promptVersion, "v5");
  const source = readFileSync(new URL("../../services/api/server.js", import.meta.url), "utf8");
  assert.ok(source.includes('npc: { model: "offline-stub:store-v1", promptVersion: "v5"'));
});
