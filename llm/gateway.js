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
    if (Array.isArray(sch.enum)) {
      if (!sch.enum.some((e) => e === value)) errors.push(`${path}: not in enum`);
      return;
    }
    const t = sch.type;
    if (t === undefined || t === null) return;
    if (t === "object") {
      if (!isPlainObject(value)) { errors.push(`${path}: expected object`); return; }
      for (const key of sch.required || []) {
        if (!(key in value)) errors.push(`${path}.${key}: missing required`);
      }
      for (const key of Object.keys(sch.properties || {})) {
        if (key in value) check(value[key], sch.properties[key], `${path}.${key}`);
      }
    } else if (t === "array") {
      if (!Array.isArray(value)) { errors.push(`${path}: expected array`); return; }
      if (sch.items) value.forEach((v, i) => check(v, sch.items, `${path}[${i}]`));
    } else if (t === "string") {
      if (typeof value !== "string") errors.push(`${path}: expected string`);
    } else if (t === "number") {
      if (typeof value !== "number") errors.push(`${path}: expected number`);
    } else if (t === "integer") {
      if (!Number.isInteger(value)) errors.push(`${path}: expected integer`);
    } else if (t === "boolean") {
      if (typeof value !== "boolean") errors.push(`${path}: expected boolean`);
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
    timeoutMs = 3000, provider, manifestId = null, fallback,
  } = opts || {};
  if (typeof provider !== "function") {
    throw Object.assign(new Error("provider function required"), { code: "BAD_INPUT" });
  }
  const fb = fallback !== undefined ? fallback : fallbackFor(role);
  const t0 = Date.now();
  const done = (ok, data, text, raw, tokens, model, source, attempts) => ({
    ok, data, text, raw,
    latencyMs: Date.now() - t0,
    tokens: tokens || zeroTokens(),
    model: model || null,
    manifestId,
    source,
    attempts,
  });

  let attempts = 0;
  for (let i = 0; i < 2; i++) {
    attempts += 1;
    let res;
    try {
      res = await withTimeout(
        Promise.resolve(provider({ role, system, messages, temperature })),
        timeoutMs
      );
    } catch (e) {
      const code = e && e.code;
      if ((code === "TIMEOUT" || code === "PROVIDER_ERROR") && i === 0) continue; // one retry
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts);
    }
    const text = res && res.text;
    if (typeof text !== "string") {
      if (i === 0) continue; // one retry on empty/non-string
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts);
    }
    if (!schema) {
      return done(true, { text }, text, text, res.tokens || zeroTokens(), res.model, "llm", attempts);
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      if (i === 0) continue; // one retry on parse failure
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts);
    }
    const v = validateAgainstSchema(data, schema);
    if (!v.ok) {
      if (i === 0) continue; // one retry on schema failure
      return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts);
    }
    return done(true, data, text, text, res.tokens || zeroTokens(), res.model, "llm", attempts);
  }
  return done(false, fb, null, null, zeroTokens(), null, "fallback", attempts);
}
