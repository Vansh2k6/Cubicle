import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createSpeechPlayback } from "../../src/speech.js";
import { createVoiceController } from "../../src/voice.js";
import { renderDebrief, pollDebrief, recoverFeedbackRetry } from "../../src/debrief.js";
import { captureRun } from "../../src/endCoordinator.js";
const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const part = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const script = part("function markListen(", "function unlockSpeech()") + part("function unlockSpeech()", "function cancelVoice()") + part("function rerenderVoiceSafely()", "const scenarios =") + part("function openDebrief(", "function completeScenario()") + part("function closeModal()", "function showGuide()") + part('$("#sound").onclick = () => {', '$("#sound").innerHTML = icon(state.muted ? "volume-x" : "volume-2");\n$("#sound").setAttribute');
const moment = { moment_id: "0-0", general: true, better_reply: "What should I clarify?" };
const result = { status: "partial", total_status: "provisional", deterministic: { points: 15, cap: 75 }, judged: { dimensions: [] }, moments: [moment], what_went_well: [], breakdown: [], priorities: [], timeline: [], missed_facts: [], weights: {}, settings: {} };
function fixture({ enabled = false, muted = true, flag = true } = {}) {
  const nodes = {}, spoken = []; let finish, fetches = 0, resumes = 0;
  class Node {
    constructor() { this.classList = { add() {} }; this.listeners = []; this.html = ""; }
    set innerHTML(html) {
      this.html = html;
      if (this === nodes["#modal-root"] && !html) delete nodes["#debrief-content"];
      for (const match of html.matchAll(/id="([^" ]+)"/g)) nodes["#" + match[1]] = new Node();
      this.listeners = [...html.matchAll(/data-listen="([^"]+)"([^>]*)/g)].map((match) => ({ dataset: { listen: match[1] }, disabled: match[2].includes("disabled"), setAttribute() {} }));
    }
    get innerHTML() { return this.html; }
    contains() { return false; } focus() {} remove() {} setAttribute() {} append() {} prepend() {}
    querySelector() { return null; } querySelectorAll() { return this.listeners; }
  }
  for (const id of ["#modal-root", ".modal", ".modal-close", "#game-viewport", "#sound"]) nodes[id] = new Node();
  const context = {
    state: { entry: "office", sessionId: "s", scenario: "deadline", threads: {}, textMode: false, muted, attempts: [] }, voiceBuildEnabled: flag, activeSpeechNpc: null, voiceViewRefresh: null, activeListenMoment: null,
    voiceStatus: { enabled: true, stt: true },
    speechPlayback: createSpeechPlayback({ onSpeaking: (speaking, id) => { if (id === "alex_coach") context.markListen(speaking); }, fetchAudio: () => { fetches++; return new Promise((resolve) => { finish = resolve; }); }, windowRef: { AudioContext: class { async resume() { resumes++; } async decodeAudioData() { return {}; } createBufferSource() { return { connect() {}, disconnect() {}, stop() {}, start() { spoken.push(moment.better_reply); } }; } } } }),
    $: (id) => nodes[id] || null, document: { activeElement: null, createElement: () => new Node(), getElementById: (id) => nodes["#" + id], querySelectorAll: () => nodes["#debrief-content"]?.listeners || [] }, window: { localStorage: { setItem() {} } },
    captureRun, renderDebrief, pollDebrief, recoverFeedbackRetry, getDebrief: async () => ({ status: "partial", debrief: result, retry_allowed: true }),
    showModal() { nodes["#debrief-content"] = new Node(); }, summaryFromDebrief: () => ({}), upsertAttempt: () => ({ attempts: [] }), persistProgress() {}, DEFAULT_SLIDERS: {},
    icon: () => "", refreshIcons() {}, chime() {}, toast() {}, office: { setSpeaking() {} }, initialiseVoice() {}, restartTextRun() {},
  };
  context.voiceController = createVoiceController({ storage: { getItem: () => String(enabled), setItem() {} }, windowRef: {}, onVoiceChange: () => context.rerenderVoiceSafely() });
  runInNewContext(script, context);
  return { context, nodes, spoken, fetches: () => fetches, resumes: () => resumes, finish: () => finish({ audio: new ArrayBuffer(4) }) };
}

test("production debrief can enable Voice and sounds then Listen; modal mute and close cancel queued audio", async () => {
  const f = fixture(); f.context.openDebrief("s"); await new Promise(setImmediate);
  assert.equal(f.nodes["#debrief-content"].listeners[0].disabled, true); assert.equal(f.resumes(), 0);
  f.nodes["#debrief-voice"].onclick(); assert.equal(f.context.voiceController.isEnabled(), true);
  f.nodes["#debrief-sound"].onclick(); assert.equal(f.context.state.muted, false);
  const listen = () => f.nodes["#debrief-content"].listeners[0].onclick();
  listen(); assert.equal(f.fetches(), 1); assert.ok(f.resumes() > 0);
  f.nodes["#debrief-sound"].onclick(); f.finish(); await new Promise(setImmediate); assert.deepEqual(f.spoken, []);
  assert.equal(f.nodes["#debrief-content"].listeners[0].disabled, true);
  f.nodes["#debrief-sound"].onclick(); listen(); f.finish(); await new Promise(setImmediate); assert.equal(f.nodes["#debrief-content"].listeners[0].textContent, "Listen · playing");
  f.context.stopSpeech(); f.spoken.length = 0; listen(); f.context.closeModal(); f.finish(); await new Promise(setImmediate); assert.deepEqual(f.spoken, []);
});

test("Listen uses ended-modal eligibility and stale modal/current run rejects late fetch", async () => {
  const f = fixture({ enabled: true, muted: false });
  f.context.openDebrief("s"); await new Promise(setImmediate);
  assert.equal(f.context.state.textMode, false);
  f.nodes["#debrief-content"].listeners[0].onclick(); f.context.state.sessionId = "new"; f.finish(); await new Promise(setImmediate); assert.deepEqual(f.spoken, []);
  assert.equal(f.fetches(), 1);
});

test("voice-off debrief renderer remains byte-identical and modal adds no voice controls", async () => {
  assert.equal(renderDebrief({ status: "partial", debrief: result }), renderDebrief({ status: "partial", debrief: result }, { listenEnabled: false }));
  const f = fixture({ flag: false }); f.context.openDebrief("s"); await new Promise(setImmediate);
  assert.equal(f.nodes["#debrief-voice"], undefined); assert.equal(f.nodes["#debrief-content"].listeners.length, 0); assert.equal(f.fetches(), 0);
});


test("debrief feedback retry blocks old Listen handlers before its POST settles", async () => {
  const f = fixture({ enabled: true, muted: false });
  let finishRetry; f.context.retryDebrief = () => new Promise((resolve) => { finishRetry = resolve; });
  f.context.openDebrief("s"); await new Promise(setImmediate);
  const oldListen = f.nodes["#debrief-content"].listeners[0].onclick;
  const pending = f.nodes["#feedback-retry"].onclick();
  oldListen(); assert.equal(f.fetches(), 0); assert.equal(f.nodes["#debrief-content"].listeners.length, 0);
  finishRetry(); await pending;
});
