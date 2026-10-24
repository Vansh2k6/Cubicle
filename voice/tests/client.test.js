import test from "node:test";
import assert from "node:assert/strict";
import { chooseRecordingMime, createVoiceController, voiceErrorMessage } from "../../src/voice.js";

class Target {
  constructor() { this.listeners = new Map(); this.classList = { toggle() {} }; this.attrs = {}; this.textContent = ""; this.disabled = false; }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type, extra = {}) { const fn = this.listeners.get(type); if (fn) fn({ preventDefault() {}, target: this, key: "", code: "", ...extra }); }
  setAttribute(name, value) { this.attrs[name] = value; }
}
class Input extends Target {
  constructor(value = "") { super(); this.value = value; this.isConnected = true; }
  focus() {} setSelectionRange() {}
}
class Recorder {
  static isTypeSupported(mime) { return mime === "audio/webm;codecs=opus"; }
  constructor() { Recorder.last = this; this.state = "inactive"; }
  start() { this.state = "recording"; }
  stop() { if (this.state === "inactive") return; this.state = "inactive"; this.onstop(); }
}
function fixture({ transcript = "spoken draft", inputValue = "", navOverride, winOverride, clock } = {}) {
  const stream = { stopped: 0, getTracks: () => [{ stop() { stream.stopped += 1; } }] };
  const nav = navOverride || { mediaDevices: { getUserMedia: async () => stream } };
  const win = winOverride || new Target();
  if (!winOverride) { win.isSecureContext = true; win.MediaRecorder = Recorder; }
  const doc = new Target(); doc.visibilityState = "visible";
  const toggle = new Target(), mic = new Target(), status = new Target(), input = new Input(inputValue);
  let calls = 0;
  const controller = createVoiceController({ navigatorRef: nav, windowRef: win, documentRef: doc,
    storage: { getItem: () => "true", setItem() {} }, clock, transcribe: async () => { calls += 1; return { text: transcript }; } });
  const cleanup = controller.mount({ toggle, mic, status, input, sessionId: "opaque-id", current: () => true });
  return { controller, cleanup, toggle, mic, status, input, stream, calls: () => calls };
}

test("chooses only an explicitly supported recording MIME", () => {
  assert.equal(chooseRecordingMime(Recorder), "audio/webm;codecs=opus");
  assert.equal(chooseRecordingMime(null), "");
  assert.match(voiceErrorMessage("denied"), /denied/);
  for (const code of ["stt_unavailable", "voice_unavailable", "voice_timeout"]) assert.equal(voiceErrorMessage(code), "Speech service unavailable — type your reply or try again.");
});

test("recording creates an editable draft and never sends a turn", async () => {
  const f = fixture();
  f.mic.dispatch("pointerdown");
  await Promise.resolve();
  Recorder.last.ondataavailable({ data: new Blob(["audio"], { type: "audio/webm;codecs=opus" }) });
  f.mic.dispatch("pointerup");
  await Promise.resolve(); await Promise.resolve();
  assert.equal(f.input.value, "spoken draft");
  assert.equal(f.calls(), 1);
  assert.match(f.status.textContent, /Check/);
  assert.equal(f.stream.stopped, 1);
  f.cleanup();
});

test("an edited draft or hidden panel discards late transcription", async () => {
  let resolve;
  const f = fixture();
  f.controller.cancel();
  const delayed = createVoiceController({ navigatorRef: { mediaDevices: { getUserMedia: async () => f.stream } }, windowRef: Object.assign(new Target(), { isSecureContext: true, MediaRecorder: Recorder }), documentRef: new Target(), storage: { getItem: () => "true", setItem() {} }, transcribe: () => new Promise((r) => { resolve = r; }) });
  const cleanup = delayed.mount({ toggle: new Target(), mic: f.mic, status: f.status, input: f.input, sessionId: "opaque-id", current: () => true });
  f.mic.dispatch("pointerdown"); await Promise.resolve();
  Recorder.last.ondataavailable({ data: new Blob(["audio"]) }); f.input.value = "typed edit"; f.input.dispatch("input"); f.mic.dispatch("pointerup");
  resolve({ text: "late transcript" }); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.input.value, "typed edit");
  cleanup();
});

test("releasing while permission is pending cancels the eventual stream", async () => {
  let resolve; let stopped = 0;
  const stream = { getTracks: () => [{ stop() { stopped += 1; } }] };
  const media = { mediaDevices: { getUserMedia: () => new Promise((r) => { resolve = r; }) } };
  const win = Object.assign(new Target(), { isSecureContext: true, MediaRecorder: Recorder });
  const f = fixture(); f.cleanup();
  const controller = createVoiceController({ navigatorRef: media, windowRef: win, documentRef: new Target(), storage: { getItem: () => "true", setItem() {} }, transcribe: async () => ({ text: "x" }) });
  const cleanup = controller.mount({ toggle: new Target(), mic: f.mic, status: f.status, input: f.input, sessionId: "opaque-id", current: () => true });
  f.mic.dispatch("pointerdown"); f.mic.dispatch("pointerup"); resolve(stream); await Promise.resolve();
  assert.equal(stopped, 1);
  cleanup();
});

test("pointer cancellation discards captured audio and a second start cannot overlap", async () => {
  const f = fixture();
  f.mic.dispatch("pointerdown"); f.mic.dispatch("pointerdown");
  await Promise.resolve();
  Recorder.last.ondataavailable({ data: new Blob(["audio"]) });
  f.mic.dispatch("pointercancel");
  await Promise.resolve();
  assert.equal(f.calls(), 0);
  assert.equal(f.stream.stopped, 1);
  f.cleanup();
});

test("insecure, unsupported and denied microphones leave typing usable without upload", async () => {
  const insecure = fixture({ winOverride: Object.assign(new Target(), { isSecureContext: false }) });
  insecure.mic.dispatch("pointerdown"); await Promise.resolve();
  assert.match(insecure.status.textContent, /secure connection/); assert.equal(insecure.calls(), 0); assert.equal(insecure.input.value, ""); insecure.cleanup();
  const unsupported = fixture({ winOverride: Object.assign(new Target(), { isSecureContext: true, MediaRecorder: null }) });
  unsupported.mic.dispatch("pointerdown"); await Promise.resolve();
  assert.match(unsupported.status.textContent, /unavailable/); assert.equal(unsupported.calls(), 0); unsupported.cleanup();
  const denied = fixture({ navOverride: { mediaDevices: { getUserMedia: async () => { const error = new Error(); error.name = "NotAllowedError"; throw error; } } } });
  denied.mic.dispatch("pointerdown"); await Promise.resolve(); await Promise.resolve();
  assert.match(denied.status.textContent, /denied/); assert.equal(denied.calls(), 0); denied.cleanup();
});

test("30-second cap updates countdown and stops the recording", async () => {
  const scheduled = []; let now = 0;
  const clock = { now: () => now, setTimeout(fn) { scheduled.push(fn); return fn; }, clearTimeout() {}, setInterval(fn) { scheduled.push(fn); return fn; }, clearInterval() {} };
  const f = fixture({ clock });
  f.mic.dispatch("pointerdown"); await Promise.resolve();
  now = 1000; scheduled[0](); assert.match(f.status.textContent, /29 seconds/);
  scheduled.at(-1)(); await Promise.resolve();
  assert.equal(Recorder.last.state, "inactive"); assert.equal(f.stream.stopped, 1); assert.equal(f.calls(), 0);
  f.cleanup();
});

test("oversized recording is discarded without upload", async () => {
  const f = fixture();
  f.mic.dispatch("pointerdown"); await Promise.resolve();
  Recorder.last.ondataavailable({ data: new Blob([new Uint8Array((2 * 1024 * 1024) + 1)]) });
  await Promise.resolve();
  assert.equal(f.calls(), 0); assert.equal(f.stream.stopped, 1); assert.match(f.status.textContent, /limit reached/);
  f.cleanup();
});

test("a cancelled old permission result cannot alter a newer pending recording", async () => {
  let rejectFirst, resolveSecond, call = 0, stopped = 0;
  const nav = { mediaDevices: { getUserMedia: () => (++call === 1
    ? new Promise((_, reject) => { rejectFirst = reject; })
    : new Promise((resolve) => { resolveSecond = resolve; })) } };
  const win = Object.assign(new Target(), { isSecureContext: true, MediaRecorder: Recorder });
  const controller = createVoiceController({ navigatorRef: nav, windowRef: win, documentRef: new Target(), storage: { getItem: () => "true", setItem() {} }, transcribe: async () => ({ text: "x" }) });
  const firstMic = new Target(); const first = controller.mount({ toggle: new Target(), mic: firstMic, status: new Target(), input: new Input(), sessionId: "id", current: () => true });
  firstMic.dispatch("pointerdown"); first();
  const secondMic = new Target(); const second = controller.mount({ toggle: new Target(), mic: secondMic, status: new Target(), input: new Input(), sessionId: "id", current: () => true });
  secondMic.dispatch("pointerdown"); rejectFirst(new Error("old request")); await Promise.resolve();
  secondMic.dispatch("pointerup"); resolveSecond({ getTracks: () => [{ stop() { stopped += 1; } }] }); await Promise.resolve();
  assert.equal(stopped, 1);
  second();
});

test("cancelling an upload before remount discards its late transcript", async () => {
  let resolve; const f = fixture();
  const controller = createVoiceController({ navigatorRef: { mediaDevices: { getUserMedia: async () => f.stream } }, windowRef: Object.assign(new Target(), { isSecureContext: true, MediaRecorder: Recorder }), documentRef: new Target(), storage: { getItem: () => "true", setItem() {} }, transcribe: () => new Promise((r) => { resolve = r; }) });
  const firstInput = new Input(); const firstMic = new Target(); const first = controller.mount({ toggle: new Target(), mic: firstMic, status: new Target(), input: firstInput, sessionId: "id", current: () => true });
  firstMic.dispatch("pointerdown"); await Promise.resolve(); Recorder.last.ondataavailable({ data: new Blob(["audio"]) }); firstMic.dispatch("pointerup"); await Promise.resolve();
  first();
  const nextInput = new Input("new draft"); const second = controller.mount({ toggle: new Target(), mic: new Target(), status: new Target(), input: nextInput, sessionId: "new-id", current: () => true });
  resolve({ text: "late transcript" }); await Promise.resolve(); await Promise.resolve();
  assert.equal(nextInput.value, "new draft");
  second();
});

async function loadApi() {
  globalThis.window = { __CUBICLE_API: "http://voice.test" };
  return import(`../../src/api.js?voice-client-test=${Math.random()}`);
}

test("audio helper posts a raw blob to an encoded session path and rejects oversized text", async () => {
  const previousFetch = globalThis.fetch;
  try {
    let request;
    globalThis.fetch = async (url, options) => { request = { url, options }; return new Response(JSON.stringify({ text: "confirmed", duration_ms: 10, provider: "local" })); };
    const { transcribeAudio } = await loadApi();
    const audio = new Blob(["raw audio"], { type: "audio/wav" });
    assert.deepEqual(await transcribeAudio("a#b", audio), { text: "confirmed", duration_ms: 10, provider: "local" });
    assert.equal(request.url, "http://voice.test/sessions/a%23b/voice/stt");
    assert.equal(request.options.body, audio); assert.equal(request.options.headers["content-type"], "audio/wav");
    globalThis.fetch = async () => new Response(JSON.stringify({ text: "x".repeat(501) }));
    await assert.rejects(() => transcribeAudio("id", audio), { code: "voice_too_long" });
  } finally { globalThis.fetch = previousFetch; }
});

test("audio helper distinguishes pre/caller abort, timeout, and public STT errors", async () => {
  const previousFetch = globalThis.fetch;
  try {
    const { transcribeAudio } = await loadApi();
    const audio = new Blob(["raw"], { type: "audio/wav" });
    const pre = new AbortController(); pre.abort();
    let invoked = false; globalThis.fetch = async () => { invoked = true; return new Response(); };
    await assert.rejects(() => transcribeAudio("id", audio, { signal: pre.signal }), { code: "voice_cancelled" }); assert.equal(invoked, false);
    globalThis.fetch = (_, options) => new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new DOMException("", "AbortError"))));
    const caller = new AbortController(); const pending = transcribeAudio("id", audio, { signal: caller.signal }); caller.abort();
    await assert.rejects(pending, { code: "voice_cancelled" });
    await assert.rejects(() => transcribeAudio("id", audio, { timeoutMs: 1 }), { code: "voice_timeout" });
    for (const [status, error, code] of [[422, "stt_empty", "stt_empty"], [413, "audio_too_large", "audio_too_large"], [503, "stt_unavailable", "stt_unavailable"]]) {
      globalThis.fetch = async () => new Response(JSON.stringify({ error }), { status });
      await assert.rejects(() => transcribeAudio("id", audio), { code });
    }
  } finally { globalThis.fetch = previousFetch; }
});

test("production mic start stops playback before requesting microphone permission", async () => {
  const order = []; let resolveAudio, starts = 0;
  const { createSpeechPlayback } = await import("../../src/speech.js");
  const playback = createSpeechPlayback({ fetchAudio: () => new Promise((resolve) => { resolveAudio = resolve; }), windowRef: { AudioContext: class { async resume() {} async decodeAudioData() { return {}; } createBufferSource() { return { connect() {}, start() { starts++; } }; } } } });
  const pending = playback.play({ sessionId: "s", speech: { available: true, turn_id: "2", mode: "server" }, current: () => true, explicit: true });
  const win = Object.assign(new Target(), { isSecureContext: true, MediaRecorder: Recorder });
  const voice = createVoiceController({ onMicStart() { order.push("stop"); playback.stop(); },
    navigatorRef: { mediaDevices: { async getUserMedia() { order.push("permission"); return { getTracks: () => [{ stop() {} }] }; } } },
    windowRef: win, documentRef: new Target(), storage: { getItem: () => "true" }, transcribe: async () => ({ text: "draft" }) });
  const mic = new Target(); const cleanup = voice.mount({ toggle: new Target(), mic, status: new Target(), input: new Input("kept draft"), sessionId: "s", current: () => true });
  mic.dispatch("pointerdown"); assert.deepEqual(order, ["stop", "permission"]);
  resolveAudio({ audio: new ArrayBuffer(4) }); await pending; assert.equal(starts, 0); cleanup();
});
