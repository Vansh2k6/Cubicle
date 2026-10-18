// llm/guards.js — Leak guard (R-02), semantic check + canon guard (R-09).
// Local, non-generative, stdlib only. No imports: pure functions over plain
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

const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

const DAY_FULL = {
  mon: "monday", monday: "monday", mondays: "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday", tuesdays: "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday", wednesdays: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday", thursdays: "thursday",
  fri: "friday", friday: "friday", fridays: "friday",
  sat: "saturday", saturday: "saturday", saturdays: "saturday",
  sun: "sunday", sunday: "sunday", sundays: "sunday",
};

// SC-01 day-0 anchored labels (D-27: Friday is the day-3 label).
const DAY_TO_OFFSET = { thursday: 2, friday: 3 };

const STOPWORDS = new Set(
  "the,a,an,is,in,on,of,to,and,for,with,you,your,it,its,that,this,these,those,have,has,had,been,are,was,were,be,as,at,by,from,or,not,can,will,would,should,about,our,we,i,my,me,us,so,do,does,if,there,here,what,when,how,why,which,who,all,any,but,no,yes,just,now,very,really,quite,more,most,some,such,than,then,they,them,their,he,she,his,her,having,doing,being,because,until,while,again,once".split(","),
);

const CONFIRM_WORDS = ["yes", "yeah", "correct", "exactly", "indeed", "confirmed", "agree", "agrees", "agreed", "true", "right", "absolutely", "definitely"];

const ATTRIB_RE = /you\s+(said|mentioned|proposed|asked|suggested|told\s+me|noted|wrote|put\s+it)|as\s+you\s+(said|put\s+it)|your\s+(proposal|words|message|question|guess)|you'?re\s+asking\s+about/i;

const DATE_DAY_RE = /\b(mon|monday|mondays|tue|tues|tuesday|tuesdays|wed|weds|wednesday|wednesdays|thu|thur|thurs|thursday|thursdays|fri|friday|fridays|sat|saturday|saturdays|sun|sunday|sundays)\b/i;
const DATE_COUNT_RE = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+days?\b/i;
const TOMORROW_RE = /\btomorrow\b/i;

const SCOPE_RE = /\bscope\b|drop\s+(a|the)\s+feature|cut\s+(scope|corners)|phased(\s+delivery)?|ship\s+(a\s+)?partial|descope|reduce\s+scope/i;
const RESOURCE_RE = /two\s+more\s+devs|extra\s+(dev|developer|engineer|resource|help|pair\s+of\s+hands)|more\s+(devs|developers|engineers|headcount)|another\s+(dev|developer|engineer)|two\s+engineers/i;
const PROGRESS_RE = /\d+\s*(%|percent)\s*complete|half[-\s]?done|almost\s+done|module\s+is\s+(ready|done)|ahead\s+of\s+schedule|already\s+finished/i;
const MEETING_RE = /(tell|told|email|emailed|call|called)\s+the\s+client|schedul\w*\s+(a\s+)?(meeting|sync|call)|standup|sync\s+with|meeting\s+(on|with|monday|tuesday|wednesday|thursday|friday)/i;
const AGREE_RE = /we\s+(have\s+)?agreed|deal\b|locked\s+in|\bconfirmed\b|all\s+set|sign[-\s]?off|shake\s+on|we\s+have\s+a\s+deal|closing\s+this/i;

// Agreement/closing wording is only legitimate on a closing act.
const AGREEMENT_ACTS = new Set(["close_positive"]);

export function normalize(text) {
  let s = String(text || "").toLowerCase();
  s = s.replace(/[_—–−]+/g, " ");
  s = s.replace(/-/g, " ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\b([a-z]+)\b/g, (w) => {
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, w)) return String(NUMBER_WORDS[w]);
    if (Object.prototype.hasOwnProperty.call(DAY_FULL, w)) return DAY_FULL[w];
    return w;
  });
  return s.replace(/\s+/g, " ").trim();
}

export function nospace(text) {
  return normalize(text).replace(/\s+/g, "");
}

function tokens(text) {
  return normalize(text).split(" ").filter(Boolean);
}

export function contentTokens(text) {
  return tokens(text).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

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

// Support corpus for the echo allowance: user words to THIS npc +
// THIS npc's permitted revealed facts + commitments logged in THIS
// conversation. Returned as normalised + nospace haystacks.
export function echoCorpus({ userSaid = [], revealedTexts = [], commitments = [] } = {}) {
  const parts = [];
  for (const t of userSaid) parts.push(String(t || ""));
  for (const t of revealedTexts) parts.push(String(t || ""));
  for (const c of commitments) {
    if (c && typeof c === "object") {
      if (c.original_words) parts.push(String(c.original_words));
      if (c.what) parts.push(String(c.what));
    } else if (typeof c === "string") parts.push(c);
  }
  const norm = normalize(parts.join(" "));
  return { norm, flat: norm.replace(/\s+/g, "") };
}

function phraseHit(replyNorm, replyFlat, phrase) {
  const p = normalize(phrase);
  if (!p) return false;
  if (replyNorm.includes(p)) return true;
  const pf = p.replace(/\s+/g, "");
  if (pf.length >= 4 && replyFlat.includes(pf)) return true;
  // Ordered token subsequence with a small gap allowance, so insertions like
  // "holding them off" still match the keyword "holding off".
  const pt = p.split(" ").filter(Boolean);
  if (pt.length >= 2) {
    const rt = replyNorm.split(" ").filter(Boolean);
    let pi = 0;
    let gap = 0;
    for (const w of rt) {
      if (w === pt[pi]) { pi += 1; gap = 0; if (pi === pt.length) return true; }
      else if (pi > 0) { gap += 1; if (gap > 3) { pi = 0; gap = 0; } }
    }
  }
  return false;
}

function supportedByEcho(corpus, phrase) {
  const p = normalize(phrase);
  if (!p) return false;
  if (p.length >= 3 && corpus.norm.includes(p)) return true;
  const pf = p.replace(/\s+/g, "");
  return pf.length >= 4 && corpus.flat.includes(pf);
}

function hasConfirmLanguage(reply) {
  const toks = new Set(tokens(reply));
  return CONFIRM_WORDS.some((w) => toks.has(w));
}

function hasAttribution(reply) {
  return ATTRIB_RE.test(String(reply || ""));
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

function resolveDayClaims(reply, clockDay) {
  const text = String(reply || ""), claims = [];
  for (const match of text.matchAll(new RegExp(DATE_DAY_RE.source, "gi"))) {
    const full = DAY_FULL[match[1].toLowerCase()];
    claims.push({ day: Object.prototype.hasOwnProperty.call(DAY_TO_OFFSET, full) ? DAY_TO_OFFSET[full] : null, label: full, index: match.index });
  }
  for (const match of text.matchAll(new RegExp(DATE_COUNT_RE.source, "gi"))) {
    const raw = match[1].toLowerCase();
    const n = Object.prototype.hasOwnProperty.call(NUMBER_WORDS, raw) ? NUMBER_WORDS[raw] : Number(raw);
    if (Number.isInteger(n)) claims.push({ day: clockDay + n, label: match[0], index: match.index });
  }
  for (const match of text.matchAll(new RegExp(TOMORROW_RE.source, "gi"))) claims.push({ day: clockDay + 1, label: match[0], index: match.index });
  return claims.sort((a, b) => a.index - b.index);
}

// Canon guard (R-09): structured checks against clock + active commitment.
// Returns failure codes (no sealed text). `authorisedFactId` spans are
// exempt; pure user-echo attribution is not a confirmation.
export function canonCheck(reply, opts = {}) {
  const {
    scenario = null, authorisedFactId = null, corpus = null,
    activeCommitment = null, clockDay = 0, bounds = null, act = "",
  } = opts;
  const failures = [];
  const text = String(reply || "");
  void scenario;

  const echoSupportedWhole = (re) => {
    const m = re.exec(text);
    if (!m) return false;
    return corpus ? supportedByEcho(corpus, m[0]) : false;
  };

  // 1. Date claims.
  for (const claim of resolveDayClaims(text, clockDay)) {
    if (claim.day !== null) {
      let exempt = false;
      if (authorisedFactId === "F1" && (claim.label === "friday" || claim.day === 3)) exempt = true;
      if (!exempt && activeCommitment && claim.day === activeCommitment.target_day) {
        exempt = ["close_positive", "acknowledge_relay", "callback_commitment"].includes(act);
      }
      if (!exempt && corpus && supportedByEcho(corpus, claim.label) && hasAttribution(text) && !hasConfirmLanguage(text)) {
        exempt = true; // pure echo attribution ("you proposed Friday")
      }
      if (!exempt) {
        if (bounds && (claim.day < bounds.minDay || claim.day > bounds.cutoffDay)) {
          failures.push({ code: "canon_date_out_of_bounds" });
        } else {
          failures.push({ code: "canon_unverified_date" });
        }
      }
    } else {
      // Named a weekday outside the SC-01 vocabulary: invented specifics.
      if (!(corpus && supportedByEcho(corpus, claim.label) && hasAttribution(text) && !hasConfirmLanguage(text))) {
        failures.push({ code: "canon_unverified_date" });
      }
    }
  }

  // 2. Scope / progress / resources / meetings: reject unless authorised or
  // pure attributed echo.
  const matChecks = [
    { re: SCOPE_RE, code: "canon_invented_scope", authFacts: [] },
    { re: RESOURCE_RE, code: "canon_invented_resources", authFacts: [] },
    { re: PROGRESS_RE, code: "canon_invented_progress", authFacts: ["F2"] },
    { re: MEETING_RE, code: "canon_invented_meeting", authFacts: [] },
  ];
  for (const c of matChecks) {
    if (!c.re.test(text)) continue;
    if (authorisedFactId && c.authFacts.includes(authorisedFactId)) continue;
    if (echoSupportedWhole(c.re) && hasAttribution(text) && !hasConfirmLanguage(text)) continue;
    failures.push({ code: c.code });
  }

  // 3. Agreement/closing wording only on an agreement/closing act.
  if (AGREE_RE.test(text) && !AGREEMENT_ACTS.has(act)) {
    failures.push({ code: "canon_agreement_wrong_act" });
  }

  return failures;
}

// Full reply check. `authorised` = {factId, owner, act} | null: the engine's
// pending disclosure for exactly this npc + act. `revealedIds` = fact ids the
// user already knows (excluded from "undisclosed" scanning); per-NPC
// knowledge filtering happens via revealedTexts in the echo corpus.
export function checkReply(reply, opts = {}) {
  const {
    scenario, npcId, act, locale = "en",
    userSaid = [], revealedTexts = [], commitments = [],
    revealedIds = [], authorised = null,
    activeCommitment = null, clockDay = 0, bounds = null,
  } = opts;
  const failures = [];
  if (!scenario) return { ok: false, failures: [{ code: "bad_input" }] };
  const corpus = echoCorpus({ userSaid, revealedTexts, commitments });
  const authFact = authorised && authorised.owner === npcId && authorised.act === act ? authorised.factId : null;

  for (const fid of undisclosedFacts(scenario, revealedIds)) {
    if (fid === authFact) continue; // exemption (a): authorised pending fact
    const kw = keywordHitsForFact(reply, scenario, fid, corpus, locale);
    if (kw.length > 0) failures.push({ code: "leak_keyword", factId: fid });
    const sem = semanticHitForFact(reply, scenario, fid, corpus);
    if (sem.hit && kw.length === 0) failures.push({ code: "leak_semantic", factId: fid });
  }

  for (const c of canonCheck(reply, { scenario, authorisedFactId: authFact, corpus, activeCommitment, clockDay, bounds, act })) {
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
