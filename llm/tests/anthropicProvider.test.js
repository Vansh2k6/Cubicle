import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAnthropicProvider, LLMBudgetExceeded } from "../providers/anthropic.js";
import { complete } from "../gateway.js";

function phase() {
  const dir = mkdtempSync(join(tmpdir(), "cubicle-anthropic-"));
  return { dir, budgetPath: join(dir, "phase.json"), close: () => rmSync(dir, { recursive: true, force: true }) };
}
function success(text = "{\"events\":[]}") {
  return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text }], usage: { input_tokens: 9, output_tokens: 3 } }) };
}

test("pins Haiku, separates system, returns raw NPC text, and disables thinking", async () => {
  const p = phase(); const calls = [];
  try {
    const provider = createAnthropicProvider({ apiKey: "test-key", budgetPath: p.budgetPath, fetchImpl: async (url, init) => {
      calls.push([url, init]);
      return url.endsWith("count_tokens") ? { ok: true, json: async () => ({ input_tokens: 10 }) } : success("Hello.");
    } });
    const out = await provider({ role: "npc", system: "private system", messages: [{ role: "user", content: "Hi" }], temperature: 1, top_p: 1, top_k: 1 });
    assert.deepEqual(out, { text: "Hello.", model: "claude-haiku-5-5", tokens: { in: 9, out: 3 } });
    const count = JSON.parse(calls[0][1].body), generate = JSON.parse(calls[1][1].body);
    assert.deepEqual(calls.map(([url]) => url), ["https://api.anthropic.com/v1/messages/count_tokens", "https://api.anthropic.com/v1/messages"]);
    assert.equal(generate.model, "claude-haiku-5-5"); assert.equal(generate.system, "private system"); assert.deepEqual(generate.messages, [{ role: "user", content: "Hi" }]);
    assert.equal(generate.max_tokens, 512);
    for (const key of ["temperature", "top_p", "top_k"]) assert.equal(generate[key], undefined);
    assert.deepEqual(generate.thinking, { type: "disabled" }); assert.deepEqual(count.thinking, { type: "disabled" });
    assert.deepEqual(calls[1][1].headers, { "content-type": "application/json", "x-api-key": "test-key", "anthropic-version": "2023-06-01" });
    assert.equal(count.max_tokens, undefined);
  } finally { p.close(); }
});

test("other roles keep provider JSON text and documented bounded outputs", async () => {
  const p = phase();
  try {
    for (const [role, maxTokens] of Object.entries({ classifier: 512, judge: 1024, coach: 1024 })) {
      const bodies = [];
      const provider = createAnthropicProvider({ apiKey: "k", budgetPath: `${p.budgetPath}-${role}`, fetchImpl: async (_, init) => {
        bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? { ok: true, json: async () => ({ input_tokens: 1 }) } : success("{\"ok\":true}");
      } });
      assert.equal((await provider({ role })).text, "{\"ok\":true}");
      assert.equal(bodies[1].max_tokens, maxTokens);
    }
  } finally { p.close(); }
});

test("reservations deny a second generation before dispatch and persist across factories", async () => {
  const p = phase(); let generationCalls = 0;
  try {
    const fetchImpl = async (url) => url.endsWith("count_tokens") ? { ok: true, json: async () => ({ input_tokens: 1 }) } : (generationCalls++, success());
    const one = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, maxUsd: 0.008, fetchImpl });
    const two = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, maxUsd: 0.008, fetchImpl });
    await one({ role: "judge" });
    await assert.rejects(two({ role: "judge" }), (error) => error instanceof LLMBudgetExceeded && error.code === "LLM_BUDGET_EXCEEDED");
    assert.equal(generationCalls, 1);
    const stored = JSON.parse(readFileSync(p.budgetPath, "utf8"));
    assert.ok(stored.reservedMicros > 0); assert.equal(stored.calls, 1);
    const budget = two.budget();
    assert.equal(budget.phase.model, "claude-haiku-5-5"); assert.equal(typeof budget.phase.startedAt, "number");
    assert.deepEqual({ capUsd: budget.capUsd, calls: budget.calls, ledger: budget.ledger.map(({ requestId, timestamp, completedAt, reservationMicros, reservationUsd, uncertainUsd, ...entry }) => entry) }, { capUsd: 0.008, calls: 1, ledger: [
      { request: "count", tokens: { input: 1, output: 0 }, calculatedMicros: 0, calculatedUsd: 0, uncertain: false },
      { request: "generation", tokens: { input: 9, output: 3 }, calculatedMicros: 3, calculatedUsd: 0.000003, uncertain: false },
      { request: "count", tokens: { input: 1, output: 0 }, calculatedMicros: 0, calculatedUsd: 0, uncertain: false },
    ] });
  } finally { p.close(); }
});

test("schema suffix is counted and missing generation usage stays uncertain", async () => {
  const p = phase(); const bodies = [];
  try {
    const provider = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, fetchImpl: async (_, init) => {
      bodies.push(JSON.parse(init.body)); return bodies.length === 1 ? { ok: true, json: async () => ({ input_tokens: 2 }) } : { ok: true, json: async () => ({ content: [{ type: "text", text: "{}" }], usage: {} }) };
    } });
    await provider({ role: "classifier", system: "classify", schema: { type: "object" } });
    assert.equal(bodies[0].system, bodies[1].system); assert.match(bodies[0].system, /Return only JSON matching this schema/);
    const generation = provider.budget().ledger.find((entry) => entry.request === "generation");
    assert.equal(generation.tokens, null); assert.equal(generation.uncertain, true); assert.ok(generation.uncertainUsd > 0);
  } finally { p.close(); }
});

test("count failure, timeout, and provider error are sanitized and never reserve or expose credentials", async () => {
  const p = phase(); const secret = "secret-never-output";
  try {
    const unavailable = createAnthropicProvider({ budgetPath: p.budgetPath, fetchImpl: async () => { throw new Error("must not call"); } });
    await assert.rejects(unavailable({ role: "classifier" }), (error) => error.code === "PROVIDER_UNAVAILABLE");
    const countError = createAnthropicProvider({ apiKey: secret, budgetPath: p.budgetPath, fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: secret } }) }) });
    await assert.rejects(countError({ role: "classifier" }), (error) => error.code === "PROVIDER_ERROR" && error.httpStatus === 401 && !String(error).includes(secret));
    const slow = createAnthropicProvider({ apiKey: secret, budgetPath: `${p.budgetPath}-slow`, timeoutMs: 10, fetchImpl: async () => new Promise(() => {}) });
    await assert.rejects(slow({ role: "classifier" }), (error) => error.code === "TIMEOUT" && !String(error).includes(secret));
  } finally { p.close(); }
});

test("gateway retry cannot dispatch a second paid generation after its phase reservation", async () => {
  const p = phase(); let counts = 0, generations = 0;
  try {
    const provider = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, maxUsd: 0.006, fetchImpl: async (url) => {
      if (url.endsWith("count_tokens")) { counts++; return { ok: true, json: async () => ({ input_tokens: 1 }) }; }
      generations++; return { ok: false, status: 503, json: async () => ({}) };
    } });
    const result = await complete({ role: "classifier", provider, system: "", messages: [], schema: { type: "object" } });
    assert.equal(result.source, "fallback"); assert.equal(result.failureCode, "LLM_BUDGET_EXCEEDED");
    assert.equal(generations, 1); assert.equal(counts, 2);
    assert.ok(provider.budget().reservedUsd > 0);
  } finally { p.close(); }
});

test("count drift near the phase cap blocks generation before dispatch", async () => {
  const p = phase(); let generations = 0;
  try {
    const provider = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, fetchImpl: async (url) => {
      if (url.endsWith("count_tokens")) return { ok: true, json: async () => ({ input_tokens: 997440 }) };
      generations++; return success();
    } });
    await assert.rejects(provider({ role: "classifier" }), (error) => error.code === "LLM_BUDGET_EXCEEDED");
    assert.equal(generations, 0);
  } finally { p.close(); }
});

test("the original phase cap survives recreation with a larger factory limit", async () => {
  const p = phase(); let generations = 0;
  try {
    const fetchImpl = async (url) => url.endsWith("count_tokens") ? { ok: true, json: async () => ({ input_tokens: 1 }) } : (generations++, success());
    const initial = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, maxUsd: 0.01, fetchImpl });
    await initial({ role: "classifier" });
    const recreated = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, maxUsd: 0.5, fetchImpl });
    await assert.rejects(recreated({ role: "classifier" }), (error) => error.code === "LLM_BUDGET_EXCEEDED");
    assert.equal(generations, 1); assert.equal(recreated.budget().phase.capMicros, 10000);
  } finally { p.close(); }
});

test("a lost or tampered phase budget fails closed after initialization", async () => {
  const p = phase();
  try {
    const fetchImpl = async (url) => url.endsWith("count_tokens") ? { ok: true, json: async () => ({ input_tokens: 1 }) } : success();
    const provider = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, fetchImpl });
    await provider({ role: "classifier" });
    unlinkSync(p.budgetPath);
    const recreated = createAnthropicProvider({ apiKey: "k", budgetPath: p.budgetPath, fetchImpl });
    await assert.rejects(recreated({ role: "classifier" }), (error) => error.code === "LLM_BUDGET_EXCEEDED");
  } finally { p.close(); }
});
