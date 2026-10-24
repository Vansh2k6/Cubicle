import test from "node:test";
import assert from "node:assert/strict";
import {createServer} from "../server.js";
import {createScenarioRegistry, defaultRegistry} from "../scenarioRegistry.js";
import {deadlineV2PackageInput} from "../deadlineV2Package.js";
import {loadVoiceConfig} from "../../../voice/config.js";
import {words} from "../../../scoring/tests/fixtures/deadlineV2Record.js";

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

test("v2 automatic completion produces an ended score3 debrief while pre-end facts remain private", async () => {
  const registry = createScenarioRegistry([deadlineV2PackageInput()]);
  const app = createServer({registry, feedbackProviders: {}, voiceConfig: loadVoiceConfig({})});
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + app.server.address().port;
  const request = async (path, body) => {
    const response = await fetch(base + path, {method: body === undefined ? "GET" : "POST", headers: {"content-type": "application/json"}, body: body === undefined ? undefined : JSON.stringify(body)});
    return {status: response.status, body: await response.json()};
  };
  try {
    const created = await request("/sessions", {scenario_id: "missed_deadline"});
    assert.equal(created.status, 200); const path = "/sessions/" + encodeURIComponent(created.body.session_id);
    for (const suffix of ["/debrief", "/debrief/retry"]) {
      const r = await request(path + suffix, suffix.endsWith("retry") ? {} : undefined);
      assert.equal(r.status, 409); assert.ok(!JSON.stringify(r.body).includes("missed_facts"));
    }
    const steps = [["maya", "I own the delay; the portal is overdue."], ["maya", words.full],
      ["jordan", "Can you reserve the pair for Friday?"], ["sam", "Please await the save acknowledgement and verify save success, failure and retry."],
      ["client", "Routing was unapproved."], ["client", "Can you accept this plan? " + words.full],
      ["maya", "Please approve the current revision. " + words.full], ["maya", "Please approve the current revision. " + words.full],
      ["client", "To recap: " + words.full], ["maya", "In summary: " + words.full]];
    let result;
    for (let i = 0; i < steps.length; i++) {
      const [npc_id, text] = steps[i]; result = await request(path + "/turn", {npc_id, text, idempotencyKey: "ds03-" + i});
      assert.equal(result.status, 200, JSON.stringify(result.body));
      assert.deepEqual(Object.keys(result.body).sort(), ["end_reason", "ended", "npc_reply", "public_state", "speech", "turn_id"]);
      assert.ok(!JSON.stringify(result.body).includes("plan_model"));
    }
    assert.equal(result.body.ended, true); assert.equal(result.body.end_reason, "goals_complete");
    let feedback;
    for (let i = 0; i < 100; i++) {
      feedback = await request(path + "/debrief");
      if (feedback.body.status !== "pending") break;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
    assert.equal(feedback.status, 200); assert.equal(feedback.body.status, "partial");
    const d = feedback.body.debrief;
    assert.equal(d.scoring_version, 3); assert.equal(d.deterministic.points, 45); assert.equal(d.judged.points, 0);
    assert.equal(d.missed_facts.length, 4); assert.ok(d.missed_facts.every((f) => f.unlock_question));
    assert.deepEqual(d.breakdown.map((e) => e.source), ["deterministic", "deterministic", "deterministic", "deterministic", "judged"]);
    const retry = await request(path + "/debrief/retry", {}); assert.ok([200, 202].includes(retry.status));
  } finally {await new Promise((resolve) => app.server.close(resolve));}
});
