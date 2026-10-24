import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "../server.js";
import { createScenarioRegistry, legacyRegistry } from "../scenarioRegistry.js";
import { privateProofInput, privateProofPolicy } from "./fixtures/privateProof.js";
import { assembleDebrief } from "../../../scoring/debrief.js";
import { renderDebrief } from "../../../src/debrief.js";
import { scoreSession } from "../../../scoring/score.js";

const makeRegistry = () => createScenarioRegistry([...legacyRegistry.allPackages(), privateProofInput()], { privatePolicies: { [privateProofPolicy.id]: privateProofPolicy } });
const start = async (options) => { const app = createServer(options); await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve)); return { app, base: `http://127.0.0.1:${app.server.address().port}` }; };
async function request(base, path, body) {
  const res = await fetch(base + path, body === undefined ? {} : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json() };
}
const assertLivePrivacy = (body) => {
  const text = JSON.stringify(body);
  for (const marker of ["orchid envelope", "copper lantern", "orchid-envelope-private", "contentHash", "commitment_model", "scoringProfile", "pending_delivery", "goalCandidates", "policy_rules"]) assert.equal(text.includes(marker), false, marker);
};

test("production routes never enable the private proof", async () => {
  const { app, base } = await start();
  try {
    const catalog = await request(base, "/scenarios");
    assert.deepEqual(catalog.body.map((item) => item.id), ["missed_deadline"]);
    assert.equal((await request(base, "/scenarios/private_email_proof")).status, 404);
    assert.equal((await request(base, "/sessions", { scenario_id: "private_email_proof" })).status, 400);
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});

test("crossed HTTP sessions retain exact private package and retry runtime after registry replacement", async () => {
  let selected = makeRegistry(); const records = [], runtimes = [];
  const mutableRegistry = { getScenario: (id) => selected.getScenario(id), listScenarios: () => selected.listScenarios() };
  const { app, base } = await start({ registry: mutableRegistry, debriefAssembler: async (input) => {
    records.push(structuredClone(input.record)); runtimes.push(input.runtime);
    return assembleDebrief(input);
  } });
  try {
    const [proof, legacy] = await Promise.all([request(base, "/sessions", { scenario_id: "private_email_proof" }), request(base, "/sessions", { scenario_id: "missed_deadline" })]);
    assert.equal(proof.status, 200); assert.equal(legacy.status, 200);
    assertLivePrivacy(proof.body); assertLivePrivacy(legacy.body);
    const p = `/sessions/${encodeURIComponent(proof.body.session_id)}`, l = `/sessions/${encodeURIComponent(legacy.body.session_id)}`;
    const pinned = app.resolveSessionContext(proof.body.session_id), old = app.resolveSessionContext(legacy.body.session_id);
    assert.notEqual(pinned.pkg.identity.contentHash, old.pkg.identity.contentHash);
    assert.equal(pinned.runtime.language, privateProofPolicy.language);
    assert.equal(pinned.runtime.rules.assistanceActor, null);
    const altered = privateProofInput(); altered.spec.title += " changed";
    selected = createScenarioRegistry([...legacyRegistry.allPackages(), altered], { privatePolicies: { [privateProofPolicy.id]: privateProofPolicy } });
    assert.notEqual(selected.getScenario("private_email_proof").identity.contentHash, pinned.pkg.identity.contentHash);
    const turns = [
      [p, "proof_observer", "I take responsibility and give an honest status."],
      [l, "maya", "I take responsibility and give an honest status."],
      [p, "proof_dispatcher", "I will send it in 2 days."],
      [l, "maya", "I will finish in 3 days."],
      [p, "proof_dispatcher", "Let me recap."],
    ];
    for (let index = 0; index < turns.length; index++) {
      const [path, npc_id, text] = turns[index];
      const result = await request(base, path + "/turn", { npc_id, text, idempotencyKey: `cross-${index}` });
      assert.equal(result.status, 200, JSON.stringify(result.body)); assertLivePrivacy(result.body);
    }
    assert.equal((await request(base, p + "/turn", { npc_id: "maya", text: "Hello" })).status, 400);
    await request(base, l + "/end", {});
    // Await bounded completion through the actual feedback route.
    async function feedback(path) {
      for (let i = 0; i < 50; i++) {
        const result = await request(base, path + "/debrief");
        if (result.body.status !== "pending") return result.body;
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      assert.fail("debrief did not settle");
    }
    const initial = await feedback(p), legacyFeedback = await feedback(l);
    assert.equal(initial.status, "partial"); assert.equal(legacyFeedback.status, "partial");
    const proofRecord = records.find((record) => record.scenario.id === "private_email_proof");
    assert.ok(proofRecord); assert.equal(proofRecord.session.ended, true);
    assert.equal(proofRecord.session.commitments.at(-1).target_day, 10);
    assert.equal(proofRecord.session.commitments.at(-1).accepted_with, "proof_dispatcher");
    assert.deepEqual(proofRecord.identity, pinned.pkg.identity);
    assert.equal(scoreSession(proofRecord).metrics.goals.points, 30);
    assert.deepEqual(JSON.parse(JSON.stringify(proofRecord)), proofRecord);
    await assert.rejects(assembleDebrief({ record: proofRecord }), /runtime/);
    await assert.rejects(assembleDebrief({ record: proofRecord, runtime: old.runtime }), /context/);
    const retry = await request(base, p + "/debrief/retry", {});
    assert.equal(retry.status, 202); const retried = await feedback(p);
    const proofRuntimes = runtimes.filter((runtime) => runtime.scenarioId === "private_email_proof");
    assert.equal(proofRuntimes.length, 2); assert.ok(proofRuntimes.every((runtime) => runtime === pinned.runtime));
    assert.deepEqual(records.filter((record) => record.scenario.id === "private_email_proof").map((record) => record.identity), [pinned.pkg.identity, pinned.pkg.identity]);
    assert.equal(app.resolveSessionContext(proof.body.session_id), pinned);
    const historical = JSON.parse(readFileSync(new URL("../../../evals/fixtures/s1-07-synthetic-sessions.json", import.meta.url), "utf8")).paths.smart;
    historical.session.ended = true;
    const historicalDebrief = await assembleDebrief({ record: historical, scenario: legacyRegistry.getScenario("deadline").spec });
    assert.equal(historicalDebrief.deterministic.points, 60);
    for (const body of [initial, retried, legacyFeedback, { status: historicalDebrief.status, debrief: historicalDebrief }]) {
      const html = renderDebrief(body);
      assert.match(html, /Scores & evidence/); assert.match(html, /Scenario outcomes/); assert.match(html, /Communication/);
    }
  } finally { await new Promise((resolve) => app.server.close(resolve)); }
});
