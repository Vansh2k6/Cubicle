// llm/manifest.js — Per-session run manifest (R-14 Stage 1 exception, D-23).
// A model/prompt/schema change creates a new manifest id. Zero deps (FNV-1a).

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

// config: { role: { model, promptVersion, schemaVersion, ... } }.
// Only the canonical triple per role feeds the id; temperature/timeout do not.
export function createManifest(config) {
  const roles = {};
  for (const role of Object.keys(config).sort()) {
    const c = config[role];
    roles[role] = {
      model: c.model,
      promptVersion: c.promptVersion,
      schemaVersion: c.schemaVersion,
    };
  }
  const id = `manifest-${fnv1a(canonicalize(roles))}`;
  return Object.freeze({
    id,
    roles: Object.freeze(roles),
    createdAt: new Date().toISOString(),
  });
}
