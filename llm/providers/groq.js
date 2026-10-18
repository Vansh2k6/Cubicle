import { loadConfig, positiveInt, providerName } from "../config.js";
import { safeFailure, validateAgainstSchema } from "../gateway.js";

const processState = { calls: 0, tokens: 0, buckets: new Map() };
export class LLMBudgetExceeded extends Error {
  constructor() { super("LLM process budget exceeded"); this.name = "LLMBudgetExceeded"; this.code = "LLM_BUDGET_EXCEEDED"; }
}
const failure = (code, httpStatus) => Object.assign(new Error(`LLM ${code.toLowerCase()}`), { code, retryable: false,
  ...(Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599 ? { httpStatus } : {}) });

// https://console.groq.com/docs/reasoning and /docs/structured-outputs
function modelParams(model, roleConfig, schema) {
  const oss = /^openai\/gpt-oss-(20b|120b)$/.test(model);
  const qwen = model === "qwen/qwen3.8-27b";
  const params = {};
  if (schema && (oss || qwen)) params.response_format = { type: "json_object" };
  const efforts = oss ? ["low", "medium", "high"] : qwen ? ["none", "default", "low", "medium", "high"] : [];
  if (efforts.includes(roleConfig.reasoningEffort)) params.reasoning_effort = roleConfig.reasoningEffort;
  if (oss && roleConfig.extraParams?.include_reasoning === false) params.include_reasoning = false;
  if (qwen && roleConfig.extraParams?.reasoning_format === "hidden") params.reasoning_format = "hidden";
  // Only documented compatible extras are forwarded; routing/auth/JSON cannot be overridden.
  for (const name of oss || qwen ? ["top_p", "seed", "stop"] : []) {
    const value = roleConfig.extraParams?.[name];
    if (name === "top_p" && typeof value === "number" && value >= 0 && value <= 1) params[name] = value;
    if (name === "seed" && Number.isSafeInteger(value)) params[name] = value;
    if (name === "stop" && (typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string")))) params[name] = value;
  }
  return params;
}

function supportsStrictJsonSchema(model) {
  return model === "qwen/qwen3.8-27b" || /^openai\/gpt-oss-(20b|120b)$/.test(model);
}

const NPC_ENVELOPE_SCHEMA = {
  type: "object",
  required: ["text"],
  additionalProperties: false,
  properties: { text: { type: "string" } },
};

export function createGroqProvider({ env = process.env, config = loadConfig(env), fetchFn = globalThis.fetch,
  state = processState, now = Date.now, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), timeoutMs = 8000 } = {}) {
  const key = env.GROQ_API_KEY;
  const maxCalls = positiveInt(env.LLM_MAX_CALLS, 40);
  const maxTokens = positiveInt(env.LLM_MAX_TOKENS_TOTAL, 60000);
  const tpm = positiveInt(env.LLM_TPM_LIMIT, 6000);
  const provider = async ({ role, system = "", messages = [], temperature, schema } = {}) => {
    if (providerName(env) !== "groq") throw failure("PROVIDER_UNAVAILABLE");
    const c = config[role];
    if (!c) throw failure("BAD_ROLE");
    const npcEnvelope = role === "npc" && !schema;
    if (npcEnvelope) schema = NPC_ENVELOPE_SCHEMA;
    const chat = [{ role: "system", content: system }, ...messages];
    if (schema) chat[0].content += `\nReturn only JSON matching this schema: ${JSON.stringify(schema)}`;
    const estimated = Math.ceil(JSON.stringify(chat).length / 4) + c.maxTokens;
    if (state.calls >= maxCalls || state.tokens + estimated > maxTokens) throw new LLMBudgetExceeded();
    const time = now();
    const bucket = state.buckets.get(c.model) || { tokens: tpm, updated: time, blockedUntil: 0 };
    bucket.tokens = Math.min(tpm, bucket.tokens + Math.max(0, time - bucket.updated) * tpm / 60000);
    bucket.updated = time;
    state.buckets.set(c.model, bucket);
    // Fail soft rather than queue a turn beyond the session deadline.
    if (bucket.blockedUntil > time || bucket.tokens < estimated) throw failure("THROTTLED");
    bucket.tokens -= estimated;
    state.calls += 1;
    state.tokens += estimated;
    const controller = new AbortController();
    let timedOut = false;
    let timer;
    const deadline = new Promise((_, reject) => {
      timer = setTimeout(() => { timedOut = true; controller.abort(); reject(failure("TIMEOUT")); }, Math.min(timeoutMs, 8000));
    });
    let response;
    try {
      response = await Promise.race([(async () => {
        const body = { model: c.model, messages: chat, temperature: c.temperature ?? temperature,
          max_tokens: c.maxTokens, ...modelParams(c.model, c, schema) };
        if (npcEnvelope && supportsStrictJsonSchema(c.model)) {
          body.response_format = { type: "json_schema", json_schema: { name: "npc_reply", strict: true, schema: NPC_ENVELOPE_SCHEMA } };
        }
        const res = await fetchFn("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
          signal: controller.signal,
          body: JSON.stringify(body),
        });
        if (res.status === 429 || !res.ok) {
          // Abort transport even when a failed response body never finishes.
          controller.abort();
          if (res.body?.cancel) Promise.resolve(res.body.cancel()).catch(() => {});
          if (res.status === 429) return { rateLimited: true, retryAfter: res.headers?.get("retry-after"), httpStatus: res.status };
          throw failure("PROVIDER_ERROR", res.status);
        }
        const data = await res.json();
        const text = data?.choices?.[0]?.message?.content;
        if (typeof text !== "string") throw failure("EMPTY_OUTPUT");
        return { text, model: c.model, tokens: { in: data.usage?.prompt_tokens || 0, out: data.usage?.completion_tokens || 0 } };
      })(), deadline]);
    } catch (error) {
      const safe = safeFailure(error);
      throw failure(timedOut ? "TIMEOUT" : safe.failureCode, safe.httpStatus);
    } finally { clearTimeout(timer); }
    if (response.rateLimited) {
      const raw = response.retryAfter;
      const seconds = raw !== null && raw !== undefined && raw.trim() !== "" && Number.isFinite(Number(raw))
        ? Number(raw) * 1000 : Date.parse(raw) - now();
      const delay = Math.min(20000, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
      bucket.blockedUntil = now() + delay;
      await sleep(delay);
      throw failure("RATE_LIMITED", response.httpStatus);
    }
    if (npcEnvelope) {
      let data;
      try { data = JSON.parse(response.text); } catch { /* handled as validation failure */ }
      if (!validateAgainstSchema(data, schema).ok) {
        throw Object.assign(failure("OUTPUT_INVALID"), { retryable: true });
      }
      response.text = data.text;
    }
    return response;
  };
  // Includes one 8s HTTP deadline and at most 20s Retry-After, with no retry on outage.
  provider.timeoutMs = 28500;
  return provider;
}
