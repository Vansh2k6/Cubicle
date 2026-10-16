// llm/tests/prompts.test.js — prompt leak scan: sealed facts, other-NPC facts,
// commitment bounds, and private canon must never enter an unauthorised prompt.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildNpcPrompt } from "../promptBuilder.js";

const root = dirname(fileURLToPath(import.meta.url));
const spec = JSON.parse(readFileSync(join(root, "..", "..", "scenarios", "missed_deadline.json"), "utf8"));

const facts = spec.facts;
const keywordsByFact = {};
for (const f of facts) keywordsByFact[f.id] = f.leak_keywords.en.map((k) => k.toLowerCase());
const contents = {};
for (const f of facts) contents[f.id] = f.content.en;

const PRIVATE_KEYS = ["client_cutoff", "module_half_done", "pair_available", "same_day_headsup_expected", "jordan_help", "sam_norm"];
const MODEL_KEYS = ["commitment_model", "unassisted_min_day", "assisted_min_day", "assistance_requires", "latest_day_from"];

const ACTS = ["greet", "deflect_sealed", "press_for_date", "redirect_to_npc", "close_positive", "walkout", "fallback_clarify", "react_freely"];
const OWNER = { F1: "maya", F2: "jordan", F3: "sam" };

function pendingFor(factId) {
  return { factId, content: contents[factId] };
}

function statesFor(npc, act) {
  const states = [{ revealedFacts: [], pendingReveal: null }];
  if (act.startsWith("reveal_fact:")) return states; // reveal acts need pending; handled below
  return states;
}

function assertSealed(system, allowedFactId, label) {
  const lower = system.toLowerCase();
  for (const f of facts) {
    if (f.id === allowedFactId) {
      assert.ok(system.includes(contents[f.id]), `${label}: authorised fact ${f.id} present`);
      continue;
    }
    assert.ok(!system.includes(contents[f.id]), `${label}: sealed content ${f.id} leaked`);
    for (const kw of keywordsByFact[f.id]) {
      assert.ok(!lower.includes(kw), `${label}: sealed keyword "${kw}" (${f.id}) leaked`);
    }
  }
  for (const k of PRIVATE_KEYS) assert.ok(!system.includes(k), `${label}: private canon "${k}" leaked`);
  for (const k of MODEL_KEYS) assert.ok(!system.includes(k), `${label}: model key "${k}" leaked`);
}

test("every npc x every act: sealed-all prompt leaks nothing", () => {
  for (const npc of ["maya", "jordan", "sam"]) {
    for (const act of ACTS) {
      for (const st of statesFor(npc, act)) {
        const { system } = buildNpcPrompt({
          scenario: spec, npcId: npc, act,
          revealedFacts: st.revealedFacts, pendingReveal: st.pendingReveal,
          userTold: [], recentTurns: [], toneText: "neutral",
        });
        assertSealed(system, null, `${npc}/${act}/sealed-all`);
      }
    }
  }
});

test("F1 staged for maya: contains F1, no other sealed fact", () => {
  const { system } = buildNpcPrompt({
    scenario: spec, npcId: "maya", act: "reveal_fact:F1",
    revealedFacts: [], pendingReveal: pendingFor("F1"),
    userTold: [], recentTurns: [], toneText: "tense",
  });
  assertSealed(system, "F1", "maya/reveal_fact:F1");
});

test("F2 delivered (jordan revealed): jordan prompt may use F2, never F1/F3", () => {
  const { system } = buildNpcPrompt({
    scenario: spec, npcId: "jordan", act: "react_freely",
    revealedFacts: ["F2"], pendingReveal: null,
    userTold: ["I need a date"], recentTurns: [], toneText: "neutral",
  });
  assertSealed(system, "F2", "jordan/F2-delivered");
});

test("revealed facts of another npc are excluded from this npc", () => {
  const { system } = buildNpcPrompt({
    scenario: spec, npcId: "maya", act: "react_freely",
    revealedFacts: ["F2", "F3"], pendingReveal: null,
    userTold: [], recentTurns: [], toneText: "neutral",
  });
  assertSealed(system, null, "maya/other-revealed-excluded");
});

test("pendingReveal mismatches throw BAD_INPUT", () => {
  assert.throws(() => buildNpcPrompt({
    scenario: spec, npcId: "maya", act: "greet",
    revealedFacts: [], pendingReveal: pendingFor("F1"), userTold: [], recentTurns: [],
  }), (e) => e.code === "BAD_INPUT");
  assert.throws(() => buildNpcPrompt({
    scenario: spec, npcId: "jordan", act: "reveal_fact:F1",
    revealedFacts: [], pendingReveal: pendingFor("F1"), userTold: [], recentTurns: [],
  }), (e) => e.code === "BAD_INPUT");
  assert.throws(() => buildNpcPrompt({
    scenario: spec, npcId: "maya", act: "reveal_fact:F1",
    revealedFacts: [], pendingReveal: null, userTold: [], recentTurns: [],
  }), (e) => e.code === "BAD_INPUT");
  assert.ok(OWNER.F1 === "maya" && OWNER.F2 === "jordan" && OWNER.F3 === "sam");
});
