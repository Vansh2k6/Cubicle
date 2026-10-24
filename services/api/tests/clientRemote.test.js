import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
import { defaultRegistry, publicScenario } from "../scenarioRegistry.js";
import { remoteProofInput, remoteProofRegistry } from "./fixtures/remoteProof.js";
import { createOfflineProviders } from "../offlineProviders.js";
import { SessionStore } from "../../../engine/store.js";
import { DEFAULTS, loadVoiceConfig, VoiceConfigError } from "../../../voice/config.js";
import { PHONE_BINDING } from "../../../shared/presentation.js";

const wav = () => ({audio: Buffer.from("RIFF-remote-proof"), mime: "audio/wav"});
async function fixture(options = {}) {
  const registry = remoteProofRegistry(), pkg = registry.getScenario("private_remote_proof");
  const calls = [], prompts = [], states = new Map();
  const offline = createOfflineProviders(pkg);
  const original = SessionStore.prototype.create;
  SessionStore.prototype.create = function (...args) { const session = original.apply(this, args); states.set(session.id, session); return session; };
  const app = createServer({ registry, voiceConfig: {...DEFAULTS, enabled: true}, voiceProviders: [{ async synthesize(args) { calls.push(args); return wav(); } }],
    npcProvider: async (args) => { prompts.push(args); return offline.npcProvider(args); }, ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function request(path, body) {
    const response = await fetch(base + path, body === undefined ? {} : {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
    return { status: response.status, body: await response.json() };
  }
  async function create(scenario_id = "private_remote_proof") { const result = await request("/sessions", {scenario_id}); assert.equal(result.status, 200); return result.body; }
  const path = (id) => `/sessions/${encodeURIComponent(id)}`;
  const turn = (id, npc_id, text, extra = {}) => request(path(id) + "/turn", {npc_id, text, ...extra});
  const audio = (id, row) => fetch(base + path(id) + `/turns/${row}/audio`);
  return { app, base, registry, pkg, calls, prompts, states, request, create, path, turn, audio, async close() {
    SessionStore.prototype.create = original; app.server.closeAllConnections(); await new Promise((resolve) => app.server.close(resolve));
  } };
}

test("remote package projection is public-only and metadata lookup creates no session or inference", async () => {
  const f = await fixture();
  try {
    const detail = await f.request("/scenarios/private_remote_proof");
    assert.equal(detail.status, 200); assert.equal(f.states.size, 0); assert.equal(f.calls.length, 0); assert.equal(f.prompts.length, 0);
    const contact = detail.body.npcs.find((actor) => actor.id === "client");
    assert.deepEqual(contact, {id: "client", name: "Rohan Mehta", role: "Client Operations Lead", contactMode: "phone", voiceId: "en_GB-alan-medium"});
    assert.equal(Object.hasOwn(contact, "sceneAnchor"), false);
    assert.deepEqual(detail.body.npcs.slice(0, 3).map((actor) => actor.sceneAnchor), ["maya", "jordan", "sam"]);
    for (const marker of ["facts", "policy", "contentHash", "canon", "orchid", "copper", "scoring"]) assert.equal(JSON.stringify(detail.body).includes(marker), false, marker);
    assert.deepEqual((await f.request("/scenarios")).body, [JSON.parse(JSON.stringify(publicScenario(defaultRegistry.getScenario("deadline"))))]);
    assert.equal(defaultRegistry.getScenario("private_remote_proof"), null);
    assert.equal(defaultRegistry.getScenario("deadline").spec.npcs.length, 3);
  } finally { await f.close(); }
});

test("remote binding validation rejects unknown mode or voice, extra anchor, and a second contact", () => {
  for (const binding of [{contactMode: "video", voiceId: PHONE_BINDING.voiceId}, {...PHONE_BINDING, voiceId: DEFAULTS.voiceMap.maya}, {...PHONE_BINDING, sceneAnchor: "maya"}, {sceneAnchor: "fourth", voiceId: PHONE_BINDING.voiceId}]) {
    const input = remoteProofInput(); input.presentation.client = binding;
    assert.throws(() => remoteProofRegistry(input), /unsupported/);
  }
  const duplicate = remoteProofInput(); duplicate.presentation.proof_qa = PHONE_BINDING;
  assert.throws(() => remoteProofRegistry(duplicate), /unsupported/);
});

test("ordinary remote state, guarded owner reveal, threads and audio stay pinned across sessions", async () => {
  let selected = remoteProofRegistry();
  const f = await fixture({ registry: {getScenario: (id) => selected.getScenario(id), listScenarios: () => selected.listScenarios()} });
  try {
    const a = await f.create(), b = await f.create();
    const state = f.states.get(a.session_id), other = f.states.get(b.session_id), context = f.app.resolveSessionContext(a.session_id);
    assert.deepEqual(Object.keys(state.npcs), ["proof_observer", "proof_dispatcher", "proof_qa", "client"]);
    assert.deepEqual(Object.keys(state.npcs.client), Object.keys(state.npcs.proof_observer));
    const physicalMood = state.npcs.proof_observer.mood, remoteMood = state.npcs.client.mood;
    selected = defaultRegistry;
    assert.equal((await f.request("/sessions", {scenario_id: "private_remote_proof"})).status, 400);
    assert.equal(f.app.resolveSessionContext(a.session_id), context);
    const first = await f.turn(a.session_id, "client", "I take responsibility and give an honest status. client-only-token", {idempotencyKey: "remote", voiceId: "arbitrary", sceneAnchor: "maya"});
    assert.equal(first.status, 200); assert.equal(first.body.speech.mode, "server");
    assert.ok(state.npcs.client.mood > remoteMood); assert.equal(state.npcs.proof_observer.mood, physicalMood);
    assert.equal(other.npcs.client.mood, remoteMood);
    assert.ok(state.events_log.some((event) => event.npc_id === "client" && event.type === "took_ownership"));
    const again = await f.turn(a.session_id, "client", "ignored duplicate", {idempotencyKey: "remote"});
    assert.deepEqual(again, first);
    assert.equal((await f.audio(a.session_id, first.body.speech.turn_id)).status, 200);
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].voice, PHONE_BINDING.voiceId); assert.equal(f.calls[0].text, first.body.npc_reply);
    assert.equal((await f.audio(b.session_id, first.body.speech.turn_id)).status, 404);
    assert.equal((await f.audio(a.session_id, "1")).status, 404);
    const qa = await f.turn(a.session_id, "proof_qa", "qa-only-token");
    assert.equal(qa.status, 200); await f.audio(a.session_id, qa.body.speech.turn_id);
    assert.equal(f.calls.at(-1).voice, DEFAULTS.voiceMap.sam);
    const bturn = await f.turn(b.session_id, "client", "other-session-token");
    await f.audio(b.session_id, bturn.body.speech.turn_id);
    await f.turn(a.session_id, "client", "client-only-token second");
    const thread = JSON.stringify(f.prompts.at(-1).messages);
    assert.ok(thread.includes("client-only-token")); assert.equal(thread.includes("qa-only-token"), false); assert.equal(thread.includes("other-session-token"), false);
    const probe = await f.turn(a.session_id, "client", "What is the impact?");
    assert.doesNotMatch(probe.body.npc_reply, /orchid envelope/); assert.deepEqual(state.user_known, []);
    const reveal = await f.turn(a.session_id, "client", "What is the impact?");
    assert.equal(reveal.status, 200); assert.match(reveal.body.npc_reply, /orchid envelope/);
    assert.equal(state.facts.PX.status, "revealed"); assert.deepEqual(state.user_known, ["PX"]); assert.deepEqual(other.user_known, []);
    for (const npc_id of ["unknown", "maya", "alex_coach", "__proto__", "constructor", "toString"]) assert.equal((await f.turn(a.session_id, npc_id, "Hello")).status, 400);
    const foreign = await f.request("/sessions", {scenario_id: "deadline"});
    assert.equal(foreign.status, 200);
    assert.equal((await f.turn(foreign.body.session_id, "client", "Hello")).status, 400);
    assert.equal(state.identity, context.pkg.identity);
    assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
  } finally { await f.close(); }
});

test("remote Alan reuse preserves four-key voice overrides and approved physical mapping", async () => {
  const overrides = {maya: DEFAULTS.voiceMap.jordan, jordan: DEFAULTS.voiceMap.sam, sam: DEFAULTS.voiceMap.alex_coach, alex_coach: DEFAULTS.voiceMap.maya};
  const config = loadVoiceConfig({VOICE_ENABLED: "1", VOICE_LOCAL_TOKEN: "synthetic", VOICE_MAP_JSON: JSON.stringify(overrides)});
  assert.deepEqual(config.voiceMap, overrides);
  assert.throws(() => loadVoiceConfig({VOICE_MAP_JSON: JSON.stringify({...overrides, client: PHONE_BINDING.voiceId})}), VoiceConfigError);
  assert.throws(() => loadVoiceConfig({VOICE_MAP_JSON: JSON.stringify({...overrides, maya: overrides.jordan})}), VoiceConfigError);
  const f = await fixture({voiceConfig: config});
  try {
    const s = await f.create();
    for (const [npc, voice] of [["proof_observer", overrides.maya], ["client", PHONE_BINDING.voiceId]]) {
      const row = await f.turn(s.session_id, npc, "Hello");
      assert.equal(row.status, 200); const audio = await f.audio(s.session_id, row.body.speech.turn_id);
      assert.equal(audio.status, 200); assert.equal(f.calls.at(-1).voice, voice);
    }
  } finally { await f.close(); }
});

test("ending a remote conversation cancels queued audio and rejects late or arbitrary audio requests", async () => {
  let finish, signal;
  const f = await fixture({voiceProviders: [{synthesize(args) { signal = args.signal; return new Promise((resolve) => { finish = resolve; }); }}]});
  try {
    const s = await f.create(), row = await f.turn(s.session_id, "client", "Hello");
    while (!finish) await new Promise(setImmediate);
    const url = `${f.base}${f.path(s.session_id)}/turns/${row.body.speech.turn_id}/audio`;
    const pending = fetch(url);
    await f.request(f.path(s.session_id) + "/end", {});
    assert.equal(signal.aborted, true); finish(wav());
    assert.equal((await pending).status, 404);
    for (const suffix of ["", "?voice=en_GB-alan-medium", "?npc_id=client", "?text=private"]) assert.equal((await fetch(url + suffix)).status, 404);
    const fresh = await f.create(); assert.equal((await f.audio(fresh.session_id, row.body.speech.turn_id)).status, 404);
  } finally { await f.close(); }
});
