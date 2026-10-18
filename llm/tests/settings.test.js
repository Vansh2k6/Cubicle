import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SLIDERS, difficultyFor, validateSliders } from "../../shared/settings.js";
import { toneText } from "../tone.js";
import { settingsPreview } from "../../src/settingsPreview.js";
import { PRESETS, presetDifficulty, presetName, presetSettings, presetsEnabled } from "../../shared/presets.js";
import { buildNpcPrompt } from "../promptBuilder.js";
import { readFileSync } from "node:fs";

const scenario = JSON.parse(readFileSync(new URL("../../scenarios/missed_deadline.json", import.meta.url), "utf8"));

test("shared slider validation defaults missing values and rejects invalid input", () => {
  assert.deepEqual(validateSliders().value, DEFAULT_SLIDERS);
  assert.deepEqual(validateSliders({ assertiveness: 0, patience: 100 }).value, { assertiveness: 0, patience: 100, warmth: 50, forthcomingness: 50 });
  for (const value of [null, [], { warmth: -1 }, { warmth: 100.5 }, { warmth: "50" }, { extra: 1 }]) assert.equal(validateSliders(value).ok, false);
});
test("public preview responds to every shared slider without score arithmetic", () => {
  const middle = { assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 50 };
  for (const key of Object.keys(middle)) {
    const changed = { ...middle, [key]: 0 };
    assert.notEqual(settingsPreview(changed), settingsPreview(middle), key);
  }
});
test("tone is included in a single NPC prompt without crossing fact silos", () => {
  const tone = toneText({ assertiveness: 100, patience: 0, warmth: 100, forthcomingness: 0 });
  const prompt = buildNpcPrompt({ scenario, npcId: "maya", act: "greet", toneText: tone });
  assert.ok(prompt.system.includes(`Tone: ${tone}`));
  assert.ok(!prompt.system.includes(scenario.facts.find((fact) => fact.owner === "jordan").content.en));
});
test("approved presets copy exact vectors and remain feature-flagged", () => {
  assert.deepEqual(PRESETS.Supportive, { assertiveness: 30, patience: 80, warmth: 80, forthcomingness: 80 });
  assert.deepEqual(PRESETS.Direct, { assertiveness: 80, patience: 50, warmth: 40, forthcomingness: 50 });
  assert.deepEqual(PRESETS.Impatient, { assertiveness: 80, patience: 20, warmth: 30, forthcomingness: 30 });
  assert.deepEqual([presetDifficulty("Supportive"), presetDifficulty("Direct"), presetDifficulty("Impatient")], ["Easy", "Medium", "Hard"]);
  const copy = presetSettings("Supportive"); copy.warmth = 0;
  assert.equal(PRESETS.Supportive.warmth, 80);
  assert.equal(presetName(presetSettings("Direct")), "Direct");
  assert.equal(presetsEnabled(undefined), false); assert.equal(presetsEnabled("0"), false); assert.equal(presetsEnabled("1"), true);
});
test("difficulty boundaries and tone extremes are deterministic", () => {
  assert.equal(difficultyFor({ assertiveness: 0, patience: 100, warmth: 100, forthcomingness: 100 }), "Easy");
  assert.equal(difficultyFor({ assertiveness: 100, patience: 64, warmth: 100, forthcomingness: 100 }), "Medium");
  assert.equal(difficultyFor({ assertiveness: 100, patience: 0, warmth: 0, forthcomingness: 0 }), "Hard");
  assert.notEqual(toneText({ assertiveness: 0, patience: 50, warmth: 50, forthcomingness: 50 }), toneText({ assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 50 }));
  assert.notEqual(toneText({ assertiveness: 0, patience: 0, warmth: 0, forthcomingness: 0 }), toneText({ assertiveness: 100, patience: 100, warmth: 100, forthcomingness: 100 }));
});
