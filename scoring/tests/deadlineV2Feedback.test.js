import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import originalScenario from "../../scenarios/missed_deadline.json" with {type: "json"};
import {scoreSession} from "../score.js";
import {assembleDebrief} from "../debrief.js";
import {DIMENSIONS} from "../judge.js";
import {validateQuote} from "../quotes.js";
import {renderDebrief} from "../../src/debrief.js";
import {endSession} from "../../engine/engine.js";
import {recordFor, setup, words, technical, pkg, runtime} from "./fixtures/deadlineV2Record.js";

const clone = (x) => structuredClone(x);
const row = (score, id) => score.metrics.goals.evidence.find((e) => e.source_id === "goal:" + id);
const manifest = {id: "ds03-quality-only-fake", roles: {judge: {model: "fake", promptVersion: "v2", schemaVersion: 2}}};
function judgeFor(record, score = 5) {
  return async ({messages}) => {
    const input = JSON.parse(messages[0].content);
    assert.ok(input.already_scored_elsewhere_do_not_reward.some((e) => e.metric === "goals"));
    return {text: JSON.stringify({dimensions: DIMENSIONS.map((id) => ({id, score, turn_id: 1, quote: record.convo.turns[0].text,
      explanation: "Offline quality-only arithmetic fixture, not a real-model assessment."}))})};
  };
}
for (const route of ["full", "phased"]) test(`${route} captured record scores65 and ended debrief adds only quality25 with verified quotes`, async () => {
  const record = await recordFor(route), before = JSON.stringify(record), result = scoreSession(record);
  assert.equal(record.session.endReason, "goals_complete"); assert.equal(record.session.turn, 18);
  assert.equal(result.scoring_version, 3);
  assert.deepEqual(Object.values(result.metrics).map((m) => m.points), [30, 20, 15, 0, 0]);
  assert.equal(result.deterministic, 65); assert.equal(result.metrics.rubric.status, "pending");
  assert.deepEqual(result.metrics.hidden_facts.evidence.map((e) => e.points), [5, 6, 4, 5]);
  const g3 = row(result, "G3"), g2 = row(result, "G2");
  assert.deepEqual(g2.evidence.map((e) => e.actor_id), ["jordan", "sam"]);
  assert.equal(g3.prerequisite_evidence.length, 2); assert.equal(g3.evidence.length, 6);
  assert.ok(g3.prerequisite_evidence.every((p) => !g3.evidence.some((e) => e.source_id === p.source_id)));
  const d = await assembleDebrief({record, runtime, manifest, providers: {judge: judgeFor(record)}});
  assert.equal(d.deterministic.points, 65); assert.equal(d.judged.points, 25); assert.equal(d.total, 90); assert.equal(d.band, "Excellent");
  assert.equal(d.scoring_version, 3); assert.deepEqual(d.missed_facts, []);
  assert.equal(d.judged.dimensions.length, 5);
  for (const e of d.judged.dimensions) assert.equal(validateQuote(record.convo.turns, e.turn_id, e.quote), true);
  const html = renderDebrief({status: d.status, debrief: d});
  for (const label of ["Scores & evidence", "Communication", "Missed opportunities", "Session details"]) assert.ok(html.includes(label));
  assert.equal(JSON.stringify(record), before);
});

test("discovery and readiness remain distinct; partial facts and undelivered fallback cannot fabricate goals", async () => {
  const f = setup();
  for (const [actor, question] of [["maya", "What did we agree about routing?"], ["jordan", "What can we reuse?"], ["sam", "What could go wrong?"], ["client", "What do you actually need Friday?"]]) {
    await f.turn(actor, question); await f.turn(actor, question);
  }
  assert.equal(scoreSession(f.record()).metrics.goals.points, 0);
  assert.equal(scoreSession(f.record()).metrics.hidden_facts.points, 20);
  const before = f.record();
  before.session.facts.F2.status = "pending_delivery";
  assert.equal(scoreSession(before).metrics.hidden_facts.points, 14);
  const fail = setup();
  await fail.turn("maya", "I own the delay; the portal is overdue.", {npc: async () => {throw {code: "PROVIDER_ERROR"};}});
  assert.equal(scoreSession(fail.record()).metrics.goals.points, 0);
  const record = await recordFor("full", {facts: false});
  assert.equal(scoreSession(record).metrics.goals.points, 30); assert.equal(scoreSession(record).metrics.hidden_facts.points, 0);
});

test("G2 is earned once historically; G3 needs current delivered technical approval after revision", async () => {
  const record = await recordFor("phased", {facts: false, revision: true});
  const score = scoreSession(record);
  assert.equal(score.metrics.goals.points, 30);
  assert.equal(row(score, "G2").revision, 1); assert.equal(row(score, "G3").revision, 2);
  assert.ok(row(score, "G3").prerequisite_evidence.every((e) => e.revision === 2));
  assert.equal(score.metrics.relationship.points, 0);
  const f = setup(); await f.turn("maya", "I own the delay; the portal is overdue."); await f.turn("maya", words.full); await technical(f, "full");
  await f.turn("maya", words.phased, {npc: async () => {throw {code: "PROVIDER_ERROR"};}});
  const partial = scoreSession(f.record());
  assert.equal(row(partial, "G2").points, 10); assert.equal(row(partial, "G3").points, 0);
});

test("forged missing stale cross-actor duplicate and uncommitted evidence earns no affected goal", async () => {
  const original = await recordFor();
  const mutations = [
    ["G2", r => r.session.goals.G2.proof.evidence[1].actor_id = "jordan"],
    ["G2", r => r.session.goals.G2.proof.source_ids[1] = r.session.goals.G2.proof.source_ids[0]],
    ["G2", r => r.session.goals.G2.proof.evidence[0].delivered = false],
    ["G2", r => r.session.commitments[0].plan.approvals.sam.revision = 9],
    ["G3", r => r.session.goals.G3.proof.prerequisite_evidence.pop()],
    ["G3", r => r.session.goals.G3.proof.revision = 2],
    ["G3", r => r.session.commitments[0].plan.delivered = false],
    ["G3", r => r.session.commitments[0].plan.correction.routing_was_unapproved = false],
    ["G3", r => r.session.commitments[0].plan.recaps.client.actor_id = "maya"],
    ["G3", r => r.session.events_log.find((e) => e.source_id === r.session.goals.G3.proof.source_ids[2]).params.ack = "qa"],
    ["G3", r => r.session.events_log.find((e) => e.source_id === r.session.goals.G3.proof.source_ids[0]).allocation = "none"],
    ["G3", r => r.session.events_log.push(clone(r.session.events_log.find((e) => e.source_id === r.session.goals.G3.proof.source_ids[1])))],
    ["G3", r => r.session.snapshots = r.session.snapshots.filter((s) => s.turn !== r.session.goals.G3.proof.evidence[4].turn_id)],
  ];
  for (const [id, mutate] of mutations) {
    const r = clone(original); mutate(r);
    assert.equal(row(scoreSession(r), id).points, 0, mutate.toString());
  }
  for (const mutate of [r => r.identity.policyId = "unknown", r => r.scoringProfile.scoring_version = 2,
    r => r.session.engine_policy.proof_version = 1, r => r.session.model.plan_model.actors.qa = "maya",
    r => r.scenario.goals[1].done_when = ["fact_revealed:F2"]]) {
    const r = clone(original); mutate(r); assert.throws(() => scoreSession(r), /Unsupported/);
  }
});

test("debrief discloses four missed facts only after end, preserves layout and rejects mismatched runtime", async () => {
  const f = setup(); await f.turn("maya", "Hello.");
  await assert.rejects(assembleDebrief({record: f.record(), runtime, manifest}), {code: "NOT_ENDED"});
  endSession(f.session);
  const record = f.record(), d = await assembleDebrief({record, runtime, manifest});
  assert.equal(d.total_status, "provisional"); assert.equal(d.judged.points, 0);
  assert.deepEqual(d.missed_facts.map((f) => f.id), ["F1", "F2", "F3", "F4"]);
  for (const fact of pkg.spec.facts) assert.equal(d.missed_facts.find((f) => f.id === fact.id).unlock_question, fact.unlock_question.en);
  const html = renderDebrief({status: "partial", debrief: d});
  assert.ok(html.includes("Communication assessment unavailable")); assert.ok(html.includes("Missed opportunities"));
  await assert.rejects(assembleDebrief({record, runtime: {...runtime, identity: {...runtime.identity, contentHash: "0".repeat(64)}}, manifest}), /identity mismatch/);
});

test("captured original scoring-v2 smart60/trap7 history is displayed without replay or v3 substitution", () => {
  const records = JSON.parse(readFileSync(new URL("../../evals/fixtures/s1-07-synthetic-sessions.json", import.meta.url), "utf8")).paths;
  for (const [name, expected] of [["smart", 60], ["trap", 7]]) {
    const before = JSON.stringify(records[name]), score = scoreSession(records[name], originalScenario);
    assert.equal(score.scoring_version, 2); assert.equal(score.deterministic, expected); assert.equal(JSON.stringify(records[name]), before);
  }
});
