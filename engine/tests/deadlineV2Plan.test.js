import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createSession, applyTurn, commitDelivery, canonicalState} from "../engine.js";
import {validateScenario, publicScenario} from "../scenarioValidator.js";
import {loadDeadlineV2EngineContext} from "../../services/api/deadlineV2EngineContext.js";
import {planSlots, planEvidence} from "../../services/api/deadlineV2EnginePolicy.js";
import {createScenarioRegistry, defaultRegistry} from "../../services/api/scenarioRegistry.js";
import {createOfflineProviders} from "../../services/api/offlineProviders.js";
import {scoreSession, createScoreRecord} from "../../scoring/score.js";

const context = loadDeadlineV2EngineContext();
const event = (type, params = {}) => ({type, params});
const full = "Full Friday submission, reliable confirmation, routing and dashboard. Vansh reserve a pair before launch. Prathamesh await save ack; verify save success, save failure and retry.";
const phased = "Phased Friday submission and reliable confirmation. Routing and dashboard Monday. Client operations manually route; I will provide instructions Friday. Vansh reserve Monday. Prathamesh await save ack; verify save success, save failure and retry.";
const copy = (value) => structuredClone(value);
function fresh(runtime = context, customisation = {}) {
  return createSession(runtime.spec, {runtime, seed: 19, sliders: {warmth: 100, patience: 100}, customisation});
}
function step(s, actor, text, events = [], delivery = {}, runtime = context) {
  const result = applyTurn(s, actor, events, {runtime, text});
  commitDelivery(s, s.turn, {runtime, delivered: true, agreementExpressed: true, closingExpressed: true, ...delivery});
  return result.act;
}
const proposal = (route, type = "proposed_plan") => event(type, {plan: planSlots(route)});
const ack = (kind, revision = 1) => event("confirmed_next_steps", {plan_revision: revision, ack: kind});
const recap = (route, revision = 1) => event("recapped_agreement", {plan_revision: revision, plan: planSlots(route)});
function start(route = "full") {
  const s = fresh();
  assert.equal(step(s, "maya", "I own the late handover; the portal is overdue.", [event("took_ownership"), event("gave_honest_status")]), "accept_plan");
  assert.equal(step(s, "maya", route === "full" ? full : phased, [event("committed_deadline", {days: 3}), proposal(route)]), "accept_plan");
  return s;
}
function technical(s, revision = 1, route = "full") {
  step(s, "jordan", route === "full" ? "I will reserve a pair before launch." : "I will reserve Monday.", [ack("engineering", revision)]);
  step(s, "sam", "I will await save ack and verify save success, save failure and retry.", [ack("qa", revision)]);
}
function external(s, route = "full", revision = 1) {
  const words = route === "full" ? full : phased;
  step(s, "client", "Routing was unapproved.", [ack("correction", revision)]);
  step(s, "client", "I approve. " + words, [ack("approval", revision)]);
  // The existing callback outranks approval. Retry is a new utterance, not credit for the suppressed one.
  const act = step(s, "maya", "I approve. " + words, [ack("approval", revision)]);
  if (act === "callback_commitment") step(s, "maya", "I approve. " + words, [ack("approval", revision)]);
  step(s, "client", "Recap: " + words, [recap(route, revision)]);
  return step(s, "maya", "Recap: " + words, [recap(route, revision)]);
}

for (const route of ["full", "phased"]) test(`${route} closes within 20 with cross-actor delivered proof and no discovered facts`, () => {
  const s = start(route);
  technical(s, 1, route);
  assert.equal(s.goals.G2.status, "done");
  assert.deepEqual(s.goals.G2.proof.evidence.map((e) => e.actor_id), ["jordan", "sam"]);
  assert.equal(external(s, route), "close_positive");
  assert.equal(s.ended, true); assert.equal(s.endReason, "goals_complete"); assert.ok(s.turn <= 20);
  assert.equal(s.commitments.length, 1); assert.equal(s.commitments[0].target_day, 3);
  assert.equal(s.commitments[0].plan.followUp?.day ?? null, route === "full" ? null : 6);
  for (const [actor, approval] of Object.entries(s.commitments[0].plan.approvals)) {
    assert.equal(approval.actor_id, actor); assert.equal(approval.delivered, true); assert.equal(approval.revision, 1);
    assert.equal(s.events_log.find((e) => e.source_id === approval.source_id).turn_id, approval.turn_id);
  }
  assert.deepEqual(s.user_known, []); assert.ok(Object.values(s.facts).every((f) => f.status === "sealed"));
  const proof = s.goals.G3.proof;
  assert.equal(proof.revision, 1);
  assert.deepEqual(proof.evidence.map((e) => e.actor_id), ["maya", "client", "client", "maya", "client", "maya"]);
  assert.ok(proof.evidence.every((e) => e.delivered && e.revision === 1));
  assert.deepEqual(proof.prerequisite_evidence.map((e) => e.actor_id), ["jordan", "sam"]);
  const allocated = Object.values(s.goals).flatMap((g) => g.proof.source_ids);
  assert.equal(allocated.length, new Set(allocated).size);
  assert.throws(() => scoreSession(createScoreRecord(s, {turns: []}, context.spec, context.scoringProfile)), /Unsupported scenario scoring/);
});

test("strict v2 authoring and engine identity; default registry and providers remain old/unplayable", () => {
  assert.equal(validateScenario(context.spec).ok, true);
  assert.equal(defaultRegistry.getScenario("missed_deadline").spec.version, 1);
  assert.throws(() => createOfflineProviders(context), /./);
  assert.throws(() => createScenarioRegistry([context]), /./);
  const pub = JSON.stringify(publicScenario(context.spec));
  assert.ok(!pub.includes("plan_model"));
  for (const f of context.spec.facts) assert.ok(!pub.includes(f.content.en));
  for (const mutate of [s => s.plan_model.actors.qa = "maya", s => s.plan_model.followUpDay = 5,
    s => s.goals[2].done_when = ["fact_revealed:F4"], s => s.facts[2].weight = 5,
    s => s.scoring.penalties.unrealistic_commitment = 7, s => s.end.max_turns = 21,
    s => s.npcs.push(copy(s.npcs[0]))]) {
    const spec = copy(context.spec); mutate(spec); assert.equal(validateScenario(spec).ok, false);
  }
  const s = fresh(); const before = canonicalState(s);
  assert.throws(() => applyTurn(s, "maya", [], {runtime: {...context, identity: {...context.identity, contentHash: "0".repeat(64)}}}), /runtime/);
  assert.equal(canonicalState(s), before);
  assert.throws(() => applyTurn(s, "maya", [], {}), /runtime/);
  assert.equal(canonicalState(s), before);
  for (const file of ["engine.js", "config.js", "store.js"]) assert.ok(!/^import\s/m.test(readFileSync(new URL("../" + file, import.meta.url), "utf8")));
});

test("four owner facts are reachable, private before delivery, and cannot complete any goal", () => {
  const s = fresh(context, Object.fromEntries(context.spec.npcs.map((n) => [n.id, {forthcomingness: 100}])));
  for (const fact of context.spec.facts) {
    const result = applyTurn(s, fact.owner, [event(fact.triggers[0])], {runtime: context, text: fact.paraphrase_questions.en[0]});
    assert.equal(result.act, "reveal_fact:" + fact.id);
    assert.equal(s.facts[fact.id].status, "pending_delivery"); assert.ok(!s.user_known.includes(fact.id));
    commitDelivery(s, s.turn, {runtime: context, delivered: true});
    assert.equal(s.facts[fact.id].status, "revealed");
  }
  assert.deepEqual(s.user_known, ["F1", "F2", "F3", "F4"]);
  assert.ok(Object.values(s.goals).every((g) => g.status === "pending"));
  for (const row of context.replies.entries) {
    assert.ok(context.spec.npcs.some((n) => n.id === row.npc)); assert.ok(row.variants.length >= 2);
    const fact = context.spec.facts.find((f) => row.act === "reveal_fact:" + f.id);
    if (fact) assert.equal(row.npc, fact.owner);
    for (const variant of row.variants) {
      assert.ok(variant.text.length > 0 && variant.text.length <= 500);
      for (const other of context.spec.facts.filter((f) => f !== fact)) assert.ok(!variant.text.includes(other.content.en));
    }
  }
});

test("each missing phased condition or QA acknowledgement leaves readiness and agreement unearned", () => {
  const s = start(); const original = copy(s.commitments[0].plan);
  for (const key of ["followUp", "manual", "engineering", "qa"]) {
    const plan = planSlots("phased"); delete plan[key];
    step(s, "client", phased, [event("proposed_phased_delivery", {plan})]);
    assert.deepEqual(s.commitments[0].plan, original);
  }
  for (const [section, key] of [["manual", "owner"], ["manual", "instructionsOwner"], ["manual", "instructionsDueDay"], ["followUp", "day"], ["qa", "fix"], ["qa", "checks"]]) {
    const plan = planSlots("phased"); delete plan[section][key];
    step(s, "client", phased, [event("proposed_plan", {plan})]); assert.deepEqual(s.commitments[0].plan, original);
  }
  step(s, "jordan", "I reserve a pair before launch.", [ack("engineering")]);
  step(s, "client", "Routing was unapproved.", [ack("correction")]);
  step(s, "client", "I approve. " + full, [ack("approval")]);
  assert.equal(s.goals.G2.status, "pending"); assert.equal(s.goals.G3.status, "pending");
  assert.equal(s.commitments[0].plan.approvals.client, undefined);
});

test("initial proposal requires existing primary commitment; normalized slot order and aliases reuse one plan", () => {
  const s = fresh(); const before = canonicalState(s);
  assert.throws(() => applyTurn(s, "maya", [proposal("full")], {runtime: context, text: full}), /missing plan commitment/);
  assert.equal(canonicalState(s), before);
  const reorder = (v) => Array.isArray(v) ? v.map(reorder).reverse() : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, reorder(x)])) : v;
  const p = reorder(planSlots("full"));
  step(s, "maya", full, [event("proposed_scope_cut", {plan: p}), event("committed_deadline", {days: 3})]);
  step(s, "jordan", full, [proposal("full"), event("committed_deadline", {days: 3})]);
  assert.equal(s.commitments.length, 1); assert.equal(s.commitments[0].plan.revision, 1);
  assert.equal(s.commitments[0].plan.proposal_sources.length, 2);
  assert.equal(s.commitments[0].accepted_with, null);
});

test("unrealistic primary date records its existing integrity fault once without a plan or agreement", () => {
  const s = fresh();
  step(s, "maya", full, [event("committed_deadline", {days: 6}), proposal("full")]);
  assert.equal(s.commitments.length, 1); assert.equal(s.commitments[0].unrealistic, true);
  assert.equal(s.commitments[0].plan, undefined); assert.equal(s.commitments[0].accepted_with, null);
  assert.equal(s.events_log.filter((e) => e.allocation === "integrity").length, 1);
  assert.ok(Object.values(s.goals).every((g) => g.status === "pending"));
});

test("delivery, explicit acknowledgement and selected act gate every goal", () => {
  for (const delivery of [{delivered: false}, {agreementExpressed: false}]) {
    const s = fresh(); step(s, "maya", "I own it; it is late.", [event("took_ownership"), event("gave_honest_status")], delivery);
    assert.equal(s.goals.G1.status, "pending");
    step(s, "maya", full, [event("committed_deadline", {days: 3}), proposal("full")], delivery);
    assert.equal(s.commitments[0].plan.delivered, false);
    technical(s); assert.equal(s.goals.G2.status, "pending");
    assert.equal(s.goals.G3.status, "pending"); assert.equal(s.commitments[0].accepted_with, null);
  }
  const s = start();
  step(s, "jordan", "I will reserve a pair before launch.", [ack("engineering")], {delivered: false});
  step(s, "sam", "I will await save ack and verify save success, save failure and retry.", [ack("qa")]);
  assert.equal(s.goals.G2.status, "pending");
  assert.equal(s.commitments[0].plan.approvals.jordan, undefined);
  assert.deepEqual(s.user_known, []);
});

test("material revision immediately blocks old finalization, even failed delivery; canonical retries preserve immutable history", () => {
  const s = start(); technical(s);
  const proof = copy(s.goals.G2.proof);
  step(s, "client", "Routing was unapproved.", [ack("correction")]);
  step(s, "client", "I approve. " + full, [ack("approval")]);
  step(s, "maya", "I approve. " + full, [ack("approval")]);
  step(s, "maya", "I approve. " + full, [ack("approval")]);
  step(s, "client", "Recap: " + full, [recap("full")]);
  const prior = copy(s.commitments[0].plan);
  step(s, "maya", phased, [proposal("phased")], {delivered: false});
  const c = s.commitments[0];
  assert.equal(c.plan.revision, 2); assert.equal(c.plan.delivered, false);
  assert.equal(c.plan.proposal_evidence.delivered, false);
  assert.deepEqual(c.plan.approvals, {}); assert.equal(c.plan.correction, null); assert.deepEqual(c.plan.recaps, {});
  assert.deepEqual(c.plan_history[0], prior); assert.deepEqual(s.goals.G2.proof, proof);
  assert.notEqual(step(s, "maya", "Recap: " + full, [recap("full")]), "close_positive");
  step(s, "maya", phased, [proposal("phased")]);
  assert.equal(c.plan.revision, 2); assert.equal(c.plan_history.length, 1); assert.equal(c.plan.delivered, true);
  assert.deepEqual(c.plan_history[0], prior);
  // G2 is already earned, but its old approvals cannot authorize G3 on revision 2.
  step(s, "client", "I approve. " + phased, [ack("approval", 2)]);
  assert.equal(c.plan.approvals.client, undefined);
  technical(s, 2, "phased");
  assert.deepEqual(s.goals.G2.proof, proof);
  assert.equal(external(s, "phased", 2), "close_positive");
  assert.equal(s.goals.G3.proof.revision, 2); assert.ok(s.goals.G3.proof.prerequisite_evidence.every((e) => e.revision === 2));
});

test("reveal and callback suppression cannot accept a proposal or grant goals", () => {
  const s = fresh(context, {maya: {forthcomingness: 100}});
  assert.equal(step(s, "maya", full, [event("committed_deadline", {days: 3}), proposal("full"), event("asked_background")], {delivered: false}), "reveal_fact:F1");
  assert.equal(s.commitments[0].plan.delivered, false); assert.deepEqual(s.user_known, []);
  step(s, "jordan", "Hello"); step(s, "sam", "Hello");
  assert.equal(step(s, "maya", phased, [proposal("phased")]), "callback_commitment");
  assert.equal(s.commitments[0].plan.revision, 2); assert.equal(s.commitments[0].plan.delivered, false);
  assert.ok(Object.values(s.goals).every((g) => g.status === "pending"));
});

test("pressure schedule remains turn4/3 and callback gap3", () => {
  for (const [assertiveness, due] of [[50, 4], [70, 3]]) {
    const s = fresh(context, {maya: {assertiveness}});
    for (let i = 1; i <= due; i++) assert.equal(step(s, "maya", "Hello", [event("greeted")]), i === due ? "press_for_date" : i === 1 ? "greet" : "react_freely");
  }
  const s = start(); step(s, "jordan", "Hello"); step(s, "sam", "Hello");
  assert.equal(step(s, "maya", "Hello"), "callback_commitment");
  assert.equal(s.turn - s.commitments[0].turn_id, 3);
});

test("unsupported semantics, wrong authority/revision and bare recap never approve", () => {
  const s = start();
  for (const text of ["I will not reserve a pair before launch.", "I will never reserve a pair before launch.", 'He said "reserve a pair before launch".', "If I reserve a pair before launch.", "'I reserve a pair before launch.'"]) {
    step(s, "jordan", text, [ack("engineering")]); assert.equal(s.commitments[0].plan.approvals.jordan, undefined);
  }
  step(s, "sam", "I will reserve a pair before launch.", [ack("engineering")]);
  step(s, "jordan", "I will reserve a pair before launch.", [ack("engineering", 2)]);
  assert.equal(s.commitments[0].plan.approvals.jordan, undefined);
  step(s, "client", "I approve. " + full, [ack("approval")]); assert.equal(s.commitments[0].plan.approvals.client, undefined);
  step(s, "maya", "I recap.", [recap("full")]); assert.deepEqual(s.commitments[0].plan.recaps, {});
  const original = copy(s.commitments[0].plan);
  for (const [words, plan] of [["Maybe " + phased, planSlots("phased")], ["Not " + phased, planSlots("phased")],
    [phased + " Thursday.", planSlots("phased")], [full.replace("Vansh reserve", "Prathamesh reserve").replace("Prathamesh await", "Vansh await"), planSlots("full")],
    [phased.replace("Friday submission and reliable confirmation", "Friday routing and dashboard").replace("Routing and dashboard Monday", "Submission and reliable confirmation Monday"), planSlots("phased")],
    [full, {...planSlots("full"), unknown: true}],
    [full, {...planSlots("full"), primary: {day: 6, scope: ["submission"]}}]]) {
    step(s, "client", words, [event("proposed_plan", {plan})]); assert.deepEqual(s.commitments[0].plan, original);
  }
});

for (const route of ["full", "phased"]) test(`${route} technical evidence requires a complete affirmative utterance`, () => {
  const s = start(route), engineering = route === "full" ? "reserve a pair before launch" : "reserve Monday";
  const rejectedEngineering = [
    ...["refuse", "decline", "reject"].map((verb) => `I ${verb} to ${engineering}.`),
    `Vansh will ${engineering}.`, `I will ${engineering}, but I decline the reservation.`,
  ];
  for (const text of rejectedEngineering) {
    step(s, "jordan", text, [ack("engineering")]);
    assert.equal(s.commitments[0].plan.approvals.jordan, undefined, text);
    assert.equal(s.goals.G2.status, "pending", text);
  }
  step(s, "jordan", `I will ${engineering}.`, [ack("engineering")]);
  assert.equal(s.commitments[0].plan.approvals.jordan.delivered, true);
  const qa = "await save ack and verify save success, save failure and retry";
  const rejectedQa = [
    ...["refuse", "decline", "reject"].map((verb) => `I ${verb} to ${qa}.`),
    `Prathamesh will ${qa}.`, `I will ${qa}, but I reject this QA plan.`,
  ];
  for (const text of rejectedQa) {
    step(s, "sam", text, [ack("qa")]);
    assert.equal(s.commitments[0].plan.approvals.sam, undefined, text);
    assert.equal(s.goals.G2.status, "pending", text);
  }
  step(s, "sam", `I will ${qa}.`, [ack("qa")]);
  assert.equal(s.goals.G2.status, "done");
});

test("refusal, attribution and conflicting extras cannot create proposals, approvals or recaps", () => {
  const s = start(); technical(s);
  step(s, "client", "Routing was unapproved.", [ack("correction")]);
  const plan = copy(s.commitments[0].plan);
  for (const text of ["I refuse this proposal. " + phased, "I decline. " + phased, "I reject. " + phased,
    "Vansh proposed: " + phased, phased + " I reject this route."]) {
    step(s, "client", text, [proposal("phased")]); assert.deepEqual(s.commitments[0].plan, plan, text);
  }
  for (const text of ["I reject and approve. " + full, "I refuse to approve. " + full,
    "I decline to accept. " + full, "Rohan says: I approve. " + full,
    "I approve. " + full + " I reject the agreement."]) {
    step(s, "client", text, [ack("approval")]);
    assert.equal(s.commitments[0].plan.approvals.client, undefined, text);
    assert.equal(s.goals.G3.status, "pending");
  }
  // Verify recap nominations directly as well; no prerequisite state can turn
  // an uncorroborated recap into a valid nomination.
  const activePlan = {revision: 1, slots: planSlots("full")};
  for (const text of ["I refuse to recap: " + full, "Rohan says recap: " + full, "Recap: " + full + " I reject it."]) {
    assert.equal(planEvidence({text, actorId: "client", events: [{...recap("full"), sourceId: "test-recap"}], activePlan}).recap, null, text);
  }
});

test("planEvidence receives only detached readonly minimal input; invalid result rolls back entire turn", () => {
  const s = start(); const before = canonicalState(s);
  for (const hook of [input => {input.activePlan.slots.primary.day = 6;},
    () => ({proposal: null, acknowledgements: [], recap: null, secret: true}),
    () => ({proposal: {sourceId: "foreign", plan: planSlots("full")}, acknowledgements: [], recap: null}),
    input => ({proposal: null, acknowledgements: [{sourceId: input.events[0].sourceId, revision: 1, ack: "qa"}], recap: null}),
    input => ({proposal: null, acknowledgements: [0, 0].map(() => ({sourceId: input.events[0].sourceId, revision: 1, ack: "engineering"})), recap: null}),
    input => ({proposal: null, acknowledgements: input.events.map((e) => ({sourceId: e.sourceId, revision: 1, ack: "engineering"})), recap: null}),
  ]) {
    const runtime = {...context, engine: {...context.engine, planEvidence: hook}};
    assert.throws(() => applyTurn(s, "jordan", [ack("engineering"), ack("engineering")], {runtime, text: "I reserve a pair before launch."}));
    assert.equal(canonicalState(s), before);
  }
  let observed;
  const runtime = {...context, engine: {...context.engine, planEvidence: input => {observed = input; return planEvidence(input);}}};
  step(s, "jordan", "I reserve a pair before launch.", [ack("engineering")], {}, runtime);
  assert.deepEqual(Object.keys(observed).sort(), ["activePlan", "actorBindings", "actorId", "events", "publicCanon", "text", "turnId"].sort());
  assert.ok(Object.isFrozen(observed.activePlan.slots.primary.scope));
  const serialized = JSON.stringify(observed);
  for (const secret of ["facts", "user_known", "plan_history", context.spec.facts[3].content.en, "original_words"]) assert.ok(!serialized.includes(secret));
  assert.equal(s.commitments[0].plan.primary.day, 3);
  assert.ok(full.length <= 500 && phased.length <= 500 && ("Recap: " + phased).length <= 500);
});

test("final closing fallback or missing closing indicator leaves G3 pending and can retry", () => {
  const s = start(); technical(s);
  step(s, "client", "Routing was unapproved.", [ack("correction")]);
  step(s, "client", "I approve. " + full, [ack("approval")]);
  step(s, "maya", "I approve. " + full, [ack("approval")]);
  step(s, "maya", "I approve. " + full, [ack("approval")]);
  step(s, "client", "Recap: " + full, [recap("full")]);
  assert.equal(step(s, "maya", "Recap: " + full, [recap("full")], {closingExpressed: false}), "close_positive");
  assert.equal(s.goals.G3.status, "pending"); assert.equal(s.ended, false);
  assert.equal(s.commitments[0].plan.recaps.maya, undefined);
  assert.equal(step(s, "maya", "Recap: " + full, [recap("full")], {delivered: false}), "close_positive");
  assert.equal(s.goals.G3.status, "pending");
  step(s, "maya", "Recap: " + full, [recap("full")]); assert.equal(s.goals.G3.status, "done");
});
