import test from "node:test";
import assert from "node:assert/strict";
import { scanArtifacts } from "../../scripts/bundle-scan-core.mjs";
test("bundle scanner catches plain and NUL-containing JavaScript text", () => {
  const needles = new Map([["reveal_fact", "private act"]]);
  assert.equal(scanArtifacts([{ file: "a.js", text: "REVEAL_FACT" }], needles).length, 1);
  assert.equal(scanArtifacts([{ file: "a.js", text: "clean text" }], needles).length, 0);
  assert.equal(scanArtifacts([{ file: "a.js", text: "\0REVEAL_FACT" }], needles).length, 1);
});

test("single-word fact keywords match tokens while full private content retains substring checks", () => {
  const keywords = new Map([["estimated", "keywords missed_deadline/F1"], ["storage", "keywords missed_deadline/F2"]]);
  assert.deepEqual(scanArtifacts([{file: "code.js", text: "underestimated localStorage storageBuffer"}], keywords), []);
  for (const text of ["not estimated", "submission and storage", "estimated", "STORAGE"]) assert.ok(scanArtifacts([{file: "private.js", text}], keywords).length);
  const publicText = "Summarize what you agreed, then finish practice when you are ready.";
  const agreed = new Map([["agreed", "keywords missed_deadline/F1"]]);
  assert.deepEqual(scanArtifacts([{file: "public.js", text: publicText}], agreed), []);
  assert.equal(scanArtifacts([{file: "private.js", text: publicText + " Private routing was never agreed."}], agreed).length, 1);
  const full = "The submission and storage piece is reusable, but that is all.";
  assert.equal(scanArtifacts([{file: "private.js", text: "prefix" + full}], new Map([[full.toLowerCase(), "fact missed_deadline/F2"]])).length, 1);
  // Private template/policy strings still match inside larger identifiers.
  assert.equal(scanArtifacts([{file: "private.js", text: "prefixstorageSuffix"}], new Map([["storage", "private template"]])).length, 1);
  const storage = new Map([["storage", "keywords missed_deadline/F2"]]);
  const publicToast = "Progress is available for this visit; browser storage is unavailable.";
  const code = "a.storage/Float32Array.BYTES_PER_ELEMENT;16-c<a.storage&&(n+=16-c);n+=a.storage}let t={boundary:0,storage:0};t.storage=4;t.storage=e.byteLength";
  const voiceBinding = "function o({transcribe:e,storage:r,navigatorRef:o,windowRef:s,documentRef:c,clock:l,onMicStart:u,onVoiceChange:d}={})";
  for (const text of [publicToast, code, voiceBinding]) {
    assert.deepEqual(scanArtifacts([{file: "public.js", text}], storage), []);
    assert.equal(scanArtifacts([{file: "private.js", text: text + " Private storage"}], storage).length, 1);
    assert.equal(scanArtifacts([{file: "private.js", text}], new Map([["storage", "private policy"]])).length, 1);
  }
  for (const text of ['"storage":0', "The storage module is reusable.", "storage", '"storage"']) assert.equal(scanArtifacts([{file: "private.js", text}], storage).length, 1);
  for (const text of ['function o({storage:r}={})', voiceBinding.replace("storage:r", '"storage":r'), voiceBinding.replace("onVoiceChange:d", "privateContext:d")]) {
    assert.equal(scanArtifacts([{file: "private.js", text}], storage).length, 1);
  }
});

test("bundle scanner masks only approved public occurrences", () => {
  const contexts = [
    ["cutoff", "a.js", "cutoffDistance"],
    ["module", "a.js", "modulepreload"],
    ["module", "index.html", '<script type="module" crossorigin src="/a.js"></script>'],
    ["module", "index.html", "<script type='module' src='/a.js'></script>"],
    ["review", "a.js", "setup-preview"],
    ["review", "a.js", "I underestimated the final review. I should have flagged the delay sooner."],
    ["review", "a.js", "I’ll review it and reply by 11 AM. I’ll also set a daily inbox check."],
  ];
  for (const [needle, file, text] of contexts) {
    const needles = new Map([[needle, "private marker"]]);
    assert.deepEqual(scanArtifacts([{ file, text }], needles), [], text);
    assert.equal(scanArtifacts([{ file, text: `${text}\0 PRIVATE ${needle.toUpperCase()}` }], needles).length, 1, text);
  }
});

test("public masking retains private occurrences and complete identifier boundaries", () => {
  for (const [needle, text, file = "a.js"] of [
    ["cutoff", "$cutoffDistance"], ["cutoff", "cutoffDistance$private"],
    ["module", "$modulepreload"], ["module", 'const secret = \'type="module"\''],
    ["module", '<script type="module"></script>'],
    ["module", '<script type="module" data-secret="module"></script>', "index.html"],
    ["module", '<div type="module"></div>', "index.html"],
    ["module", '<script data-code=\' type="module" \'>', "index.html"],
    ["review", "privatepreview"],
  ]) assert.equal(scanArtifacts([{ file, text }], new Map([[needle, "private"]])).length, 1, text);
  const markers = ["reveal_fact", "commitment_model", "CURRENT MOVE", "private fact (F1)[x]\\.plus+"];
  for (const marker of markers) {
    const needle = marker.toLowerCase();
    assert.equal(scanArtifacts([{ file: "a.js", text: `preview modulepreload ${marker}` }], new Map([[needle, "private"]])).length, 1);
  }
  assert.throws(() => scanArtifacts([{ file: "bad.js" }], new Map()), TypeError);
});
