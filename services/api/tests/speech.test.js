import {legacyRegistry} from "../scenarioRegistry.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

const map = { maya: "en_US-lessac-medium", jordan: "en_US-ryan-medium", sam: "en_US-amy-medium", alex_coach: "en_GB-alan-medium" };
const config = { enabled: true, sttChain: ["local"], ttsChain: ["local", "browser"], localUrl: "http://127.0.0.1:9", localToken: "x", sttTimeoutMs: 20, ttsTimeoutMs: 50, voiceMap: map };
async function fixture(provider, options = {}) { const app = createServer({ registry: legacyRegistry, voiceConfig: config, voiceProviders: [provider], ...options }); await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve)); const base = `http://127.0.0.1:${app.server.address().port}`; const session = await (await fetch(base + "/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario_id: "deadline" }) })).json(); return { base, id: session.session_id, close: () => new Promise((resolve) => app.server.close(resolve)) }; }
test("turn text returns before slow TTS and audio is id scoped", async () => {
  let release; const f = await fixture({ async synthesize() { return new Promise((resolve) => { release = resolve; }); } });
  try { const reply = await (await fetch(`${f.base}/sessions/${encodeURIComponent(f.id)}/turn`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ npc_id: "maya", text: "I need help", idempotencyKey: "one" }) })).json(); assert.equal(reply.speech.mode, "server"); const user = await fetch(`${f.base}/sessions/${encodeURIComponent(f.id)}/turns/1/audio`); assert.equal(user.status, 404); const foreign = await fetch(`${f.base}/sessions/${encodeURIComponent(f.id)}/turns/${reply.speech.turn_id}/audio?text=x`); assert.equal(foreign.status, 404); release({ audio: Buffer.from("RIFF"), mime: "audio/wav", provider: "local" }); const audio = await fetch(`${f.base}/sessions/${encodeURIComponent(f.id)}/turns/${reply.speech.turn_id}/audio`, { headers: { origin: "http://127.0.0.1:5173" } }); assert.equal(audio.status, 200); assert.equal(audio.headers.get("cache-control"), "no-store"); } finally { await f.close(); }
});

import { DEFAULTS, loadVoiceConfig } from "../../../voice/config.js";
import { PUBLIC_KEYS } from "../../../llm/pipeline.js";
import { cannedText, FakeProvider } from "../../../llm/fakeProvider.js";
const wav = () => ({ audio: Buffer.from("RIFF"), mime: "audio/wav", provider: "local" });
const post = async (f, suffix, body) => fetch(`${f.base}/sessions/${encodeURIComponent(f.id)}${suffix}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const sendTurn = async (f, body = {}) => (await post(f, "/turn", { npc_id: "maya", text: "Hello.", ...body })).json();
const audioUrl = (f, id = "2") => `${f.base}/sessions/${encodeURIComponent(f.id)}/turns/${id}/audio`;

test("audio rejects user, future, foreign, queries and methods with private response policy", async () => {
  const f = await fixture({ synthesize: async () => wav() });
  try {
    await sendTurn(f);
    const other = await (await fetch(f.base + "/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario_id: "deadline" }) })).json();
    for (const [url, method] of [[audioUrl(f, "1"), "GET"], [audioUrl(f, "4"), "GET"], [audioUrl({ ...f, id: other.session_id }), "GET"], [audioUrl(f) + "?text=secret&voice=x", "GET"], [audioUrl(f), "POST"], [audioUrl({ ...f, id: "unknown" }), "GET"]]) {
      const response = await fetch(url, { method });
      assert.equal(response.status, 404); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    for (const method of ["GET", "OPTIONS"]) {
      const response = await fetch(audioUrl(f), { method, headers: { origin: "https://evil.example" } });
      assert.equal(response.status, 403); assert.equal(response.headers.get("cache-control"), "no-store"); assert.equal(response.headers.get("access-control-allow-origin"), null);
    }
    const preflight = await fetch(audioUrl(f), { method: "OPTIONS", headers: { origin: "http://localhost:5173" } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("cache-control"), "no-store"); assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5173");
  } finally { await f.close(); }
});

test("public projection and idempotency expose one descriptor and synthesize one committed row", async () => {
  const calls = [];
  const f = await fixture({ async synthesize(args) { calls.push(args); return wav(); } });
  try {
    const first = await sendTurn(f, { idempotencyKey: "same" });
    const again = await sendTurn(f, { idempotencyKey: "same" });
    assert.deepEqual(first, again); assert.deepEqual(Object.keys(first).sort(), [...PUBLIC_KEYS].sort());
    assert.deepEqual(Object.keys(first.speech).sort(), ["available", "mode", "turn_id"]);
    assert.equal(first.turn_id, 1); assert.equal(first.speech.turn_id, "2");
    const response = await fetch(audioUrl(f)); assert.equal(response.status, 200);
    assert.equal(calls.length, 1); assert.equal(calls[0].text, first.npc_reply); assert.equal(calls[0].voice, map.maya);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
    assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { await f.close(); }
});

for (const twice of [false, true]) test(`unsafe generation ${twice ? "falls back" : "regenerates"} before speech`, async () => {
  const unsafe = "The client hard cutoff is Friday, three days out.";
  const fake = new FakeProvider([cannedText(unsafe), cannedText(twice ? unsafe : "Thanks for coming to me. Tell me plainly what happened with the deadline.")]);
  const calls = [];
  const f = await fixture({ async synthesize({ text }) { calls.push(text); return wav(); } }, { npcProvider: fake.fn() });
  try {
    const reply = await sendTurn(f);
    await fetch(audioUrl(f));
    assert.deepEqual(calls, [reply.npc_reply]); assert.ok(!calls.includes(unsafe));
    // Ended-only score evidence confirms speech did not discover the rejected fact.
    await post(f, "/end", {});
    let body;
    for (let n = 0; n < 10; n++) { body = await (await fetch(`${f.base}/sessions/${encodeURIComponent(f.id)}/debrief`)).json(); if (body.status !== "pending") break; await new Promise(setImmediate); }
    assert.ok(body.debrief.missed_facts.some((fact) => fact.id === "F1"));
    assert.equal(body.debrief.breakdown.find((metric) => metric.id === "hidden_facts").points, 0);
  } finally { await f.close(); }
});

test("pending NPC generation has no synthesizer call and no audio row", async () => {
  let release;
  const calls = [];
  const f = await fixture({ async synthesize(args) { calls.push(args); return wav(); } }, { npcProvider: () => new Promise((resolve) => { release = resolve; }) });
  try {
    const pending = sendTurn(f);
    while (!release) await new Promise(setImmediate);
    assert.equal(calls.length, 0); assert.equal((await fetch(audioUrl(f))).status, 404);
    release(cannedText("Thanks for coming to me. Tell me plainly what happened with the deadline."));
    const reply = await pending; await fetch(audioUrl(f)); assert.deepEqual(calls.map((v) => v.text), [reply.npc_reply]);
  } finally { await f.close(); }
});

test("delayed reachable health mismatch gates inference but never holds the text response", async () => {
  let release, calls = 0;
  const f = await fixture({ health: () => new Promise((resolve) => { release = resolve; }), async synthesize() { calls++; return wav(); } });
  try {
    const reply = await sendTurn(f); assert.equal(reply.speech.mode, "server"); assert.equal(calls, 0);
    release([map.maya]);
    const response = await fetch(audioUrl(f)); const body = await response.json();
    assert.equal(body.speech.mode, "browser"); assert.equal(calls, 0); assert.equal(response.headers.get("cache-control"), "no-store");
  } finally { await f.close(); }
});

test("health ignoring abort is bounded and unavailable health returns browser fallback", async () => {
  let calls = 0;
  const f = await fixture({ health: () => new Promise(() => {}), async synthesize() { calls++; return wav(); } });
  try { await sendTurn(f); const response = await fetch(audioUrl(f)); assert.equal(response.status, 200); assert.equal((await response.json()).speech.mode, "browser"); assert.equal(calls, 0); } finally { await f.close(); }
});

test("end aborts pending audio immediately and late completion stays unreachable", async () => {
  let finish, signal;
  const f = await fixture({ synthesize(args) { signal = args.signal; return new Promise((resolve) => { finish = resolve; }); } }, { voiceConfig: { ...config, ttsTimeoutMs: 30000 } });
  try {
    await sendTurn(f); while (!finish) await new Promise(setImmediate);
    const pending = fetch(audioUrl(f));
    await post(f, "/end", {}); assert.equal(signal.aborted, true);
    assert.equal((await pending).status, 404);
    finish(wav()); await new Promise(setImmediate);
    assert.equal((await fetch(audioUrl(f))).status, 404);
  } finally { await f.close(); }
});

test("debug speech metadata exists only under debug and config errors never echo input", async () => {
  assert.equal(new Set(Object.values(DEFAULTS.voiceMap)).size, 4);
  assert.throws(() => loadVoiceConfig({ VOICE_MAP_JSON: "private injected value" }), (error) => error.message === "invalid voice configuration");
  const f = await fixture({ synthesize: async () => wav() }, { debug: true });
  try { const reply = await sendTurn(f); assert.equal(reply._debug.tts_provider, "local"); assert.equal(reply._debug.tts_latency_ms, null); } finally { await f.close(); }
});

test("per-NPC config selects distinct voices and disabled speech never probes health", async () => {
  const voices = [];
  const f = await fixture({ async synthesize({ voice }) { voices.push(voice); return wav(); } });
  try {
    for (const npc_id of ["maya", "jordan", "sam"]) {
      const reply = await sendTurn(f, { npc_id });
      assert.equal((await fetch(audioUrl(f, reply.speech.turn_id))).status, 200);
    }
    assert.deepEqual(voices, [map.maya, map.jordan, map.sam]);
  } finally { await f.close(); }
  let calls = 0;
  const disabled = await fixture({ health() { calls++; }, synthesize() { calls++; } }, { voiceConfig: { ...config, enabled: false } });
  try { const reply = await sendTurn(disabled); assert.equal(reply.speech.mode, "none"); assert.equal(calls, 0); } finally { await disabled.close(); }
});
