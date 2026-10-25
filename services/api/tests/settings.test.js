import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
import { defaultRegistry, legacyRegistry } from "../scenarioRegistry.js";
import { loadVoiceConfig } from "../../../voice/config.js";

const servers = [];
async function launch(options = {}) {
  const app = createServer({ registry: legacyRegistry, feedbackProviders: {}, voiceConfig: loadVoiceConfig({}), ...options });
  servers.push(app.server);
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}
async function request(base, path, body) {
  const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
test.after(async () => { await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve)))); });

test("npc sliders are package-bound partial overrides with independent engine mood", async () => {
  let captured;
  const { app, base } = await launch({ debriefAssembler: async ({ record }) => { captured = record; return { status: "partial" }; } });
  const created = await request(base, "/sessions", { scenario_id: "deadline", sliders: { warmth: 20, patience: 80 }, npc_sliders: { maya: { warmth: 100 }, jordan: { patience: 0 } } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.deepEqual(created.body.settings, { assertiveness: 50, patience: 80, warmth: 20, forthcomingness: 50 });
  assert.deepEqual(created.body.npc_settings, {
    maya: { assertiveness: 50, patience: 80, warmth: 100, forthcomingness: 50 },
    jordan: { assertiveness: 50, patience: 0, warmth: 20, forthcomingness: 50 },
    sam: { assertiveness: 50, patience: 80, warmth: 20, forthcomingness: 50 },
  });
  assert.equal(app.resolveSessionContext(created.body.session_id).pkg.spec.id, "missed_deadline");
  await request(base, `/sessions/${encodeURIComponent(created.body.session_id)}/end`, {});
  for (let attempt = 0; attempt < 20 && !captured; attempt++) await new Promise((resolve) => setTimeout(resolve, 2));
  const raw = captured.session;
  assert.equal(raw.npcs.maya.mood, 65);
  assert.equal(raw.npcs.jordan.mood, 41);
  assert.equal(raw.npcs.sam.mood, 41);
  assert.deepEqual(raw.customisation, created.body.npc_settings);
});

test("omitted npc map remains backwards compatible and all malformed maps fail closed", async () => {
  const { base } = await launch();
  const baseline = await request(base, "/sessions", { scenario_id: "deadline", sliders: { warmth: 20 } });
  assert.equal(baseline.status, 200);
  assert.deepEqual(baseline.body.npc_settings.maya, { assertiveness: 50, patience: 50, warmth: 20, forthcomingness: 50 });
  const bad = [null, [], { ghost: { warmth: 20 } }, { maya: null }, { maya: [] }, { maya: { unknown: 20 } }, { maya: { warmth: -1 } }, { maya: { warmth: 20.5 } }, { maya: { warmth: "20" } }, JSON.parse('{"__proto__":{"warmth":20}}'), JSON.parse('{"maya":{"__proto__":20}}')];
  for (const npc_sliders of bad) assert.equal((await request(base, "/sessions", { scenario_id: "deadline", npc_sliders })).status, 400, JSON.stringify(npc_sliders));
});

test("captured retry package validates actors before creation and settings stay fixed after start", async () => {
  let selected = legacyRegistry;
  const registry = { getScenario: (id) => selected.getScenario(id), listScenarios: () => selected.listScenarios() };
  const { base } = await launch({ registry });
  const first = await request(base, "/sessions", { scenario_id: "deadline" });
  await request(base, `/sessions/${encodeURIComponent(first.body.session_id)}/end`, {});
  selected = defaultRegistry;
  const retry = await request(base, "/sessions", { scenario_id: "deadline", previous_session_id: first.body.session_id, npc_sliders: { maya: { warmth: 0 } } });
  assert.equal(retry.status, 200, JSON.stringify(retry.body));
  assert.equal(Object.keys(retry.body.npc_settings).length, 3);
  assert.equal((await request(base, "/sessions", { scenario_id: "deadline", previous_session_id: first.body.session_id, npc_sliders: { client: { warmth: 0 } } })).status, 400);
  const rejected = await request(base, `/sessions/${encodeURIComponent(retry.body.session_id)}/turn`, { npc_id: "maya", text: "Hello.", npc_sliders: { maya: { warmth: 100 } }, idempotencyKey: "fixed-npc-settings" });
  assert.equal(rejected.status, 400);
});

test("current four-actor package resolves independent client settings", async () => {
  const { app, base } = await launch({ registry: defaultRegistry });
  const created = await request(base, "/sessions", { scenario_id: "deadline", sliders: { warmth: 10 }, npc_sliders: { client: { warmth: 100 }, jordan: { patience: 0 } } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(Object.keys(created.body.npc_settings).length, 4);
  assert.equal(created.body.npc_settings.client.warmth, 100);
  assert.equal(created.body.npc_settings.jordan.patience, 0);
  assert.equal(created.body.npc_settings.maya.warmth, 10);
  assert.equal(app.resolveSessionContext(created.body.session_id).pkg.spec.version, 2);
});

test("ended debrief record retains actual per-NPC settings without scoring changes", async () => {
  let captured;
  const { base } = await launch({ debriefAssembler: async ({ record }) => { captured = record; return { status: "partial", moments: [], breakdown: [], deterministic: { points: 0 }, judged: { points: 0 } }; } });
  const created = await request(base, "/sessions", { scenario_id: "deadline", npc_sliders: { maya: { warmth: 100 }, jordan: { forthcomingness: 0 } } });
  await request(base, `/sessions/${encodeURIComponent(created.body.session_id)}/end`, {});
  for (let attempt = 0; attempt < 20 && !captured; attempt++) await new Promise((resolve) => setTimeout(resolve, 2));
  assert.deepEqual(captured.session.customisation, created.body.npc_settings);
});
