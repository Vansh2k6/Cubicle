// llm/tests/gateway.test.js — gateway: valid pass, retry-once, role fallbacks.
import test from "node:test";
import assert from "node:assert/strict";
import { complete, validateAgainstSchema, fallbackFor } from "../gateway.js";
import { FakeProvider } from "../fakeProvider.js";

const SCHEMA = {
  type: "object",
  required: ["events"],
  properties: { events: { type: "array" } },
};

const base = (fake, extra = {}) => ({
  role: "classifier",
  system: "s",
  messages: [{ role: "user", content: "hi" }],
  schema: SCHEMA,
  temperature: 0,
  timeoutMs: 500,
  provider: fake.fn(),
  manifestId: "m1",
  ...extra,
});

test("valid response passes with source llm and attempts 1", async () => {
  const fake = new FakeProvider([{ json: { events: [] } }]);
  const res = await complete(base(fake));
  assert.equal(res.ok, true);
  assert.equal(res.source, "llm");
  assert.equal(res.attempts, 1);
  assert.deepEqual(res.data, { events: [] });
  assert.equal(res.manifestId, "m1");
});

test("malformed JSON retries exactly once then falls back", async () => {
  const fake = new FakeProvider([{ malformed: true }, { malformed: true }]);
  const res = await complete(base(fake));
  assert.equal(res.source, "fallback");
  assert.equal(res.ok, false);
  assert.deepEqual(res.data, { events: [], clarify: [] });
  assert.equal(res.attempts, 2);
  assert.equal(fake.calls.length, 2);
});

test("schema-invalid response retries once then falls back", async () => {
  const fake = new FakeProvider([{ json: { nope: 1 } }, { json: { nope: 1 } }]);
  const res = await complete(base(fake));
  assert.equal(res.source, "fallback");
  assert.equal(res.attempts, 2);
  assert.equal(fake.calls.length, 2);
});

test("first failure then success uses the retry", async () => {
  const fake = new FakeProvider([{ malformed: true }, { json: { events: [] } }]);
  const res = await complete(base(fake));
  assert.equal(res.source, "llm");
  assert.equal(res.attempts, 2);
});

test("timeout falls back after one retry", async () => {
  const fake = new FakeProvider([{ timeout: true }, { timeout: true }]);
  const res = await complete(base(fake, { timeoutMs: 50 }));
  assert.equal(res.source, "fallback");
  assert.equal(res.attempts, 2);
});

test("slow provider hits gateway timeout", async () => {
  const fake = new FakeProvider([
    { delayMs: 300, json: { events: [] } },
    { delayMs: 300, json: { events: [] } },
  ]);
  const res = await complete(base(fake, { timeoutMs: 30 }));
  assert.equal(res.source, "fallback");
  assert.equal(res.attempts, 2);
});

test("no-schema call returns raw text (npc path)", async () => {
  const fake = new FakeProvider([{ text: "Hello there." }]);
  const res = await complete({ ...base(fake), role: "npc", schema: null, temperature: 0.8 });
  assert.equal(res.ok, true);
  assert.equal(res.data.text, "Hello there.");
});

test("temperature is passed through to the provider", async () => {
  const fake = new FakeProvider([{ text: "x" }]);
  await complete({ ...base(fake), schema: null, temperature: 0.8 });
  assert.equal(fake.calls[0].temperature, 0.8);
});

test("role fallbacks match R-12", () => {
  assert.deepEqual(fallbackFor("classifier"), { events: [], clarify: [] });
  assert.deepEqual(fallbackFor("npc"), { fallback: true });
  assert.deepEqual(fallbackFor("judge"), { insufficient: true });
  assert.deepEqual(fallbackFor("coach"), { insufficient: true });
});

test("minimal validator covers object/array/required/enum", () => {
  const sch = {
    type: "object",
    required: ["a"],
    properties: { a: { type: "string" }, b: { enum: ["x", "y"] } },
  };
  assert.equal(validateAgainstSchema({ a: "s", b: "x" }, sch).ok, true);
  assert.equal(validateAgainstSchema({ b: "x" }, sch).ok, false);
  assert.equal(validateAgainstSchema({ a: "s", b: "z" }, sch).ok, false);
  assert.equal(validateAgainstSchema({ a: 1 }, sch).ok, false);
});
