// engine/config.js — P1 engine constants (ESM, zero imports).
// Every tunable lives here. Items marked PROVISIONAL (P1) are placeholders
// pending playtest calibration.

export const MAX_TURNS_DEFAULT = 20;

// PROVISIONAL (P1): patienceDrop anchors {100:-3, 50:-8, 0:-15}, linear interpolation.
export function patienceDrop(patience) {
  const p = Math.min(100, Math.max(0, Number(patience) || 0));
  if (p <= 50) return -15 + (p / 50) * 7;
  return -8 + ((p - 50) / 50) * 5;
}

// PROVISIONAL (P1): walkoutThreshold anchors {0:25, 100:5}, linear.
export function walkoutThreshold(patience) {
  const p = Math.min(100, Math.max(0, Number(patience) || 0));
  return 25 - p * 0.2;
}

// Warmth: start mood 35 + 0.3 * warmth.
export function startMood(warmth) {
  const w = Math.min(100, Math.max(0, Number(warmth) || 0));
  return 35 + 0.3 * w;
}

// PROVISIONAL (P1): warmth gains low +4 high +10, linear by warmth.
export function warmthGain(warmth) {
  const w = Math.min(100, Math.max(0, Number(warmth) || 0));
  return 4 + (w / 100) * 6;
}

// Forthcomingness bands: >=70: 1 ask; 30-69: 2 asks (1 if mood >= 60);
// <30: 2 asks and mood >= 50.
export function forthcomingnessGate(forthcomingness, mood) {
  const f = Number(forthcomingness) || 0;
  const m = Number(mood) || 0;
  if (f >= 70) return { asks: 1, moodMin: 0 };
  if (f >= 30) return { asks: m >= 60 ? 1 : 2, moodMin: 0 };
  return { asks: 2, moodMin: 50 };
}

// PROVISIONAL (P1): assertiveness B2 turn 4 -> 3 when >= 70 (threshold).
export const B2_BASE_TURN = 4;
export const B2_ASSERTIVE_TURN = 3;
export const ASSERTIVENESS_B2_CUTOFF = 70;
export function b2TurnFor(assertiveness) {
  return (Number(assertiveness) || 0) >= ASSERTIVENESS_B2_CUTOFF
    ? B2_ASSERTIVE_TURN
    : B2_BASE_TURN;
}

// PROVISIONAL (P1): B3 extra mood drop scaled by assertiveness (keep tiny: 1..3).
export function b3ExtraDrop(assertiveness) {
  const a = Math.min(100, Math.max(0, Number(assertiveness) || 0));
  return 1 + (a / 100) * 2;
}

// PROVISIONAL (P1): vague event set.
export const VAGUE_EVENTS = ["avoided_question", "off_topic"];

export const GAIN_EVENTS = ["apologized", "took_ownership", "acknowledged_concern"];

// Turns since commitment before B3 callback is due.
export const B3_GAP_TURNS = 3;

// Act priority order (first match wins). Mirrors ARCHITECTURE.md section 6.4.
export const ACT_ORDER = [
  "walkout",
  "callback_commitment",
  "reveal_fact",
  "deflect_sealed",
  "redirect_to_npc",
  "press_for_date",
  "close_positive",
  "acknowledge_relay",
  "greet",
  "react_freely",
];

export const DEFAULT_SLIDERS = {
  assertiveness: 50,
  patience: 50,
  warmth: 50,
  forthcomingness: 50,
};
