import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createSpeechPlayback } from "../../src/speech.js";
import { createEndCoordinator } from "../../src/endCoordinator.js";

const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8").replaceAll("\r\n", "\n");
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const functions = between("function stopSpeech()", "function cancelVoice()") +
  between("function closeConversation()", "function renderDialogue(") +
  between("function renderTextDialogue()", "async function sendTextTurn(") +
  between("async function completeTextSession()", "function openDebrief(");
const listeners = between('window.addEventListener("blur", stopSpeech);', "function openConversation()") +
  between('$("#sound").onclick = () => {', '$("#sound").innerHTML = icon(state.muted ? "volume-x" : "volume-2");\n$("#sound").setAttribute');
function fixture() {
  let finishAudio, finishEnd, started = 0, fetches = 0;
  const windowListeners = {}, documentListeners = {}, nodes = {};
  const node = () => ({ innerHTML: "", focus() {}, setAttribute() {}, classList: { toggle() {} } });
  for (const id of ["#dialogue-layer", "#game-viewport", "#talk-prompt", "#close-dialogue", "#sound"]) nodes[id] = node();
  const line = { sessionId: "s", speech: { available: true, turn_id: "2", mode: "server" }, who: "npc", name: "Maya", text: "Displayed caption" };
  const thread = { over: false, busy: false, transcript: [line] };
  const state = { sessionId: "s", scenario: "deadline", textMode: true, text: thread, dialogue: "maya", muted: false, complete: {} };
  const context = {
    state, speechPlayback: createSpeechPlayback({ fetchAudio: () => { fetches++; return new Promise((resolve) => { finishAudio = resolve; }); }, windowRef: { AudioContext: class {
      async resume() {} async decodeAudioData() { return {}; }
      createBufferSource() { return { connect() {}, disconnect() {}, stop() {}, start() { started++; } }; }
    } } }), activeSpeechNpc: null, voiceBuildEnabled: true,
    voiceController: { isEnabled: () => true, isAudioUnlocked: () => true }, voiceStatus: { enabled: true, stt: true },
    ending: createEndCoordinator(), office: { setSpeaking() {} }, cancelVoice() {},
    $: (id) => nodes[id] || null, people: { maya: { name: "Maya", color: "green", initials: "M", role: "Manager" } },
    currentGuidance: () => ({}), escapeHtml: String, icon: () => "", refreshIcons() {}, paintTextDebug() {}, initialiseVoice() {}, updatePublicGuidance() {},
    rerenderVoiceSafely() {}, chime() {}, toast() {}, threadsFor: () => ({ maya: thread }),
    endSession: () => new Promise((resolve) => { finishEnd = resolve; }),
    window: { addEventListener: (type, fn) => { windowListeners[type] = fn; }, localStorage: { setItem() {} } },
    document: { visibilityState: "visible", addEventListener: (type, fn) => { documentListeners[type] = fn; }, querySelectorAll: () => [], querySelector: () => null },
  };
  runInNewContext(functions + listeners, context);
  return { context, state, thread, line, nodes, windowListeners, documentListeners, finishAudio: () => finishAudio({ audio: new ArrayBuffer(4) }), finishEnd: () => finishEnd(null), started: () => started, fetches: () => fetches };
}

for (const action of ["close", "mute", "blur", "hidden"]) test(`main ${action} wiring cancels a queued replay`, async () => {
  const f = fixture();
  await f.context.playSpeech(f.line, f.thread, "maya", true);
  if (action === "close") f.context.closeConversation();
  if (action === "mute") f.nodes["#sound"].onclick();
  if (action === "blur") f.windowListeners.blur();
  if (action === "hidden") { f.context.document.visibilityState = "hidden"; f.documentListeners.visibilitychange(); }
  f.finishAudio(); await new Promise(setImmediate); assert.equal(f.started(), 0);
  if (action === "close" || action === "mute") {
    await f.context.playSpeech(f.line, f.thread, "maya", true);
    await new Promise(setImmediate); assert.equal(f.started(), 0); assert.equal(f.fetches(), 1);
  }
});

test("main delayed End stops queued speech, disables replay, and rejects replay until settled", async () => {
  const f = fixture();
  await f.context.playSpeech(f.line, f.thread, "maya", true);
  const pending = f.context.completeTextSession();
  assert.equal(f.context.ending.busy("s", "deadline"), true);
  assert.match(f.nodes["#dialogue-layer"].innerHTML, /data-replay="2"[^>]*disabled/);
  f.finishAudio(); await new Promise(setImmediate); assert.equal(f.started(), 0);
  await f.context.playSpeech(f.line, f.thread, "maya", true); await new Promise(setImmediate); assert.equal(f.started(), 0); assert.equal(f.fetches(), 1);
  f.finishEnd(); await pending;
  assert.equal(f.context.ending.busy("s", "deadline"), false);
});
