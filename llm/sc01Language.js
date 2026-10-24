// Server-owned English SC-01 language; no engine decisions or private root canon.
import {NUMBER_WORDS, DAY_FULL, normalize, echoCorpus, supportedByEcho, hasAttribution, hasConfirmLanguage} from "./languagePrimitives.js";
// SC-01 day-0 anchored labels (D-27: Friday is the day-3 label).
const DAY_TO_OFFSET = { thursday: 2, friday: 3 };

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
// Returns failure codes without sealed text. Only permitted fact spans and
// attributed, unconfirmed user echoes can support material claims.
function checkCanon(reply, opts = {}) {
  const {
    corpus = null,
    activeCommitment = null, clockDay = 0, bounds = null, act = "", permittedDates = [], permittedTexts = [],
  } = opts;
  const failures = [];
  const text = String(reply || "");

  // 1. Date claims.
  for (const claim of resolveDayClaims(text, clockDay)) {
    if (claim.day !== null) {
      let exempt = false;
      if (permittedDates.some((date) => date.day === claim.day && date.day !== null)) exempt = true;
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
    { re: SCOPE_RE, code: "canon_invented_scope" },
    { re: RESOURCE_RE, code: "canon_invented_resources" },
    { re: PROGRESS_RE, code: "canon_invented_progress" },
    { re: MEETING_RE, code: "canon_invented_meeting" },
  ];
  for (const check of matChecks) {
    for (const match of text.matchAll(new RegExp(check.re.source, "gi"))) {
      // Permission covers a supported span, never the whole claim category.
      if (permittedTexts.some((content) => normalize(content).includes(normalize(match[0])))) continue;
      if (corpus && supportedByEcho(corpus, match[0]) && hasAttribution(text) && !hasConfirmLanguage(text)) continue;
      failures.push({code: check.code});
    }
  }

  // 3. Agreement/closing wording only on an agreement/closing act.
  if (AGREE_RE.test(text) && !AGREEMENT_ACTS.has(act)) {
    failures.push({ code: "canon_agreement_wrong_act" });
  }

  return failures;
}


export const sc01Language = Object.freeze({
  publicCanonLines({publicCanon = {}, actorPublicContext, publicCast = []}) {
    const manager = publicCast.find((actor) => actor.id === "maya")?.name || "the manager";
    const player = publicCast.find((actor) => actor.id === "alex")?.name || "the user";
    const lines = [];
    if (publicCanon.project_status) lines.push(`- Project status: ${publicCanon.project_status}.`);
    if (typeof publicCanon.original_due_day === "number") lines.push(`- The project was due ${Math.abs(publicCanon.original_due_day)} day(s) ago.`);
    if (publicCanon.maya_manages_project) lines.push(`- ${manager} manages the project.`);
    if (publicCanon.alex_responsible_for_update) lines.push(`- ${player} (the user) is responsible for the update.`);
    return lines.length ? lines : ["(no verified context)"];
  },
  normalizeCommitment({text, clock}) {
    const value = String(text || "");
    const ambiguous = ["next week", "end of day", "eod", "couple of days", "few days", "soon", "asap", "shortly", "whenever"].find((word) => value.toLowerCase().includes(word));
    const claims = resolveDayClaims(value, clock?.day || 0);
    const days = [...new Set(claims.map((claim) => claim.day))];
    if (ambiguous || days.length !== 1 || days[0] === null) return {day: null, clarification: ambiguous || (days.length > 1 ? "conflicting_dates" : "missing_day")};
    return {day: days[0], clarification: null};
  },
  canonCheck({text, act, permittedCanon = {}, authorisedFact, activeCommitment, clock, bounds}) {
    const corpus = echoCorpus({userSaid: permittedCanon.userSaid || [], revealedTexts: (permittedCanon.facts || []).map((fact) => fact.content), commitments: permittedCanon.commitments || []});
    const permittedTexts = [...(permittedCanon.facts || []), ...(authorisedFact ? [authorisedFact] : [])].map((fact) => fact.content);
    const permittedDates = permittedTexts.flatMap((content) => resolveDayClaims(content, clock?.day || 0));
    return checkCanon(text, {act, corpus, activeCommitment, clockDay: clock?.day || 0, bounds, permittedDates, permittedTexts});
  },
});
// Explicit compatibility entry for SC-01 callers that do not yet hold a runtime.
export function legacyCanonCheck(text, opts = {}) {
  if (opts.scenario && (opts.scenario.id !== "missed_deadline" || opts.scenario.version !== 1)) return [{code: "canon_unsupported_context"}];
  const permittedDates = opts.authorisedFactId === "F1" ? [{day: 3}] : [];
  return checkCanon(text, {...opts, permittedDates});
}
