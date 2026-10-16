// replies/fallbackStore.js — Guarded failure fallback lines (ARCHITECTURE.md §7).
// Lookup by (scenario, npc, act, locale), filtered by state predicates.
// Used ONLY on failure (gateway npc fallback + npc.js fallback path, D-23).
// ESM, stdlib only.

import storeData from "./missed_deadline.en.json" with { type: "json" };

export function bandOf(mood) {
  if (typeof mood !== "number") return null;
  if (mood >= 65) return "calm";
  if (mood >= 40) return "tense";
  if (mood >= 20) return "frustrated";
  return "hostile";
}

export function createStore(entries) {
  return { entries: Array.isArray(entries) ? entries.slice() : [] };
}

export function defaultStore() {
  return createStore(storeData.entries);
}

function predicatesMatch(entry, state) {
  const p = entry.predicates || {};
  if (p.moodBand) {
    const band = bandOf(state && state.mood);
    if (band !== p.moodBand) return false;
  }
  if (Array.isArray(p.factsRevealed)) {
    const have = (state && state.factsRevealed) || [];
    if (!p.factsRevealed.every((f) => have.includes(f))) return false;
  }
  return true;
}

// Tiny rotation memory: last served variant per (scenario, locale, npc, act).
const lastServed = new Map();

export function memoryKey(scenario, locale, npc, act) {
  return `${scenario}:${locale}:${npc}:${act}`;
}

// fetch({scenario, npc, act, state, locale, usedIds}, store?)
// -> {entryId, variantId, text} | null.
export function fetch(query = {}, store = null) {
  const {
    scenario, npc, act, state = {}, locale = "en", usedIds = [],
  } = query;
  const entries = store ? store.entries : storeData.entries;
  const candidates = entries.filter(
    (e) => e.npc === npc && e.act === act && predicatesMatch(e, state)
  );
  if (candidates.length === 0) return null;
  const entry = candidates[0];
  const variants = entry.variants || [];
  if (variants.length === 0) return null;
  const key = memoryKey(scenario, locale, npc, act);
  const banned = new Set(usedIds);
  if (lastServed.has(key)) banned.add(lastServed.get(key));
  const fresh = variants.filter((v) => !banned.has(v.id));
  const picked = fresh.length > 0 ? fresh[0] : variants[0];
  lastServed.set(key, picked.id);
  return { entryId: entry.id, variantId: picked.id, text: picked.text };
}

export function clearMemory() {
  lastServed.clear();
}
