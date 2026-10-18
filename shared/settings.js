export const SLIDER_NAMES = ["assertiveness", "patience", "warmth", "forthcomingness"];
export const DEFAULT_SLIDERS = Object.freeze(Object.fromEntries(SLIDER_NAMES.map((name) => [name, 50])));
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
export function difficultyFor(sliders) {
  const s = validateSliders(sliders);
  if (!s.ok) return null;
  const v = s.value;
  const mean = (v.assertiveness + 100 - v.patience + 100 - v.warmth + 100 - v.forthcomingness) / 4;
  return mean < 34 ? "Easy" : mean < 67 ? "Medium" : "Hard";
}
