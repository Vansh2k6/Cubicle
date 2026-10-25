import { DEFAULT_SLIDERS } from "../shared/settings.js";
import { PRESETS } from "../shared/presets.js";

export const CAST_TRAITS = Object.freeze([
  ["assertiveness", "Assertiveness", "How readily they state a position", "Reserved", "Firm"],
  ["patience", "Patience", "How much room they give you to think", "Brisk", "Unhurried"],
  ["warmth", "Warmth", "How personally encouraging they feel", "Formal", "Encouraging"],
  ["forthcomingness", "Forthcomingness", "How readily they share context", "Guarded", "Open"],
]);

export const CAST_PRESETS = Object.freeze({
  Balanced: DEFAULT_SLIDERS,
  ...PRESETS,
});

const copy = (settings = DEFAULT_SLIDERS) => Object.fromEntries(CAST_TRAITS.map(([key]) => [key, settings[key] ?? DEFAULT_SLIDERS[key]]));

export function createCastDraft(base = DEFAULT_SLIDERS, overrides = {}) {
  return { base: copy(base), overrides: Object.fromEntries(Object.entries(overrides).map(([id, values]) => [id, copy(values)])) };
}

export function effectiveCastSettings(draft, actorId) {
  return copy(draft.overrides[actorId] || draft.base);
}

export function updateCastDraft(draft, actorId, key, value) {
  const next = createCastDraft(draft.base, draft.overrides);
  if (actorId) next.overrides[actorId] = { ...effectiveCastSettings(next, actorId), [key]: value };
  else next.base[key] = value;
  return next;
}

export function applyCastPreset(draft, actorId, preset) {
  const values = CAST_PRESETS[preset];
  if (!values) return createCastDraft(draft.base, draft.overrides);
  const next = createCastDraft(draft.base, draft.overrides);
  if (actorId) next.overrides[actorId] = copy(values);
  else next.base = copy(values);
  return next;
}

export function useOverallSettings(draft, actorId) {
  const next = createCastDraft(draft.base, draft.overrides);
  if (actorId) delete next.overrides[actorId];
  return next;
}

export function npcSliderPayload(draft, actorIds) {
  return Object.fromEntries(actorIds.filter((id) => Object.hasOwn(draft.overrides, id)).map((id) => [id, copy(draft.overrides[id])]));
}

export function castTone(settings) {
  const a = settings.assertiveness > 65 ? "clear and firm" : settings.assertiveness < 35 ? "measured" : "balanced";
  const p = settings.patience > 65 ? "patient" : settings.patience < 35 ? "brisk" : "steady";
  const w = settings.warmth > 65 ? "encouraging" : settings.warmth < 35 ? "formal" : "professional";
  return `${a}, ${p}, and ${w}`;
}
