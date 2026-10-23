import test from "node:test";
import assert from "node:assert/strict";
import { createScenarioRegistry, defaultRegistry, publicScenario } from "../scenarioRegistry.js";
import { createStore, fetch as fetchFallback, clearMemory } from "../../../replies/fallbackStore.js";
import { createServer } from "../server.js";
import { createOfflineProviders } from "../offlineProviders.js";
import { SessionStore } from "../../../engine/store.js";

function packageInput() {
  const { spec, replies, scoringProfile, policy } = defaultRegistry.getScenario("deadline");
  return structuredClone({ spec, replies, scoringProfile, policy, aliases: ["deadline"] });
}

function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([key, child]) => [key, reverseKeys(child)]));
  return value;
}

test("SC-01 registry preserves aliases and projects only public metadata", () => {
  const pkg = defaultRegistry.getScenario("missed_deadline");
  assert.equal(defaultRegistry.getScenario("deadline"), pkg);
  assert.equal(defaultRegistry.getScenario("unknown"), null);
  assert.ok(Object.isFrozen(pkg) && Object.isFrozen(pkg.spec) && /^[a-f0-9]{64}$/.test(pkg.identity.contentHash));
  assert.equal(JSON.stringify(pkg.identity), JSON.stringify(defaultRegistry.getScenario("deadline").identity));
  const catalog = defaultRegistry.listScenarios();
  assert.deepEqual(catalog, [publicScenario(pkg)]);
  const text = JSON.stringify(catalog);
  for (const privateKey of ["facts", "triggers", "leak_keywords", "commitment_model", "contentHash", "scoringProfile"]) assert.equal(text.includes(privateKey), false);
});

test("registry clones and deeply freezes packages without changing constructor inputs", () => {
  const input = packageInput();
  const before = structuredClone(input);
  const pkg = createScenarioRegistry([input]).getScenario("deadline");
  assert.deepEqual(input, before);
  assert.notEqual(pkg.spec, input.spec);
  assert.notEqual(pkg.replies, input.replies);
  assert.notEqual(pkg.scoringProfile, input.scoringProfile);
  assert.throws(() => { pkg.spec.facts[0].content.en = "Changed fact."; }, TypeError);
  assert.throws(() => { pkg.replies.entries[0].variants[0].text = "Changed reply."; }, TypeError);
  assert.throws(() => { pkg.scoringProfile.weights.goals = 0; }, TypeError);
  assert.deepEqual(input, before);
  input.spec.facts[0].content.en = "Caller-owned fact.";
  input.replies.entries[0].variants[0].text = "Caller-owned reply.";
  input.scoringProfile.weights.goals = 0;
  assert.deepEqual(pkg.spec, before.spec);
  assert.deepEqual(pkg.replies, before.replies);
  assert.deepEqual(pkg.scoringProfile, before.scoringProfile);
});

test("content hash ignores recursive object key order but detects authored data and array order", () => {
  const input = packageInput();
  const hash = (value) => createScenarioRegistry([value]).getScenario("deadline").identity.contentHash;
  assert.equal(hash(input), hash(reverseKeys(input)));
  const changed = packageInput();
  changed.spec.title += " revised";
  assert.notEqual(hash(input), hash(changed));
  const reordered = packageInput();
  reordered.replies.entries.reverse();
  assert.notEqual(hash(input), hash(reordered));
});

test("registry rejects altered scoring, policy, legacy bindings, and replies", () => {
  const base = defaultRegistry.getScenario("deadline");
  const rejects = (change) => { const input = packageInput(); change(input); assert.throws(() => createScenarioRegistry([input]), /invalid|incompatible/); };
  rejects((x) => { x.spec.scoring.version++; });
  rejects((x) => { x.spec.goals[0].weight++; x.spec.goals[1].weight--; });
  rejects((x) => { x.spec.facts[0].weight++; x.spec.facts[1].weight--; });
  rejects((x) => { x.spec.scoring.penalties = { ...x.scoringProfile.penalties, unrealistic_commitment: x.scoringProfile.penalties.unrealistic_commitment + 1 }; });
  rejects((x) => { x.scoringProfile.weights.goals--; });
  rejects((x) => { x.policy.version++; });
  rejects((x) => { x.spec.facts[0].owner = "jordan"; });
  rejects((x) => { x.replies.entries[0].npc = "not-an-npc"; });
  assert.equal(base.spec.facts[0].owner, "maya");
});

test("HTTP catalogue and detail expose only allowed public fields and reject unknown IDs", async () => {
  const app = createServer();
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const pkg = defaultRegistry.getScenario("deadline");
    const catalog = await fetch(base + "/scenarios");
    assert.equal(catalog.status, 200);
    const items = await catalog.json();
    assert.equal(items.length, 1);
    const banned = ["facts", "triggers", "leak_keywords", "canon", "commitment_model", "scoring", "scoringProfile", "policy", "contentHash", "identity"];
    const secrets = pkg.spec.facts.flatMap((fact) => [fact.id, ...Object.values(fact.content), ...Object.values(fact.leak_keywords).flat(), ...fact.triggers]);
    for (const path of ["/scenarios/missed_deadline", "/scenarios/deadline"]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200);
      const detail = await response.json();
      assert.deepEqual(items, [detail]);
      assert.deepEqual(Object.keys(detail).sort(), ["id", "title", "briefing", "difficulty", "duration_min", "goals", "npcs"].filter((key) => pkg.spec[key] !== undefined || ["goals", "npcs"].includes(key)).sort());
      for (const goal of detail.goals) assert.deepEqual(Object.keys(goal).sort(), ["id", "label", "requires"]);
      for (const npc of detail.npcs) assert.deepEqual(Object.keys(npc).sort(), ["id", "name", "role"]);
      const text = JSON.stringify(detail).toLowerCase();
      for (const key of banned) assert.equal(text.includes(`"${key.toLowerCase()}"`), false, key);
      for (const secret of secrets) assert.equal(text.includes(secret.toLowerCase()), false, secret);
    }
    const unknown = await fetch(base + "/scenarios/unknown");
    assert.equal(unknown.status, 404);
    assert.deepEqual(await unknown.json(), { error: "unknown scenario" });
    const unknownSession = await fetch(base + "/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario_id: "unknown" }) });
    assert.equal(unknownSession.status, 400);
    assert.deepEqual(await unknownSession.json(), { error: "unknown scenario_id" });
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});

test("offline providers reject unsupported scenario, policy, version, and locale", () => {
  for (const change of [
    (pkg) => { pkg.spec.id = "unknown"; },
    (pkg) => { pkg.policy.id = "unknown"; },
    (pkg) => { pkg.policy.version++; },
  ]) {
    const pkg = packageInput();
    change(pkg);
    assert.throws(() => createOfflineProviders(pkg), /unsupported offline scenario package/);
  }
  assert.throws(() => createOfflineProviders(defaultRegistry.getScenario("deadline"), { locale: "fr" }), /unsupported offline scenario package/);
});

test("unsupported session binding fails before store creation or provider fallback", async () => {
  const unsupported = { ...defaultRegistry.getScenario("deadline"), policy: { id: "unsupported", version: 1 } };
  let creates = 0;
  let providerCalls = 0;
  const originalCreate = SessionStore.prototype.create;
  SessionStore.prototype.create = function (...args) { creates++; return originalCreate.apply(this, args); };
  let app;
  try {
    app = createServer({ registry: { getScenario: () => unsupported }, npcProvider: async () => { providerCalls++; return { text: "Fallback." }; } });
    await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
    const response = await fetch(`http://127.0.0.1:${app.server.address().port}/sessions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario_id: "deadline" }) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal error" });
    assert.equal(creates, 0);
    assert.equal(providerCalls, 0);
  } finally {
    SessionStore.prototype.create = originalCreate;
    if (app?.server.listening) await new Promise((resolve) => app.server.close(resolve));
  }
});

test("fallback stores are scope-bound and never rotate across package hashes", () => {
  clearMemory();
  const entries = [{ id: "same", npc: "maya", act: "react_freely", variants: [{ id: "one", text: "One." }, { id: "two", text: "Two." }] }];
  const a = createStore(entries, { scenario: "a", locale: "en", contentHash: "one" });
  const b = createStore(entries, { scenario: "a", locale: "en", contentHash: "two" });
  assert.equal(fetchFallback({ scenario: "a", npc: "maya", act: "react_freely", locale: "en" }, a).variantId, "one");
  assert.equal(fetchFallback({ scenario: "a", npc: "maya", act: "react_freely", locale: "en" }, b).variantId, "one");
  assert.equal(fetchFallback({ scenario: "a", npc: "maya", act: "react_freely", locale: "en" }, a).variantId, "two");
  assert.equal(fetchFallback({ scenario: "a", npc: "maya", act: "react_freely", locale: "en" }, b).variantId, "two");
  assert.equal(fetchFallback({ scenario: "b", npc: "maya", act: "react_freely", locale: "en" }, b), null);
  assert.equal(fetchFallback({ scenario: "a", npc: "maya", act: "react_freely", locale: "fr" }, a), null);
  assert.equal(fetchFallback({ scenario: "unknown", npc: "maya", act: "react_freely", locale: "en" }), null);
});

test("session context retains the bound immutable package", async () => {
  let current = defaultRegistry.getScenario("deadline");
  const registry = { getScenario: () => current, listScenarios: () => defaultRegistry.listScenarios() };
  let captured = null;
  const app = createServer({ registry, debriefAssembler: async ({ record }) => { captured = record; return { status: "partial", moments: [], breakdown: [], deterministic: { points: 0 }, judged: { points: 0 } }; } });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const response = await globalThis.fetch(base + "/sessions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario_id: "deadline" }) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    const pkg = defaultRegistry.getScenario("deadline");
    current = null;
    assert.equal(app.resolveSessionContext("unknown"), null);
    assert.equal(app.resolveSessionContext(body.session_id).pkg, pkg);
    const path = `/sessions/${encodeURIComponent(body.session_id)}`;
    const turn = await globalThis.fetch(base + path + "/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ npc_id: "maya", text: "Hello.", idempotencyKey: "bound" }) });
    assert.equal(turn.status, 200, await turn.text());
    await globalThis.fetch(base + path + "/end", { method: "POST" });
    for (let i = 0; i < 20 && !captured; i++) await new Promise((resolve) => setTimeout(resolve, 2));
    assert.deepEqual(captured.session.identity, pkg.identity);
    const serialized = JSON.parse(JSON.stringify(captured.session));
    assert.deepEqual(serialized, captured.session);
    assert.deepEqual(Object.keys(serialized.identity).sort(), ["scenarioId", "contentVersion", "schemaVersion", "policyId", "policyVersion", "scoringVersion", "contentHash"].sort());
    for (const value of Object.values(serialized.identity)) assert.ok(["string", "number"].includes(typeof value));
    const checkSession = (value) => {
      if (!value || typeof value !== "object") return;
      for (const [key, child] of Object.entries(value)) {
        assert.ok(!["pkg", "spec", "replies", "scoringProfile", "policy", "store", "providers", "npcProvider", "classifyProviderFor"].includes(key), key);
        assert.notEqual(child, pkg);
        checkSession(child);
      }
    };
    checkSession(captured.session);
    const retry = await globalThis.fetch(base + path + "/debrief/retry", { method: "POST" });
    assert.equal(retry.status, 202);
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});
