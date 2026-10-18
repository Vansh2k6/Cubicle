import { readFileSync } from "node:fs";
const TEXT = JSON.parse(readFileSync(new URL("./prompts/npc/v3-tone.json", import.meta.url), "utf8"));
const band = (value) => value < 30 ? "low" : value >= 70 ? "high" : "middle";
export function toneText(sliders = {}) {
  return Object.keys(TEXT).map((key) => {
    const value = sliders[key] ?? 50;
    return TEXT[key][band(value)];
  }).join("; ");
}
