import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "../server.js";
import {createScenarioRegistry, defaultRegistry} from "../scenarioRegistry.js";
import {deadlineV2PackageInput} from "../deadlineV2Package.js";
import {loadVoiceConfig} from "../../../voice/config.js";

test("injected v2/v1 sessions keep exact package binding and remote knowledge private across registry replacement", async () => {
  const v2 = createScenarioRegistry([deadlineV2PackageInput()]);
  let selected = v2;
  const registry = {getScenario: (id) => selected.getScenario(id), listScenarios: () => selected.listScenarios()};
  const app = createServer({registry, feedbackProviders: {}, voiceConfig: loadVoiceConfig({})});
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const post = async (path, body) => {
    const response = await fetch(base + path, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  try {
    const first = await post("/sessions", {scenario_id: "missed_deadline"});
    assert.equal(first.status, 200, JSON.stringify(first.body)); assert.equal(first.body.scenario.npcs.length, 4);
    const id = first.body.session_id, context = app.resolveSessionContext(id);
    assert.equal(context.runtime.schemaVersion, 2); assert.equal(context.pkg, v2.getScenario("missed_deadline"));
    assert.equal(context.runtime.identity, context.pkg.identity);
    selected = defaultRegistry;
    const old = await post("/sessions", {scenario_id: "deadline"});
    assert.equal(old.status, 200); assert.equal(old.body.scenario.npcs.length, 3);
    assert.equal(app.resolveSessionContext(old.body.session_id).runtime.schemaVersion, 1);
    assert.equal(app.resolveSessionContext(id), context);
    const turn = (sid, npc, text, key) => post(`/sessions/${encodeURIComponent(sid)}/turn`, {npc_id: npc, text, idempotencyKey: key});
    const ownership = await turn(id, "maya", "I own the delay; the portal is overdue.", "own");
    assert.equal(ownership.status, 200, JSON.stringify(ownership.body)); assert.equal(ownership.body.public_state.goals[0].status, "done");
    assert.deepEqual((await turn(id, "maya", "I own the delay; the portal is overdue.", "own")).body, ownership.body);
    await turn(id, "client", "What do you actually need Friday?", "client-1");
    const reveal = await turn(id, "client", "What do you actually need Friday?", "client-2");
    assert.equal(reveal.status, 200); assert.ok(reveal.body.npc_reply.includes("I asked about the dashboard"));
    const otherThread = await turn(id, "maya", "Hello.", "maya-safe");
    const otherSession = await turn(old.body.session_id, "maya", "Hello.", "old-safe");
    for (const response of [first, ownership, otherThread, otherSession]) {
      const text = JSON.stringify(response.body);
      for (const privateValue of ["plan_model", "source_id", "plan_revision", "contentHash", "deadline-v2", context.pkg.spec.facts[3].content.en]) assert.ok(!text.includes(privateValue), privateValue);
    }
    assert.equal((await turn(old.body.session_id, "client", "Hello.", "foreign-contact")).status, 400);
    assert.equal((await post("/sessions", {scenario_id: "unknown"})).status, 400);
  } finally {
    await new Promise((resolve) => app.server.close(resolve));
  }
});
