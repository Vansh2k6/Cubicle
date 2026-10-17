import { difficultyFor } from "../shared/settings.js";

const phrase = (value, low, middle, high) => value < 30 ? low : value >= 70 ? high : middle;

export function settingsPreview(settings) {
  return `All colleagues: ${phrase(settings.assertiveness, "more measured", "clear", "more direct")}; ${phrase(settings.patience, "briefer", "steady", "more patient")}; ${phrase(settings.warmth, "more reserved", "courteous", "warmer")}; ${phrase(settings.forthcomingness, "more guarded", "selectively helpful", "more open")}. Difficulty: ${difficultyFor(settings)}`;
}
