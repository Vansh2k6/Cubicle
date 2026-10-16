// llm/tests/npc.test.js — NPC shaping: 1–3 sentences, stage-direction strip, fallback.
import test from "node:test";
import assert from "node:assert/strict";
import { generateNpcReply, stripStageDirections, splitSentences } from "../npc.js";
import { FakeProvider, cannedText } from "../fakeProvider.js";

const prompt = { system: "sys", messages: [{ role: "user", content: "hi" }] };

test("four sentences are trimmed to three with trimmed flag", async () => {
  const fake = new FakeProvider([cannedText("One. Two. Three. Four.")]);
  const out = await generateNpcReply({ prompt, provider: fake.fn(), manifestId: "m", fallback: { text: "FB" } });
  assert.equal(out.source, "llm");
  assert.equal(out.trimmed, true);
  assert.equal(out.text, "One. Two. Three.");
  assert.equal(splitSentences(out.text).length, 3);
});

test("1–3 sentences pass through untrimmed", async () => {
  const fake = new FakeProvider([cannedText("Got it. I will look into this.")]);
  const out = await generateNpcReply({ prompt, provider: fake.fn(), manifestId: "m", fallback: { text: "FB" } });
  assert.equal(out.trimmed, false);
  assert.equal(out.text, "Got it. I will look into this.");
});

test("stage directions are stripped", async () => {
  const fake = new FakeProvider([cannedText("*smiles warmly* Hello there. [pause] How can I help?")]);
  const out = await generateNpcReply({ prompt, provider: fake.fn(), manifestId: "m", fallback: { text: "FB" } });
  assert.equal(out.source, "llm");
  assert.ok(!out.text.includes("*") && !out.text.includes("[") && !out.text.includes("]"));
  assert.ok(out.text.includes("Hello there."));
});

test("parenthetical direction lines are removed", () => {
  const cleaned = stripStageDirections("(she sighs)\nI hear you. Let's talk.");
  assert.ok(!cleaned.includes("sighs"));
  assert.ok(cleaned.includes("I hear you."));
});

test("empty after stripping falls back", async () => {
  const fake = new FakeProvider([cannedText("*nods silently* [looks away]")]);
  const out = await generateNpcReply({ prompt, provider: fake.fn(), manifestId: "m", fallback: { text: "FB-LINE" } });
  assert.equal(out.source, "fallback");
  assert.equal(out.text, "FB-LINE");
});

test("provider outage uses the fallback line", async () => {
  const fake = new FakeProvider([{ timeout: true }, { timeout: true }]);
  const out = await generateNpcReply({
    prompt, provider: fake.fn(), manifestId: "m", fallback: { text: "FB-LINE" }, timeoutMs: 20,
  });
  assert.equal(out.source, "fallback");
  assert.equal(out.text, "FB-LINE");
});

test("npc runs near 0.8 and tags manifest", async () => {
  const fake = new FakeProvider([cannedText("Fine. Let's move on.")]);
  const out = await generateNpcReply({ prompt, provider: fake.fn(), manifestId: "m9", fallback: "FB" });
  assert.equal(fake.calls[0].temperature, 0.8);
  assert.equal(out.manifestId, "m9");
});
