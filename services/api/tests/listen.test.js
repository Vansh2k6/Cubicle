import {legacyRegistry} from "../scenarioRegistry.js";
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
import { DEFAULTS } from "../../../voice/config.js";
import { assembleDebrief } from "../../../scoring/debrief.js";
const config = { ...DEFAULTS, enabled: true, localToken: "fake", sttTimeoutMs: 30, ttsTimeoutMs: 30 };
const wav = { audio: Buffer.from("RIFF"), mime: "audio/wav", provider: "local" };
async function fixture(options = {}) {
  const calls = [];
  const provider = { transcribe: async () => ({ text: "Hello.", duration_ms: 1000 }), synthesize: async (input) => { calls.push(input); return wav; } };
  const { server } = createServer({ registry: legacyRegistry, voiceConfig: config, voiceProviders: [provider], ...options });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body) => fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const id = (await (await request("/sessions", { scenario_id: "deadline" })).json()).session_id;
  const path = `/sessions/${encodeURIComponent(id)}`;
  const ready = async () => { for (let n = 0; n < 30; n++) { const packet = await (await request(path + "/debrief")).json(); if (packet.status !== "pending") return packet; await new Promise(setImmediate); } throw Error("debrief did not settle"); };
  return { base, request, path, id, calls, ready, close: async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } };
}

test("Listen uses exact stored guarded coaching, coach voice and session-owned ID only", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request(f.path + "/debrief/moments/0-0/audio")).status, 404);
    await f.request(f.path + "/turn", { npc_id: "maya", text: "Hello." }); await f.request(f.path + "/end", {});
    const packet = await f.ready(), moment = packet.debrief.moments[0]; assert.equal(moment.moment_id, "0-0");
    const url = f.path + `/debrief/moments/${moment.moment_id}/audio`;
    const response = await f.request(url); assert.equal(response.status, 200); assert.equal(response.headers.get("content-type"), "audio/wav"); assert.equal(response.headers.get("cache-control"), "no-store");
    const coachCalls = f.calls.filter((call) => call.voice === DEFAULTS.voiceMap.alex_coach);
    assert.equal(coachCalls.length, 1); assert.equal(coachCalls[0].text, moment.better_reply);
    await f.request(url); assert.equal(f.calls.filter((call) => call.voice === DEFAULTS.voiceMap.alex_coach).length, 1);
    for (const path of [url + "?text=untrusted&voice=other", f.path + "/debrief/moments/0-9/audio", f.path + "/debrief/moments/0-01/audio", "/sessions/foreign/debrief/moments/0-0/audio", f.path + "/debrief/moments/Hello/audio"]) {
      const rejection = await f.request(path); assert.equal(rejection.status, 404); assert.equal(rejection.headers.get("cache-control"), "no-store");
    }
    assert.equal((await f.request(url, { text: "arbitrary" })).status, 404);
    for (const method of ["GET", "OPTIONS"]) {
      const response = await fetch(f.base + url, { method, headers: { origin: "https://evil.test" } });
      assert.equal(response.status, 403); assert.equal(response.headers.get("access-control-allow-origin"), null); assert.equal(response.headers.get("cache-control"), "no-store");
    }
    const preflight = await fetch(f.base + url, { method: "OPTIONS", headers: { origin: "http://localhost:5173" } }); assert.equal(preflight.status, 204); assert.equal(preflight.headers.get("cache-control"), "no-store");
  } finally { await f.close(); }
});

test("feedback retry aborts old Listen work and cannot serve pending or stale moment IDs", async () => {
  let finish, signal, assembling;
  const f = await fixture({ voiceConfig: { ...config, ttsTimeoutMs: 30000 },
    voiceProviders: [{ synthesize(input) { signal = input.signal; return new Promise((resolve) => { finish = resolve; }); } }],
    debriefAssembler: async (args) => { if (args.previous) await new Promise((resolve) => { assembling = resolve; }); return assembleDebrief(args); } });
  try {
    await f.request(f.path + "/end", {}); const packet = await f.ready();
    const oldUrl = f.path + `/debrief/moments/${packet.debrief.moments[0].moment_id}/audio`;
    const pendingAudio = f.request(oldUrl); while (!finish) await new Promise(setImmediate);
    await f.request(f.path + "/debrief/retry", {}); assert.equal(signal.aborted, true);
    assert.equal((await pendingAudio).status, 404); assert.equal((await f.request(oldUrl)).status, 404);
    assert.equal((await f.request(f.path + "/debrief/moments/1-0/audio")).status, 404);
    finish(wav); assembling(); const refreshed = await f.ready(); assert.equal(refreshed.debrief.moments[0].moment_id, "1-0");
    assert.equal((await f.request(oldUrl)).status, 404);
  } finally { await f.close(); }
});

test("voice-off debrief JSON is the unchanged stored result and has no Listen route", async () => {
  let stored;
  const f = await fixture({ voiceConfig: { ...config, enabled: false }, debriefAssembler: async (args) => (stored = await assembleDebrief(args)) });
  try { await f.request(f.path + "/end", {}); const packet = await f.ready(); assert.equal(JSON.stringify(packet.debrief), JSON.stringify(stored)); assert.equal((await f.request(f.path + "/debrief/moments/0-0/audio")).status, 404); } finally { await f.close(); }
});

test("startup down is honest, typed remains usable, recovery is shared and bounded by backoff", async () => {
  let available = false, probes = 0, syntheses = 0;
  const f = await fixture({ voiceProviders: [{ health: async () => { probes++; return available ? Object.values(DEFAULTS.voiceMap) : null; }, transcribe: async () => ({ text: "Confirmed draft", duration_ms: 1000 }), synthesize: async () => { syntheses++; return wav; } }] });
  try {
    const status = await (await f.request("/voice/status")).json(); assert.deepEqual(status, { enabled: true, stt: false, tts_mode: "browser" });
    await Promise.all(Array.from({ length: 4 }, () => f.request("/voice/status"))); assert.equal(probes, 1);
    const typed = await (await f.request(f.path + "/turn", { npc_id: "maya", text: "Hello." })).json(); assert.ok(typed.npc_reply);
    const fallback = await (await f.request(f.path + `/turns/${typed.speech.turn_id}/audio`)).json(); assert.equal(fallback.speech.mode, "browser"); assert.equal(syntheses, 0);
    available = true; await new Promise((resolve) => setTimeout(resolve, 1010));
    const recovered = await (await f.request("/voice/status")).json(); assert.deepEqual(recovered, { enabled: true, stt: true, tts_mode: "server" }); assert.equal(probes, 2);
    const stt = await fetch(f.base + f.path + "/voice/stt", { method: "POST", headers: { "content-type": "audio/wav" }, body: Buffer.from("synthetic") }); assert.equal(stt.status, 200);
    const next = await (await f.request(f.path + "/turn", { npc_id: "maya", text: "Hello again." })).json(); assert.equal((await f.request(f.path + `/turns/${next.speech.turn_id}/audio`)).headers.get("content-type"), "audio/wav"); assert.equal(probes, 2); assert.equal(syntheses, 1);
  } finally { await f.close(); }
});

test("mid-session STT failure marks readiness down while typing and browser TTS remain usable", async () => {
  let fail = false, probes = 0;
  const f = await fixture({ voiceProviders: [{ health: async () => { probes++; return Object.values(DEFAULTS.voiceMap); },
    transcribe: async () => { if (fail) throw Error("private error"); return { text: "Confirmed draft", duration_ms: 1000 }; }, synthesize: async () => wav }] });
  try {
    assert.equal((await (await f.request("/voice/status")).json()).stt, true);
    fail = true;
    const upload = await fetch(f.base + f.path + "/voice/stt", { method: "POST", headers: { "content-type": "audio/wav" }, body: Buffer.from("synthetic") }); assert.equal(upload.status, 503);
    assert.deepEqual(await upload.json(), { error: "stt_unavailable" });
    assert.deepEqual(await (await f.request("/voice/status")).json(), { enabled: true, stt: false, tts_mode: "browser" }); assert.equal(probes, 1);
    const turn = await (await f.request(f.path + "/turn", { npc_id: "maya", text: "Hello." })).json(); assert.ok(turn.npc_reply);
    assert.equal((await (await f.request(f.path + `/turns/${turn.speech.turn_id}/audio`)).json()).speech.mode, "browser");
  } finally { await f.close(); }
});
