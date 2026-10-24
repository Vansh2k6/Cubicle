import { readFileSync } from "node:fs";
import { open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config.js";
import { safeFailure, validateAgainstSchema } from "../gateway.js";

const MODEL = "claude-haiku-5-5";
const CALL_CAP = 40, TOKEN_CAP = 200_000, OUTPUT_CAP = 1024, USD_CAP = 4, RATE_PER_MILLION = 2.5;
const GRANT = "cubicle-scenario-prototype-haiku-2026-10-25";
const error = (code, retryable = false) => Object.assign(new Error(`LLM ${code.toLowerCase()}`), { code, retryable });
const validLedger = (v) => v && v.version === 1 && Number.isSafeInteger(v.calls) && v.calls >= 0 && v.calls <= CALL_CAP &&
  Number.isSafeInteger(v.reservedTokens) && v.reservedTokens >= 0 && v.reservedTokens <= TOKEN_CAP &&
  Number.isFinite(v.reservedUsd) && v.reservedUsd >= 0 && v.reservedUsd <= USD_CAP &&
  Number.isSafeInteger(v.actualInputTokens) && v.actualInputTokens >= 0 && Number.isSafeInteger(v.actualOutputTokens) && v.actualOutputTokens >= 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const caps = Object.freeze({calls: CALL_CAP, reservedTokens: TOKEN_CAP, outputTokens: OUTPUT_CAP, usd: USD_CAP, usdPerMillionReservedTokens: RATE_PER_MILLION});

async function lockedUpdate(path, update) {
  const lock = `${path}.lock`, until = Date.now() + 5000;
  let handle;
  while (!handle) {
    try { handle = await open(lock, "wx"); }
    catch (e) { if (e.code !== "EEXIST" || Date.now() >= until) throw error("LLM_BUDGET_UNAVAILABLE"); await wait(20); }
  }
  try {
    let ledger;
    try { ledger = JSON.parse(await readFile(path, "utf8")); } catch { throw error("LLM_BUDGET_UNAVAILABLE"); }
    if (!validLedger(ledger)) throw error("LLM_BUDGET_UNAVAILABLE");
    const next = update(ledger);
    if (!next || !validLedger(next)) throw error("LLM_BUDGET_EXCEEDED");
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next), { flag: "wx" });
    try { await rename(temp, path); }
    catch (e) {
      // Windows does not replace an existing destination with rename(). Keep
      // the previous counters recoverable while swapping under the exclusive lock.
      if (!["EPERM", "EEXIST", "ENOTEMPTY"].includes(e.code)) { await unlink(temp).catch(() => {}); throw error("LLM_BUDGET_UNAVAILABLE"); }
      const backup = `${path}.${randomUUID()}.previous`;
      try {
        await rename(path, backup);
        try { await rename(temp, path); }
        catch (replaceError) { await rename(backup, path).catch(() => {}); throw replaceError; }
        await unlink(backup).catch(() => {});
      } catch {
        await unlink(temp).catch(() => {});
        throw error("LLM_BUDGET_UNAVAILABLE");
      }
    }
    return next;
  } finally { await handle.close().catch(() => {}); await unlink(lock).catch(() => {}); }
}

function contentText(blocks) {
  return Array.isArray(blocks) ? blocks.filter((block) => block?.type === "text" && typeof block.text === "string").map((block) => block.text).join("") : "";
}

async function readBoundedJson(response, limit = 256_000) {
  const length = Number(response.headers?.get?.("content-length"));
  if (Number.isFinite(length) && length > limit) { await response.body?.cancel?.().catch?.(() => {}); throw error("OUTPUT_INVALID"); }
  if (!response.body?.getReader) return response.json();
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const {done, value} = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw error("OUTPUT_INVALID"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock?.(); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function authorizeLedger(path) {
  return lockedUpdate(path, (ledger) => {
    if (ledger.grant === undefined && ledger.calls === 0 && ledger.reservedTokens === 0 && ledger.reservedUsd === 0 &&
        ledger.actualInputTokens === 0 && ledger.actualOutputTokens === 0 && Object.keys(ledger).sort().join(",") ===
        ["actualInputTokens", "actualOutputTokens", "calls", "reservedTokens", "reservedUsd", "version"].join(",")) {
      return {...ledger, grant: GRANT, model: MODEL, caps, grantBoundAt: new Date().toISOString()};
    }
    return ledger.grant === GRANT && ledger.model === MODEL && JSON.stringify(ledger.caps) === JSON.stringify(caps) ? ledger : null;
  });
}

export function anthropicProviderMode(env = process.env) {
  if (env.LLM_PROVIDER !== "anthropic") return "offline";
  if (env.RUN_LIVE !== "1" || env.CUBICLE_LIVE_TEST !== GRANT || !env.ANTHROPIC_API_KEY?.trim()) return "offline (Claude authorization is incomplete)";
  const path = resolve(env.ANTHROPIC_BUDGET_LEDGER || ".state/anthropic-budget-ledger.json");
  try {
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    const emptyUnbound = ledger.grant === undefined && ledger.calls === 0 && ledger.reservedTokens === 0 && ledger.reservedUsd === 0 &&
      ledger.actualInputTokens === 0 && ledger.actualOutputTokens === 0 && Object.keys(ledger).sort().join(",") ===
      ["actualInputTokens", "actualOutputTokens", "calls", "reservedTokens", "reservedUsd", "version"].join(",");
    const bound = ledger.grant === GRANT && ledger.model === MODEL && JSON.stringify(ledger.caps) === JSON.stringify(caps);
    if (validLedger(ledger) && (emptyUnbound || bound)) {
      if (ledger.calls >= CALL_CAP || ledger.reservedTokens >= TOKEN_CAP || ledger.reservedUsd >= USD_CAP) return "offline (Claude task budget exhausted)";
      return "live (Claude Haiku · task budget active)";
    }
  } catch { /* missing or malformed budget stays offline until fixed */ }
  return "offline (Claude budget ledger is unavailable)";
}

export function createAnthropicProvider({ env = process.env, config = loadConfig(env), fetchFn = globalThis.fetch,
  now = Date.now, timeoutMs = 12_000 } = {}) {
  const key = typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
  const ledgerPath = resolve(env.ANTHROPIC_BUDGET_LEDGER || ".state/anthropic-budget-ledger.json");
  const provider = async ({ role, system = "", messages = [], schema } = {}) => {
    if (env.LLM_PROVIDER !== "anthropic" || env.RUN_LIVE !== "1" || env.CUBICLE_LIVE_TEST !== GRANT || !key) throw error("PROVIDER_UNAVAILABLE");
    if (typeof fetchFn !== "function") throw error("PROVIDER_UNAVAILABLE");
    if (!config[role] || typeof system !== "string" || !Array.isArray(messages)) throw error("PROVIDER_ERROR");
    const maxTokens = Math.min(OUTPUT_CAP, Math.max(1, Number.isSafeInteger(config[role].maxTokens) ? config[role].maxTokens : OUTPUT_CAP));
    if (!messages.length || messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content) || messages.at(-1)?.role !== "user") throw error("PROVIDER_ERROR");
    const safeMessages = messages.map(({role: messageRole, content}) => ({role: messageRole, content}));
    const body = { model: MODEL, max_tokens: maxTokens, system,
      messages: safeMessages,
      ...(schema ? { output_config: { format: { type: "json_schema", schema } } } : {}) };
    const reserveTokens = Buffer.byteLength(JSON.stringify(body), "utf8") + 2048 + maxTokens;
    const reservedUsd = reserveTokens * RATE_PER_MILLION / 1_000_000;
    await authorizeLedger(ledgerPath);
    await lockedUpdate(ledgerPath, (ledger) => ledger.calls + 1 > CALL_CAP || ledger.reservedTokens + reserveTokens > TOKEN_CAP || ledger.reservedUsd + reservedUsd > USD_CAP
      ? null : ledger.grant !== GRANT || ledger.model !== MODEL || JSON.stringify(ledger.caps) !== JSON.stringify(caps) ? null
        : { ...ledger, calls: ledger.calls + 1, reservedTokens: ledger.reservedTokens + reserveTokens,
        reservedUsd: ledger.reservedUsd + reservedUsd });
    const controller = new AbortController();
    let timer, timedOut = false;
    try {
      const timeout = new Promise((_, reject) => { timer = setTimeout(() => { timedOut = true; controller.abort(); reject(error("TIMEOUT", true)); }, timeoutMs); });
      const data = await Promise.race([(async () => {
        const response = await fetchFn("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
          signal: controller.signal, body: JSON.stringify(body),
        });
        if (!response?.ok) { await response?.body?.cancel?.().catch?.(() => {}); throw error(response?.status === 429 || response?.status >= 500 ? "PROVIDER_ERROR" : "PROVIDER_UNAVAILABLE", response?.status === 429 || response?.status >= 500); }
        return readBoundedJson(response);
      })(), timeout]);
      const input = data?.usage?.input_tokens, output = data?.usage?.output_tokens;
      if (Number.isSafeInteger(input) && input >= 0 && Number.isSafeInteger(output) && output >= 0) {
        await lockedUpdate(ledgerPath, (ledger) => ledger.grant === GRANT && ledger.model === MODEL && JSON.stringify(ledger.caps) === JSON.stringify(caps)
          ? {...ledger, actualInputTokens: ledger.actualInputTokens + input, actualOutputTokens: ledger.actualOutputTokens + output} : null);
      }
      if (["refusal", "max_tokens", "model_context_window_exceeded"].includes(data?.stop_reason)) throw error("OUTPUT_INVALID", data.stop_reason !== "refusal");
      const text = contentText(data?.content);
      if (!text || (schema && !validateAgainstSchema(safeJson(text), schema).ok)) throw error("OUTPUT_INVALID", true);
      return { text, model: MODEL, tokens: { in: Number.isSafeInteger(input) ? input : 0, out: Number.isSafeInteger(output) ? output : 0 } };
    } catch (e) {
      if (e?.code && e.code.startsWith("LLM_")) throw e;
      const safe = safeFailure(e);
      throw error(timedOut ? "TIMEOUT" : safe.failureCode, timedOut || e?.retryable === true || !e?.code);
    } finally { clearTimeout(timer); }
  };
  provider.timeoutMs = timeoutMs + 1000;
  return provider;
}

function safeJson(text) { try { return JSON.parse(text); } catch { return null; } }

export const anthropicBudgetCaps = Object.freeze({ calls: CALL_CAP, reservedTokens: TOKEN_CAP, outputTokens: OUTPUT_CAP, usd: USD_CAP, reservedUsdPerMillionTokens: RATE_PER_MILLION });
