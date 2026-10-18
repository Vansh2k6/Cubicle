import test from "node:test";
import assert from "node:assert/strict";
import { scanArtifacts } from "../../scripts/bundle-scan-core.mjs";
test("bundle scanner catches plain and NUL-containing JavaScript text", () => {
  const needles = new Map([["reveal_fact", "private act"]]);
  assert.equal(scanArtifacts([{ file: "a.js", text: "REVEAL_FACT" }], needles).length, 1);
  assert.equal(scanArtifacts([{ file: "a.js", text: "clean text" }], needles).length, 0);
  assert.equal(scanArtifacts([{ file: "a.js", text: "\0REVEAL_FACT" }], needles).length, 1);
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
