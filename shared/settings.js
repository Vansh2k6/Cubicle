export const SLIDER_NAMES = ["assertiveness", "patience", "warmth", "forthcomingness"];
export const DEFAULT_SLIDERS = Object.freeze(Object.fromEntries(SLIDER_NAMES.map((name) => [name, 50])));
function plainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
export function validateSliders(value) {
  if (value === undefined) return { ok: true, value: { ...DEFAULT_SLIDERS } };
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ok: false };
  if (Object.keys(value).some((key) => !SLIDER_NAMES.includes(key))) return { ok: false };
  const out = { ...DEFAULT_SLIDERS };
  for (const key of Object.keys(value)) {
    if (!Number.isInteger(value[key]) || value[key] < 0 || value[key] > 100) return { ok: false };
    out[key] = value[key];
  }
  return { ok: true, value: out };
}
export function validateNpcSliders(value, npcIds) {
  if (value === undefined) return { ok: true, value: {} };
  if (!plainObject(value) || !Array.isArray(npcIds) || npcIds.some((id) => typeof id !== "string")) return { ok: false };
  const allowed = new Set(npcIds);
  const out = {};
  for (const npcId of Object.keys(value)) {
    if (["__proto__", "constructor", "prototype"].includes(npcId) || !allowed.has(npcId) || !plainObject(value[npcId])) return { ok: false };
    const sliders = {};
    for (const key of Object.keys(value[npcId])) {
      const setting = value[npcId][key];
      if (!SLIDER_NAMES.includes(key) || !Number.isInteger(setting) || setting < 0 || setting > 100) return { ok: false };
      sliders[key] = setting;
    }
    Object.defineProperty(out, npcId, { value: sliders, enumerable: true, writable: true, configurable: true });
  }
  return { ok: true, value: out };
}
export function difficultyFor(sliders) {
  const s = validateSliders(sliders);
  if (!s.ok) return null;
  const v = s.value;
  const mean = (v.assertiveness + 100 - v.patience + 100 - v.warmth + 100 - v.forthcomingness) / 4;
  return mean < 34 ? "Easy" : mean < 67 ? "Medium" : "Hard";
}
