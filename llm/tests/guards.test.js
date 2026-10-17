// llm/tests/guards.test.js — Unit tests for llm/guards.js (R-02/R-09).
// Offline, stdlib only.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalize, contentTokens, echoCorpus, keywordHitsForFact,
  semanticHitForFact, canonCheck, checkReply, checkPositiveReveal,
} from "../guards.js";
import { NEUTRAL_CLARIFY } from "../pipeline.js";

const dir = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(dir, "..", "..", "scenarios", "missed_deadline.json"), "utf8"));

const ctx = (over = {}) => ({
  scenario, npcId: "maya", act: "react_freely", locale: "en",
  userSaid: [], revealedTexts: [], commitments: [], revealedIds: [],
  authorised: null, activeCommitment: null, clockDay: 0,
  bounds: { minDay: 3, cutoffDay: 3 }, ...over,
});

test("normalize: case, punctuation, number-words, day forms", () => {
  assert.equal(normalize("Three-days (Friday)!!"), "3 days friday");
  assert.equal(normalize("FRI, heads-UP; same_day"), "friday heads up same day");
  assert.equal(normalize("HEADSUP"), "headsup");
});

test("keyword hit: verbatim F1 leak", () => {
  const hits = keywordHitsForFact(
    "The client hard cutoff is Friday.", scenario, "F1", echoCorpus(), "en");
  assert.ok(hits.includes("friday") && hits.includes("cutoff"));
});

test("keyword hit: gapped phrase still matches", () => {
  const hits = keywordHitsForFact(
    "I have been holding them off for you.", scenario, "F1", echoCorpus(), "en");
  assert.ok(hits.length > 0);
});

test("benign reply has no hits", () => {
  const hits = keywordHitsForFact(
    "Give me the straight story on where the project stands.", scenario, "F1", echoCorpus(), "en");
  assert.deepEqual(hits, []);
});

test("echo allowance: attributed span ignored, confirmation fails", () => {
  const corpus = echoCorpus({ userSaid: ["Is the cutoff Friday?"] });
  const safe = keywordHitsForFact("You asked about Friday. Walk me through it.", scenario, "F1", corpus, "en");
  assert.deepEqual(safe, []);
  const unsafe = keywordHitsForFact("Yes, Friday is the cutoff.", scenario, "F1", corpus, "en");
  assert.ok(unsafe.length > 0);
});

test("authorised pending disclosure is exempt, same text on wrong act fails", () => {
  const text = "The client cutoff is Friday, 3 days out. I have been holding them off.";
  const okRes = checkReply(text, ctx({ act: "reveal_fact:F1", authorised: { factId: "F1", owner: "maya", act: "reveal_fact:F1" } }));
  assert.equal(okRes.ok, true);
  const badRes = checkReply(text, ctx({ act: "react_freely", authorised: null }));
  assert.equal(badRes.ok, false);
  assert.ok(badRes.failures.some((f) => f.code === "leak_keyword" && f.factId === "F1"));
});

test("cross-NPC leak is caught", () => {
  const res = checkReply("Maya told me the cutoff is Friday.", ctx({ npcId: "jordan" }));
  assert.equal(res.ok, false);
});

test("semantic check catches multi-token paraphrase, echo tokens subtracted", () => {
  const sem = semanticHitForFact(
    "reusable module half remaining work pair afternoon", scenario, "F2", echoCorpus());
  assert.equal(sem.hit, true);
  const echo = semanticHitForFact(
    "reusable module half remaining work pair afternoon", scenario, "F2",
    echoCorpus({ userSaid: ["reusable module half remaining work pair afternoon"] }));
  assert.equal(echo.hit, false);
});

test("canon: invented weekday and out-of-bounds counts fail", () => {
  assert.ok(canonCheck("I will tell the client Monday.", { clockDay: 0, bounds: { minDay: 3, cutoffDay: 3 }, act: "react_freely" }).length > 0);
  assert.ok(canonCheck("Let us aim for Thursday.", { clockDay: 0, bounds: { minDay: 3, cutoffDay: 3 }, act: "react_freely" }).some((f) => f.code === "canon_date_out_of_bounds"));
});

test("canon: agreement wording fails outside closing act, passes on close with matching commitment", () => {
  assert.ok(canonCheck("Deal. Locked in.", { act: "react_freely" }).some((f) => f.code === "canon_agreement_wrong_act"));
  assert.deepEqual(canonCheck("Good. We are aligned on Friday. Send a recap.", {
    act: "close_positive", activeCommitment: { target_day: 3 }, clockDay: 0,
    bounds: { minDay: 3, cutoffDay: 3 }, corpus: echoCorpus({ userSaid: ["I will deliver Friday"] }),
  }), []);
});

test("canon: scope/progress/resources/meetings rejected", () => {
  for (const t of [
    "Cut the scope and ship a partial version.",
    "I will get you two more devs.",
    "We are 90 percent complete.",
    "I scheduled a sync with the client.",
  ]) {
    assert.ok(canonCheck(t, { act: "react_freely" }).length > 0, t);
  }
});

test("positive check: authorised reveal passes, omission fails", () => {
  const good = checkPositiveReveal(
    "The client cutoff is Friday, 3 days out. I have been holding them off.", scenario, "F1");
  assert.equal(good.ok, true);
  const bad = checkPositiveReveal("Let us discuss timelines in general terms soon.", scenario, "F1");
  assert.equal(bad.ok, false);
});

test("neutral clarifications pass both guards for every npc", () => {
  for (const npc of ["maya", "jordan", "sam", "unknown_npc"]) {
    const line = NEUTRAL_CLARIFY[npc] || "Can you say a bit more about what you need from me?";
    const res = checkReply(line, ctx({ npcId: npc === "unknown_npc" ? "maya" : npc }));
    assert.equal(res.ok, true, npc + ": " + JSON.stringify(res.failures));
  }
});

test("guard output carries codes only, never sealed text", () => {
  const res = checkReply("The hard cutoff is Friday.", ctx({}));
  const blob = JSON.stringify(res);
  for (const secret of ["holding them off", "reusable module", "heads-up", "half the remaining"]) {
    assert.ok(!blob.includes(secret), secret);
  }
});

test("contentTokens drops stopwords", () => {
  assert.ok(!contentTokens("the client and its cutoff").includes("the"));
  assert.ok(contentTokens("the client and its cutoff").includes("cutoff"));
});

test("canon validates every date occurrence rather than letting an authorized first date mask later claims", () => {
  const options = { scenario, authorisedFactId: "F1", corpus: echoCorpus(), clockDay: 0 };
  for (const text of [
    "The cutoff is Friday. The actual deadline is tomorrow.",
    "The cutoff is Friday. The actual deadline is Thursday.",
    "The cutoff is Friday. We can deliver Monday.",
    "The cutoff is Friday but the actual deadline is tomorrow and delivery is Monday.",
    "The cutoff is in three days; we will deliver in two days.",
    "The cutoff is Friday and tomorrow and Thursday.",
  ]) assert.ok(canonCheck(text, options).length > 0, text);
  assert.deepEqual(canonCheck("The cutoff is Friday, three days away.", options), []);
  const authorised = ctx({ act: "reveal_fact:F1", authorised: { factId: "F1", owner: "maya", act: "reveal_fact:F1" } });
  assert.equal(checkReply("The client cutoff is Friday, three days away. I have been holding them off.", authorised).ok, true);
});
