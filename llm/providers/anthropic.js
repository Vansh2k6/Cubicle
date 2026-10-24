import { readFileSync } from "node:fs";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config.js";
import { safeFailure, validateAgainstSchema } from "../gateway.js";

const MODEL = "claude-haiku-5-5";
const CALL_CAP = 40, TOKEN_CAP = 200_000, OUTPUT_CAP = 1024, USD_CAP = 4, RATE_PER_MILLION = 2.5;
const GRANT = "cubicle-scenario-prototype-haiku-2026-10-25";
const GAMEPLAY_GRANT = "all-scenarios-live-gameplay";
const GAMEPLAY_CALL_CAP = 350, GAMEPLAY_TOKEN_CAP = 5_000_000, GAMEPLAY_OUTPUT_CAP = 1024, GAMEPLAY_USD_CAP = 0.5;
const GAMEPLAY_INPUT_BYTE_CAP = 100_000, GAMEPLAY_INPUT_RATE_PER_MILLION = 0.1, GAMEPLAY_OUTPUT_RATE_PER_MILLION = 0.5;
const caps = Object.freeze({calls: CALL_CAP, reservedTokens: TOKEN_CAP, outputTokens: OUTPUT_CAP, usd: USD_CAP, usdPerMillionReservedTokens: RATE_PER_MILLION});
const grantProfiles = Object.freeze({
  [GRANT]: Object.freeze({name: GRANT, caps, ledger: ".state/anthropic-budget-ledger.json", reserve: (body, maxTokens) => {
    const reservedTokens = Buffer.byteLength(JSON.stringify(body), "utf8") + 2048 + maxTokens;
    return {reservedTokens, reservedUsd: reservedTokens * RATE_PER_MILLION / 1_000_000};
  }}),
  [GAMEPLAY_GRANT]: Object.freeze({
    name: GAMEPLAY_GRANT,
    caps: Object.freeze({calls: GAMEPLAY_CALL_CAP, reservedTokens: GAMEPLAY_TOKEN_CAP, outputTokens: GAMEPLAY_OUTPUT_CAP,
      usd: GAMEPLAY_USD_CAP, usdPerMillionInputTokens: GAMEPLAY_INPUT_RATE_PER_MILLION, usdPerMillionOutputTokens: GAMEPLAY_OUTPUT_RATE_PER_MILLION,
      maxInputBytes: GAMEPLAY_INPUT_BYTE_CAP}),
    ledger: ".state/all-scenarios-live-gameplay-ledger.json",
    reserve: (body, maxTokens) => {
      const inputBytes = Buffer.byteLength(JSON.stringify(body), "utf8");
      if (inputBytes + 2048 > GAMEPLAY_INPUT_BYTE_CAP) throw error("LLM_BUDGET_EXCEEDED");
      const inputBound = inputBytes + 2048;
      return {reservedTokens: inputBound + maxTokens,
        reservedUsd: inputBound * GAMEPLAY_INPUT_RATE_PER_MILLION / 1_000_000 + maxTokens * GAMEPLAY_OUTPUT_RATE_PER_MILLION / 1_000_000};
    },
  }),
});
const grantProfileFor = (name) => Object.hasOwn(grantProfiles, name) ? grantProfiles[name] : null;

export async function initializeAnthropicBudgetLedger(grantName, path) {
  const selectedGrant = grantName || GRANT;
  const profile = grantProfileFor(selectedGrant);
  if (!profile) throw error("PROVIDER_UNAVAILABLE");
  const ledgerPath = resolve(path || profile.ledger);
  await mkdir(dirname(ledgerPath), {recursive: true});
  const initial = selectedGrant === GRANT
    ? {version: 1, calls: 0, reservedTokens: 0, reservedUsd: 0, actualInputTokens: 0, actualOutputTokens: 0}
    : {version: 1, grant: profile.name, model: MODEL, caps: profile.caps, grantBoundAt: new Date().toISOString(),
      calls: 0, reservedTokens: 0, reservedUsd: 0, actualInputTokens: 0, actualOutputTokens: 0};
  const handle = await open(ledgerPath, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(initial)); await handle.sync(); }
  catch (e) { await handle.close().catch(() => {}); await unlink(ledgerPath).catch(() => {}); throw e; }
  await handle.close();
  return ledgerPath;
}
const LOCK_WAIT_MS = 5000;
const RENAME_RETRIES = 3;
const TRANSIENT_RENAME_CODES = new Set(["EPERM", "EACCES", "EBUSY", "EEXIST", "ENOTEMPTY"]);
const error = (code, retryable = false) => Object.assign(new Error(`LLM ${code.toLowerCase()}`), { code, retryable });
const validLedger = (v, profile) => v && v.version === 1 && Number.isSafeInteger(v.calls) && v.calls >= 0 && v.calls <= profile.caps.calls &&
  Number.isSafeInteger(v.reservedTokens) && v.reservedTokens >= 0 && v.reservedTokens <= profile.caps.reservedTokens &&
  Number.isFinite(v.reservedUsd) && v.reservedUsd >= 0 && v.reservedUsd <= profile.caps.usd &&
  Number.isSafeInteger(v.actualInputTokens) && v.actualInputTokens >= 0 && Number.isSafeInteger(v.actualOutputTokens) && v.actualOutputTokens >= 0;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function renameWithRetry(source, destination) {
  for (let attempt = 0; ; attempt++) {
    try { await rename(source, destination); return; }
    catch (e) {
      if (!TRANSIENT_RENAME_CODES.has(e.code) || attempt >= RENAME_RETRIES) throw e;
      await wait(20 * (attempt + 1));
    }
  }
}

async function lockedUpdate(path, profile, update) {
  const lock = `${path}.lock`, until = Date.now() + LOCK_WAIT_MS;
  let handle;
  while (!handle) {
    try { handle = await open(lock, "wx"); }
    catch (e) { if (e.code !== "EEXIST" || Date.now() >= until) throw error("LLM_BUDGET_UNAVAILABLE"); await wait(20); }
  }
  try {
    let ledger;
    try { ledger = JSON.parse(await readFile(path, "utf8")); } catch { throw error("LLM_BUDGET_UNAVAILABLE"); }
    if (!validLedger(ledger, profile)) throw error("LLM_BUDGET_UNAVAILABLE");
    const next = update(ledger);
    if (!next || !validLedger(next, profile)) throw error("LLM_BUDGET_EXCEEDED");
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next), { flag: "wx" });
    try { await renameWithRetry(temp, path); }
    catch (e) {
      // Windows does not replace an existing destination with rename(). Keep
      // the previous counters recoverable while swapping under the exclusive lock.
      if (!["EPERM", "EEXIST", "ENOTEMPTY"].includes(e.code)) { await unlink(temp).catch(() => {}); throw error("LLM_BUDGET_UNAVAILABLE"); }
      const backup = `${path}.${randomUUID()}.previous`;
      try {
        await renameWithRetry(path, backup);
        try { await renameWithRetry(temp, path); }
        catch (replaceError) { await renameWithRetry(backup, path).catch(() => {}); throw replaceError; }
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

function normalizeStructuredJson(text, schema) {
  let source = String(text || "").trim();
  if (source.startsWith("```")) {
    const fence = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(source);
    if (!fence) return null;
    source = fence[1].trim();
  }
  const parsed = safeJson(source);
  if (parsed === null || !validateAgainstSchema(parsed, schema).ok) return null;
  return JSON.stringify(parsed);
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

async function authorizeLedger(path, profile) {
  return lockedUpdate(path, profile, (ledger) => {
    const grant = profile.name;
    if (ledger.grant === undefined && ledger.calls === 0 && ledger.reservedTokens === 0 && ledger.reservedUsd === 0 &&
        ledger.actualInputTokens === 0 && ledger.actualOutputTokens === 0 && Object.keys(ledger).sort().join(",") ===
        ["actualInputTokens", "actualOutputTokens", "calls", "reservedTokens", "reservedUsd", "version"].join(",")) {
      if (grant !== GRANT) throw error("LLM_BUDGET_UNAVAILABLE");
      return {...ledger, grant, model: MODEL, caps: profile.caps, grantBoundAt: new Date().toISOString()};
    }
    if (ledger.grant !== grant || ledger.model !== MODEL || JSON.stringify(ledger.caps) !== JSON.stringify(profile.caps)) throw error("LLM_BUDGET_UNAVAILABLE");
    return ledger;
  });
}

export function anthropicProviderMode(env = process.env) {
  if (env.LLM_PROVIDER !== "anthropic") return "offline";
  const profile = grantProfileFor(env.CUBICLE_LIVE_TEST);
  if (env.RUN_LIVE !== "1" || !profile || !env.ANTHROPIC_API_KEY?.trim()) return "offline (Claude authorization is incomplete)";
  const path = resolve(env.ANTHROPIC_BUDGET_LEDGER || profile.ledger);
  try {
    const ledger = JSON.parse(readFileSync(path, "utf8"));
    const emptyUnbound = profile.name === GRANT && ledger.grant === undefined && ledger.calls === 0 && ledger.reservedTokens === 0 && ledger.reservedUsd === 0 &&
      ledger.actualInputTokens === 0 && ledger.actualOutputTokens === 0 && Object.keys(ledger).sort().join(",") ===
      ["actualInputTokens", "actualOutputTokens", "calls", "reservedTokens", "reservedUsd", "version"].join(",");
    const bound = ledger.grant === profile.name && ledger.model === MODEL && JSON.stringify(ledger.caps) === JSON.stringify(profile.caps);
    if (validLedger(ledger, profile) && (emptyUnbound || bound)) {
      if (ledger.calls >= profile.caps.calls || ledger.reservedTokens >= profile.caps.reservedTokens || ledger.reservedUsd >= profile.caps.usd) return "offline (Claude task budget exhausted)";
      return "live (Claude Haiku · task budget active)";
    }
  } catch { /* missing or malformed budget stays offline until fixed */ }
  return "offline (Claude budget ledger is unavailable)";
}

export function createAnthropicProvider({ env = process.env, config = loadConfig(env), fetchFn = globalThis.fetch,
  now = Date.now, timeoutMs = 12_000 } = {}) {
  const key = typeof env.ANTHROPIC_API_KEY === "string" ? env.ANTHROPIC_API_KEY.trim() : "";
  const profile = grantProfileFor(env.CUBICLE_LIVE_TEST);
  const ledgerPath = resolve(env.ANTHROPIC_BUDGET_LEDGER || profile?.ledger || ".state/anthropic-budget-ledger.json");
  const provider = async ({ role, system = "", messages = [], schema } = {}) => {
    if (env.LLM_PROVIDER !== "anthropic" || env.RUN_LIVE !== "1" || !profile || !key) throw error("PROVIDER_UNAVAILABLE");
    if (typeof fetchFn !== "function") throw error("PROVIDER_UNAVAILABLE");
    if (!config[role] || typeof system !== "string" || !Array.isArray(messages)) throw error("PROVIDER_ERROR");
    const maxTokens = Math.min(profile.caps.outputTokens, Math.max(1, Number.isSafeInteger(config[role].maxTokens) ? config[role].maxTokens : profile.caps.outputTokens));
    if (!messages.length || messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content) || messages.at(-1)?.role !== "user") throw error("PROVIDER_ERROR");
    const safeMessages = messages.map(({role: messageRole, content}) => ({role: messageRole, content}));
    // The shared runtime schemas intentionally leave event params open because
    // the classifier validates them against its own taxonomy after decoding.
    // Anthropic strict structured outputs require every object to close its
    // properties, which would reject those established schemas. Keep the
    // existing prompt contract and gateway/schema validation for this provider.
    const body = { model: MODEL, max_tokens: maxTokens, output_config: {effort: config[role].reasoningEffort}, system, messages: safeMessages };
    const {reservedTokens, reservedUsd} = profile.reserve(body, maxTokens);
    await authorizeLedger(ledgerPath, profile);
    await lockedUpdate(ledgerPath, profile, (ledger) => ledger.calls + 1 > profile.caps.calls || ledger.reservedTokens + reservedTokens > profile.caps.reservedTokens || ledger.reservedUsd + reservedUsd > profile.caps.usd
      ? null : ledger.grant !== profile.name || ledger.model !== MODEL || JSON.stringify(ledger.caps) !== JSON.stringify(profile.caps) ? null
        : { ...ledger, calls: ledger.calls + 1, reservedTokens: ledger.reservedTokens + reservedTokens,
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
        await lockedUpdate(ledgerPath, profile, (ledger) => ledger.grant === profile.name && ledger.model === MODEL && JSON.stringify(ledger.caps) === JSON.stringify(profile.caps)
          ? {...ledger, actualInputTokens: ledger.actualInputTokens + input, actualOutputTokens: ledger.actualOutputTokens + output} : null);
      }
      if (["refusal", "max_tokens", "model_context_window_exceeded"].includes(data?.stop_reason)) throw error("OUTPUT_INVALID", data.stop_reason !== "refusal");
      const rawText = contentText(data?.content);
      const text = schema ? normalizeStructuredJson(rawText, schema) : rawText;
      if (!text) throw error("OUTPUT_INVALID", true);
      return { text, model: MODEL, tokens: { in: Number.isSafeInteger(input) ? input : 0, out: Number.isSafeInteger(output) ? output : 0 } };
    } catch (e) {
      if (e?.code && e.code.startsWith("LLM_")) throw e;
      const safe = safeFailure(e);
      throw error(timedOut ? "TIMEOUT" : safe.failureCode, timedOut || e?.retryable === true || !e?.code);
    } finally { clearTimeout(timer); }
  };
  // The gateway deadline covers three bounded ledger-lock windows (authorization,
  // reservation, usage), plus the worst-case transient-rename retries across
  // those atomic updates. The network/body timer itself remains timeoutMs.
  provider.timeoutMs = timeoutMs + LOCK_WAIT_MS * 3 + 2000;
  return provider;
}

function safeJson(text) { try { return JSON.parse(text); } catch { return null; } }

export const anthropicBudgetCaps = Object.freeze({ calls: CALL_CAP, reservedTokens: TOKEN_CAP, outputTokens: OUTPUT_CAP, usd: USD_CAP, reservedUsdPerMillionTokens: RATE_PER_MILLION });
