import test from "node:test";
import assert from "node:assert/strict";
import spec from "../../scenarios/missed_deadline.json" with { type: "json" };
import * as core from "../engine.js";
import * as compat from "../sc01Compatibility.js";
import { createScoreRecord, scoreSession } from "../../scoring/score.js";

import { defaultRegistry } from "../../services/api/scenarioRegistry.js";
const pkg = defaultRegistry.getScenario("missed_deadline");
const recordFor = (session, convo) => { session.identity ??= pkg.identity; return createScoreRecord(session, convo, spec, pkg.scoringProfile); };

const ev = (type, params = {}) => ({ type, params });
const runtime = compat.runtime;
const withHook = (name, hook) => ({ ...runtime, engine: { ...runtime.engine, [name]: hook } });
const fresh = () => compat.createSession(structuredClone(spec));
const apply = (s, npc, events, r = runtime) => core.applyTurn(s, npc, events, { runtime: r });
const deliver = (s, flags = {}) => core.commitDelivery(s, s.turn, { runtime, delivered: true, ...flags });
function ready() {
  const s = fresh();
  apply(s, "maya", [ev("took_ownership"), ev("gave_honest_status")]);
  apply(s, "jordan", [ev("asked_requirement_details")]);
  apply(s, "maya", [ev("committed_deadline", { days: 3 })]);
  deliver(s, { agreementExpressed: true });
  return s;
}

test("explicit runtime is required and SC01 compatibility rejects unknown IDs and versions", () => {
  assert.throws(() => core.createSession(spec), /runtime/);
  for (const changed of [{ ...spec, id: "unknown" }, { ...spec, version: 2 }])
    assert.throws(() => compat.createSession(changed), /compatibility/);
  assert.throws(() => compat.createSession(spec, { runtime: { ...runtime, policyId: "unknown" } }), /compatibility/);
  assert.throws(() => compat.createSession({ ...spec, scoring: { ...spec.scoring, version: 3 } }), /compatibility/);
  const s = fresh();
  assert.throws(() => core.applyTurn(s, "maya", []), /runtime/);
  assert.throws(() => apply(s, "maya", [], { ...runtime, policyVersion: 2 }), /runtime/);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  s.identity = Object.freeze({ scenarioId: spec.id, contentVersion: 1, policyId: runtime.policyId, policyVersion: 1 });
  const identity = s.identity;
  apply(s, "maya", []);
  assert.equal(s.identity, identity);
});

test("hook input is detached and readonly; mutation and invalid outputs roll back all state and retained refs", () => {
  for (const [name, hook] of [
    ["goalCandidates", ({ state }) => { state.facts.F1.status = "revealed"; return []; }],
    ["goalCandidates", ({ rules }) => { rules.goals[0].requires.push("G2"); return []; }],
    ["goalCandidates", () => null],
    ["pressureCandidates", () => [{ beatId: "B2", actorId: "maya", act: "reveal_fact:F1", sourceIds: [] }]],
    ["pressureCandidates", () => [{ beatId: "B2", actorId: "jordan", act: "press_for_date", sourceIds: [] }]],
    ["pressureCandidates", () => [{ beatId: "missing", actorId: "maya", act: "press_for_date", sourceIds: [] }]],
    ["commitmentBounds", () => ({ minDay: 1, cutoffDay: 3, assistance: { active: false, factDelivered: false, helpAccepted: false } })],
  ]) {
    const s = fresh(), before = structuredClone(s), npc = s.npcs.maya, facts = s.facts;
    assert.throws(() => apply(s, "maya", [ev("committed_deadline", { days: 3 })], withHook(name, hook)));
    assert.deepEqual(s, before); assert.equal(s.npcs.maya, npc); assert.equal(s.facts, facts);
    assert.deepEqual(npc, before.npcs.maya);
  }
});

test("successful draft preserves nested references and does not freeze or retain caller events", () => {
  const s = fresh(), events = [ev("committed_deadline", { days: 3 })], npc = s.npcs.maya;
  apply(s, "maya", events);
  const commitment = s.commitments[0];
  assert.equal(s.npcs.maya, npc);
  assert.equal(Object.isFrozen(events), false); assert.equal(Object.isFrozen(events[0].params), false);
  events[0].params.days = 1;
  assert.equal(s.commitments[0].target_day, 3);
  assert.equal(s.events_log[0].params.days, 3);
  apply(s, "maya", [ev("committed_deadline", { days: 3 })]);
  assert.equal(s.commitments[0], commitment); assert.equal(commitment.status, "superseded");
});

test("goal candidates cannot fabricate, duplicate, reallocate or change actor of a source", () => {
  for (const alter of [
    (c) => ({ ...c, sourceIds: ["missing", c.sourceIds[1]] }),
    (c) => ({ ...c, sourceIds: [c.sourceIds[0], c.sourceIds[0]] }),
    (c) => ({ ...c, actorId: "jordan" }),
    (c) => ({ ...c, goalId: "G2", actorId: "jordan" }),
    (c) => ({ ...c, requiresDelivery: true }),
    (c) => ({ ...c, commitmentId: "C999" }),
  ]) {
    const s = fresh(), before = structuredClone(s);
    const hook = (input) => runtime.engine.goalCandidates(input).map(alter);
    assert.throws(() => apply(s, "maya", [ev("took_ownership"), ev("gave_honest_status")], withHook("goalCandidates", hook)));
    assert.deepEqual(s, before);
  }
  const s = fresh();
  apply(s, "maya", [ev("took_ownership"), ev("gave_honest_status")]);
  const proof = structuredClone(s.goals.G1.proof);
  apply(s, "maya", [ev("took_ownership"), ev("gave_honest_status")]);
  assert.deepEqual(s.goals.G1.proof, proof);
  const score = scoreSession(recordFor(s, { turns: [] }));
  assert.equal(score.metrics.goals.points, 10); assert.equal(score.metrics.relationship.points, 0);
});

test("candidate cannot bypass dependencies, pending facts, or active accepted commitment", () => {
  const s = fresh();
  const candidate = { goalId: "G3", actorId: "maya", sourceIds: [], commitmentId: "C999", requiresDelivery: true };
  apply(s, "maya", [ev("recapped_agreement")], withHook("goalCandidates", () => [candidate]));
  assert.equal(s.goals.G3.status, "pending");
  const readySession = ready(), before = structuredClone(readySession);
  assert.throws(() => apply(readySession, "maya", [ev("recapped_agreement")], withHook("goalCandidates", ({ state }) => [
    { ...candidate, sourceIds: [state.events_log.at(-1).source_id] },
  ])), /commitment/);
  assert.deepEqual(readySession, before);
  const pending = fresh();
  apply(pending, "jordan", [ev("asked_for_help")]); apply(pending, "jordan", [ev("asked_for_help")]);
  assert.equal(pending.facts.F2.status, "pending_delivery");
  apply(pending, "jordan", [ev("confirmed_next_steps", { help_accepted: true })]);
  apply(pending, "maya", [ev("committed_deadline", { days: 2 })]);
  assert.equal(pending.commitments[0].unrealistic, true);
});

test("failed reveal, agreement and closing delivery grant no fact or closing proof credit", () => {
  const s = fresh();
  apply(s, "jordan", [ev("asked_for_help")]); apply(s, "jordan", [ev("asked_for_help")]);
  core.commitDelivery(s, s.turn, { runtime, delivered: false });
  assert.equal(scoreSession(recordFor(s, {})).metrics.hidden_facts.points, 0);
  const failed = fresh(); apply(failed, "maya", [ev("committed_deadline", { days: 3 })]);
  core.commitDelivery(failed, failed.turn, { runtime, delivered: false, agreementExpressed: true });
  assert.equal(failed.commitments[0].accepted_with, null);
  const closing = ready(); apply(closing, "maya", [ev("recapped_agreement")]);
  assert.equal(closing.goals.G3.status, "pending_delivery"); assert.ok(closing.goals.G3.proof);
  core.commitDelivery(closing, closing.turn, { runtime, delivered: false, closingExpressed: true });
  assert.equal(closing.goals.G3.status, "pending"); assert.equal(closing.goals.G3.proof, undefined);
  assert.equal(closing.events_log.at(-1).allocation, "none"); assert.equal(closing.ended, false);
  assert.equal(scoreSession(recordFor(closing, {})).metrics.goals.points, 20);
  apply(closing, "maya", [ev("recapped_agreement")]); deliver(closing, { closingExpressed: true });
  assert.equal(closing.goals.G3.status, "done"); assert.equal(closing.ended, true);
  const score = scoreSession(recordFor(closing, {}));
  assert.equal(score.metrics.goals.points, 30);
  deliver(closing, { closingExpressed: true });
  assert.deepEqual(scoreSession(recordFor(closing, {})), score);
});

test("only relay hook receives text; nonboolean relay output and pressure commitment spoof roll back", () => {
  const s = fresh(); let inspected = 0;
  const inspect = { ...runtime, engine: Object.fromEntries(Object.entries(runtime.engine).map(([name, fn]) => [name, (input) => {
    if (name !== "relayAccuracy") {
      assert.equal("text" in input, false);
      assert.equal(JSON.stringify(input).includes("private-user-wording"), false);
    }
    inspected++; return fn(input);
  }])) };
  apply(s, "maya", [ev("committed_deadline", { days: 3, what: "private-user-wording", original_words: "private-user-wording" })], inspect);
  apply(s, "jordan", [], inspect);
  assert.equal(s.commitments[0].original_words, "private-user-wording");
  assert.equal(s.events_log[0].params.original_words, "private-user-wording");
  assert.ok(inspected >= 3);
  const before = structuredClone(s);
  assert.throws(() => apply(s, "maya", [], withHook("pressureCandidates", () => [{ beatId: "B3", actorId: "maya", act: "callback_commitment", commitmentId: "C999", sourceIds: [s.commitments[0].source_id] }])));
  assert.deepEqual(s, before);
  s.facts.F1.status = "revealed"; s.user_known.push("F1");
  const known = structuredClone(s);
  assert.throws(() => core.applyTurn(s, "maya", [ev("relayed_fact", { fact_id: "F1", accurate: true })], { text: "Friday", runtime: withHook("relayAccuracy", () => "true") }), /relay/);
  assert.deepEqual(s, known);
});

test("core rejects premature callbacks and date pressure before its schedule or after a commitment", () => {
  const forceDate = () => [{ beatId: "B2", actorId: "maya", act: "press_for_date", sourceIds: [] }];
  for (const assertiveness of [50, 70]) {
    const s = compat.createSession(structuredClone(spec), { sliders: { assertiveness } });
    const before = structuredClone(s);
    assert.throws(() => apply(s, "maya", [], withHook("pressureCandidates", forceDate)), /ineligible date/);
    assert.deepEqual(s, before);
  }
  const callback = ({ state }) => {
    const c = state.commitments[0];
    return [{ beatId: "B3", actorId: "maya", act: "callback_commitment", commitmentId: c.id, sourceIds: [c.source_id] }];
  };
  const freshCommitment = fresh(), beforeCommitment = structuredClone(freshCommitment);
  assert.throws(() => apply(freshCommitment, "maya", [ev("committed_deadline", { days: 3 })], withHook("pressureCandidates", callback)), /ineligible pressure callback/);
  assert.deepEqual(freshCommitment, beforeCommitment);
  const committed = fresh(); apply(committed, "maya", [ev("committed_deadline", { days: 3 })]);
  apply(committed, "jordan", []); apply(committed, "sam", []);
  const before = structuredClone(committed);
  assert.throws(() => apply(committed, "maya", [], withHook("pressureCandidates", forceDate)), /ineligible date/);
  assert.deepEqual(committed, before);
  assert.equal(apply(committed, "maya", []).act, "callback_commitment");
  for (const [assertiveness, turn] of [[50, 4], [70, 3]]) {
    const s = compat.createSession(structuredClone(spec), { sliders: { assertiveness } });
    for (let i = 1; i < turn; i++) apply(s, "jordan", []);
    assert.equal(apply(s, "maya", []).act, "press_for_date");
  }
});
