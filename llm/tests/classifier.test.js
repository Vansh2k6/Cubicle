// llm/tests/classifier.test.js — classifier post-validation via fake provider.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyTurn, buildClassifierInput, getClassifierPrompt, TAXONOMY } from "../classifier.js";
import { loadConfig } from "../config.js";
import { cannedClassifier, FakeProvider } from "../fakeProvider.js";
import { createSession, applyTurn } from "../../engine/sc01Compatibility.js";
import { rulesToEvents } from "../../services/api/offlineProviders.js";

const scenario = JSON.parse(readFileSync(new URL("../../scenarios/missed_deadline.json", import.meta.url), "utf8"));
const ownershipCases = JSON.parse(readFileSync(new URL("../../evals/cases/ownership-status.json", import.meta.url), "utf8")).cases;

const deps = (fake) => ({ provider: fake.fn(), manifestId: "m-class" });
const input = (text) => buildClassifierInput({ text, lastTurns: [], userKnown: [], clock: { day: 0 } });

test("buildClassifierInput slices lastTurns to <=2", () => {
  const turns = [{ speaker: "user", text: "a" }, { speaker: "user", text: "b" }, { speaker: "user", text: "c" }];
  const in1 = buildClassifierInput({ text: "hi", lastTurns: turns, userKnown: ["F2"], clock: { day: 0 } });
  assert.equal(in1.lastTurns.length, 2);
  assert.deepEqual(in1.lastTurns.map((t) => t.text), ["b", "c"]);
});

test("classifier v3 prompt and config share provenance", () => {
  assert.equal(loadConfig({}).classifier.promptVersion, "v3");
  assert.match(getClassifierPrompt(), /Classifier prompt v3/);
  assert.match(getClassifierPrompt(), /Ownership and status are independent multi-labels/);
});

test("ownership-status fixture is internally valid", () => {
  assert.ok(ownershipCases.length >= 6 && ownershipCases.length <= 8);
  assert.equal(new Set(ownershipCases.map((c) => c.id)).size, ownershipCases.length);
  for (const c of ownershipCases) {
    assert.ok(c.id && c.utterance && Array.isArray(c.required_events) && Array.isArray(c.forbidden_events));
    assert.equal(typeof c.goal_complete, "boolean");
    assert.equal(c.required_events.some((type) => c.forbidden_events.includes(type)), false);
    for (const type of [...c.required_events, ...c.forbidden_events]) assert.ok(TAXONOMY.has(type), `${c.id}: ${type}`);
  }
});

test("post-validated ownership and status labels are the complete G1 input", async () => {
  for (const c of ownershipCases) {
    const fake = new FakeProvider([cannedClassifier(c.required_events.map((type) => ({ type })))]);
    const classified = await classifyTurn(deps(fake), input(c.utterance));
    const types = classified.events.map((event) => event.type);
    assert.deepEqual(types, c.required_events, c.id);
    for (const type of c.forbidden_events) assert.equal(types.includes(type), false, c.id);
    const session = createSession(scenario);
    applyTurn(session, "maya", classified.events);
    assert.equal(session.goals.G1.status === "done", c.goal_complete, c.id);
  }
});

test("unknown event types are dropped and counted", async () => {
  const fake = new FakeProvider([cannedClassifier([{ type: "made_up_event" }, { type: "greeted" }])]);
  const out = await classifyTurn(deps(fake), input("hello there"));
  assert.deepEqual(out.events.map((e) => e.type), ["greeted"]);
  assert.equal(out.dropped.length, 1);
  assert.equal(out.dropped[0].reason, "unknown_event");
});

test("overpromised is rejected (engine-derived, forbidden)", async () => {
  const fake = new FakeProvider([cannedClassifier([{ type: "overpromised", params: {} }])]);
  const out = await classifyTurn(deps(fake), input("I will do it"));
  assert.deepEqual(out.events, []);
  assert.equal(out.dropped[0].reason, "engine_derived_forbidden");
});

test("date table: tomorrow->1, Thursday->2, Friday->3", async () => {
  for (const [words, day] of [["I will deliver it tomorrow", 1], ["ready by Thursday", 2], ["done by Friday", 3]]) {
    const fake = new FakeProvider([cannedClassifier([{ type: "committed_deadline", params: {} }])]);
    const out = await classifyTurn(deps(fake), input(words));
    assert.equal(out.events.length, 1, words);
    assert.equal(out.events[0].params.day, day, words);
  }
});

test("ambiguous dates produce clarify, never a rounded day", async () => {
  for (const words of ["next week", "by end of day", "in a couple of days", "soon"]) {
    const fake = new FakeProvider([cannedClassifier([{ type: "committed_deadline", params: { day: 7 } }])]);
    const out = await classifyTurn(deps(fake), input(`I will finish it ${words}`));
    assert.ok(out.clarify.some((c) => c.reason === "ambiguous_date"), words);
    assert.ok(!out.events.some((e) => e.type === "committed_deadline"), words);
  }
});

test("help_accepted kept only on explicit wording", async () => {
  const mk = () => cannedClassifier([{ type: "confirmed_next_steps", params: { help_accepted: true } }]);
  const yes = new FakeProvider([mk()]);
  const outYes = await classifyTurn(deps(yes), input("Yes, I accept your help. Let's pair on it."));
  assert.equal(outYes.events[0].params.help_accepted, true);

  const no = new FakeProvider([mk()]);
  const outNo = await classifyTurn(deps(no), input("I will send you an update tomorrow."));
  assert.equal(outNo.events[0].params.help_accepted, false);
});

test("Vansh first/full-name help acceptance works while Jordan remains a legacy alias", async () => {
  for (const words of ["I accept Vansh's help.", "I accept Vansh Singh's help.", "Let's pair with Vansh.", "Let's pair with Vansh Singh.", "I accept Jordan's help."]) {
    const fake = new FakeProvider([cannedClassifier([{ type: "confirmed_next_steps", params: { help_accepted: true } }])]);
    const classified = await classifyTurn(deps(fake), input(words));
    assert.equal(classified.events[0].params.help_accepted, true, words);
    assert.ok(rulesToEvents(words).some((event) => event.type === "confirmed_next_steps" && event.params.help_accepted), words);
  }
});

test("classifier runs at temperature 0 and reports attempts", async () => {
  const fake = new FakeProvider([cannedClassifier([])]);
  const out = await classifyTurn(deps(fake), input("hi"));
  assert.equal(fake.calls[0].temperature, 0);
  assert.equal(fake.calls[0].role, "classifier");
  assert.equal(out.attempts, 1);
  assert.equal(out.manifestId, "m-class");
});

test("provider outage yields empty events via gateway fallback", async () => {
  const fake = new FakeProvider([{ timeout: true }, { timeout: true }]);
  const out = await classifyTurn({ provider: fake.fn(), manifestId: "m", timeoutMs: 20 }, input("hi"));
  assert.deepEqual(out.events, []);
  assert.equal(out.attempts, 2);
});
