import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechPlayback } from "../../src/speech.js";

test("playback ignores a stale fetch and stops the previous request", async () => {
  let resolve, aborted = false, starts = 0;
  const playback = createSpeechPlayback({ fetchAudio: (_session, _turn, { signal }) => new Promise((done) => { resolve = done; signal.addEventListener("abort", () => { aborted = true; }); }), windowRef: { AudioContext: class { async resume() {} async decodeAudioData() { return {}; } createBufferSource() { return { connect() {}, start() { starts++; }, stop() {}, onended: null }; } }, speechSynthesis: { cancel() {} } } });
  const pending = playback.play({ sessionId: "s", speech: { available: true, turn_id: "2", mode: "server" }, text: "caption", current: () => true, muted: false, explicit: true });
  playback.stop(); resolve?.({ audio: new ArrayBuffer(4) }); await pending;
  assert.equal(aborted, true); assert.equal(starts, 0);
});

test("browser fallback uses the caption only after an explicit interaction", async () => {
  let said = 0;
  const win = { speechSynthesis: { speak(utterance) { said++; assert.equal(utterance.text, "caption"); }, cancel() {}, getVoices() { return [{ localService: true, lang: "en-US" }]; } }, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } };
  const playback = createSpeechPlayback({ windowRef: win });
  await playback.play({ speech: { available: true, turn_id: "2", mode: "browser" }, text: "caption", current: () => true, muted: false });
  assert.equal(said, 0);
  await playback.play({ speech: { available: true, turn_id: "2", mode: "browser" }, text: "caption", current: () => true, muted: false, explicit: true });
  assert.equal(said, 1);
});

test("Prathamesh plays at 1.1x while other NPCs stay at 1x in browser and local playback", async () => {
  const utterances = [], sources = [];
  const win = {
    speechSynthesis: { getVoices: () => [{ localService: true, lang: "en" }], speak: (utterance) => utterances.push(utterance), cancel() {} },
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    AudioContext: class { async resume() {} async decodeAudioData() { return {}; } createBufferSource() { const source = { playbackRate: { value: 1 }, connect() {}, disconnect() {}, stop() {}, start() {} }; sources.push(source); return source; } },
  };
  const playback = createSpeechPlayback({ windowRef: win, fetchAudio: async () => ({ audio: new ArrayBuffer(4) }) });
  const line = { sessionId: "s", text: "caption", current: () => true, muted: false, explicit: true };
  await playback.play({ ...line, speech: { available: true, turn_id: "1", mode: "browser" }, npcId: "sam" });
  await playback.play({ ...line, speech: { available: true, turn_id: "2", mode: "browser" }, npcId: "maya" });
  await playback.play({ ...line, speech: { available: true, turn_id: "3", mode: "server" }, npcId: "sam" });
  await playback.play({ ...line, speech: { available: true, turn_id: "4", mode: "server" }, npcId: "maya" });
  assert.deepEqual(utterances.map((utterance) => utterance.rate), [1.1, 1]);
  assert.deepEqual(sources.map((source) => source.playbackRate.value), [1.1, 1]);
});

test("a stopped playback cannot start after decode", async () => {
  let resolveDecode, played = 0;
  const win = { AudioContext: class { async resume() {} decodeAudioData() { return new Promise((resolve) => { resolveDecode = resolve; }); } createBufferSource() { return { connect() {}, start() { played++; }, stop() {} }; } }, speechSynthesis: { cancel() {} } };
  const playback = createSpeechPlayback({ windowRef: win, fetchAudio: async () => ({ audio: new ArrayBuffer(4) }) });
  const text = "caption stays visible";
  const pending = playback.play({ sessionId: "s", speech: { available: true, turn_id: "2", mode: "server" }, text, current: () => true, muted: false, explicit: true });
  await new Promise((resolve) => setImmediate(resolve));
  playback.stop(); resolveDecode({}); await pending;
  assert.equal(played, 0);
});

test("browser playback rejects remote and non-English voices", async () => {
  let said = 0;
  const win = { speechSynthesis: { speak() { said++; }, cancel() {}, getVoices() { return [{ localService: false, lang: "en-US" }, { localService: true, lang: "fr-FR" }]; } }, SpeechSynthesisUtterance: class {} };
  const playback = createSpeechPlayback({ windowRef: win });
  await playback.play({ speech: { available: true, turn_id: "2", mode: "browser" }, text: "caption", current: () => true, muted: false, explicit: true });
  assert.equal(said, 0);
});

test("old end callback cannot clear the next speaker", async () => {
  const states = []; let first;
  const win = { speechSynthesis: { speak(utterance) { if (!first) first = utterance; }, cancel() {}, getVoices() { return [{ localService: true, lang: "en-US" }]; } }, SpeechSynthesisUtterance: class {} };
  const playback = createSpeechPlayback({ windowRef: win, onSpeaking: (speaking, id) => states.push([speaking, id]) });
  await playback.play({ speech: { available: true, turn_id: "2", mode: "browser" }, text: "one", current: () => true, muted: false, explicit: true, npcId: "maya" });
  await playback.play({ speech: { available: true, turn_id: "4", mode: "browser" }, text: "two", current: () => true, muted: false, explicit: true, npcId: "sam" });
  first.onend();
  assert.deepEqual(states.at(-1), [true, "sam"]);
});

const serverLine = { sessionId: "s", speech: { available: true, turn_id: "2", mode: "server" }, text: "caption", current: () => true, muted: false, explicit: true, npcId: "maya" };

test("explicit replay resumes during activation before its delayed fetch", async () => {
  let activated = true, resolve, resumes = 0, starts = 0;
  const playback = createSpeechPlayback({ fetchAudio: () => new Promise((done) => { resolve = done; }), windowRef: { AudioContext: class {
    resume() { assert.equal(activated, true); resumes++; return Promise.resolve(); }
    async decodeAudioData() { return {}; }
    createBufferSource() { return { playbackRate: { value: 1 }, connect() {}, disconnect() {}, stop() {}, start() { starts++; } }; }
  } } });
  const pending = playback.play(serverLine);
  assert.equal(resumes, 1); activated = false;
  resolve({ audio: new ArrayBuffer(4) }); await pending;
  assert.equal(starts, 1); playback.stop();
});

for (const kind of ["browser", "source"]) test(`throwing ${kind} clears its highlight and resources`, async () => {
  const states = []; let released = 0, unavailable = 0;
  const win = kind === "browser" ? {
    SpeechSynthesisUtterance: class {}, speechSynthesis: { getVoices: () => [{ localService: true, lang: "en" }], speak() { throw Error("failed"); }, cancel() { released++; } },
  } : { AudioContext: class {
    async resume() {} async decodeAudioData() { return {}; }
    createBufferSource() { return { playbackRate: { value: 1 }, connect() {}, disconnect() { released++; }, stop() {}, start() { throw Error("failed"); } }; }
  } };
  const playback = createSpeechPlayback({ windowRef: win, fetchAudio: async () => ({ audio: new ArrayBuffer(4) }), onSpeaking: (value, id) => states.push([value, id]), onUnavailable: () => unavailable++ });
  await playback.play({ ...serverLine, speech: { ...serverLine.speech, mode: kind === "browser" ? "browser" : "server" } });
  assert.deepEqual(states, [[true, "maya"], [false, "maya"]]); assert.equal(unavailable, 1); assert.equal(released, 1);
  playback.stop(); assert.equal(states.length, 2);
});

test("server fallback obeys the interaction gate and speaks the displayed caption", async () => {
  const spoken = [];
  const win = { speechSynthesis: { getVoices: () => [{ localService: true, lang: "en" }], speak: (u) => spoken.push(u.text), cancel() {} }, SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } } };
  const playback = createSpeechPlayback({ windowRef: win, fetchAudio: async () => ({ speech: { mode: "browser" } }) });
  await playback.play({ ...serverLine, explicit: false }); assert.deepEqual(spoken, []);
  await playback.play({ ...serverLine, explicit: false, unlocked: true }); assert.deepEqual(spoken, [serverLine.text]);
  playback.stop();
});

test("unlock rejection is handled while fetch is pending and never starts audio", async () => {
  let finish, starts = 0;
  const playback = createSpeechPlayback({ fetchAudio: () => new Promise((resolve) => { finish = resolve; }), windowRef: { AudioContext: class { resume() { return Promise.reject(Error("denied")); } createBufferSource() { starts++; } } } });
  const pending = playback.play(serverLine); await new Promise(setImmediate);
  finish({ audio: new ArrayBuffer(4) }); await pending; assert.equal(starts, 0);
});

test("a stale fetch failure cannot clear a newer browser speaker", async () => {
  let reject; const states = []; let unavailable = 0;
  const playback = createSpeechPlayback({ fetchAudio: () => new Promise((_, fail) => { reject = fail; }),
    windowRef: { SpeechSynthesisUtterance: class {}, speechSynthesis: { getVoices: () => [{ localService: true, lang: "en" }], speak() {}, cancel() {} } },
    onSpeaking: (value, id) => states.push([value, id]), onUnavailable: () => unavailable++ });
  const old = playback.play(serverLine);
  await playback.play({ ...serverLine, npcId: "sam", speech: { ...serverLine.speech, mode: "browser" } });
  reject(Error("late failure")); await old;
  assert.deepEqual(states.at(-1), [true, "sam"]); assert.equal(unavailable, 0); playback.stop();
});
