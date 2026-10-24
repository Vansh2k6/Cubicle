import test from "node:test";
import examples from "./fixtures/deadlineV2LanguageCases.json" with {type: "json"};
import assert from "node:assert/strict";
import * as engine from "../../engine/engine.js";
import {createScenarioRegistry, defaultRegistry, publicScenario} from "../../services/api/scenarioRegistry.js";
import {deadlineV2PackageInput} from "../../services/api/deadlineV2Package.js";
import {loadDeadlineV2EngineContext} from "../../services/api/deadlineV2EngineContext.js";
import {createOfflineProviders} from "../../services/api/offlineProviders.js";
import {runTurn, createConversation} from "../pipeline.js";
import {classifyTurn, buildClassifierInput} from "../classifier.js";
import {checkReply} from "../guards.js";
import {buildNpcPrompt} from "../promptBuilder.js";
import {extractDeadlineV2, planSlots} from "../../services/api/deadlineV2EnginePolicy.js";
import {PLAN_REPLIES} from "../deadlineV2Language.js";
import {scoreSession, createScoreRecord} from "../../scoring/score.js";
import {scanRegistry, registeredPrivateNeedles} from "../../scripts/registered-private-sources.mjs";
import {privateLanguageNeedles} from "../../scripts/private-language-needles.mjs";
import {scanArtifacts} from "../../scripts/bundle-scan-core.mjs";
import {loadConfig} from "../config.js";

const pkg = createScenarioRegistry([deadlineV2PackageInput()]).getScenario("missed_deadline");
const runtime = Object.freeze({scenarioId: pkg.spec.id, schemaVersion: 2, spec: pkg.spec, identity: pkg.identity,
  policyId: pkg.policy.id, policyVersion: pkg.policy.version, language: pkg.policy.language, engine: pkg.policy.engine, rules: pkg.policy.rules});
const full = "Let's deliver submission, reliable confirmation, routing and dashboard Friday. Vansh will reserve a pair before launch. Prathamesh will await save acknowledgement and test save success, failure and retry.";
const phased = "Let's ship submission and reliable confirmation Friday. Routing and dashboard will follow Monday. Client operations will manually route; I will provide instructions Friday. Vansh will reserve capacity for Monday. Prathamesh will await save acknowledgement and test save success, failure and retry.";
const active = (route = "full") => ({revision: 1, slots: planSlots(route), proposalDelivered: true});
function fresh() {
  const offline = createOfflineProviders(pkg);
  const session = engine.createSession(pkg.spec, {runtime}), convo = createConversation();
  const turn = (npcId, text, override = {}) => runTurn({session, scenario: pkg.spec, convo, npcId, text, engine, runtime,
    store: offline.store, providers: {classify: offline.classifyProviderFor(text), npc: offline.npcProvider, ...override}});
  return {session, convo, offline, turn};
}
const provider = (events) => async () => ({text: JSON.stringify({events})});
async function classify(text, actorId, events, activePlan = null) {
  return classifyTurn({scenario: pkg.spec, runtime, provider: provider(events)}, buildClassifierInput({text, clock: {day: 0},
    planContext: {actorId, publicCanon: pkg.spec.canon.public, ownFacts: [], activePlan}}));
}

for (const route of ["full", "phased"]) test(`${route} natural conversation discovers four facts at default gates and closes in 18 turns`, async () => {
  const f = fresh();
  const first = await f.turn("maya", "I own the delay; the portal is overdue.");
  assert.equal(first.act, "accept_plan"); assert.equal(f.session.goals.G1.status, "done");
  for (const [actor, question, id] of [["maya", "What did we agree about routing?", "F1"], ["jordan", "What's left and can you help?", "F2"],
    ["sam", "What could go wrong?", "F3"], ["client", "What do you actually need Friday?", "F4"]]) {
    assert.equal((await f.turn(actor, question)).act, "deflect_sealed");
    const reveal = await f.turn(actor, question);
    assert.equal(reveal.act, "reveal_fact:" + id); assert.equal(reveal.delivered, true, JSON.stringify(reveal.trace));
    assert.ok(f.session.user_known.includes(id));
  }
  assert.equal(f.session.turn, 9);
  assert.equal((await f.turn("maya", route === "full" ? full : phased)).delivered, true);
  await f.turn("jordan", route === "full" ? "Can you reserve the pair for Friday?" : "Can you reserve capacity for Monday?");
  await f.turn("sam", "Can you await the save acknowledgement and verify save success, failure and retry?");
  assert.equal(f.session.goals.G2.status, "done");
  await f.turn("client", "I need to correct my routing promise: it was not agreed.");
  await f.turn("client", "Can you accept this plan? " + (route === "full" ? full : phased));
  assert.equal((await f.turn("maya", "Does this plan work for you? " + (route === "full" ? full : phased))).act, "callback_commitment");
  await f.turn("maya", "Please approve the current revision. " + (route === "full" ? full : phased));
  await f.turn("client", "To recap: " + (route === "full" ? full : phased));
  const closing = await f.turn("maya", "In summary: " + (route === "full" ? full : phased));
  assert.equal(closing.act, "close_positive"); assert.equal(closing.delivered, true, JSON.stringify(closing.trace));
  assert.equal(f.session.turn, 18); assert.equal(f.session.endReason, "goals_complete");
  assert.equal(f.session.commitments.length, 1); assert.equal(f.session.commitments[0].target_day, 3);
  assert.equal(scoreSession(createScoreRecord(f.session, f.convo, pkg.spec, pkg.scoringProfile)).metrics.goals.points, 30);
});

test("versioned NOT-RUN live cases have five or more natural positives for every changed interpretation", async () => {
  assert.equal(examples.live_eval_status, "NOT RUN");
  const counts = new Map();
  for (const row of examples.cases) {
    const result = await classify(row.text, row.actorId, [{type: row.event}], row.activeRoute ? active(row.activeRoute) : null);
    const event = result.events.find((e) => e.type === row.event);
    assert.ok(event, row.id + ": " + row.text);
    if (row.expectedAck) assert.equal(event.params.ack, row.expectedAck, row.id);
    if (row.expectedPlanRoute && event.params.plan) assert.equal(event.params.plan.route, row.expectedPlanRoute, row.id);
    if (row.event === "committed_deadline") assert.equal(event.params.day, 3, row.id);
    counts.set(row.event, (counts.get(row.event) || 0) + 1);
  }
  assert.equal(counts.size, 11); // Six wire types plus five broadened inquiries.
  assert.ok([...counts.values()].every((count) => count >= 5));
});

test("unsupported plans/refusals/attribution/conflicting dates and scope fail closed through classifier", async () => {
  for (const text of ["I refuse to reserve the pair for Friday.", "Vansh said he will reserve the pair for Friday.",
    "Can you reserve the pair for Friday, but I reject the reservation?", "Maybe this plan works?", "I reject and approve this plan.",
    full + " I reject it.", full.replace("Friday", "Thursday"), phased.replace("Monday", "Tuesday"), phased.replace("Client operations will manually route;", "")]) {
    const result = await classify(text, "jordan", [{type: "confirmed_next_steps", params: {ack: "engineering", plan_revision: 1}}, {type: "proposed_plan", params: {plan: planSlots("full")}}], active());
    assert.deepEqual(result.events, [], text);
  }
  const date = runtime.language.normalizeCommitment({text: phased, planContext: {actorId: "maya"}});
  assert.deepEqual(date, {day: 3, clarification: null});
  assert.equal((await classify("Can you reserve the pair for Friday?", "sam", [{type: "confirmed_next_steps"}], active())).events.length, 0);
  assert.equal((await classify("Can you accept this plan?", "client", [{type: "confirmed_next_steps"}], active())).events.length, 0);
  assert.ok(("Can you accept this plan? " + phased).length <= 500);
});

test("all four authorized owner reveals pass; foreign appended secrets and wrong-owner reveals fail", () => {
  for (const fact of pkg.spec.facts) {
    const ctx = {scenario: pkg.spec, runtime, npcId: fact.owner, act: "reveal_fact:" + fact.id,
      authorised: {factId: fact.id, owner: fact.owner, act: "reveal_fact:" + fact.id}};
    assert.equal(checkReply(fact.content.en, ctx).ok, true, fact.id);
    for (const other of pkg.spec.facts.filter((f) => f.id !== fact.id)) assert.equal(checkReply(fact.content.en + " " + other.content.en, ctx).ok, false, fact.id + "/" + other.id);
    assert.equal(checkReply(fact.content.en, {...ctx, npcId: fact.owner === "maya" ? "client" : "maya"}).ok, false);
    assert.equal(checkReply(fact.content.en, {...ctx, authorised: null, act: "react_freely"}).ok, false);
  }
  const safePublic = "The package covers submission, reliable confirmation, automatic routing, and dashboard.";
  assert.equal(checkReply(safePublic, {scenario: pkg.spec, runtime, npcId: "client", act: "react_freely"}).ok, true);
  assert.equal(checkReply(safePublic + " I asked about the dashboard because I thought submission and confirmation were already done.", {scenario: pkg.spec, runtime, npcId: "client", act: "react_freely"}).ok, false);
});

test("selected acknowledgements are guarded; friendly replies/provider fallback cannot create credit", async () => {
  const f = fresh();
  const fail = async () => ({text: "Nice to hear from you."});
  const result = await f.turn("maya", "I own the delay; the portal is overdue.", {npc: fail});
  assert.equal(result.usedFallback, true); assert.equal(result.delivered, false); assert.equal(f.session.goals.G1.status, "pending");
  await f.turn("maya", full, {npc: async () => {throw {code: "PROVIDER_ERROR"};}});
  assert.equal(f.session.commitments[0].plan.delivered, false); assert.equal(f.session.commitments[0].accepted_with, null);
  assert.deepEqual(f.session.user_known, []);
  const ctx = {scenario: pkg.spec, runtime, npcId: "client", act: "react_freely", planDelivery: {expectedReply: PLAN_REPLIES.approval, actorId: "client", turnId: 1, revision: 1}};
  assert.equal(checkReply(PLAN_REPLIES.approval, ctx).ok, false);
  assert.equal(checkReply(PLAN_REPLIES.approval, {...ctx, act: "accept_plan", npcId: "maya"}).ok, false);
});

test("grounded public/own-known paraphrases and ordinary reactions are supported without secret guesses", () => {
  const ctx = {scenario: pkg.spec, runtime, npcId: "client", act: "react_freely"};
  for (const text of ["I hear you. Let's take this step by step.", "That sounds frustrating. What would you like to clarify?",
    "Hi, thanks for reaching out. How can I help with the portal today?",
    "It makes sense to feel uneasy about a difficult conversation. We can talk through your concerns together.",
    "The public launch remains on Friday.", "The public scope includes dashboard, routing, submission and reliable confirmation.",
    "The handover remains overdue. Thanks for explaining."]) assert.equal(checkReply(text, ctx).ok, true, text);
  const paraphrases = ["Routing was only a suggestion and was never agreed.", "Only submission and storage are reusable.",
    "The success message may appear before save acknowledgement.", "I requested the dashboard because I assumed submission and confirmation were already finished."];
  for (let i = 0; i < paraphrases.length; i++) {
    const fact = pkg.spec.facts[i], own = {...ctx, npcId: fact.owner, revealedIds: [fact.id]};
    assert.equal(checkReply(paraphrases[i], own).ok, true, paraphrases[i]);
    assert.equal(checkReply(paraphrases[i], {...own, revealedIds: []}).ok, false, paraphrases[i]);
  }
  for (const text of ["The implementation is already complete.", "Routing was agreed.", "The launch is Thursday.",
    "The package includes a new analytics dashboard.", "I accept your plan."]) assert.equal(checkReply(text, ctx).ok, false, text);
});

test("natural generated acknowledgements remain bound to the current actor, move and revision", async () => {
  const f = fresh();
  const replies = {ownership: "Thanks for owning the delay and explaining where things stand.", proposal: "I understand your proposal.",
    engineering: "I will set aside the requested pair for this revision.", qa: "I agree to the proposed fix and checks.",
    correction: "Thank you for correcting the earlier promise.", approval: "This plan works for me.",
    recap: "Your summary matches the plan I approved.", closing: "We have agreed on this revision."};
  const naturalNpc = async ({system}) => {
    const marker = /\nENGINE-SELECTED PLAN MOVE: ([^\n]+)/.exec(system);
    if (!marker) return f.offline.npcProvider({system});
    const selected = JSON.parse(marker[1]);
    const kind = selected.closing ? "closing" : selected.ownership ? "ownership" : selected.proposal ? "proposal" : selected.acknowledgement[0] || "recap";
    return {text: replies[kind] + " Let's take this step by step."};
  };
  const turn = (actor, text) => f.turn(actor, text, {npc: naturalNpc});
  assert.equal((await turn("maya", "I own the delay; the portal is overdue.")).delivered, true);
  await turn("maya", full);
  await turn("jordan", "Can you reserve the pair for Friday?");
  await turn("sam", "Please await the save acknowledgement and verify save success, failure and retry.");
  await turn("client", "I promised routing without agreement.");
  await turn("client", "Please approve the current revision. " + full);
  await turn("maya", "Please accept this plan. " + full); // callback suppresses nomination
  await turn("maya", "Does this plan work for you? " + full);
  await turn("client", "Let me recap: " + full);
  const closing = await turn("maya", "To summarize: " + full);
  assert.equal(closing.delivered, true, JSON.stringify(closing.trace)); assert.equal(f.session.endReason, "goals_complete");
  assert.deepEqual(f.session.user_known, []); assert.ok(Object.values(f.session.facts).every((fact) => fact.status === "sealed"));
  assert.equal(f.session.turn, 10);
  for (const [actor, request] of [["client", "Please approve the current revision. " + full], ["maya", "Does this plan work for you? " + full]]) {
    const row = f.convo.turns.find((t) => t.speaker === "user" && t.npcId === actor && t.text === request);
    assert.ok(row, "material plan was explicitly told to " + actor);
  }
});

test("new material approval request revises immediately and failed generation cannot revive old consent", async () => {
  const f = fresh();
  await f.turn("maya", full);
  await f.turn("jordan", "Can you reserve the pair for Friday?");
  await f.turn("sam", "Please await the save acknowledgement and verify save success, failure and retry.");
  const original = structuredClone(f.session.goals.G2.proof);
  const result = await f.turn("client", "Can you accept this plan? " + phased, {npc: async () => {throw {code: "PROVIDER_ERROR"};}});
  const plan = f.session.commitments[0].plan;
  assert.equal(plan.revision, 2); assert.equal(plan.delivered, false); assert.deepEqual(plan.approvals, {});
  assert.equal(result.delivered, false); assert.equal(f.session.goals.G3.status, "pending");
  assert.deepEqual(f.session.goals.G2.proof, original);
});

test("v2 relays corroborate known facts, distinguish false/uncertain claims and never discover a fact", async () => {
  const f = fresh();
  const accurate = "Vansh said only submission and storage are reusable.";
  const inaccurate = "Vansh said nothing is reusable.";
  const uncertain = "Maybe Vansh said nothing is reusable.";
  await f.turn("maya", inaccurate);
  assert.ok(!f.session.events_log.some((e) => e.type === "relayed_fact" && e.validated));
  assert.deepEqual(f.session.user_known, []);
  await f.turn("jordan", "What can we reuse?"); await f.turn("jordan", "What can we reuse?");
  assert.deepEqual(f.session.user_known, ["F2"]);
  await f.turn("maya", accurate);
  const accurateRow = f.session.events_log.filter((e) => e.type === "relayed_fact" && e.validated).pop();
  assert.equal(accurateRow.params.accurate, true); assert.equal(accurateRow.allocation, "none");
  const before = f.session.events_log.filter((e) => e.allocation === "integrity").length;
  await f.turn("maya", uncertain);
  assert.equal(f.session.events_log.filter((e) => e.allocation === "integrity").length, before);
  // A duplicated classifier nomination within one utterance remains one fault.
  await f.turn("maya", inaccurate, {classify: provider([{type: "relayed_fact", params: {fact_id: "F2", accurate: false}}, {type: "relayed_fact", params: {fact_id: "F2", accurate: false}}])});
  assert.equal(f.session.events_log.filter((e) => e.allocation === "integrity").length, before + 1);
  assert.deepEqual(f.session.user_known, ["F2"]);
  assert.equal(f.session.goals.G2.status, "pending"); assert.equal(f.session.goals.G3.status, "pending");
  assert.equal(extractDeadlineV2({text: "Vansh said half the module is done.", actorId: "maya"}).events.length, 0);
});

test("registry identity uses one recipe, stays unpublished by default, and rejects forged hooks/offline identities", () => {
  assert.deepEqual(loadDeadlineV2EngineContext().identity, pkg.identity);
  assert.equal(defaultRegistry.getScenario("deadline").spec.version, 1);
  assert.equal(defaultRegistry.listScenarios()[0].npcs.length, 3);
  for (const mutate of [p => p.policy = {...p.policy, id: "unknown"}, p => p.policy = {...p.policy, language: {...p.policy.language}},
    p => p.policy = {...p.policy, offline: {classifyEvents: () => []}}, p => p.spec.npcs[0].role = "Changed",
    p => p.privateProof = true]) {
    const input = deadlineV2PackageInput(); mutate(input); assert.throws(() => createScenarioRegistry([input]));
  }
  assert.throws(() => createOfflineProviders({...pkg, identity: {...pkg.identity, contentHash: "0".repeat(64)}}), /unsupported/);
  assert.throws(() => createOfflineProviders(pkg, {locale: "fr"}), /unsupported/);
  const serialized = JSON.stringify(publicScenario(pkg));
  for (const value of ["plan_model", "planEvidence", "contentHash", "policy", pkg.spec.facts[3].content.en]) assert.ok(!serialized.includes(value));
});

test("classifier/NPC context contains no other transcript, sealed facts, private model or proof", async () => {
  const f = fresh(); let captured;
  await f.turn("jordan", "Hello.");
  await f.turn("client", "Hello.", {classify: async (request) => {captured = request; return {text: '{"events":[]}'};}});
  const input = JSON.parse(captured.messages[0].content), text = JSON.stringify(input);
  assert.equal(input.plan_context.actorId, "client"); assert.deepEqual(input.plan_context.ownFacts, []);
  assert.ok(!input.recent_turns.some((turn) => turn.text.includes("Jordan")));
  for (const banned of ["plan_model", "source_id", "approvals", "proof", ...pkg.spec.facts.map((fact) => fact.content.en)]) assert.ok(!text.includes(banned));
  const prompt = buildNpcPrompt({scenario: pkg.spec, runtime, npcId: "client", act: "react_freely"});
  for (const fact of pkg.spec.facts) assert.ok(!prompt.system.includes(fact.content.en));
  assert.equal(runtime.language.canonCheck({text: "The implementation is already complete.", act: "coach"})[0].code, "canon_unverified_claim");
});

test("provenance and synthetic source scans include unpublished v2 without publishing duplicate ids", () => {
  assert.equal(loadConfig({}).classifier.promptVersion, "v4"); assert.equal(loadConfig({}).npc.promptVersion, "v5");
  assert.equal(loadConfig({}).classifier.schemaVersion, 1); assert.equal(loadConfig({}).judge.promptVersion, "v2");
  assert.equal(scanRegistry.listScenarios().length, 1); assert.equal(scanRegistry.allPackages().length, 4);
  const needles = new Map([...registeredPrivateNeedles(scanRegistry), ...privateLanguageNeedles]);
  for (const text of ["deadline-v2", "ENGINE-BOUND PLAN REPLY", pkg.spec.facts[3].content.en, PLAN_REPLIES.qa]) assert.ok(scanArtifacts([{file: "synthetic.js", text}], needles).length > 0, text);
});
