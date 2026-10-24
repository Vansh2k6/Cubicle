import test from "node:test";
import assert from "node:assert/strict";
import * as engine from "../../engine/sc01Compatibility.js";
import { runBot, scenario } from "../../evals/scriptedBot.mjs";
import { smart, trap, ev } from "../../evals/scriptedPaths.mjs";

test("synthetic smart full pipeline completes goals with delivered F1/F2", async () => {
  const { session, results } = await runBot(smart);
  assert.equal(session.endReason, "goals_complete");
  assert.deepEqual(session.user_known.sort(), ["F1", "F2"]);
  assert.equal(session.commitments.at(-1).accepted_with, "maya");
  assert.equal(session.events_log.filter((e) => e.allocation === "integrity").length, 0);
  for (const r of results) assert.deepEqual(Object.keys(r.public).sort(), ["npc_reply", "public_state", "ended", "end_reason", "turn_id", "speech", "reply_source"].sort());
});
test("trap callback defers to Maya and never discloses private cutoff", async () => {
  const { session, results } = await runBot(trap);
  assert.equal(results.at(-1).act, "callback_commitment");
  assert.ok(results.slice(1, 4).every((r) => r.act !== "callback_commitment"));
  assert.ok(!/friday|cutoff|three days|3 days/i.test(results.at(-1).reply));
  assert.deepEqual(session.user_known, []);
  assert.equal(session.events_log.filter((e) => e.allocation === "integrity").length, 1);
});
test("relay evidence matrix is conservative and duplicate sources do not penalize twice", async () => {
  for (const [text, known, proposed, expected] of [
    ["Jordan built a module covering half the remaining work.", true, true, "none"],
    ["Jordan built a module covering all the remaining work.", true, false, "integrity"],
    ["Hello.", true, false, "none"],
    ["Jordan built a module covering all the remaining work.", false, false, "none"],
    ["Maybe Jordan built a module covering all the remaining work?", true, false, "none"],
    ["Jordan built a module covering half the remaining work.", true, false, "none"],
  ]) {
    const session = engine.createSession(scenario, { seed: 4 });
    if (known) { session.user_known.push("F2"); session.facts.F2.status = "revealed"; }
    const mood = session.npcs.maya.mood;
    const event = ev("relayed_fact", { fact_id: "F2", accurate: proposed });
    await runBot([["maya", text, [event, event]]], { session });
    const penalties = session.events_log.filter((e) => e.allocation === "integrity");
    assert.equal(penalties.length, expected === "integrity" ? 1 : 0);
    assert.equal(session.npcs.maya.mood, mood);
  }
});
test("B2 timing, guess confirmation guard, walkout and max turns", async () => {
  for (const [assertiveness, expected] of [[50, 4], [90, 3]]) {
    const { results } = await runBot(Array.from({ length: expected }, () => ["maya", "Hello.", []]), { sliders: { assertiveness } });
    assert.equal(results.at(-1).act, "press_for_date");
  }
  const guessed = await runBot([["maya", "Friday?", []]], { npc: async () => ({ text: "Yes, Friday is the cutoff." }) });
  assert.deepEqual(guessed.session.user_known, []);
  assert.ok(!/friday|cutoff/i.test(guessed.results[0].reply));
  const maximum = await runBot(Array.from({ length: 20 }, () => ["jordan", "Hello.", []]));
  assert.equal(maximum.session.endReason, "max_turns");
  const walkout = await runBot(Array.from({ length: 8 }, () => ["maya", "Whatever.", [ev("avoided_question")]]), { sliders: { patience: 0 } });
  assert.equal(walkout.session.endReason, "walkout");
});
test("failed guarded agreement and recap cannot complete session", async () => {
  const { session } = await runBot(smart.slice(0, 8));
  const c = engine.applyTurn(session, "maya", [ev("committed_deadline", { day: 2 })]);
  assert.equal(session.commitments.at(-1).accepted_with, null);
  engine.commitDelivery(session, session.turn, { delivered: false });
  assert.equal(session.commitments.at(-1).accepted_with, null);
  assert.equal(session.ended, false);
  engine.applyTurn(session, "maya", [ev("committed_deadline", { day: 2 })]);
  engine.commitDelivery(session, session.turn, { delivered: true, agreementExpressed: true, closingExpressed: true });
  engine.applyTurn(session, "maya", [ev("recapped_agreement")]);
  assert.equal(session.ended, false);
  engine.commitDelivery(session, session.turn, { delivered: false });
  assert.equal(session.goals.G3.status, "pending");
  assert.equal(session.ended, false);
});

test("revision requires a new guarded recap; optional Sam fact is delivered", async () => {
  const { session } = await runBot(smart.slice(0, 8));
  const out = await runBot([
    ["maya", "I will deliver tomorrow.", [ev("committed_deadline", { day: 1 })]],
    ["maya", "I revise that: I will deliver Friday.", [ev("committed_deadline", { day: 3 })]],
    ["maya", "To recap I will deliver Friday.", [ev("recapped_agreement")]],
  ], { session });
  assert.equal(out.session.commitments[0].status, "superseded");
  assert.equal(out.session.commitments[1].supersedes, "C1");
  assert.equal(out.session.endReason, "goals_complete");
  assert.equal(out.session.events_log.filter((e) => e.allocation === "integrity").length, 1);
  const sam = await runBot([["sam", "Any advice?", [ev("asked_advice")]], ["sam", "What advice do you have?", [ev("asked_advice")]]]);
  assert.deepEqual(sam.session.user_known, ["F3"]);
});

test("neutral acceptance and higher-priority recap replies cannot finalize outcomes", async () => {
  const { session } = await runBot(smart.slice(0, 8));
  await runBot([["maya", "I will deliver Thursday.", [ev("committed_deadline", { day: 2 })]]], { session, npc: async () => ({ text: "I hear you." }) });
  assert.equal(session.commitments.at(-1).accepted_with, null);
  await runBot([["maya", "I will deliver Thursday.", [ev("committed_deadline", { day: 2 })]]], { session });
  await runBot([["maya", "To recap I will deliver Thursday. Why urgent?", [ev("recapped_agreement"), ev("asked_why_urgent")]]], { session });
  assert.equal(session.goals.G3.status, "pending");
  assert.equal(session.ended, false);
});
test("early recap cannot later complete on Jordan's requirement turn", async () => {
  const session = engine.createSession(scenario, { seed: 3 });
  await runBot([
    ["maya", "I will deliver Friday.", [ev("committed_deadline", { day: 3 })]],
    ["maya", "To recap I will deliver Friday.", [ev("recapped_agreement")]],
    ["maya", "I own the delay and report honestly.", [ev("took_ownership"), ev("gave_honest_status")]],
    ["jordan", "What is left?", [ev("asked_requirement_details")]],
  ], { session });
  assert.equal(session.goals.G3.status, "pending");
  assert.equal(session.ended, false);
});
test("negated or mixed relay statements never create a false penalty", async () => {
  for (const [fact, text] of [["F2", "Jordan built a module covering half, not all the remaining work."], ["F1", "The deadline is not tomorrow; it is Friday."]]) {
    const session = engine.createSession(scenario, { seed: 9 });
    session.user_known.push(fact); session.facts[fact].status = "revealed";
    await runBot([["maya", text, [ev("relayed_fact", { fact_id: fact, accurate: false })]]], { session });
    assert.equal(session.events_log.filter((e) => e.allocation === "integrity").length, 0);
  }
});

test("discovery with another NPC does not authorize unrelayed confirmation", async () => {
  for (const fact of ["F2", "F3"]) {
    const owner = scenario.facts.find((f) => f.id === fact).owner;
    const trigger = fact === "F2" ? "asked_for_help" : "asked_advice";
    const { session } = await runBot([[owner, "Could you explain?", [ev(trigger)]], [owner, "Please explain more.", [ev(trigger)]]]);
    assert.ok(session.user_known.includes(fact));
    const sealed = scenario.facts.find((f) => f.id === fact).content.en;
    const x = await runBot([["maya", "Hello.", []]], { session, npc: async () => ({ text: sealed }) });
    assert.ok(!x.results[0].reply.includes(sealed));
    assert.equal(x.results[0].usedFallback, true);
  }
});

test("unrealistic and nonauthority promises never authorize acceptance", async () => {
  for (const [who, day, word] of [["maya", 1, "tomorrow"], ["jordan", 3, "Friday"]]) {
    const result = await runBot([[who, `I will deliver ${word}.`, [ev("committed_deadline", { day })]]]);
    assert.equal(result.session.commitments[0].accepted_with, null);
    assert.ok(!/that plan works for me/i.test(result.results[0].reply));
  }
});
test("mixed subjects with both half and all remaining work cannot penalize a relay", async () => {
  const session = engine.createSession(scenario, { seed: 9 });
  session.user_known.push("F2"); session.facts.F2.status = "revealed";
  await runBot([["maya", "Jordan built a module covering half the remaining work. I will finish all the remaining work.", [ev("relayed_fact", { fact_id: "F2", accurate: false })]]], { session });
  assert.equal(session.events_log.filter((e) => e.allocation === "integrity").length, 0);
});

test("Jordan-only promises never become Maya callbacks", async () => {
  const result = await runBot([
    ["jordan", "I will deliver Friday.", [ev("committed_deadline", { day: 3 })]],
    ["jordan", "Hello.", []], ["jordan", "Thanks.", []], ["maya", "Hello.", []],
  ]);
  assert.notEqual(result.results.at(-1).act, "callback_commitment");
  assert.ok(!/promise earlier/i.test(result.results.at(-1).reply));
});
