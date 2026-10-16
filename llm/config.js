// llm/config.js — Per-role LLM routing config. Provider UNCHOSEN (P0.2 deferred):
// models are placeholder strings, overridable by env. No keys here (R-50).
// ESM, stdlib only.

const DEFAULTS = {
  classifier: { model: "pending-provider:classifier", temperature: 0, timeoutMs: 1500, promptVersion: "v1", schemaVersion: 1 },
  npc: { model: "pending-provider:npc", temperature: 0.8, timeoutMs: 3000, promptVersion: "v1", schemaVersion: 1 },
  judge: { model: "pending-provider:judge", temperature: 0, timeoutMs: 8000, promptVersion: "v1", schemaVersion: 1 },
  coach: { model: "pending-provider:coach", temperature: 0.7, timeoutMs: 8000, promptVersion: "v1", schemaVersion: 1 },
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
  for (const role of Object.keys(DEFAULTS)) {
    const base = DEFAULTS[role];
    const override = env && typeof env[MODEL_ENV[role]] === "string" && env[MODEL_ENV[role]].trim() !== ""
      ? env[MODEL_ENV[role]].trim()
      : base.model;
    config[role] = { ...base, model: override };
  }
  return Object.freeze(config);
}

// Stable hash of the canonical default role table (env overrides excluded).
export const CONFIG_HASH = fnv1a(canonicalize(DEFAULTS));

export const ROLES = Object.freeze(Object.keys(DEFAULTS));
