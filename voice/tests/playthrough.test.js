import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceController } from "../../src/voice.js";
import { runTranscription } from "../provider.js";
import { createSpeechService } from "../speech.js";
import { DEFAULTS } from "../config.js";
import { scenario, runBot, languageRuntime } from "../../evals/scriptedBot.mjs";
import { smart, trap } from "../../evals/scriptedPaths.mjs";
import { scoreSession } from "../../scoring/score.js";
import { assembleDebrief } from "../../scoring/debrief.js";
import { endSession } from "../../engine/engine.js";
class Target {
  constructor() { this.handlers = {}; this.classList = { toggle() {} }; this.value = ""; this.isConnected = true; }
  addEventListener(type, fn) { this.handlers[type] = fn; } removeEventListener(type) { delete this.handlers[type]; }
  dispatch(type) { this.handlers[type]?.({ preventDefault() {}, target: this }); }
  setAttribute() {} focus() {} setSelectionRange() {}
}
class Recorder {
  static isTypeSupported() { return true; }
  constructor() { Recorder.last = this; this.state = "inactive"; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; this.onstop?.(); }
}
for (const [name, steps, expected] of [["smart", smart, 60], ["trap", trap, 7]]) test(`${name} fake voice confirmation matches typed score, outcomes and flags`, async () => {
  const typed = await runBot(steps);
  const confirmedSteps = [], rawDraft = "Unconfirmed STT draft; must never be evidence.";
  for (const [npc, confirmed, events] of steps) {
    const input = new Target(), mic = new Target();
    const controller = createVoiceController({ storage: { getItem: () => "true" },
      navigatorRef: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) } },
      windowRef: Object.assign(new Target(), { isSecureContext: true, MediaRecorder: Recorder }), documentRef: new Target(),
      transcribe: async (_id, blob) => runTranscription([{ name: "fake", transcribe: async () => ({ text: rawDraft, duration_ms: 1000 }) }], { audio: Buffer.from(await blob.arrayBuffer()), mime: blob.type }) });
    const cleanup = controller.mount({ toggle: new Target(), mic, status: new Target(), input, sessionId: "synthetic", current: () => true });
    mic.dispatch("pointerdown"); await Promise.resolve();
    Recorder.last.ondataavailable({ data: new Blob(["memory-only audio"]) }); mic.dispatch("pointerup");
    for (let n = 0; n < 20 && input.value !== rawDraft; n++) await new Promise(setImmediate);
    assert.equal(input.value, rawDraft);
    input.value = confirmed; input.dispatch("input");
    confirmedSteps.push([npc, input.value, events]); cleanup();
  }
  const voice = await runBot(confirmedSteps);
  const typedScore = scoreSession(typed, scenario), voiceScore = scoreSession(voice, scenario);
  assert.equal(voiceScore.deterministic, expected); assert.deepEqual(voiceScore.metrics, typedScore.metrics); assert.deepEqual(voiceScore.flags, typedScore.flags);
  assert.deepEqual(voice.session.user_known, typed.session.user_known); assert.deepEqual(voice.session.goals, typed.session.goals);
  const calls = [];
  const speech = createSpeechService({ config: { ...DEFAULTS, enabled: true }, providers: [{ synthesize: async ({ text }) => { calls.push(text); return { audio: Buffer.from("RIFF"), mime: "audio/wav" }; } }] });
  // Playback receives only committed pipeline rows; no raw draft enters speech or scoring.
  const cacheSession = { id: "synthetic", ended: false };
  for (const turn of voice.convo.turns.filter((t) => t.speaker === "npc")) { speech.prefetch(cacheSession, turn); await speech.audio(cacheSession, String(turn.id)); }
  assert.deepEqual(calls, voice.convo.turns.filter((t) => t.speaker === "npc").map((t) => t.text)); speech.clear(cacheSession.id);
  endSession(voice.session); const feedback = await assembleDebrief({ record: voice, scenario, runtime: languageRuntime });
  assert.ok(!JSON.stringify({ transcript: voice.convo, feedback }).includes(rawDraft));
});
