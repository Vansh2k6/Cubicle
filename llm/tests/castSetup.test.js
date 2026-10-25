import assert from "node:assert/strict";
import test from "node:test";
import { applyCastPreset, createCastDraft, effectiveCastSettings, npcSliderPayload, updateCastDraft, useOverallSettings } from "../../src/castSetup.js";

test("overall changes leave individual overrides intact and affect inherited cast settings", () => {
  let draft = createCastDraft({ assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 50 });
  draft = updateCastDraft(draft, "maya", "patience", 80);
  draft = updateCastDraft(draft, null, "warmth", 30);
  assert.equal(effectiveCastSettings(draft, "maya").patience, 80);
  assert.equal(effectiveCastSettings(draft, "maya").warmth, 50);
  assert.equal(effectiveCastSettings(draft, "jordan").warmth, 30);
  assert.deepEqual(npcSliderPayload(draft, ["maya", "jordan"]), { maya: { assertiveness: 50, patience: 80, warmth: 50, forthcomingness: 50 } });
});

test("selected settings can return to the overall baseline without flattening another actor", () => {
  let draft = createCastDraft();
  draft = applyCastPreset(draft, "maya", "Supportive");
  draft = applyCastPreset(draft, "jordan", "Direct");
  draft = useOverallSettings(draft, "maya");
  assert.deepEqual(npcSliderPayload(draft, ["maya", "jordan", "sam"]), { jordan: { assertiveness: 80, patience: 50, warmth: 40, forthcomingness: 50 } });
  assert.deepEqual(effectiveCastSettings(draft, "maya"), effectiveCastSettings(draft, "sam"));
});

test("an ended effective cast map remains a distinct per-person retry payload", () => {
  const ended = {
    maya: { assertiveness: 30, patience: 80, warmth: 80, forthcomingness: 80 },
    jordan: { assertiveness: 80, patience: 50, warmth: 40, forthcomingness: 50 },
  };
  const draft = createCastDraft({ assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 50 }, ended);
  assert.deepEqual(npcSliderPayload(draft, ["maya", "jordan"]), ended);
  assert.notDeepEqual(effectiveCastSettings(draft, "maya"), effectiveCastSettings(draft, "jordan"));
});
