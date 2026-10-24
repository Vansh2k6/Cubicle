// Per-role Groq defaults, overridable server-side. Offline remains the default.
// ESM, stdlib only.

const DEFAULTS = {
  classifier: { model: "openai/gpt-oss-20b", temperature: 0, maxTokens: 512, reasoningEffort: "low", extraParams: {}, timeoutMs: 8000, promptVersion: "v4", schemaVersion: 1 },
  npc: { model: "qwen/qwen3.8-27b", temperature: 0.8, maxTokens: 512, reasoningEffort: "none", extraParams: {}, timeoutMs: 8000, promptVersion: "v5", schemaVersion: 1 },
  judge: { model: "openai/gpt-oss-120b", temperature: 0, maxTokens: 1024, reasoningEffort: "low", extraParams: {}, timeoutMs: 8000, promptVersion: "v2", schemaVersion: 2 },
  coach: { model: "openai/gpt-oss-120b", temperature: 0.7, maxTokens: 1024, reasoningEffort: "low", extraParams: {}, timeoutMs: 8000, promptVersion: "v3", schemaVersion: 2 },
};

const MODEL_ENV = {
  classifier: "CLASSIFIER_MODEL",
  npc: "NPC_MODEL",
  judge: "JUDGE_MODEL",
  coach: "COACH_MODEL",
};

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Canonical JSON: sorted keys, no whitespace variance.
function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function loadConfig(env = process.env) {
  const config = {};
  const anthropic = env?.LLM_PROVIDER === "anthropic";
  for (const role of Object.keys(DEFAULTS)) {
    const base = DEFAULTS[role];
    const override = env && typeof env[MODEL_ENV[role]] === "string" && env[MODEL_ENV[role]].trim() !== ""
      ? env[MODEL_ENV[role]].trim()
      : base.model;
    const prefix = role.toUpperCase();
    let extraParams = {};
    try { extraParams = JSON.parse(env[`${prefix}_EXTRA_PARAMS`] || "{}"); } catch { /* ignore invalid optional params */ }
    if (!extraParams || typeof extraParams !== "object" || Array.isArray(extraParams)) extraParams = {};
    const modelExtras = /^openai\/gpt-oss-(20b|120b)$/.test(override) ? { include_reasoning: false }
      : override === "qwen/qwen3.8-27b" ? { reasoning_format: "hidden" } : {};
    config[role] = { ...base, model: anthropic ? "claude-haiku-5-5" : override,
      maxTokens: anthropic ? Math.min(1024, positiveInt(env[`${prefix}_MAX_TOKENS`], 1024)) : positiveInt(env[`${prefix}_MAX_TOKENS`], base.maxTokens),
      reasoningEffort: anthropic ? "low" : env[`${prefix}_REASONING_EFFORT`] || base.reasoningEffort,
      extraParams: { ...modelExtras, ...extraParams },
    };
  }
  return Object.freeze(config);
}

export function positiveInt(value, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : fallback;
}

export function providerName(env = process.env) {
  if (env.LLM_PROVIDER === "anthropic") return "anthropic";
  return env.LLM_PROVIDER === "groq" && typeof env.GROQ_API_KEY === "string" && env.GROQ_API_KEY.trim() ? "groq" : "offline";
}

// Stable hash of the canonical default role table (env overrides excluded).
export const CONFIG_HASH = fnv1a(canonicalize(DEFAULTS));

export const ROLES = Object.freeze(Object.keys(DEFAULTS));
