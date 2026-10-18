import { difficultyFor } from "./settings.js";

export const PRESETS = Object.freeze({
  Supportive: Object.freeze({ assertiveness: 30, patience: 80, warmth: 80, forthcomingness: 80 }),
  Direct: Object.freeze({ assertiveness: 80, patience: 50, warmth: 40, forthcomingness: 50 }),
  Impatient: Object.freeze({ assertiveness: 80, patience: 20, warmth: 30, forthcomingness: 30 }),
});

export function presetSettings(name) {
  return PRESETS[name] ? { ...PRESETS[name] } : null;
}

export function presetName(settings) {
  return Object.keys(PRESETS).find((name) => Object.keys(PRESETS[name]).every((key) => PRESETS[name][key] === settings[key])) || "Custom";
}

export function presetsEnabled(value) {
  return value === "1";
}

export function presetDifficulty(name) {
  const settings = presetSettings(name);
  return settings ? difficultyFor(settings) : null;
}
