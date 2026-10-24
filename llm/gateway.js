// llm/gateway.js — LLM gateway: schema validation, one retry, role fallback (R-12).
// Provider fn is injected: provider({role, system, messages, temperature})
//   -> {text, tokens?, model?} or throws {code: TIMEOUT|PROVIDER_ERROR}.
// Never logs prompt content (R-66). ESM, stdlib only.

const ROLE_FALLBACK = {
  classifier: { events: [], clarify: [] },
  npc: { fallback: true },
  judge: { insufficient: true },
  coach: { insufficient: true },
};
const FAILURE_CODES = new Set(["TIMEOUT", "PROVIDER_ERROR", "OUTPUT_INVALID", "PROVIDER_UNAVAILABLE", "LLM_BUDGET_EXCEEDED", "LLM_BUDGET_UNAVAILABLE", "THROTTLED", "RATE_LIMITED", "INVALID_JSON", "SCHEMA_INVALID", "EMPTY_OUTPUT"]);

export function safeFailure(error) {
  const failureCode = FAILURE_CODES.has(error?.code) ? error.code : "PROVIDER_ERROR";
  const httpStatus = Number.isInteger(error?.httpStatus) && error.httpStatus >= 400 && error.httpStatus <= 599
    ? error.httpStatus : undefined;
  return { failureCode, httpStatus };
}

export function fallbackFor(role) {
  const fb = ROLE_FALLBACK[role];
  if (!fb) throw Object.assign(new Error(`unknown role: ${role}`), { code: "BAD_ROLE" });
  return JSON.parse(JSON.stringify(fb));
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Minimal JSON-schema validator: object/array/string/number/boolean/integer/enum/required.
export function validateAgainstSchema(data, schema) {
  const errors = [];
  function check(value, sch, path) {
    if (!sch || typeof sch !== "object") return;
    if (Array.isArray(sch.type)) {
      const valid = sch.type.some((type) => validateAgainstSchema(value, { ...sch, type }).ok);
      if (!valid) errors.push(`${path}: no permitted type`);
      return;
    }
    if (Array.isArray(sch.enum)) {
      if (!sch.enum.some((e) => e === value)) errors.push(`${path}: not in enum`);
      return;
    }
    const t = sch.type;
    if (t === undefined || t === null) return;
    if (t === "null") {
      if (value !== null) errors.push(`${path}: expected null`);
    } else if (t === "object") {
      if (!isPlainObject(value)) { errors.push(`${path}: expected object`); return; }
      for (const key of sch.required || []) {
        if (!(key in value)) errors.push(`${path}.${key}: missing required`);
      }
      for (const key of Object.keys(sch.properties || {})) {
        if (key in value) check(value[key], sch.properties[key], `${path}.${key}`);
      }
      if (sch.additionalProperties === false && Object.keys(value).some((key) => !(key in (sch.properties || {})))) errors.push(`${path}: extra property`);
    } else if (t === "array") {
      if (!Array.isArray(value)) { errors.push(`${path}: expected array`); return; }
      if (Number.isInteger(sch.minItems) && value.length < sch.minItems) errors.push(`${path}: too few items`);
      if (Number.isInteger(sch.maxItems) && value.length > sch.maxItems) errors.push(`${path}: too many items`);
      if (sch.items) value.forEach((v, i) => check(v, sch.items, `${path}[${i}]`));
    } else if (t === "string") {
      if (typeof value !== "string") errors.push(`${path}: expected string`);
      else if (Number.isInteger(sch.minLength) && value.length < sch.minLength) errors.push(`${path}: too short`);
    } else if (t === "number") {
      if (typeof value !== "number") errors.push(`${path}: expected number`);
    } else if (t === "integer") {
      if (!Number.isInteger(value)) errors.push(`${path}: expected integer`);
    } else if (t === "boolean") {
      if (typeof value !== "boolean") errors.push(`${path}: expected boolean`);
    }
    if ((t === "number" || t === "integer") && typeof value === "number") {
      if (!Number.isFinite(value)) errors.push(`${path}: expected finite number`);
      if (typeof sch.minimum === "number" && value < sch.minimum) errors.push(`${path}: below minimum`);
      if (typeof sch.maximum === "number" && value > sch.maximum) errors.push(`${path}: above maximum`);
    }
  }
  check(data, schema, "$");
  return { ok: errors.length === 0, errors };
}

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject({ code: "TIMEOUT" }), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function zeroTokens() {
  return { in: 0, out: 0 };
}

// complete({role, system, messages, schema|null, temperature, timeoutMs,
//           provider, manifestId, fallback})
// -> {ok, data, text, raw, latencyMs, tokens, model, manifestId, source, attempts}.
// Retries ONCE on parse/validation/timeout error, then role fallback (R-12).
// attempts = number of provider calls made.
export async function complete(opts) {
  const {
    role, system, messages, schema = null, temperature,
    timeoutMs = 3000, provider, manifestId = null, fallback, validateData,
  } = opts || {};
  if (typeof provider !== "function") {
    throw Object.assign(new Error("provider function required"), { code: "BAD_INPUT" });
  }
  const fb = fallback !== undefined ? fallback : fallbackFor(role);
  const t0 = Date.now();
  const done = (ok, data, text, raw, tokens, model, source, attempts, failure = null) => ({
    ok, data, text, raw,
    latencyMs: Date.now() - t0,
    tokens: tokens || zeroTokens(),
    model: model || null,
    manifestId,
    source,
    attempts,
    ...(failure || {}),
  });

  let attempts = 0;
  for (let i = 0; i < 2; i++) {
    attempts += 1;
    let res;
    try {
      res = await withTimeout(
        Promise.resolve(provider({ role, system, messages, temperature, schema })),
        provider.timeoutMs || timeoutMs
      );
    } catch (e) {
      const failure = safeFailure(e);
      if (e?.retryable !== false && ["TIMEOUT", "PROVIDER_ERROR", "OUTPUT_INVALID"].includes(e?.code) && i === 0) continue;
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts, failure);
    }
    const text = res && res.text;
    if (typeof text !== "string") {
      if (i === 0) continue; // one retry on locally detected empty output
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts, { failureCode: "EMPTY_OUTPUT" });
    }
    if (!schema) {
      return done(true, { text }, text, text, res.tokens || zeroTokens(), res.model, "llm", attempts);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (i === 0) continue; // one retry on parse failure
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts, { failureCode: "INVALID_JSON" });
    }
    const v = validateAgainstSchema(data, schema);
    let customOk = true;
    try { if (typeof validateData === "function") customOk = validateData(data) === true; } catch { customOk = false; }
    if (!v.ok || !customOk) {
      if (i === 0) continue; // one retry on schema failure
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts, { failureCode: "SCHEMA_INVALID" });
    }
    return done(true, data, text, text, res.tokens || zeroTokens(), res.model, "llm", attempts);
  }
  return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts, { failureCode: "PROVIDER_ERROR" });
}
