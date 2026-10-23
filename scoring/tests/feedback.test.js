import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateQuote } from "../quotes.js";
import { judgeSession, DIMENSIONS } from "../judge.js";
import { coachSession } from "../coach.js";
import { endSession } from "../../engine/engine.js";
import { FakeProvider } from "../../llm/fakeProvider.js";
import { runBot, scenario } from "../../evals/scriptedBot.mjs";
import { smart, trap, ev } from "../../evals/scriptedPaths.mjs";
import { createScenarioRegistry, defaultRegistry } from "../../services/api/scenarioRegistry.js";
const fixtures = JSON.parse(readFileSync(new URL("../../evals/fixtures/s1-07-synthetic-sessions.json", import.meta.url), "utf8")).paths;
const finish = (record) => { endSession(record.session); return record; };
for (const record of Object.values(fixtures)) finish(record);
const manifest = { id: "synthetic-s1-09" };
const judged = (quote = fixtures.smart.convo.turns[0].text, turn_id = 1) => ({ dimensions: DIMENSIONS.map((id) => ({ id, score: 5, turn_id, quote, explanation: "Specific wording supports this quality assessment." })) });
const coached = (quote = fixtures.trap.convo.turns[0].text, turn_id = 1) => ({ turn_id, quote, what_went_well: "You stated a clear intention.", what_happened: "This moment could benefit from clarification.", why_it_matters: "A question can help you understand what is needed.", better_reply: "What should I understand before proposing a next step?" });
test("quote normalization verifies user-only evidence with documented substring boundaries", () => {
  const turns = [{ id: 1, speaker: "user", text: 'I own “this” — and\n  will check.' }, { id: 2, speaker: "npc", text: "NPC only." }];
  for (const [id, quote, valid] of [[1, 'i OWN "this" - and will', true], [1, "own", true], [1, "his", true], [1, "invented", false], [2, "NPC only", false], [3, "own", false], [1, "", false], [null, "own", false]]) assert.equal(validateQuote(turns, id, quote), valid);
});
test("judge enforces exact unique dimensions, integer range and nullable score inside two calls", async () => {
  const variants = [
    (d) => { d.dimensions[0].score = 6; },
    (d) => { d.dimensions[0].score = -1; },
    (d) => { d.dimensions[0].score = 2.5; },
    (d) => { d.dimensions[1].id = d.dimensions[0].id; },
    (d) => { d.dimensions.pop(); },
    (d) => { d.dimensions[0].id = "clarity"; },
    (d) => { d.dimensions[0].quote = 4; },
  ];
  for (const change of variants) {
    const data = judged(); change(data);
    const fake = new FakeProvider([{ json: data }, { json: data }]);
    const result = await judgeSession({ record: fixtures.smart, scenario, provider: fake.fn(), manifest });
    assert.equal(result.points, 0); assert.equal(fake.callCount, 2);
    assert.ok(result.dimensions.every((d) => d.status === "insufficient"));
  }
  const data = judged(); data.dimensions[0].score = null;
  const result = await judgeSession({ record: fixtures.smart, scenario, provider: new FakeProvider([{ json: data }]).fn(), manifest });
  assert.equal(result.points, 20); assert.equal(result.dimensions[0].points, 0);
});
test("judge verifies each quote independently, keeps deterministic separate, and marks provenance", async () => {
  const data = judged(); data.dimensions[0].quote = "not in the transcript"; data.dimensions[1].turn_id = 2;
  const fake = new FakeProvider([{ json: data }]);
  const result = await judgeSession({ record: fixtures.smart, scenario, provider: fake.fn(), manifest });
  assert.equal(result.points, 15); assert.equal(result.deterministic, 60);
  assert.equal(fake.calls[0].temperature, 0);
  assert.ok(result.dimensions.every((d) => d.manifestId === manifest.id));
});
test("judge prompt contains quality exclusions and fairness, receives no scenario sealed text", async () => {
  let request;
  await judgeSession({ record: fixtures.trap, scenario, provider: async (args) => { request = args; return { text: JSON.stringify(judged(fixtures.trap.convo.turns[0].text)) }; }, manifest });
  assert.match(request.system, /No reward for length, accent, speed, filler words, or grammar polish/);
  const input = JSON.parse(request.messages[0].content);
  assert.ok(input.already_scored_elsewhere_do_not_reward.some((r) => r.metric === "integrity"));
  for (const fact of scenario.facts) assert.ok(!request.messages[0].content.includes(fact.content.en));
});
test("judge malformed/outage/personal labels fall back without fabricated evidence", async () => {
  for (const script of [[{ malformed: true }, { malformed: true }], [{ providerError: true }, { providerError: true }]]) {
    const fake = new FakeProvider(script);
    const result = await judgeSession({ record: fixtures.smart, scenario, provider: fake.fn(), manifest });
    assert.equal(result.points, 0); assert.equal(fake.callCount, 2);
  }
  const data = judged(); data.dimensions[0].explanation = "You are lazy.";
  const result = await judgeSession({ record: fixtures.smart, scenario, provider: new FakeProvider([{ json: data }]).fn(), manifest });
  assert.equal(result.dimensions[0].status, "insufficient");
});
test("coach uses only historical transcript and regenerates secret replies once then authored fallback", async () => {
  let calls = 0;
  const result = await coachSession({ record: fixtures.trap, scenario, manifest, provider: async (args) => {
    calls++; const input = JSON.parse(args.messages[0].content);
    assert.equal(input.transcript.length, 1); assert.deepEqual(input.user_known, []);
    assert.equal(input.original_user_turn.id, 1);
    const data = coached(); data.better_reply = scenario.facts[0].content.en;
    return { text: JSON.stringify(data) };
  } });
  assert.equal(calls, 2);
  assert.equal(result.moments[0].better_reply, scenario.facts[0].unlock_question.en);
  assert.equal(result.moments[0].quote, fixtures.trap.convo.turns[0].text);
  assert.equal(result.moments[0].source, "fallback");
});
test("coach supports valid output and rejects fabricated quotes and personal labels within shared retry budget", async () => {
  for (const modify of [(d) => d, (d) => { d.quote = "fabricated quote"; }, (d) => { d.what_happened = "You are incompetent."; }]) {
    const data = coached(); modify(data);
    const fake = new FakeProvider([{ json: data }, { json: data }]);
    const result = await coachSession({ record: fixtures.trap, scenario, provider: fake.fn(), manifest });
    assert.ok(result.moments.length >= 1); assert.ok(fake.callCount <= 2);
    assert.equal(result.moments[0].manifestId, manifest.id);
    assert.ok(!/incompetent/.test(JSON.stringify(result)));
  }
});
test("coach fallback for empty transcript is a general starter without invented quote", async () => {
  const record = await runBot([]);
  const fake = new FakeProvider([]);
  const result = await coachSession({ record: finish(record), scenario, provider: fake.fn(), manifest });
  assert.equal(fake.callCount, 0); assert.equal(result.moments[0].general, true);
  assert.equal(result.moments[0].quote, null); assert.equal(result.moments[0].turn_id, null);
  assert.ok(result.moments[0].better_reply.length > 0);
});

test("coach excludes F1 revealed in the NPC response to the exact flagged user turn", async () => {
  const record = await runBot([["maya", "What is the impact? I suggest we discuss this constructively.", [ev("asked_impact"), ev("pushed_back_constructively")]]], { sliders: { forthcomingness: 100 } });
  assert.ok(record.session.user_known.includes("F1"));
  let calls = 0;
  const result = await coachSession({ record: finish(record), scenario, manifest, provider: async (args) => {
    calls++; const input = JSON.parse(args.messages[0].content);
    assert.deepEqual(input.user_known, []);
    assert.ok(input.transcript.every((t) => t.speaker === "user"));
    assert.ok(!args.messages[0].content.includes(scenario.facts[0].content.en));
    const data = coached(record.convo.turns[0].text); data.better_reply = "The cutoff is Friday, three days away.";
    return { text: JSON.stringify(data) };
  } });
  assert.equal(calls, 2); assert.equal(result.moments[0].source, "fallback");
  assert.ok(!/friday|cutoff|three days/i.test(result.moments[0].better_reply));
});
test("coach prior snapshot knowledge is included but future transcript is excluded", async () => {
  const record = await runBot([
    ["maya", "What is the impact?", [ev("asked_impact")]],
    ["maya", "I suggest we discuss this constructively.", [ev("pushed_back_constructively")]],
    ["jordan", "FUTURE USER LINE", []],
  ], { sliders: { forthcomingness: 100 } });
  let inspected = false;
  const result = await coachSession({ record: finish(record), scenario, manifest, provider: async (args) => {
    inspected = true; const input = JSON.parse(args.messages[0].content);
    assert.ok(input.user_known.some((f) => f.id === "F1"));
    assert.ok(!args.messages[0].content.includes("FUTURE USER LINE"));
    return { text: JSON.stringify(coached(record.convo.turns[2].text, 3)) };
  } });
  assert.equal(inspected, true); assert.equal(result.moments[0].source, "llm");
});
test("schema failure and unsafe regeneration share coach's two-call budget", async () => {
  let calls = 0;
  const result = await coachSession({ record: fixtures.trap, scenario, manifest, provider: async () => {
    calls++; if (calls === 1) return { text: "not JSON" };
    const data = coached(); data.better_reply = scenario.facts[0].content.en;
    return { text: JSON.stringify(data) };
  } });
  assert.equal(calls, 2); assert.equal(result.moments[0].source, "fallback");
  const terminal = new FakeProvider([{ timeout: true }, { timeout: true }]);
  const fallback = await coachSession({ record: fixtures.trap, scenario, manifest, provider: terminal.fn() });
  assert.equal(terminal.callCount, 2); assert.equal(fallback.moments[0].source, "fallback");
});
test("all-null judge is zero and unknown turn quotes never award points", async () => {
  for (const mutate of [(d) => d.dimensions.forEach((x) => { x.score = null; x.turn_id = null; x.quote = ""; }), (d) => d.dimensions.forEach((x) => { x.turn_id = 9999; })]) {
    const data = judged(); mutate(data);
    const result = await judgeSession({ record: fixtures.smart, scenario, provider: new FakeProvider([{ json: data }]).fn(), manifest });
    assert.equal(result.points, 0);
  }
});
test("judge and coach prompt versions are v2 in role configuration", async () => {
  const { loadConfig } = await import("../../llm/config.js");
  assert.equal(loadConfig({}).judge.promptVersion, "v2"); assert.equal(loadConfig({}).coach.promptVersion, "v2");
});

test("coach chooses matching owner question and guards authored fallbacks", async () => {
  const sam = await runBot([["sam", "Hello.", []]]);
  const failed = new FakeProvider([{ malformed: true }, { malformed: true }]);
  const samResult = await coachSession({ record: finish(sam), scenario, provider: failed.fn(), manifest });
  assert.equal(samResult.moments[0].better_reply, scenario.facts.find((f) => f.id === "F3").unlock_question.en);
  const altered = structuredClone(scenario);
  altered.facts.find((f) => f.id === "F3").unlock_question.en = "The client cutoff is Friday.";
  const pkg = createScenarioRegistry([{ ...defaultRegistry.getScenario("missed_deadline"), spec: altered }]).getScenario("missed_deadline");
  const alteredRecord = structuredClone(finish(sam));
  alteredRecord.scenario = pkg.spec; alteredRecord.identity = alteredRecord.session.identity = pkg.identity;
  const guarded = await coachSession({ record: alteredRecord, scenario: pkg.spec, provider: new FakeProvider([{ malformed: true }, { malformed: true }]).fn(), manifest });
  assert.ok(!/cutoff|friday/i.test(guarded.moments[0].better_reply));
});

test("judge/coach schema v2, strict output shape and terminal failure provenance", async () => {
  const { loadConfig } = await import("../../llm/config.js");
  assert.equal(loadConfig({}).judge.schemaVersion, 2); assert.equal(loadConfig({}).coach.schemaVersion, 2);
  const invalid = coached(); invalid.extra = "unexpected";
  const fake = new FakeProvider([{ json: invalid }, { json: invalid }]);
  const result = await coachSession({ record: fixtures.trap, scenario, provider: fake.fn(), manifest });
  assert.equal(fake.callCount, 2); assert.equal(result.moments[0].source, "fallback");
  let calls = 0;
  const terminal = await judgeSession({ record: fixtures.trap, scenario, manifest, provider: async () => {
    calls++; throw { code: "LLM_BUDGET_EXCEEDED", retryable: false };
  } });
  assert.equal(calls, 1); assert.equal(terminal.source, "fallback");
  assert.equal(terminal.points, 0); assert.equal(terminal.manifestId, manifest.id);
});

test("active session feedback is pending with zero provider calls", async () => {
  const record = await runBot(trap);
  const fake = new FakeProvider([{ json: judged() }]);
  const judge = await judgeSession({ record, scenario, provider: fake.fn(), manifest });
  const coach = await coachSession({ record, scenario, provider: fake.fn(), manifest });
  assert.equal(fake.callCount, 0);
  assert.equal(judge.status, "pending"); assert.equal(judge.points, 0);
  assert.equal(coach.status, "pending"); assert.deepEqual(coach.moments, []);
});

test("coach rejects unsupported material dates/resources/scope with shared retry and guarded fallback", async () => {
  for (const invented of ["The deadline is tomorrow.", "We have three extra engineers available.", "We can reduce scope."]) {
    const data = coached(); data.better_reply = invented;
    const fake = new FakeProvider([{ json: data }, { json: data }]);
    const result = await coachSession({ record: fixtures.trap, scenario, provider: fake.fn(), manifest });
    assert.equal(fake.callCount, 2); assert.equal(result.moments[0].source, "fallback");
    assert.notEqual(result.moments[0].better_reply, invented);
  }
  const changed = structuredClone(scenario);
  changed.facts[0].unlock_question.en = "We have three extra engineers available.";
  const result = await coachSession({ record: fixtures.trap, scenario: changed, provider: new FakeProvider([{ malformed: true }, { malformed: true }]).fn(), manifest });
  assert.ok(!/extra engineers/i.test(result.moments[0].better_reply));
});
test("coach canon guard preserves ordinary clarification and prior known facts", async () => {
  const { safeHistoricalText } = await import("../coach.js");
  assert.equal(safeHistoricalText("What should I clarify before choosing a next step?", scenario, []), true);
  assert.equal(safeHistoricalText("Can we clarify the scope?", scenario, []), true);
  assert.equal(safeHistoricalText("The cutoff is Friday.", scenario, ["F1"]), true);
  assert.equal(safeHistoricalText(scenario.facts[1].content.en, scenario, ["F2"]), true);
  assert.equal(safeHistoricalText("The deadline is tomorrow.", scenario, ["F1"]), false);
  assert.equal(safeHistoricalText("We have three extra engineers available.", scenario, ["F2"]), false);
});
test("blank coaching fields and non-sentences fall back to usable questions", async () => {
  for (const field of ["what_went_well", "what_happened", "why_it_matters", "better_reply"]) {
    const data = coached(); data[field] = " \n\t ";
    const fake = new FakeProvider([{ json: data }, { json: data }]);
    const result = await coachSession({ record: fixtures.trap, scenario, provider: fake.fn(), manifest });
    assert.equal(fake.callCount, 2); assert.equal(result.moments[0].source, "fallback");
    assert.ok(result.moments[0].better_reply.trim().endsWith("?"));
  }
  const data = coached(); data.better_reply = "... !!! ???";
  const result = await coachSession({ record: fixtures.trap, scenario, provider: new FakeProvider([{ json: data }, { json: data }]).fn(), manifest });
  assert.equal(result.moments[0].source, "fallback");
});
test("judge rejects whitespace explanations and normalizes curly personal labels", async () => {
  const blank = judged(); blank.dimensions[0].explanation = " \n ";
  const fake = new FakeProvider([{ json: blank }, { json: blank }]);
  const rejected = await judgeSession({ record: fixtures.smart, scenario, provider: fake.fn(), manifest });
  assert.equal(fake.callCount, 2); assert.equal(rejected.points, 0);
  const insult = judged(); insult.dimensions[0].explanation = "You’re lazy.";
  const judge = await judgeSession({ record: fixtures.smart, scenario, provider: new FakeProvider([{ json: insult }]).fn(), manifest });
  assert.equal(judge.dimensions[0].status, "insufficient");
  const coach = coached(); coach.what_happened = "You’re lazy.";
  const result = await coachSession({ record: fixtures.trap, scenario, provider: new FakeProvider([{ json: coach }, { json: coach }]).fn(), manifest });
  assert.equal(result.moments[0].source, "fallback");
});

test("known F1 cannot mask later invented dates in separate or mixed sentences", async () => {
  const { safeHistoricalText } = await import("../coach.js");
  for (const text of [
    "The cutoff is Friday. The actual deadline is tomorrow.",
    "The cutoff is Friday. The actual deadline is Thursday.",
    "The cutoff is Friday. We can deliver Monday.",
    "The cutoff is Friday but delivery is tomorrow or Monday.",
    "The cutoff is in three days but the deadline is in two days.",
  ]) assert.equal(safeHistoricalText(text, scenario, ["F1"]), false, text);
  assert.equal(safeHistoricalText("The cutoff is Friday.", scenario, ["F1"]), true);
  const record = await runBot([
    ["maya", "What is the impact?", [ev("asked_impact")]],
    ["maya", "Let's discuss this constructively.", [ev("pushed_back_constructively")]],
  ], { sliders: { forthcomingness: 100 } });
  finish(record);
  const data = coached(record.convo.turns[2].text, 3);
  data.better_reply = "The cutoff is Friday. The actual deadline is tomorrow.";
  const fake = new FakeProvider([{ json: data }, { json: data }]);
  const result = await coachSession({ record, scenario, provider: fake.fn(), manifest });
  assert.equal(fake.callCount, 2); assert.equal(result.moments[0].source, "fallback");
});
