import test from "node:test";
import assert from "node:assert/strict";
import { loadVoiceConfig, VoiceConfigError } from "../config.js";
import { runTranscription, VoiceError } from "../provider.js";
import { VoiceRateLimiter } from "../limits.js";
import { createFakeVoiceProvider } from "../providers/fake.js";
import { createLocalVoiceProvider } from "../providers/local.js";

test("voice is disabled by default and enabled local requires a token", () => {
  assert.equal(loadVoiceConfig({}).enabled, false);
  assert.throws(() => loadVoiceConfig({ VOICE_ENABLED: "1" }), VoiceConfigError);
  assert.throws(() => loadVoiceConfig({ VOICE_LOCAL_URL: "http://example.test:9" }), VoiceConfigError);
});
test("transcription falls through failures and never exposes thrown text", async () => {
  const result = await runTranscription([{ async transcribe() { throw new Error("private key text"); } }, createFakeVoiceProvider()], { audio: Buffer.from("x"), mime: "audio/wav" });
  assert.equal(result.provider, "fake");
});
test("empty transcript is typed and rate leases release", async () => {
  await assert.rejects(() => runTranscription([{ async transcribe() { throw new VoiceError("stt_empty"); } }], {}), { code: "stt_empty" });
  const limiter = new VoiceRateLimiter({ now: () => 1 }); assert.equal(limiter.acquire("s"), "ok"); assert.equal(limiter.acquire("s"), "busy"); limiter.release("s"); assert.equal(limiter.acquire("s"), "ok");
});
test("timeout abandons an uncooperative provider and uses the next provider", async () => {
  const result = await runTranscription([{ name: "local", transcribe: () => new Promise(() => {}) }, createFakeVoiceProvider()], {}, { timeoutMs: 5 });
  assert.equal(result.provider, "fake");
});
test("local adapter bounds malformed and oversized sidecar bodies without echoing errors", async () => {
  const response = (body) => new Response(body, { status: 200, headers: { "content-type": "application/json" } });
  for (const body of ["not json", "x".repeat(17000)]) {
    const provider = createLocalVoiceProvider({ url: "http://127.0.0.1:8790", token: "t", fetchFn: async () => response(body) });
    await assert.rejects(() => provider.transcribe({ audio: Buffer.from("a"), mime: "audio/wav" }), (error) => error.code === "stt_unavailable" && !error.message.includes(body.slice(0, 10)));
  }
});

test("caller abort immediately stops an uncooperative provider and never calls fallback", async () => {
  const controller = new AbortController();
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let fallbackCalls = 0;
  const pending = runTranscription([{ name: "local", transcribe: () => {
    entered(); return new Promise(() => {});
  } }, { transcribe: () => { fallbackCalls++; } }], { signal: controller.signal }, { timeoutMs: 1000 });
  await started;
  controller.abort();
  await assert.rejects(pending, { code: "stt_unavailable" });
  assert.equal(fallbackCalls, 0);
});

test("adapter enforces durations, silence hygiene, strips metadata and forbids redirects", async () => {
  for (const data of [{ text: "Thank you.", duration_ms: 1000 },
    { text: "valid", duration_ms: 100 }, { text: "valid", duration_ms: 30001 }]) {
    const provider = createLocalVoiceProvider({ url: "http://127.0.0.1:8790", token: "test",
      fetchFn: async () => new Response(JSON.stringify(data)) });
    await assert.rejects(provider.transcribe({ audio: Buffer.from("a"), mime: "audio/wav" }), VoiceError);
  }
  const provider = createLocalVoiceProvider({ url: "http://127.0.0.1:8790", token: "test",
    fetchFn: async (_, options) => {
      assert.equal(options.redirect, "error");
      return new Response(JSON.stringify({ text: "ready", duration_ms: 1000, provider: "private", token: "secret" }));
    } });
  assert.deepEqual(await provider.transcribe({ audio: Buffer.from("a"), mime: "audio/wav" }),
    { text: "ready", duration_ms: 1000, provider: "local" });
  for (const VOICE_STT_CHAIN of ["browser", "fake", "cloud", "local,local"]) {
    assert.throws(() => loadVoiceConfig({ VOICE_STT_CHAIN }), VoiceConfigError);
  }
});

test("rate windows expire and provider errors never carry their original content", async () => {
  let now = 0;
  const limiter = new VoiceRateLimiter({ limit: 1, windowMs: 100, now: () => now });
  assert.equal(limiter.acquire("id"), "ok"); limiter.release("id");
  assert.equal(limiter.acquire("id"), "rate");
  now = 101;
  assert.equal(limiter.acquire("id"), "ok"); limiter.release("id");
  await assert.rejects(runTranscription([{ transcribe: async () => {
    throw new Error("sensitive-provider-output");
  } }], {}), (error) => error.message === "stt_unavailable");
});
