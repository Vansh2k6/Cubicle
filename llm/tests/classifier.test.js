// llm/tests/classifier.test.js — classifier post-validation via fake provider.
import test from "node:test";
import assert from "node:assert/strict";
import { classifyTurn, buildClassifierInput } from "../classifier.js";
import { cannedClassifier, FakeProvider } from "../fakeProvider.js";

const deps = (fake) => ({ provider: fake.fn(), manifestId: "m-class" });
const input = (text) => buildClassifierInput({ text, lastTurns: [], userKnown: [], clock: { day: 0 } });

test("buildClassifierInput slices lastTurns to <=2", () => {
  const turns = [{ speaker: "user", text: "a" }, { speaker: "user", text: "b" }, { speaker: "user", text: "c" }];
  const in1 = buildClassifierInput({ text: "hi", lastTurns: turns, userKnown: ["F2"], clock: { day: 0 } });
  assert.equal(in1.lastTurns.length, 2);
  assert.deepEqual(in1.lastTurns.map((t) => t.text), ["b", "c"]);
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
