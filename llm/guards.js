// llm/guards.js — Leak guard (R-02), semantic check + canon guard (R-09).
// Local, non-generative, stdlib only. Pure functions over plain
// data so the engine stays R-16 clean and every caller passes scenario text
// explicitly. Outputs carry reason CODES and fact ids only — never sealed
// fact text, keywords, or private guard detail (R-66).
//
// Two exemptions are kept separate:
//   (a) engine-authorised pending disclosure: exactly that fact, that owner,
//       that act. Skips leak/canon hits attributable to the authorised fact;
//       the positive check then requires the reply to actually express it.
//   (b) occurrence-specific echo allowance: a keyword/semantic hit is ignored
//       only when that occurrence is supported by the user's words to THIS npc,
//       this npc's permitted revealed facts, or logged commitments in THIS
//       conversation. Echo is attribution, not confirmation: confirmation
//       language attached to an echoed span still fails.

import {tokens, normalize, nospace, contentTokens, echoCorpus, phraseHit, supportedByEcho, hasConfirmLanguage} from "./languagePrimitives.js";
import {legacyCanonCheck} from "./sc01Language.js";
import {resolveLanguage, checkLanguageCanon} from "./languageContext.js";
export {normalize, nospace, contentTokens, echoCorpus};
export const canonCheck = legacyCanonCheck;

function factKeywords(scenario, factId, locale) {
  const f = (scenario.facts || []).find((x) => x && x.id === factId);
  if (!f) return [];
  const kw = f.leak_keywords || {};
  return Array.isArray(kw[locale]) ? kw[locale].slice() : [];
}

function factContent(scenario, factId) {
  const f = (scenario.facts || []).find((x) => x && x.id === factId);
  if (!f) return "";
  if (typeof f.content === "string") return f.content;
  return (f.content && f.content.en) || "";
}

function undisclosedFacts(scenario, revealedIds) {
  const have = new Set(revealedIds || []);
  return (scenario.facts || []).filter((f) => f && !have.has(f.id)).map((f) => f.id);
}

// Keyword scan for one fact. Returns {hitPhrases[]} of phrases present in
// the reply that are NOT echo-supported (echo = attribution without
// confirmation). An echo-supported occurrence paired with confirmation
// language is returned as a hit (unsafe echo-with-confirmation).
export function keywordHitsForFact(reply, scenario, factId, corpus, locale) {
  const norm = normalize(reply);
  const flat = nospace(reply);
  const confirm = hasConfirmLanguage(reply);
  const hits = [];
  for (const phrase of factKeywords(scenario, factId, locale)) {
    if (!phraseHit(norm, flat, phrase)) continue;
    if (supportedByEcho(corpus, phrase)) {
      if (confirm) hits.push(phrase);
      continue;
    }
    hits.push(phrase);
  }
  return hits;
}

function scenarioNames(scenario) {
  const names = new Set();
  for (const n of (scenario && scenario.npcs) || []) {
    if (n && n.id) names.add(String(n.id).toLowerCase());
    if (n && n.name) {
      for (const w of String(n.name).toLowerCase().split(/[^a-z]+/)) {
        if (w) names.add(w);
      }
    }
  }
  return names;
}

// Semantic check: normalised content-token overlap against the fact text
// plus structured claim checks are done by the canon stage; here the overlap
// test. Echo-supported tokens are subtracted before measuring. NPC
// names are excluded: redirects legitimately name other NPCs alongside
// generic words ("Jordan knows the remaining work best").
export function semanticHitForFact(reply, scenario, factId, corpus) {
  const names = scenarioNames(scenario);
  const content = contentTokens(factContent(scenario, factId)).filter((t) => !names.has(t));
  if (content.length === 0) return { hit: false, overlap: 0 };
  const echoToks = new Set(tokens(corpus.norm));
  const replyToks = new Set(tokens(reply).filter((t) => !names.has(t)));
  let overlap = 0;
  for (const t of new Set(content)) {
    if (replyToks.has(t) && !echoToks.has(t)) overlap += 1;
  }
  const ratio = overlap / new Set(content).size;
  // Fail closed: >=3 distinctive non-echo tokens, or >=half the fact.
  const hit = overlap >= 3 || (content.length >= 2 && ratio >= 0.5);
  return { hit, overlap, ratio };
}

// Full reply check. `authorised` = {factId, owner, act} | null: the engine's
// pending disclosure for exactly this npc + act. `revealedIds` = fact ids the
// user already knows; only facts OWNED by this actor are excluded from scanning.
// Other actors' facts still require attributed user relay and cannot be confirmed.
export function checkReply(reply, opts = {}) {
  const {
    scenario, npcId, act, locale = "en",
    userSaid = [], commitments = [],
    revealedIds = [], authorised = null,
    activeCommitment = null, clockDay = 0, bounds = null, runtime = undefined, planDelivery = null,
  } = opts;
  const failures = [];
  if (!scenario || !scenario.npcs?.some((npc) => npc.id === npcId)) return { ok: false, failures: [{ code: "bad_input" }] };
  let language;
  try { language = resolveLanguage(scenario, runtime, locale); } catch { return {ok: false, failures: [{code: "unsupported_language"}]}; }
  if (planDelivery && (planDelivery.actorId !== npcId || !["accept_plan", "close_positive"].includes(act) || !Number.isInteger(planDelivery.turnId) || planDelivery.turnId < 1)) return {ok: false, failures: [{code: "bad_plan_delivery"}]};
  const ownIds = revealedIds.filter((id) => scenario.facts.some((fact) => fact.id === id && fact.owner === npcId));
  const ownTexts = scenario.facts.filter((fact) => ownIds.includes(fact.id)).map((fact) => factContent(scenario, fact.id));
  const corpus = echoCorpus({ userSaid, revealedTexts: ownTexts, commitments });
  const authFact = authorised && authorised.owner === npcId && authorised.act === act && act === `reveal_fact:${authorised.factId}` && scenario.facts.some((fact) => fact.id === authorised.factId && fact.owner === npcId) ? authorised.factId : null;
  const publicSpans = typeof language.permittedReplySpans === "function" ? language.permittedReplySpans({text: reply, publicCanon: scenario.canon.public,
    act, planDelivery, facts: ownIds.map((id) => ({id, content: factContent(scenario, id)})), authorisedFact: authFact ? {id: authFact, content: factContent(scenario, authFact)} : null}) : [];
  if (!Array.isArray(publicSpans) || publicSpans.some((span) => typeof span !== "string" || span.length < 20)) return {ok: false, failures: [{code: "bad_public_span"}]};
  // Only complete, authored authorized/public spans are removed from foreign
  // fact scanning. Shared nouns never exempt a private claim or appended text.
  const spans = [...publicSpans, ...(authFact ? [factContent(scenario, authFact)] : [])];
  let foreignReply = normalize(reply);
  for (const span of spans) foreignReply = foreignReply.replace(normalize(span), " ");

  for (const fid of undisclosedFacts(scenario, ownIds)) {
    if (fid === authFact) continue; // exemption (a): authorised pending fact
    const scanReply = language.permittedReplySpans ? foreignReply : reply;
    const kw = keywordHitsForFact(scanReply, scenario, fid, corpus, locale);
    if (kw.length > 0) failures.push({ code: "leak_keyword", factId: fid });
    const sem = semanticHitForFact(scanReply, scenario, fid, corpus);
    if (sem.hit && kw.length === 0) failures.push({ code: "leak_semantic", factId: fid });
  }

  const knownCommitments = commitments.map(({original_words, what, target_day}) => ({original_words, what, target_day}));
  const knownActive = activeCommitment ? {target_day: activeCommitment.target_day, original_words: activeCommitment.original_words, what: activeCommitment.what} : null;
  for (const c of checkLanguageCanon(language, {text: reply, act, permittedCanon: {public: scenario.canon?.public || {}, userSaid, facts: ownIds.map((id) => ({id, content: factContent(scenario, id)})), commitments: knownCommitments}, authorisedFact: authFact ? {id: authFact, content: factContent(scenario, authFact)} : null, activeCommitment: knownActive, clock: {day: clockDay}, bounds, planDelivery})) {
    failures.push(c);
  }

  return { ok: failures.length === 0, failures };
}

// Positive check for reveals: the guarded reveal reply must actually express
// the authorised fact (>=2 distinct leak-keyword phrases, or >=half of the
// fact's content tokens). Call BEFORE commitDelivery.
export function checkPositiveReveal(reply, scenario, factId, locale = "en") {
  const norm = normalize(reply);
  const flat = nospace(reply);
  const phrases = factKeywords(scenario, factId, locale);
  let distinct = 0;
  for (const p of phrases) {
    if (phraseHit(norm, flat, p)) distinct += 1;
  }
  const content = contentTokens(factContent(scenario, factId));
  const replyToks = new Set(tokens(reply));
  let overlap = 0;
  for (const t of new Set(content)) if (replyToks.has(t)) overlap += 1;
  const ratio = content.length > 0 ? overlap / new Set(content).size : 0;
  const ok = distinct >= 2 || (content.length >= 2 && ratio >= 0.5);
  return { ok, distinct, overlap, ratio };
}
