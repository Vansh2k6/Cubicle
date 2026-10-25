import { closeSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const API = "https://api.anthropic.com/v1/messages";
const COUNT_API = "https://api.anthropic.com/v1/messages/count_tokens";
const MODEL = "claude-haiku-5-5";
const ROLE_MAX_TOKENS = Object.freeze({ classifier: 512, npc: 512, judge: 1024, coach: 1024 });
const MAX_USD = 0.5;

export class LLMBudgetExceeded extends Error {
  constructor() { super("LLM phase budget exceeded"); this.name = "LLMBudgetExceeded"; this.code = "LLM_BUDGET_EXCEEDED"; }
}

function failure(code, httpStatus) {
  return Object.assign(new Error(`LLM ${code.toLowerCase()}`), { code, retryable: ["TIMEOUT", "PROVIDER_ERROR", "EMPTY_OUTPUT"].includes(code),
    ...(Number.isInteger(httpStatus) && httpStatus >= 400 && httpStatus <= 599 ? { httpStatus } : {}) });
}

function phaseBudget(maxUsd, maxCalls) {
  const usd = Number.isFinite(maxUsd) && maxUsd >= 0 ? Math.min(maxUsd, MAX_USD) : MAX_USD;
  const calls = Number.isSafeInteger(maxCalls) && maxCalls > 0 ? Math.min(maxCalls, 40) : 40;
  return { micros: Math.floor(usd * 1_000_000), calls };
}

function withBudget(budgetPath, limit, action, now = Date.now) {
  const lockPath = `${budgetPath}.lock`;
  const markerPath = `${budgetPath}.phase`;
  let lock;
  try {
    lock = openSync(lockPath, "wx");
    const initialPhase = { model: MODEL, startedAt: now(), capMicros: limit.micros, callLimit: limit.calls };
    let prior = { phase: initialPhase, reservedMicros: 0, calls: 0, ledger: [] };
    try { prior = JSON.parse(readFileSync(budgetPath, "utf8")); } catch (error) {
      if (error?.code !== "ENOENT") throw new LLMBudgetExceeded();
      try { readFileSync(markerPath, "utf8"); throw new LLMBudgetExceeded(); } catch (markerError) {
        if (markerError instanceof LLMBudgetExceeded || markerError?.code !== "ENOENT") throw new LLMBudgetExceeded();
      }
      writeFileSync(markerPath, JSON.stringify(initialPhase), { encoding: "utf8", flag: "wx" });
    }
    if (prior.phase?.model !== MODEL || !Number.isSafeInteger(prior.phase?.startedAt) || !Number.isSafeInteger(prior.phase?.capMicros) || prior.phase.capMicros < 0 || !Number.isSafeInteger(prior.phase?.callLimit) || prior.phase.callLimit < 1 || !Number.isSafeInteger(prior.reservedMicros) || prior.reservedMicros < 0 || !Number.isSafeInteger(prior.calls) || prior.calls < 0 || !Array.isArray(prior.ledger)) throw new LLMBudgetExceeded();
    let marker;
    try { marker = JSON.parse(readFileSync(markerPath, "utf8")); } catch { throw new LLMBudgetExceeded(); }
    if (marker?.model !== prior.phase.model || marker?.startedAt !== prior.phase.startedAt || marker?.capMicros !== prior.phase.capMicros || marker?.callLimit !== prior.phase.callLimit) throw new LLMBudgetExceeded();
    const next = action(prior);
    writeFileSync(budgetPath, JSON.stringify(next), "utf8");
    return next;
  } catch (error) {
    if (error instanceof LLMBudgetExceeded || error?.code === "EEXIST") throw new LLMBudgetExceeded();
    throw new LLMBudgetExceeded();
  } finally {
    if (lock !== undefined) {
      closeSync(lock);
      try { unlinkSync(lockPath); } catch { /* lock cleanup is best effort */ }
    }
  }
}

function recordCount(budgetPath, limit, tokens, uncertain, now) {
  return withBudget(budgetPath, limit, (prior) => ({ ...prior, ledger: [...prior.ledger, {
    request: "count", tokens: tokens === null ? null : { input: tokens, output: 0 }, calculatedMicros: 0, calculatedUsd: 0,
    reservationMicros: 0, reservationUsd: 0, uncertain, uncertainUsd: 0, timestamp: now(),
  }] }), now);
}

function reserve(budgetPath, limit, inputTokens, outputTokens, now) {
  const requestId = randomUUID();
  withBudget(budgetPath, limit, (prior) => {
    // Highest published Haiku 5.5 tier: $0.50 input / $2.50 output per million tokens.
    const reservation = Math.ceil(inputTokens * 0.5 + outputTokens * 2.5);
    const effectiveCalls = Math.min(limit.calls, prior.phase.callLimit);
    const effectiveMicros = Math.min(limit.micros, prior.phase.capMicros);
    if (prior.calls >= effectiveCalls || reservation > effectiveMicros - prior.reservedMicros) throw new LLMBudgetExceeded();
    return { ...prior, reservedMicros: prior.reservedMicros + reservation, calls: prior.calls + 1, ledger: [...prior.ledger, {
      requestId, request: "generation", tokens: null, calculatedMicros: null, calculatedUsd: null,
      reservationMicros: reservation, reservationUsd: reservation / 1_000_000, uncertain: true, uncertainUsd: reservation / 1_000_000, timestamp: now(),
    }] };
  }, now);
  return requestId;
}

function recordGeneration(budgetPath, limit, requestId, inputTokens, outputTokens, now) {
  return withBudget(budgetPath, limit, (prior) => {
    const ledger = [...prior.ledger];
    const row = ledger.find((entry) => entry.request === "generation" && entry.requestId === requestId && entry.uncertain === true && entry.tokens === null);
    if (!row) throw new LLMBudgetExceeded();
    if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens)) {
      row.completedAt = now();
      return { ...prior, ledger };
    }
    const highTier = inputTokens > 100_000;
    const calculatedMicros = Math.ceil(inputTokens * (highTier ? 0.5 : 0.1) + outputTokens * (highTier ? 2.5 : 0.5));
    row.tokens = { input: inputTokens, output: outputTokens };
    row.calculatedMicros = calculatedMicros;
    row.calculatedUsd = calculatedMicros / 1_000_000;
    row.uncertainUsd = 0;
    row.uncertain = false;
    row.completedAt = now();
    return { ...prior, ledger };
  }, now);
}

function messagesBody(system, messages, schema) {
  let finalSystem = typeof system === "string" ? system : "";
  if (schema) finalSystem += `\nReturn only JSON matching this schema: ${JSON.stringify(schema)}`;
  return { model: MODEL, system: finalSystem, messages: Array.isArray(messages) ? messages : [], thinking: { type: "disabled" } };
}

function conservativeInputBound(countedTokens, generationBody) {
  return Math.max(Math.ceil(countedTokens * 1.1) + 4096, Buffer.byteLength(JSON.stringify(generationBody), "utf8") + 8192);
}

async function request(fetchImpl, url, apiKey, body, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => { timedOut = true; controller.abort(); reject(failure("TIMEOUT")); }, timeoutMs);
  });
  try {
    const result = await Promise.race([Promise.resolve(fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      signal: controller.signal,
      body: JSON.stringify(body),
    })).then(async (response) => {
      if (!response?.ok) throw failure("PROVIDER_ERROR", response?.status);
      return response.json();
    }), timeout]);
    return result;
  } catch (error) {
    if (timedOut || error?.code === "TIMEOUT") throw failure("TIMEOUT");
    throw failure("PROVIDER_ERROR", error?.httpStatus);
  } finally { clearTimeout(timer); }
}

export function createAnthropicProvider({ apiKey, fetchImpl = globalThis.fetch, budgetPath, maxUsd = MAX_USD, maxCalls = 40, timeoutMs = 8000, now = Date.now } = {}) {
  const limit = phaseBudget(maxUsd, maxCalls);
  const deadline = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 ? Math.min(timeoutMs, 8000) : 8000;
  const provider = async ({ role, system = "", messages = [], schema = null } = {}) => {
    const maxTokens = ROLE_MAX_TOKENS[role];
    if (!maxTokens || typeof apiKey !== "string" || !apiKey.trim() || typeof fetchImpl !== "function" || typeof budgetPath !== "string" || !budgetPath) {
      throw failure(role && !maxTokens ? "BAD_ROLE" : "PROVIDER_UNAVAILABLE");
    }
    const base = messagesBody(system, messages, schema);
    let counted;
    try { counted = await request(fetchImpl, COUNT_API, apiKey, base, deadline); } catch (error) {
      recordCount(budgetPath, limit, null, true, now);
      throw error;
    }
    if (!Number.isSafeInteger(counted?.input_tokens) || counted.input_tokens < 0) {
      recordCount(budgetPath, limit, null, true, now);
      throw failure("PROVIDER_ERROR");
    }
    recordCount(budgetPath, limit, counted.input_tokens, false, now);
    const generationBody = { ...base, max_tokens: maxTokens };
    const requestId = reserve(budgetPath, limit, conservativeInputBound(counted.input_tokens, generationBody), maxTokens, now);
    let data;
    try { data = await request(fetchImpl, API, apiKey, generationBody, deadline); } catch (error) { throw error; }
    const text = data?.content?.find((part) => part?.type === "text")?.text;
    if (typeof text !== "string") throw failure("EMPTY_OUTPUT");
    const tokens = { in: Number.isSafeInteger(data?.usage?.input_tokens) ? data.usage.input_tokens : null,
      out: Number.isSafeInteger(data?.usage?.output_tokens) ? data.usage.output_tokens : null };
    recordGeneration(budgetPath, limit, requestId, tokens.in, tokens.out, now);
    return { text, model: MODEL, tokens };
  };
  provider.timeoutMs = deadline;
  provider.budget = () => {
    try {
      const current = JSON.parse(readFileSync(budgetPath, "utf8"));
      if (current.phase?.model !== MODEL || !Number.isSafeInteger(current.phase?.startedAt) || !Number.isSafeInteger(current.phase?.capMicros) || !Number.isSafeInteger(current.phase?.callLimit)) return null;
      return { phase: { ...current.phase }, capUsd: Math.min(limit.micros, current.phase.capMicros) / 1_000_000, reservedUsd: current.reservedMicros / 1_000_000, calls: current.calls,
        ledger: Array.isArray(current.ledger) ? current.ledger.map((entry) => ({ ...entry, tokens: entry.tokens && { ...entry.tokens } })) : [] };
    } catch { return null; }
  };
  return provider;
}
