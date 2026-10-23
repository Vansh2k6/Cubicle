import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { scoreSession, createScoreRecord } from "../score.js";
import { scenario, scoringProfile, runBot, languageRuntime } from "../../evals/scriptedBot.mjs";
import * as engine from "../../engine/engine.js";
import { smart, trap, ev } from "../../evals/scriptedPaths.mjs";
const fixtures = JSON.parse(readFileSync(new URL("../../evals/fixtures/s1-07-synthetic-sessions.json", import.meta.url), "utf8")).paths;
const clone = (x) => structuredClone(x);
// These authored event-list cases exercise core source allocation, independently of language interpretation.
function coreRecord(steps) {
  const session = engine.createSession(scenario, {runtime: languageRuntime, seed: 7});
  session.identity = languageRuntime.identity;
  const convo = {seq: 0, turns: []};
  for (const [npcId, text, events] of steps) {
    convo.turns.push({id: ++convo.seq, speaker: "user", npcId, text});
    const {act} = engine.applyTurn(session, npcId, events, {runtime: languageRuntime, text});
    convo.turns.push({id: ++convo.seq, speaker: "npc", npcId, text: "I hear you.", act});
    engine.commitDelivery(session, session.turn, {runtime: languageRuntime, delivered: true});
  }
  return createScoreRecord(session, convo, scenario, scoringProfile);
}
test("hand-derived smart 60 and trap 7; rubric pending25", () => {
  for (const [name, expected] of [["smart", [30, 15, 15, 0, 60]], ["trap", [0, 0, 7, 0, 7]]]) {
    const result = scoreSession(fixtures[name], scenario);
    assert.deepEqual([result.metrics.goals.points, result.metrics.hidden_facts.points, result.metrics.integrity.points, result.metrics.relationship.points, result.deterministic], expected);
    assert.equal(result.metrics.rubric.status, "pending"); assert.equal(result.metrics.rubric.cap, 25);
    assert.equal(result.scoring_version, 2);
    assert.equal(result.turn_map[1].user_turn_id, 3);
  }
});
test("pure repeatability, event reingestion and duplicate commitment do not change points", () => {
  const source = clone(fixtures.trap), before = JSON.stringify(source);
  assert.deepEqual(scoreSession(source, scenario), scoreSession(source, scenario));
  assert.equal(JSON.stringify(source), before);
  source.session.events_log.push(...clone(source.session.events_log));
  source.session.commitments.push(clone(source.session.commitments[0]));
  const result = scoreSession(source, scenario);
  assert.equal(result.deterministic, 7);
  assert.ok(result.excluded.some((e) => e.reason === "duplicate_commitment"));
});
test("overpromised and callback aliases do not duplicate commitment penalty", () => {
  const source = clone(fixtures.trap);
  for (const type of ["overpromised", "callback_commitment"]) source.session.events_log.push({ type, source_id: type, turn_id: 5, npc_id: "maya", params: {} });
  const result = scoreSession(source, scenario);
  assert.equal(result.metrics.integrity.points, 7);
  assert.equal(result.excluded.filter((e) => e.reason === "commitment_alias_or_callback").length, 2);
});
test("only delivered snapshot facts count; debrief-only changes do not", () => {
  const source = clone(fixtures.smart);
  source.session.facts.F1.status = "pending_delivery";
  assert.equal(scoreSession(source, scenario).metrics.hidden_facts.points, 7);
  source.session.facts.F1.status = "revealed";
  source.session.snapshots.forEach((s) => { s.facts.F1.status = "probed"; });
  assert.equal(scoreSession(source, scenario).metrics.hidden_facts.points, 7);
  source.session.debrief_only_facts = ["F3"];
  assert.equal(scoreSession(source, scenario).metrics.hidden_facts.points, 7);
});
test("relationship excludes goal ownership while independent apology can score", async () => {
  const { session, convo } = await runBot([["maya", "I own it and am honest. Sorry.", [ev("took_ownership"), ev("gave_honest_status"), ev("apologized")]]]);
  const result = scoreSession(createScoreRecord(session, convo, scenario, scoringProfile), scenario);
  assert.ok(Math.abs(result.metrics.relationship.points - 10 * 7 / 50 / 3) < 1e-12);
  assert.ok(result.excluded.some((e) => e.reason === "allocated_to_goals"));
  assert.ok(session.npcs.maya.mood > result.metrics.relationship.evidence[0].final);
});
test("unvisitedNPCs contributezero; negative mood clamps; caps and versions", () => {
  const source = clone(fixtures.trap);
  source.session.events_log.push({ type: "off_topic", source_id: "neg", npc_id: "sam", turn_id: 2, params: {} });
  assert.equal(scoreSession(source, scenario).metrics.relationship.points, 0);
  const changed = clone(scenario); changed.scoring.weights.goals = 31;
  assert.throws(() => scoreSession(source, changed), /version or weights/);
  for (let i = 0; i < 60; i++) {
    const generated = clone(fixtures.smart);
    for (let n = 0; n < i; n++) generated.session.events_log.push({ type: "apologized", source_id: `apology:${n}`, npc_id: "sam", turn_id: 1, params: {} });
    const result = scoreSession(generated, scenario);
    for (const metric of Object.values(result.metrics)) assert.ok(metric.points >= 0 && metric.points <= metric.cap);
    assert.ok(result.deterministic <= 75); assert.ok(result.total <= 100);
  }
});
test("code flags and largest-two-loss priorities carry mapped turn evidence", () => {
  const result = scoreSession(fixtures.trap, scenario);
  assert.ok(result.flags.some((f) => f.type === "premature_commitment" && f.turn_id === 1 && f.user_turn_id === 1));
  assert.ok(result.flags.some((f) => f.type === "missed_probe"));
  assert.equal(result.priorities.length, 2); assert.ok(result.priorities[0].loss >= result.priorities[1].loss);
  const smartResult = scoreSession(fixtures.smart, scenario);
  assert.ok(smartResult.flags.some((f) => f.type === "great_recap" && f.turn_id === 10 && f.user_turn_id === 19));
  assert.ok(!smartResult.flags.some((f) => f.type === "premature_commitment"));
});

test("standalone denial of same-NPC prior promise costs four; uncertainty/revision/quotes/explanations do not", async () => {
  for (const [who, text, prior, expected] of [
    ["maya", "I never promised a delivery date.", true, 11],
    ["jordan", "I never promised a delivery date.", true, 15],
    ["maya", "I never promised a delivery date.", false, 15],
    ["maya", "I revise the date to Friday.", true, 15],
    ["maya", "I never promised a delivery date because I was unsure.", true, 15],
    ["maya", 'You said "I never promised a delivery date."', true, 15],
  ]) {
    const steps = prior ? [["maya", "I will deliver Friday.", [ev("committed_deadline", { day: 3 })]]] : [];
    steps.push([who, text, []]);
    const { session, convo } = await runBot(steps);
    const result = scoreSession(createScoreRecord(session, convo, scenario, scoringProfile), scenario);
    assert.equal(result.metrics.integrity.points, expected);
    assert.equal(result.flags.some((f) => f.type === "broken_promise"), expected === 11);
  }
});
test("integrity floors to zero with ledger-applied penalties and duplicate exclusions", () => {
  const source = clone(fixtures.trap);
  for (let i = 2; i <= 5; i++) {
    const c = { ...clone(source.session.commitments[0]), id: `C${i}`, turn_id: i };
    source.session.commitments.push(c);
    source.session.events_log.push({ source_id: `bad:${i}`, type: "committed_deadline", turn_id: i, npc_id: "maya", params: { day: 1 }, allocation: "integrity" });
  }
  const result = scoreSession(source, scenario);
  assert.equal(result.metrics.integrity.points, 0);
  assert.equal(result.metrics.integrity.evidence.reduce((n, r) => n + r.points, 0), 0);
  assert.ok(result.excluded.some((e) => e.reason === "integrity_floor"));
});
test("partial conversation mapping never attributes older events to new user text", async () => {
  const { session } = await runBot(smart.slice(0, 8));
  const next = await runBot([["maya", "Hello.", []]], { session });
  const result = scoreSession(next, scenario);
  assert.deepEqual(result.turn_map, [{ engine_turn_id: 9, user_turn_id: 1, npc_id: "maya" }]);
  assert.equal(result.metrics.goals.evidence[0].user_turn_id, null);
});
test("start100 denominator is safe and a realistic revision avoids repeated penalty", async () => {
  const source = clone(fixtures.smart);
  source.session.npcs.sam.moodHistory[0] = 100;
  assert.equal(scoreSession(source, scenario).metrics.relationship.points, 0);
  const { session, convo } = await runBot([["maya", "I will deliver tomorrow.", [ev("committed_deadline", { day: 1 })]], ["maya", "I revise it to Friday.", [ev("committed_deadline", { day: 3 })]]]);
  const result = scoreSession(createScoreRecord(session, convo, scenario, scoringProfile), scenario);
  assert.equal(result.metrics.integrity.points, 7);
  assert.equal(result.metrics.goals.points, 0);
});
test("flags for pushback inaccurate-relay and ignored redirects come from code", async () => {
  const { session, convo } = await runBot([["maya", "Can you help?", [ev("asked_for_help")]], ["maya", "I disagree constructively.", [ev("pushed_back_constructively")]]]);
  const result = scoreSession(createScoreRecord(session, convo, scenario, scoringProfile), scenario);
  assert.ok(result.flags.some((f) => f.type === "ignored_npc_redirect" && f.turn_id === 2));
  assert.ok(result.flags.some((f) => f.type === "constructive_pushback" && f.user_turn_id === 3));
  const altered = clone(fixtures.smart);
  altered.session.events_log.push({ type: "relayed_fact", source_id: "relaybad", npc_id: "maya", turn_id: 8, params: { fact_id: "F2", accurate: false }, allocation: "integrity", validated: true });
  assert.ok(scoreSession(altered, scenario).flags.some((f) => f.type === "inaccurate_relay" && f.turn_id === 8));
});

test("registry plugins carry configured caps and frozen records retain scoring provenance", async () => {
  const { METRIC_REGISTRY } = await import("../score.js");
  const record = createScoreRecord(fixtures.smart.session, fixtures.smart.convo, scenario);
  assert.equal(record.scenario.scoring.version, 2);
  const result = scoreSession(record);
  for (const [id, plugin] of Object.entries(METRIC_REGISTRY)) {
    assert.equal(plugin.id, id);
    assert.equal(plugin.weight(scenario), result.metrics[id].cap);
    assert.deepEqual(plugin.evaluate(record), result.metrics[id]);
  }
  record.session.turn = 999;
  assert.notEqual(fixtures.smart.session.turn, 999);
});

test("failed guarded reveal credits zero; a safe retry credits once", async () => {
  const { npcFn } = await import("../../services/api/offlineProviders.js");
  const steps = [["maya", "Is there deadline flexibility?", [ev("asked_deadline_flexibility")]], ["maya", "What happens if it slips?", [ev("asked_impact")]]];
  const failed = await runBot(steps, { npc: async () => ({ text: "I hear you." }) });
  assert.equal(scoreSession(failed, scenario).metrics.hidden_facts.points, 0);
  const retry = await runBot([["maya", "Please explain the impact.", [ev("asked_impact")]]], { session: failed.session, npc: npcFn });
  assert.equal(scoreSession(retry, scenario).metrics.hidden_facts.points, 8);
  assert.equal(scoreSession(retry, scenario).ledger.filter((e) => e.metric === "hidden_facts" && e.source_id === "fact:F1" && e.points === 8).length, 1);
});

test("goal evidence is causal and repeated ownership cannot add relationship credit", async () => {
  const { session, convo } = await runBot([
    ["maya", "I own it and report honestly.", [ev("took_ownership"), ev("gave_honest_status")]],
    ["maya", "I own it.", [ev("took_ownership")]],
  ]);
  const result = scoreSession(createScoreRecord(session, convo, scenario, scoringProfile), scenario);
  assert.ok(result.metrics.goals.evidence[0].evidence.every((e) => e.turn_id <= 1));
  assert.equal(result.metrics.relationship.points, 0);
  assert.ok(result.excluded.some((e) => e.reason === "repeated_goal_achievement"));
});
test("distinct denial fault is separately sourced from an unrealistic promise", async () => {
  const { session, convo } = await runBot([["maya", "I will deliver tomorrow.", [ev("committed_deadline", { day: 1 })]], ["maya", "I never promised a delivery date.", []]]);
  const result = scoreSession(createScoreRecord(session, convo, scenario, scoringProfile), scenario);
  assert.equal(result.metrics.integrity.points, 3);
  assert.deepEqual(result.metrics.integrity.evidence.slice(1).map((r) => r.source_id), ["commitment:C1", "commitment:C1:denial:2"]);
  const changed = clone(scenario); changed.scoring.penalties = { unrealistic_commitment: 9, contradicted_commitment: 4, inaccurate_relay: 3 };
  assert.throws(() => scoreSession(createScoreRecord(session, convo, scenario, scoringProfile), changed), /version or weights/);
});

test("G3 evidence references the delivered active recap rather than an ignored earlier recap", async () => {
  const record = await runBot([
    ["maya", "I own this and report honestly.", [ev("took_ownership"), ev("gave_honest_status")]],
    ["maya", "I will deliver Friday.", [ev("committed_deadline", { day: 3 })]],
    ["maya", "To recap, I will deliver Friday.", [ev("recapped_agreement")]],
    ["jordan", "What is left?", [ev("asked_requirement_details")]],
    ["maya", "I am back.", []],
    ["maya", "To recap, I will deliver Friday.", [ev("recapped_agreement")]],
  ]);
  const result = scoreSession(record, scenario);
  const g3 = result.metrics.goals.evidence.find((e) => e.source_id === "goal:G3");
  assert.equal(g3.points, 10); assert.equal(g3.commitment_id, "C1");
  assert.equal(g3.evidence[0].turn_id, 6);
  assert.equal(g3.evidence[0].user_turn_id, 11);
});
test("multiple commitments in one user turn bind distinct historical fault sources", async () => {
  const record = coreRecord([["maya", "I will deliver tomorrow. I revise that to Friday.", [ev("committed_deadline", { day: 1 }), ev("committed_deadline", { day: 3 })]]]);
  assert.notEqual(record.session.commitments[0].source_id, record.session.commitments[1].source_id);
  assert.equal(scoreSession(record, scenario).metrics.integrity.points, 7);
  for (const c of record.session.commitments) delete c.source_id;
  assert.equal(scoreSession(record, scenario).metrics.integrity.points, 7);
});
test("floor applies penalties in source chronology across relay and commitment categories", async () => {
  const { session } = await runBot(smart.slice(0, 8));
  const record = await runBot([
    ["maya", "Jordan built a module covering all the remaining work.", [ev("relayed_fact", { fact_id: "F2", accurate: false })]],
    ["maya", "I will deliver tomorrow.", [ev("committed_deadline", { day: 1 })]],
    ["maya", "I will deliver tomorrow.", [ev("committed_deadline", { day: 1 })]],
  ], { session });
  const result = scoreSession(record, scenario);
  assert.deepEqual(result.metrics.integrity.evidence.slice(1).map((r) => [r.turn_id, r.loss]), [[9, 3], [10, 8], [11, 4]]);
});
test("duplicate accepted commitments do not duplicate recap flags", () => {
  const record = clone(fixtures.smart);
  record.session.commitments.push(clone(record.session.commitments.at(-1)));
  const result = scoreSession(record, scenario);
  assert.equal(result.flags.filter((f) => f.type === "great_recap").length, 1);
});
test("per-goal and per-fact weights require a matching scoring contract version", () => {
  for (const kind of ["facts", "goals"]) {
    const changed = clone(scenario);
    changed[kind][0].weight += 1; changed[kind][1].weight -= 1;
    assert.throws(() => scoreSession(fixtures.smart, changed), /version or weights/);
  }
});

test("current and legacy provenance mirrors engine conflicting day-alias precedence", async () => {
  const record = coreRecord([["maya", "I will deliver tomorrow.", [ev("committed_deadline", { days: 1, day: 3 })]]]);
  assert.equal(record.session.commitments[0].target_day, 1);
  assert.equal(scoreSession(record, scenario).metrics.integrity.points, 7);
  delete record.session.commitments[0].source_id;
  assert.equal(scoreSession(record, scenario).metrics.integrity.points, 7);
});
test("denial chooses latest creation when multiple promises share one engine turn", async () => {
  const record = coreRecord([
    ["maya", "I will deliver tomorrow. I revise that to Friday.", [ev("committed_deadline", { day: 1 }), ev("committed_deadline", { day: 3 })]],
    ["maya", "I never promised a delivery date.", []],
  ]);
  record.session.commitments.push(clone(record.session.commitments[1]));
  const result = scoreSession(record, scenario);
  const denial = result.metrics.integrity.evidence.find((r) => r.reason === "contradicted_commitment");
  assert.equal(denial.source_id, "commitment:C2:denial:2");
  assert.equal(result.metrics.integrity.points, 3);
});
