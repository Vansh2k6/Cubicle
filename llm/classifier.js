// llm/classifier.js — LLM event classifier front-end (code-side post-validation).
// The LLM interprets utterances; it NEVER judges realism/acceptance (no min/cutoff
// logic here). Engine-derived `overpromised` is rejected as output. ESM, stdlib only.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { complete } from "./gateway.js";

const TAXONOMY = new Set([
  "asked_deadline_flexibility",
  "asked_why_urgent",
  "asked_requirement_details",
  "asked_background",
  "asked_impact",
  "asked_for_help",
  "asked_advice",
  "asked_expectation",
  "committed_deadline",
  "proposed_scope_cut",
  "proposed_phased_delivery",
  "proposed_plan",
  "confirmed_next_steps",
  "recapped_agreement",
  "gave_honest_status",
  "took_ownership",
  "blamed_others",
  "apologized",
  "acknowledged_concern",
  "pushed_back_constructively",
  "avoided_question",
  "relayed_fact",
  "greeted",
  "small_talk",
  "off_topic",
  "repeated_question",
  "asked_reveal_all",
]);

export const CLASSIFIER_SCHEMA = {
  type: "object",
  required: ["events"],
  properties: {
    events: {
      type: "array",
      items: {
        type: "object",
        required: ["type"],
        properties: {
          type: { type: "string" },
          params: { type: "object" },
        },
      },
    },
    clarify: {
      type: "array",
      items: {
        type: "object",
        required: ["reason"],
        properties: {
          reason: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
  },
};

// Explicit day words, day-0 anchored (SC-01 clock; D-27: Friday is the day-3 label).
const EXPLICIT_DAY = [
  { re: /\btomorrow\b/i, day: 1, word: "tomorrow" },
  { re: /\bthursday\b/i, day: 2, word: "Thursday" },
  { re: /\bfriday\b/i, day: 3, word: "Friday" },
];

// Ambiguous/intraday markers: clarification need, never a rounded deadline (D-25).
const AMBIGUOUS_MARKERS = [
  "next week",
  "end of day",
  "eod",
  "couple of days",
  "few days",
  "soon",
  "asap",
  "shortly",
  "whenever",
];

// Explicit acceptance of Jordan's offered help (R-14 prompt; code enforces strictly).
const EXPLICIT_ACCEPT = /accepts?\s+(your|jordan'?s|the)?\s*help|yes[^.]*help|let'?s\s+pair|pair\s+with\s+(you|jordan)|sounds\s+good[^.]*pair/i;

let cachedPrompt = null;
export function getClassifierPrompt() {
  if (!cachedPrompt) {
    const dir = dirname(fileURLToPath(import.meta.url));
    cachedPrompt = readFileSync(join(dir, "prompts", "classifier", "v2.md"), "utf8");
  }
  return cachedPrompt;
}

// lastTurns sliced to <=2 by code.
export function buildClassifierInput({ text, lastTurns, userKnown, clock } = {}) {
  return {
    text: typeof text === "string" ? text : "",
    lastTurns: Array.isArray(lastTurns) ? lastTurns.slice(-2) : [],
    userKnown: Array.isArray(userKnown) ? userKnown.slice() : [],
    clock: clock && typeof clock.day === "number" ? { day: clock.day } : { day: 0 },
  };
}

function findExplicitDay(text) {
  for (const d of EXPLICIT_DAY) {
    if (d.re.test(text)) return d;
  }
  return null;
}

function findAmbiguous(text) {
  const lower = text.toLowerCase();
  for (const m of AMBIGUOUS_MARKERS) {
    if (lower.includes(m)) return m;
  }
  return null;
}

function coerceDay(raw) {
  if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) return raw;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw.trim());
    if (Number.isInteger(n) && n >= 0) return n;
  }
  return null;
}

// classifyTurn({provider, manifestId, system?, timeoutMs?}, input)
// -> {events, clarify, manifestId, attempts, dropped[]}.
export async function classifyTurn(deps, input) {
  const { provider, manifestId = null } = deps || {};
  const system = (deps && deps.system) || getClassifierPrompt();
  const timeoutMs = (deps && deps.timeoutMs) || 1500;
  const payload = {
    message: input.text,
    recent_turns: input.lastTurns,
    user_known: input.userKnown,
    clock: input.clock,
  };
  const res = await complete({
    role: "classifier",
    system,
    messages: [{ role: "user", content: JSON.stringify(payload) }],
    schema: CLASSIFIER_SCHEMA,
    temperature: 0,
    timeoutMs,
    provider,
    manifestId,
    fallback: { events: [], clarify: [] },
  });

  const data = res.source === "llm" ? res.data : { events: [], clarify: [] };
  const events = [];
  const clarify = [];
  const dropped = [];

  for (const ev of Array.isArray(data.events) ? data.events : []) {
    const type = ev && ev.type;
    if (type === "overpromised") {
      dropped.push({ type, reason: "engine_derived_forbidden" });
      continue;
    }
    if (typeof type !== "string" || !TAXONOMY.has(type)) {
      dropped.push({ type: typeof type === "string" ? type : null, reason: "unknown_event" });
      continue;
    }
    const params = ev.params && typeof ev.params === "object" && !Array.isArray(ev.params)
      ? { ...ev.params }
      : {};
    if (type === "committed_deadline") {
      let day = coerceDay(params.day);
      const explicit = findExplicitDay(input.text);
      const ambiguous = findAmbiguous(input.text);
      if (ambiguous) {
        clarify.push({ reason: "ambiguous_date", detail: ambiguous });
        dropped.push({ type, reason: "ambiguous_date" });
        continue;
      }
      if (day === null && explicit) day = explicit.day; // code-side date table
      if (day === null) {
        clarify.push({ reason: "ambiguous_date", detail: input.text.slice(0, 120) });
        dropped.push({ type, reason: "missing_day" });
        continue;
      }
      params.day = day;
    }
    if (type === "confirmed_next_steps" && params.help_accepted) {
      if (!EXPLICIT_ACCEPT.test(input.text)) params.help_accepted = false;
    }
    events.push({ type, params });
  }

  // Text-level ambiguous markers always need clarification, even with no event.
  if (findAmbiguous(input.text) && !clarify.some((c) => c.reason === "ambiguous_date")) {
    clarify.push({ reason: "ambiguous_date", detail: findAmbiguous(input.text) });
  }

  for (const c of Array.isArray(data.clarify) ? data.clarify : []) {
    if (c && typeof c.reason === "string") {
      clarify.push({ reason: c.reason, detail: typeof c.detail === "string" ? c.detail : "" });
    }
  }

  return { events, clarify, manifestId, attempts: res.attempts, dropped };
}

export { TAXONOMY };
