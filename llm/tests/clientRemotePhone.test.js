import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {parseScenarioMetadata} from "../../src/scenarioMetadata.js";
import {captureRun, createEndCoordinator} from "../../src/endCoordinator.js";
import {publicScenario, defaultRegistry} from "../../services/api/scenarioRegistry.js";
import {remoteProofRegistry} from "../../services/api/tests/fixtures/remoteProof.js";
import {startRemoteUiServer} from "../../services/api/tests/fixtures/remoteUiServer.js";
const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
function fn(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert.ok(start >= 0, name);
  const next = source.slice(start + 1).search(/\n(?:async )?function /);
  return source.slice(start, next < 0 ? source.length : start + 1 + next).replaceAll("import.meta.env.VITE_PRESETS", "undefined");
}
const metadata = () => JSON.parse(JSON.stringify(publicScenario(remoteProofRegistry().getScenario("private_remote_proof"))));
const legacyMetadata = () => JSON.parse(JSON.stringify(publicScenario(defaultRegistry.getScenario("deadline"))));
const tick = () => new Promise(setImmediate);
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => {resolve = yes; reject = no;}); return {promise, resolve, reject}; }
function fixture(overrides = {}) {
  const nodes = new Map(), calls = {creates: 0, gets: 0, cancels: 0, stops: 0, plays: 0, renders: 0, debriefs: 0, highlights: []};
  function node() {
    return {innerHTML: "", textContent: "", open: false, hidden: false, value: "", children: [], classList: {add() {}, remove() {}, toggle() {}, contains: () => false}, setAttribute() {}, focus() {},
      querySelectorAll(selector) { return selector === "[data-contact-person]" ? [...this.innerHTML.matchAll(/data-contact-person="([^"]+)"/g)].map((m) => ({dataset: {contactPerson: m[1]}})) : []; },
      querySelector(selector) { return selector === "strong" ? {textContent: ""} : selector === "[data-contact-retry]" && this.innerHTML.includes("data-contact-retry") ? {} : null; },
    };
  }
  const $ = (id) => { if (!nodes.has(id)) nodes.set(id, node()); return nodes.get(id); };
  const promptLabel = {innerHTML: ""};
  const queryPrompt = $("#talk-prompt").querySelector;
  $("#talk-prompt").querySelector = (selector) => selector === "span" ? promptLabel : queryPrompt.call($("#talk-prompt"), selector);
  const state = {entry: "office", scenario: "deadline", dialogue: null, textMode: false, text: null, paused: false, near: null, sessionId: null, threads: null, sharedGoals: [], sharedHint: "", startingSession: false, muted: false, appliedSettings: null};
  const people = Object.fromEntries(["maya", "jordan", "sam"].map((id) => [id, {name: id, role: "Colleague", color: "sage", initials: id[0]}]));
  const context = {state, people, $, parseScenarioMetadata, captureRun, ending: createEndCoordinator(), DEFAULT_SLIDERS: {},
    office: {reset() {}, highlight(id) {calls.highlights.push(id);}}, document: {hidden: false, body: {classList: {contains: () => false}}, querySelector: $, querySelectorAll: () => []},
    window: {}, icon: () => "", refreshIcons() {}, updatePublicGuidance() {}, updateScenario() {}, chime() {}, toast() {},
    cancelVoice() {calls.cancels++;}, stopSpeech() {calls.stops++;}, renderDialogue() {},
    renderTextDialogue() {calls.renders++;}, playSpeech() {calls.plays++;}, openDebrief() {calls.debriefs++;},
    closeModal() {state.paused = false;}, openSettings() {},
    getScenario: async () => {calls.gets++; return metadata();},
    createSession: async () => {calls.creates++; return {session_id: "bound", scenario: metadata(), public_state: {goals: [], next_hint: ""}};},
    sendTurn: async () => ({npc_reply: "A guarded response.", public_state: {mood_label: "Calm", goals: []}}),
    ...overrides,
  };
  const names = ["currentPeople", "personFor", "remoteContact", "physicalActorId", "renderPeople", "syncPeople", "loadScenarioMetadata", "freshThread", "threadsFor", "openConversation", "openTextConversation", "closeConversation", "startTextSession", "startRetrySession", "sendTextTurn", "resetTextRun", "officeHooks", "escapeHtml"];
  runInNewContext(names.map(fn).join("\n"), context);
  return {context, state, nodes, calls, $, async ready() {await context.loadScenarioMetadata();}};
}

test("public metadata preflight does no session work, parses the phone union, and fails closed with retry", async () => {
  const waiting = deferred(), f = fixture({getScenario: () => waiting.promise});
  const load = f.context.loadScenarioMetadata();
  assert.equal(f.state.metadataStatus, "loading"); assert.equal(f.context.remoteContact(), undefined);
  assert.equal(f.calls.creates, 0); assert.equal(f.calls.cancels, 0); assert.equal(f.calls.plays, 0);
  waiting.resolve(metadata()); await load;
  assert.equal(f.context.remoteContact().id, "client"); assert.equal(Object.hasOwn(f.context.remoteContact(), "sceneAnchor"), false);
  assert.deepEqual(Object.keys(f.context.threadsFor()), ["proof_observer", "proof_dispatcher", "proof_qa", "client"]);
  const invalid = metadata(); invalid.npcs[3].sceneAnchor = "maya";
  assert.throws(() => parseScenarioMetadata(invalid));
  f.context.getScenario = async () => invalid; await f.context.loadScenarioMetadata();
  assert.equal(f.state.scenarioMetadata, null); assert.equal(f.state.metadataStatus, "error");
  assert.match(f.$(".people-list").innerHTML, /Retry contact details/); assert.equal(f.context.remoteContact(), undefined);
  assert.equal(f.context.physicalActorId("maya"), "maya");
  f.context.getScenario = async () => metadata(); await f.context.loadScenarioMetadata(); assert.equal(f.state.metadataStatus, "ready");
});

test("late metadata cannot replace a bound session, reset run or selected scenario", async () => {
  for (const transition of ["session", "reset", "scenario", "menu"]) {
    const wait = deferred(), f = fixture({getScenario: () => wait.promise});
    const pending = f.context.loadScenarioMetadata();
    if (transition === "session") {f.state.sessionId = "new"; f.state.scenarioMetadata = parseScenarioMetadata(legacyMetadata());}
    if (transition === "reset") {f.state.metadataGeneration++; f.state.threads = {};}
    if (transition === "scenario") f.state.scenario = "email";
    if (transition === "menu") f.state.entry = "selection";
    wait.resolve(metadata()); await pending;
    assert.equal(f.context.remoteContact()?.id, undefined, transition);
    if (transition === "session") assert.equal(f.state.scenarioMetadata.id, "missed_deadline");
  }
});

test("E and People open the same ordinary thread, while phone calls ignore physical proximity changes", async () => {
  const f = fixture(); await f.ready(); f.state.sessionId = "bound"; f.context.threadsFor();
  f.context.officeHooks().onNear("@phone");
  assert.equal(f.$("#talk-prompt").querySelector("span").innerHTML, "Call <strong>Rohan Mehta</strong>");
  f.context.officeHooks().onNear("maya");
  assert.equal(f.$("#talk-prompt").querySelector("span").innerHTML, "Talk to <strong>Fixture</strong>");
  f.state.near = "@phone"; f.context.openConversation();
  assert.equal(f.state.dialogue, "client"); const thread = f.state.text;
  f.context.officeHooks().onNear("maya"); assert.equal(f.state.dialogue, "client");
  f.context.officeHooks().onTalk(); assert.equal(f.state.dialogue, "proof_observer");
  f.context.officeHooks().onNear(null); assert.equal(f.state.dialogue, null);
  const box = f.$("#people-test");
  let buttons;
  const original = box.querySelectorAll;
  box.querySelectorAll = function (selector) {buttons = original.call(this, selector); return buttons;};
  f.context.renderPeople(box);
  buttons.find((button) => button.dataset.contactPerson === "client").onclick();
  assert.equal(f.state.dialogue, "client"); assert.equal(f.state.text, thread); assert.deepEqual(f.calls.highlights, []);
  for (const blocked of ["hidden", "paused", "entry", "confirmation"]) {
    f.context.closeConversation(); f.state.near = "@phone";
    if (blocked === "hidden") f.context.document.hidden = true;
    if (blocked === "paused") f.state.paused = true;
    if (blocked === "entry") f.state.entry = "selection";
    if (blocked === "confirmation") f.$("#end-practice-dialog").open = true;
    f.context.openConversation(); assert.equal(f.state.dialogue, null, blocked);
    f.context.document.hidden = false; f.state.paused = false; f.state.entry = "office"; f.$("#end-practice-dialog").open = false;
  }
});

test("hangup cancels capture/playback and keeps a delayed reply without reopening or autoplay", async () => {
  for (const ended of [false, true]) {
    const wait = deferred(), f = fixture({sendTurn: () => wait.promise}); await f.ready(); f.state.sessionId = "bound"; f.state.near = "@phone"; f.context.openConversation();
    const thread = f.state.text, pending = f.context.sendTextTurn("Hello", "once", false);
    f.context.closeConversation(); const renders = f.calls.renders;
    assert.ok(f.calls.cancels); assert.ok(f.calls.stops);
    wait.resolve({npc_reply: "A guarded delayed response.", ended, public_state: {ended, mood_label: "Calm"}, speech: {available: true, mode: "server", turn_id: "2"}}); await pending;
    assert.equal(thread.transcript.length, 2); assert.equal(f.state.dialogue, null);
    assert.equal(f.calls.renders, renders); assert.equal(f.calls.plays, 0); assert.equal(f.calls.debriefs, 0);
    if (!ended) {f.context.openConversation(); assert.equal(f.state.text, thread);}
  }
});

test("late create/turn callbacks are discarded after reset and invalid session metadata shows recoverable error", async () => {
  const create = deferred(), f = fixture({createSession: () => create.promise}); await f.ready();
  f.state.near = "@phone"; f.context.openConversation(); f.context.startTextSession();
  const old = f.state.text; f.context.getScenario = async () => legacyMetadata(); f.context.resetTextRun();
  create.resolve({session_id: "stale", scenario: metadata(), public_state: {}}); await tick();
  assert.equal(f.state.sessionId, null); assert.equal(f.state.dialogue, null);
  const broken = fixture({createSession: async () => ({session_id: "bad", scenario: {...metadata(), npcs: []}})}); await broken.ready();
  broken.state.near = "@phone"; broken.context.openConversation(); broken.context.startTextSession(); await tick();
  assert.equal(broken.state.sessionId, null); assert.equal(broken.state.startingSession, false); assert.ok(broken.state.text.loadError);
  broken.context.startRetrySession({}, "client"); await tick();
  assert.equal(broken.state.sessionId, null); assert.equal(broken.state.startingSession, false); assert.ok(broken.state.text.loadError);
  assert.equal(old.transcript.length, 0);
  const mismatched = fixture({createSession: async () => ({session_id: "new", scenario: legacyMetadata(), public_state: {}})}); await mismatched.ready();
  mismatched.state.near = "@phone"; mismatched.context.openConversation(); mismatched.context.startTextSession(); await tick();
  assert.equal(mismatched.state.sessionId, "new"); assert.equal(mismatched.state.dialogue, null); assert.equal(mismatched.context.remoteContact(), undefined);
  const delayed = deferred(), changed = fixture({sendTurn: () => delayed.promise}); await changed.ready(); changed.state.sessionId = "old"; changed.state.near = "@phone"; changed.context.openConversation();
  const abandoned = changed.state.text, turn = changed.context.sendTextTurn("old", "old", false);
  changed.state.sessionId = "new"; changed.state.threads = {}; changed.state.dialogue = null; changed.state.text = null;
  delayed.resolve({npc_reply: "obsolete", ended: true}); await turn;
  assert.equal(abandoned.transcript.length, 1); assert.equal(changed.calls.debriefs, 0); assert.equal(changed.calls.plays, 0);
});

test("first phone conversation uses the existing settings Start boundary without requesting microphone work", async () => {
  const f = fixture(); await f.ready();
  Object.assign(f.context, {PRESETS: {}, presetsEnabled: () => false, settingsPreview: () => "Shared settings", presetName: () => "Custom", presetSettings: () => null,
    showModal() {f.context.closeConversation(); f.state.paused = true;}});
  runInNewContext(fn("openSettings"), f.context);
  f.state.near = "@phone"; f.context.openConversation(); await tick();
  assert.equal(f.calls.creates, 0); assert.equal(f.state.sessionId, null); assert.equal(f.state.paused, true);
  assert.equal(typeof f.$("#setup-start").onclick, "function");
  f.$("#setup-start").onclick(); await tick();
  assert.equal(f.calls.creates, 1); assert.equal(f.state.sessionId, "bound"); assert.equal(f.state.dialogue, "client");
});

test("returning from a completed scripted scenario loads public contacts without starting a session", async () => {
  const f = fixture(); f.state.scenario = "call"; f.state.complete = {}; f.state.score = 0;
  Object.assign(f.context, {scenarios: {deadline: {short: "Deadline"}, email: {short: "Email"}, call: {short: "Call"}}, persistProgress() {}, updateProgress() {}, showModal() {}});
  runInNewContext(fn("completeScenario"), f.context); f.context.completeScenario();
  f.$("#try-next").onclick(); await tick();
  assert.equal(f.state.scenario, "deadline"); assert.equal(f.context.remoteContact().id, "client"); assert.equal(f.calls.creates, 0);
});

test("contact UI escapes long public names and uses the existing named hangup control", async () => {
  const data = metadata(); data.npcs[3].name = '<img src=x onerror="bad()">'.repeat(4); data.npcs[3].role = "<script>bad()</script>";
  const f = fixture({getScenario: async () => data}); await f.ready();
  assert.equal(f.$(".people-list").innerHTML.includes("<img"), false); assert.match(f.$(".people-list").innerHTML, /&lt;img/);
  f.state.sessionId = "bound"; f.state.near = "@phone"; f.context.openConversation();
  Object.assign(f.context, {voiceStatus: null, voiceController: null, voiceBuildEnabled: false, currentGuidance: () => ({}), completeTextSession() {}, paintTextDebug() {}, initialiseVoice() {}});
  runInNewContext(fn("renderTextDialogue"), f.context); f.context.renderTextDialogue();
  const html = f.$("#dialogue-layer").innerHTML;
  assert.match(html, /aria-label="Hang up call"/); assert.equal(html.includes("<script>"), false); assert.equal(html.includes("<img"), false);
});

test("loopback fixture UI consumes only existing public scenario and ordinary session/turn APIs", async () => {
  const app = await startRemoteUiServer();
  try {
    const request = async (path, body) => {const response = await fetch(app.base + path, body ? {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)} : {}); assert.equal(response.status, 200); return response.json();};
    let creates = 0;
    const diagnostics = {};
    const f = fixture({getScenario: async () => {
      try {const data = await request("/scenarios/deadline"); diagnostics.publicShape = {id: data.id, actors: data.npcs, goals: data.goals}; return data;}
      catch (error) {diagnostics.requestError = error.stack; throw error;}
    }, parseScenarioMetadata(data) {
      try {return parseScenarioMetadata(data);} catch (error) {diagnostics.parseError = error.stack; throw error;}
    }, createSession: () => {creates++; return request("/sessions", {scenario_id: "deadline"});}, sendTurn: (id, npc_id, text, idempotencyKey) => request(`/sessions/${encodeURIComponent(id)}/turn`, {npc_id, text, idempotencyKey})});
    const syncPeople = f.context.syncPeople;
    f.context.syncPeople = () => {try {return syncPeople();} catch (error) {diagnostics.renderError = error.stack; throw error;}};
    await f.ready();
    assert.equal(f.state.metadataStatus, "ready", JSON.stringify(diagnostics));
    assert.equal(creates, 0); assert.equal(f.context.remoteContact()?.id, "client", JSON.stringify(diagnostics));
    f.state.near = "@phone"; f.context.openConversation(); assert.equal(creates, 0);
    f.context.startTextSession(); await tick();
    for (let i = 0; i < 50 && !f.state.sessionId; i++) await new Promise((resolve) => setTimeout(resolve, 5));
    assert.ok(f.state.sessionId); assert.equal(creates, 1);
    await f.context.sendTextTurn("Hello", "ordinary-remote-turn", false);
    assert.equal(f.state.text.transcript.length, 2); assert.equal(f.state.dialogue, "client");
  } finally {await app.close();}
});
