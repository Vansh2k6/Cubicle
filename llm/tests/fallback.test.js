// llm/tests/fallback.test.js — fallback store: coverage, own-fact-only, rotation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { fetch, createStore, clearMemory } from "../../replies/fallbackStore.js";

const root = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(root, "..", "..", "replies", "missed_deadline.en.json"), "utf8"));
const spec = JSON.parse(readFileSync(join(root, "..", "..", "scenarios", "missed_deadline.json"), "utf8"));

const NPCS = ["maya", "jordan", "sam"];
const ACTS = ["greet", "deflect_sealed", "press_for_date", "redirect_to_npc", "close_positive", "walkout", "fallback_clarify"];
const REVEAL = { maya: "reveal_fact:F1", jordan: "reveal_fact:F2", sam: "reveal_fact:F3" };
const OWNER = { F1: "maya", F2: "jordan", F3: "sam" };

const kwByFact = {};
for (const f of spec.facts) kwByFact[f.id] = f.leak_keywords.en.map((k) => k.toLowerCase());
const allKw = [...new Set(Object.values(kwByFact).flat())];

test("every SC-01 npc/act has at least one line", () => {
  clearMemory();
  for (const npc of NPCS) {
    for (const act of [...ACTS, REVEAL[npc]]) {
      const hit = fetch({ scenario: "missed_deadline", npc, act, state: {}, locale: "en" });
      assert.ok(hit && hit.text.length > 0, `${npc}/${act} missing`);
    }
  }
});

test("reveal lines contain only their own fact keywords", () => {
  clearMemory();
  for (const npc of NPCS) {
    const factId = Object.keys(OWNER).find((f) => OWNER[f] === npc);
    const hit = fetch({ scenario: "missed_deadline", npc, act: `reveal_fact:${factId}`, state: {}, locale: "en" });
    const lower = hit.text.toLowerCase();
    assert.ok(kwByFact[factId].some((kw) => lower.includes(kw)), `${npc} reveal missing own keywords`);
    for (const other of Object.keys(OWNER)) {
      if (other === factId) continue;
      for (const kw of kwByFact[other]) {
        assert.ok(!lower.includes(kw), `${npc} reveal leaks ${other} keyword "${kw}"`);
      }
    }
  }
});

test("non-reveal fallback lines contain no fact keywords at all", () => {
  for (const e of data.entries) {
    if (e.act.startsWith("reveal_fact:")) continue;
    for (const v of e.variants) {
      const lower = v.text.toLowerCase();
      for (const kw of allKw) {
        assert.ok(!lower.includes(kw), `${e.id}/${v.id} contains fact keyword "${kw}"`);
      }
    }
  }
});

test("rotation avoids immediate repeat", () => {
  clearMemory();
  const q = { scenario: "missed_deadline", npc: "maya", act: "greet", state: {}, locale: "en" };
  const first = fetch(q);
  const second = fetch(q);
  assert.ok(first && second);
  assert.notEqual(first.variantId, second.variantId);
});

test("usedIds are respected when alternatives exist", () => {
  clearMemory();
  const q = { scenario: "missed_deadline", npc: "sam", act: "greet", state: {}, locale: "en", usedIds: ["sam-greet-1a"] };
  const hit = fetch(q);
  assert.equal(hit.variantId, "sam-greet-1b");
});

test("predicates filter and entry shape holds", () => {
  for (const e of data.entries) {
    assert.ok(e.npc && e.act && Array.isArray(e.variants) && e.variants.length > 0);
    assert.ok(e.predicates && typeof e.predicates === "object");
    assert.ok(Array.isArray(e.toneTags));
  }
  const store = createStore(data.entries);
  const hit = fetch({ scenario: "missed_deadline", npc: "maya", act: "close_positive", state: { factsRevealed: ["F1"] }, locale: "en" }, store);
  assert.ok(hit && hit.text.length > 0);
});
