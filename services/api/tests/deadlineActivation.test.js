import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "../server.js";
import {defaultRegistry, legacyRegistry, publicScenario} from "../scenarioRegistry.js";
import {loadVoiceConfig} from "../../../voice/config.js";
import {scanRegistry, registeredPrivateNeedles} from "../../../scripts/registered-private-sources.mjs";
import {scanArtifacts} from "../../../scripts/bundle-scan-core.mjs";

test("default activation publishes only v2 public metadata and scanner covers both versions once", () => {
  const pkg = defaultRegistry.getScenario("deadline");
  assert.equal(pkg, defaultRegistry.getScenario("missed_deadline"));
  assert.equal(pkg.spec.version, 2); assert.equal(pkg.identity.scoringVersion, 3);
  assert.equal(pkg.spec.npcs.length, 4); assert.equal(legacyRegistry.getScenario("deadline").spec.version, 1);
  assert.deepEqual(defaultRegistry.listScenarios(), [publicScenario(pkg)]);
  const all = scanRegistry.allPackages();
  assert.equal(all.length, 4); assert.equal(new Set(all.map((p) => p.identity.contentHash)).size, 4);
  const needles = registeredPrivateNeedles(scanRegistry);
  for (const p of all) for (const fact of p.spec.facts) {
    assert.ok(scanArtifacts([{file: "injected.js", text: fact.content.en}], needles).length, p.identity.contentVersion + "/" + fact.id);
  }
});

test("ended retries use captured v1/v2 packages across replacement; fresh sessions use current default", async () => {
  let selected = legacyRegistry;
  const registry = {getScenario: (id) => selected.getScenario(id), listScenarios: () => selected.listScenarios()};
  const app = createServer({registry, feedbackProviders: {}, voiceConfig: loadVoiceConfig({})});
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = async (path, body) => {
    const r = await fetch(base + path, body === undefined ? {} : {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
    return {status: r.status, body: await r.json()};
  };
  try {
    const first = await request("/sessions", {scenario_id: "deadline"});
    const id = first.body.session_id, captured = app.resolveSessionContext(id);
    assert.equal((await request("/sessions", {scenario_id: "deadline", previous_session_id: id})).status, 400);
    await request(`/sessions/${encodeURIComponent(id)}/end`, {});
    selected = defaultRegistry;
    const feedback = await request(`/sessions/${encodeURIComponent(id)}/debrief`);
    assert.deepEqual(feedback.body.scenario, first.body.scenario);
    const retry = await request("/sessions", {scenario_id: "missed_deadline", previous_session_id: id, sliders: {patience: 70, assertiveness: 30, forthcomingness: 60, warmth: 40}});
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.deepEqual(retry.body.scenario, first.body.scenario);
    assert.equal(app.resolveSessionContext(retry.body.session_id).pkg, captured.pkg);
    assert.notEqual(retry.body.session_id, id);
    const fresh = await request("/sessions", {scenario_id: "deadline"});
    assert.equal(fresh.body.scenario.npcs.length, 4);
    await request(`/sessions/${encodeURIComponent(fresh.body.session_id)}/end`, {});
    selected = legacyRegistry;
    const modernRetry = await request("/sessions", {scenario_id: "deadline", previous_session_id: fresh.body.session_id});
    assert.equal(modernRetry.status, 200); assert.equal(modernRetry.body.scenario.npcs.length, 4);
    assert.equal(app.resolveSessionContext(modernRetry.body.session_id).pkg, defaultRegistry.getScenario("deadline"));
    for (const previous_session_id of ["missing", "", null, 1, {}]) assert.equal((await request("/sessions", {scenario_id: "deadline", previous_session_id})).status, 400);
    assert.equal((await request("/sessions", {scenario_id: "email", previous_session_id: id})).status, 400);
    assert.equal((await request("/sessions", {scenario_id: "unknown"})).status, 400);
    const text = JSON.stringify(feedback.body.scenario);
    for (const secret of ["contentHash", "identity", "facts", "plan_model", "policy", "scoringProfile"]) assert.ok(!text.includes(secret));
  } finally {await new Promise((resolve) => app.server.close(resolve));}
});
