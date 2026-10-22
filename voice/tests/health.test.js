import test from "node:test";
import assert from "node:assert/strict";
import { createVoiceHealth } from "../health.js";
import { DEFAULTS } from "../config.js";
import { forceOffline, summarize, measureAudio } from "../../scripts/voice-latency.mjs";
const config = { ...DEFAULTS, enabled: true };

test("health deduplicates probes, backs off unavailable service and recovers without restart", async () => {
  let time = 0, calls = 0, finish;
  const provider = { transcribe() {}, synthesize() {}, health() { calls++; return new Promise((resolve) => { finish = resolve; }); } };
  const health = createVoiceHealth({ config, provider, now: () => time, retryMs: 10, healthyMs: 50 });
  const first = health.check(), same = health.check(); assert.equal(first, same);
  await Promise.resolve(); finish(null); assert.deepEqual(await first, { stt: false, tts: false });
  await health.check(); assert.equal(calls, 1);
  time = 10; const next = health.check(); await Promise.resolve(); finish(Object.values(DEFAULTS.voiceMap));
  assert.deepEqual(await next, { stt: true, tts: true }); assert.equal(calls, 2);
  time = 11; await health.check(); assert.equal(calls, 2);
  health.unavailable(); await health.check(); assert.equal(calls, 2);
  time = 21; const recovered = health.check(); await Promise.resolve(); finish(Object.values(DEFAULTS.voiceMap)); await recovered;
  assert.equal(calls, 3); health.close();
});

test("health timeout and close settle probes even when provider ignores abort", async () => {
  let aborted = false;
  const provider = { health({ signal }) { signal.addEventListener("abort", () => { aborted = true; }); return new Promise(() => {}); } };
  const timed = createVoiceHealth({ config, provider, timeoutMs: 1 });
  assert.deepEqual(await timed.check(), { stt: false, tts: false }); assert.equal(aborted, true); timed.close();
  const closed = createVoiceHealth({ config, provider }); const pending = closed.check(); closed.close(); assert.deepEqual(await pending, { stt: false, tts: false });
});

test("voice map mismatch disables only synthesis; disabled health does no work", async () => {
  let calls = 0;
  const provider = { transcribe() {}, synthesize() {}, async health() { calls++; return [DEFAULTS.voiceMap.maya]; } };
  const health = createVoiceHealth({ config, provider }); assert.deepEqual(await health.check(), { stt: true, tts: false }); health.close();
  const disabled = createVoiceHealth({ config: { ...config, enabled: false }, provider }); await disabled.check(); assert.equal(calls, 1); disabled.close();
});

test("latency environment is forced offline and reports percentiles and first body byte without content", async () => {
  const env = { LLM_PROVIDER: "groq", GROQ_API_KEY: "synthetic", OPENAI_API_KEY: "synthetic", RUN_LIVE: "1", VOICE_LOCAL_TOKEN: "local-only", PATH: "kept" };
  forceOffline(env); assert.deepEqual(env, { LLM_PROVIDER: "offline", VOICE_LOCAL_TOKEN: "local-only", PATH: "kept" });
  assert.deepEqual(summarize(Array.from({ length: 20 }, (_, n) => n + 1)), { p50: 10, p95: 19 });
  let time = 5;
  const audio = await measureAudio(new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/wav" } }), 0, () => time++);
  assert.deepEqual(audio, { firstMs: 5, totalMs: 6, bytes: 3 });
  await assert.rejects(measureAudio(new Response("fallback", { headers: { "content-type": "application/json" } }), 0));
});

test("local health requires a warmed successful sidecar and bounds its response", async () => {
  const { createLocalVoiceProvider } = await import("../providers/local.js");
  for (const body of [{ ok: true, warm: false, voices: Object.values(DEFAULTS.voiceMap) }, { ok: false, warm: true, voices: Object.values(DEFAULTS.voiceMap) }]) {
    const provider = createLocalVoiceProvider({ url: "http://127.0.0.1:9", token: "fake", fetchFn: async () => new Response(JSON.stringify(body)) });
    assert.equal(await provider.health(), null);
  }
  const ready = createLocalVoiceProvider({ url: "http://127.0.0.1:9", token: "fake", fetchFn: async () => new Response(JSON.stringify({ ok: true, warm: true, voices: Object.values(DEFAULTS.voiceMap) })) });
  assert.deepEqual(await ready.health(), Object.values(DEFAULTS.voiceMap));
  const huge = createLocalVoiceProvider({ url: "http://127.0.0.1:9", token: "fake", fetchFn: async () => new Response("x".repeat(17000)) }); assert.equal(await huge.health(), null);
});
