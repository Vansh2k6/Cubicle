import test from "node:test";
import assert from "node:assert/strict";
import { createGroqProvider, LLMBudgetExceeded } from "../providers/groq.js";
import { providerName, loadConfig } from "../config.js";
import { complete } from "../gateway.js";
import { runSmoke } from "../smoke.mjs";
import { execFileSync } from "node:child_process";
const state = () => ({ calls: 0, tokens: 0, buckets: new Map() });
const env = { GROQ_API_KEY: "test-credential", LLM_PROVIDER: "groq" };
const schema = { type: "object", required: ["events"], properties: { events: { type: "array" } } };
const ok = () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"events":[]}' } }], usage: { prompt_tokens: 3, completion_tokens: 4 } }) });
const call = (provider) => complete({ role: "classifier", system: "JSON", messages: [], schema, provider });

test("smoke preserves a lower configured call budget", () => {
  const smokeUrl = new URL("../smoke.mjs", import.meta.url).href;
  const source = `import { runSmoke } from ${JSON.stringify(smokeUrl)};
    let calls = 0;
    const result = await runSmoke({ env: { RUN_LIVE: "1", LLM_PROVIDER: "groq", GROQ_API_KEY: "test-credential", LLM_MAX_CALLS: "1" },
      fetchFn: async () => { calls++; return { ok: true, json: async () => ({ choices: [{ message: { content: '{"events":[]}' } }] }) }; } });
    console.log(JSON.stringify({ calls, reported: result.calls }));`;
  const output = execFileSync(process.execPath, ["--input-type=module", "-e", source], { encoding: "utf8" });
  assert.deepEqual(JSON.parse(output), { calls: 1, reported: 1 });
});

test("offline is default and both opt-in and key are required", () => {
  for (const e of [{}, { GROQ_API_KEY: "test" }, { LLM_PROVIDER: "groq" }, { LLM_PROVIDER: "groq", GROQ_API_KEY: " " }]) assert.equal(providerName(e), "offline");
  assert.equal(providerName(env), "groq");
});
test("model-aware JSON, reasoning and extras; schema is locally validated", async () => {
  const bodies = [];
  const config = loadConfig({ ...env, CLASSIFIER_EXTRA_PARAMS: '{"seed":4,"reasoning_format":"raw","authorization":"bad"}' });
  const provider = createGroqProvider({ env, config, state: state(), fetchFn: async (_, init) => { bodies.push(JSON.parse(init.body)); return ok(); } });
  assert.equal((await call(provider)).ok, true);
  assert.deepEqual(bodies[0].response_format, { type: "json_object" });
  assert.equal(bodies[0].reasoning_effort, "low");
  assert.equal(bodies[0].include_reasoning, false);
  assert.equal(bodies[0].reasoning_format, undefined);
  assert.equal(bodies[0].seed, 4);
  assert.equal(bodies[0].authorization, undefined);
  await provider({ role: "npc", system: "hello", schema });
  assert.equal(bodies[1].reasoning_effort, "none");
  assert.deepEqual(bodies[1].response_format, { type: "json_object" });
  assert.equal(bodies[1].reasoning_format, "hidden");
});
test("call and token budgets stop cleanly including concurrent reservations", async () => {
  let calls = 0;
  const shared = state();
  const options = { env: { ...env, LLM_MAX_CALLS: "1" }, state: shared, fetchFn: async () => { calls++; return ok(); } };
  const a = createGroqProvider(options), b = createGroqProvider(options);
  const results = await Promise.all([call(a), call(b)]);
  assert.equal(calls, 1);
  assert.equal(results.filter((r) => r.source === "fallback").length, 1);
  await assert.rejects(a({ role: "classifier" }), LLMBudgetExceeded);
  const limited = createGroqProvider({ ...options, state: state(), env: { ...env, LLM_MAX_TOKENS_TOTAL: "1" } });
  assert.equal((await call(limited)).source, "fallback");
});
test("429 honours Retry-After up to 20s then fallback with no retry", async () => {
  let calls = 0; const delays = [];
  const provider = createGroqProvider({ env, state: state(), sleep: async (ms) => delays.push(ms), fetchFn: async () => { calls++; return { status: 429, headers: { get: () => "25" } }; } });
  const result = await call(provider);
  assert.equal(result.source, "fallback");
  assert.equal(result.failureCode, "RATE_LIMITED");
  assert.equal(calls, 1);
  assert.deepEqual(delays, [20000]);
});
test("token bucket throttles per model and refills", async () => {
  let time = 0, calls = 0;
  const provider = createGroqProvider({ env: { ...env, LLM_TPM_LIMIT: "600" }, state: state(), now: () => time, fetchFn: async () => { calls++; return ok(); } });
  assert.equal((await call(provider)).ok, true);
  const throttled = await call(provider);
  assert.equal(throttled.source, "fallback");
  assert.equal(throttled.failureCode, "THROTTLED");
  time = 60000;
  assert.equal((await call(provider)).ok, true);
  assert.equal(calls, 2);
});
test("timeout covers fetch and body consumption, aborts and falls back", async () => {
  for (const body of [false, true]) {
    let signal;
    const provider = createGroqProvider({ env, state: state(), timeoutMs: 10, fetchFn: async (_, init) => {
      signal = init.signal;
      if (!body) return new Promise(() => {});
      return { ok: true, json: () => new Promise(() => {}) };
    } });
    assert.equal((await call(provider)).source, "fallback");
    assert.equal(signal.aborted, true);
  }
});
test("credential and provider response are absent from errors and logs", async () => {
  const logs = []; const original = console.error; console.error = (...args) => logs.push(args.join(" "));
  try {
    const provider = createGroqProvider({ env, state: state(), fetchFn: async () => { throw new Error(env.GROQ_API_KEY); } });
    await assert.rejects(provider({ role: "classifier" }), (e) => !String(e.stack).includes(env.GROQ_API_KEY));
    assert.equal((await call(provider)).source, "fallback");
    assert.deepEqual(logs, []);
  } finally { console.error = original; }
});
test("smoke refuses without RUN_LIVE and caps HTTP calls at three", async () => {
  let calls = 0;
  await assert.rejects(runSmoke({ env, fetchFn: async () => { calls++; return ok(); } }));
  assert.equal(calls, 0);
  const out = await runSmoke({ env: { ...env, RUN_LIVE: "1" }, fetchFn: async () => { calls++; return { ok: true, json: async () => ({ choices: [{ message: { content: 'invalid' } }] }) }; } });
  assert.equal(out.calls, 3);
  assert.equal(calls, 3);
  assert.equal(out.results.length, 2);
});

test("unknown models omit unverified JSON/reasoning/extras support", async () => {
  let body;
  const config = loadConfig({ ...env, NPC_MODEL: "unknown/model", NPC_EXTRA_PARAMS: '{"top_p":0.5}' });
  const provider = createGroqProvider({ env, config, state: state(), fetchFn: async (_, init) => { body = JSON.parse(init.body); return ok(); } });
  await provider({ role: "npc", schema });
  for (const key of ["response_format", "reasoning_effort", "reasoning_format", "include_reasoning", "top_p"]) assert.equal(body[key], undefined);
});
test("429 HTTP-date and missing Retry-After are bounded", async () => {
  for (const [header, expected] of [[new Date(12000).toUTCString(), 12000], [null, 0]]) {
    let slept;
    const provider = createGroqProvider({ env, state: state(), now: () => 0, sleep: async (ms) => { slept = ms; }, fetchFn: async () => ({ status: 429, headers: { get: () => header } }) });
    assert.equal((await call(provider)).source, "fallback");
    assert.equal(slept, expected);
  }
});

test("production NPC envelope is validated, unwrapped and retried once", async () => {
  for (const validSecond of [true, false]) {
    let calls = 0;
    const provider = createGroqProvider({ env, state: state(), fetchFn: async (_, init) => {
      const body = JSON.parse(init.body);
      assert.deepEqual(body.response_format, { type: "json_schema", json_schema: { name: "npc_reply", strict: true,
        schema: { type: "object", required: ["text"], additionalProperties: false, properties: { text: { type: "string" } } } } });
      calls++;
      return { ok: true, json: async () => ({ choices: [{ message: { content: calls === 2 && validSecond ? '{"text":"Hello."}' : '{"text":42}' } }] }) };
    } });
    const result = await complete({ role: "npc", provider, system: "Hello", messages: [] });
    assert.equal(calls, 2);
    assert.equal(result.source, validSecond ? "llm" : "fallback");
    if (validSecond) assert.equal(result.text, "Hello.");
  }
});
test("inferred NPC envelopes use strict JSON schema only on documented compatible models", async () => {
  for (const model of ["qwen/qwen3.8-27b", "openai/gpt-oss-20b", "openai/gpt-oss-120b"]) {
    let body;
    const config = loadConfig({ ...env, NPC_MODEL: model });
    const provider = createGroqProvider({ env, config, state: state(), fetchFn: async (_, init) => {
      body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":"Hello."}' } }] }) };
    } });
    assert.equal((await provider({ role: "npc", system: "Hello" })).text, "Hello.");
    assert.equal(body.response_format.type, "json_schema");
    assert.equal(body.response_format.json_schema.name, "npc_reply");
    assert.equal(body.response_format.json_schema.strict, true);
    assert.deepEqual(body.response_format.json_schema.schema, { type: "object", required: ["text"], additionalProperties: false, properties: { text: { type: "string" } } });
  }
  let body;
  const unknown = createGroqProvider({ env, config: loadConfig({ ...env, NPC_MODEL: "unknown/model" }), state: state(), fetchFn: async (_, init) => {
    body = JSON.parse(init.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: '{"text":42}' } }] }) };
  } });
  await assert.rejects(unknown({ role: "npc", system: "Hello" }), (error) => error.code === "OUTPUT_INVALID");
  assert.equal(body.response_format, undefined);
});
test("failed HTTP responses abort and cancel unconsumed bodies before backoff", async () => {
  for (const status of [429, 503]) {
    let signal, cancelled = false;
    const provider = createGroqProvider({ env, state: state(), sleep: async () => {
      assert.equal(signal.aborted, true);
      assert.equal(cancelled, true);
    }, fetchFn: async (_, init) => {
      signal = init.signal;
      return { status, ok: false, headers: { get: () => "1" }, body: { cancel: () => { cancelled = true; return new Promise(() => {}); } } };
    } });
    assert.equal((await call(provider)).source, "fallback");
    assert.equal(signal.aborted, true);
    assert.equal(cancelled, true);
  }
});

test("Groq factory preserves sanitized HTTP failures without provider bodies or arbitrary codes", async () => {
  const injected = "test-credential-do-not-log";
  for (const status of [400, 401]) {
    const provider = createGroqProvider({ env, state: state(), fetchFn: async () => ({ status, ok: false,
      headers: { get: () => null }, body: { cancel: () => Promise.resolve() }, text: async () => injected }) });
    await assert.rejects(provider({ role: "classifier" }), (error) => {
      assert.equal(error.code, "PROVIDER_ERROR");
      assert.equal(error.httpStatus, status);
      assert.ok(!String(error).includes(injected));
      assert.ok(!JSON.stringify({ code: error.code, httpStatus: error.httpStatus }).includes(injected));
      return true;
    });
  }
  const thrown = createGroqProvider({ env, state: state(), fetchFn: async () => {
    throw Object.assign(new Error(injected), { code: injected, httpStatus: 401 });
  } });
  await assert.rejects(thrown({ role: "classifier" }), (error) => {
    assert.equal(error.code, "PROVIDER_ERROR");
    assert.equal(error.httpStatus, 401);
    assert.ok(!String(error).includes(injected));
    return true;
  });
});
