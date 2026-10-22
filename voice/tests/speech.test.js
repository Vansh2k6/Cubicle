import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechService } from "../speech.js";

const config = Object.freeze({ enabled: true, ttsChain: ["local", "browser"], ttsTimeoutMs: 30,
  voiceMap: { maya: "en_US-lessac-medium", jordan: "en_US-ryan-medium", sam: "en_US-amy-medium", alex_coach: "en_GB-alan-medium" } });
const session = { id: "opaque", ended: false };
const turn = { id: 2, speaker: "npc", npcId: "maya", text: "Committed reply" };

test("speech prefetch is bounded, id scoped, and falls back without text in logs", async () => {
  const logs = [];
  const service = createSpeechService({ config, log: (entry) => logs.push(entry), providers: [{ name: "local", async synthesize() { return { audio: Buffer.from("RIFF"), mime: "audio/wav", provider: "local" }; } }] });
  assert.deepEqual(service.prefetch(session, turn), { available: true, turn_id: "2", mode: "server" });
  const audio = await service.audio(session, "2");
  assert.equal(audio.mime, "audio/wav");
  assert.equal(logs[0].bytes, 4);
  assert.ok(!JSON.stringify(logs).includes(turn.text));
  service.clear(session.id);
  assert.equal(await service.audio(session, "2"), null);
});

test("failed synthesis is browser fallback and an ended session cannot serve late audio", async () => {
  const service = createSpeechService({ config, providers: [{ async synthesize() { throw new Error("down"); } }] });
  service.prefetch(session, turn);
  assert.deepEqual(await service.audio(session, "2"), { speech: { available: true, turn_id: "2", mode: "browser" } });
  session.ended = true;
  assert.equal(await service.audio(session, "2"), null);
  session.ended = false;
});

test("timeout falls back, local-only becomes none, and the LRU aborts evicted work", async () => {
  let aborted = 0;
  const stalled = { async synthesize({ signal }) { signal.addEventListener("abort", () => { aborted++; }); return new Promise(() => {}); } };
  const service = createSpeechService({ config: { ...config, ttsTimeoutMs: 1 }, providers: [stalled] });
  service.prefetch(session, turn);
  assert.deepEqual(await service.audio(session, "2"), { speech: { available: true, turn_id: "2", mode: "browser" } });
  const localOnly = createSpeechService({ config: { ...config, ttsChain: ["local"] }, providers: [stalled] });
  localOnly.prefetch(session, { ...turn, id: 3 });
  assert.deepEqual(await localOnly.audio(session, "3"), { speech: { available: false, turn_id: "3", mode: "none" } });
  const queued = createSpeechService({ config, providers: [stalled] });
  for (let id = 10; id < 19; id++) queued.prefetch(session, { ...turn, id });
  assert.ok(aborted >= 1);
});

test("disabled, ended and unknown NPC eligibility precedes provider fallback", async () => {
  let calls = 0;
  for (const enabled of [false, true]) {
    const service = createSpeechService({ config: { ...config, enabled }, providers: [{ synthesize() { calls++; } }] });
    service.disableLocal();
    for (const [s, t] of [[{ ...session, ended: true }, turn], [session, { ...turn, npcId: "alex_coach" }], [session, { ...turn, speaker: "user" }]]) {
      assert.equal(service.prefetch(s, t).mode, "none");
    }
    if (!enabled) assert.equal(service.prefetch(session, turn).mode, "none");
  }
  assert.equal(calls, 0);
});

test("cache reads refresh recency and clearing settles a provider ignoring abort", async () => {
  const service = createSpeechService({ config, providers: [{ synthesize: async () => ({ audio: Buffer.from("RIFF"), mime: "audio/wav" }) }] });
  for (let id = 1; id <= 8; id++) service.prefetch(session, { ...turn, id });
  await service.audio(session, "1");
  service.prefetch(session, { ...turn, id: 9 });
  assert.equal(await service.audio(session, "2"), null);
  assert.ok((await service.audio(session, "1")).audio);
  service.clear(session.id);
  let finish, signal;
  const stalled = createSpeechService({ config: { ...config, ttsTimeoutMs: 30000 }, providers: [{ synthesize(args) { signal = args.signal; return new Promise((resolve) => { finish = resolve; }); } }] });
  stalled.prefetch(session, turn);
  await new Promise(setImmediate);
  const pending = stalled.audio(session, "2");
  stalled.clear(session.id);
  assert.equal(await pending, null);
  assert.equal(signal.aborted, true);
  finish({ audio: Buffer.from("RIFF"), mime: "audio/wav" });
  await new Promise(setImmediate);
  assert.equal(await stalled.audio(session, "2"), null);
});

test("readiness blocks inference, idempotency shares work and throwing logs stay harmless", async () => {
  let ready, calls = 0;
  const service = createSpeechService({ config, localReady: new Promise((resolve) => { ready = resolve; }), log() { throw new Error("logger down"); }, providers: [{ async synthesize() { calls++; return { audio: Buffer.from("RIFF"), mime: "audio/wav" }; } }] });
  service.prefetch(session, turn); service.prefetch(session, turn);
  await new Promise(setImmediate); assert.equal(calls, 0);
  ready(true);
  assert.ok((await service.audio(session, "2")).audio); assert.equal(calls, 1);
  service.clear(session.id);
});

test("invalid or oversized audio degrades to fallback without retaining bytes", async () => {
  for (const result of [{ audio: Buffer.alloc(2 * 1024 * 1024 + 1), mime: "audio/wav" }, { audio: Buffer.from("bad"), mime: "text/plain" }]) {
    const service = createSpeechService({ config, providers: [{ synthesize: async () => result }] });
    service.prefetch(session, turn);
    assert.equal((await service.audio(session, "2")).speech.mode, "browser");
    service.clear(session.id);
  }
});
