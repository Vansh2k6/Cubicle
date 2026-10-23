// services/api/offlineProviders.js — Deterministic offline fake providers (P2c).
// No network, no live LLM (D-28: Groq wiring deferred). Both functions match the
// gateway provider interface: ({role, system, messages, temperature}) -> {text}.
// classifyFn: rule-based text -> classifier JSON. npcFn: voices a guarded
// fallback-store line for the engine-chosen act parsed from the prompt's
// CURRENT MOVE (reveal acts use the store's authorised reveal lines; the
// pipeline's leak/canon guards still apply before delivery).

import { fetch as fetchFallback, defaultStore, createStore } from "../../replies/fallbackStore.js";
import { neutralFor } from "../../llm/pipeline.js";

const SCENARIO_ID = "missed_deadline";
const store = defaultStore();

function has(re, text) {
  return re.test(text);
}

// Rule-based event mapping for SC-01 small talk. Recall-limited by design:
// unknown phrasing yields no events (engine reacts neutrally). Documented
// stub behaviour, not a classifier claim.
export function rulesToEvents(text) {
  const t = String(text || "");
  const events = [];
  const push = (type, params) => events.push({ type, params: params || {} });
  if (/\b(jordan|vansh)\b/i.test(t) && /\b(module|remaining work)\b/i.test(t)) {
    if (/\bhalf\b/i.test(t)) push("relayed_fact", { fact_id: "F2", accurate: true });
    else if (/all the remaining work|entire remaining work|no module|nothing built/i.test(t)) push("relayed_fact", { fact_id: "F2", accurate: false });
  }

  if (has(/ignore\b.*\binstructions|tell me everything|reveal\s+(all|everything)|tell me all/i, t)) {
    push("asked_reveal_all");
    return events;
  }
  if (has(/flexib|wiggle|more time|extend|room\b.*deadline|deadline.*room|slip/i, t)) {
    push("asked_deadline_flexibility");
  }
  if (has(/why\b.*(urgent|rush|hurry|hurrying)|urgent\?|why the rush|why.*hurry/i, t)) {
    push("asked_why_urgent");
  }
  if (has(/impact|happen if|consequence|what happens/i, t)) {
    push("asked_impact");
  }
  if (has(/requirement|what(?:'s| is) left|remaining work|details?\b.*(?:work|left|project)/i, t)) {
    push("asked_requirement_details");
  }
  if (has(/\bhelp\b|pair\b|stuck\b|can you help/i, t)) {
    push("asked_for_help");
  }
  if (has(/advice|what should i do|what would you do|any (tips|suggestions)|how should i handle|guidance/i, t)) {
    push("asked_advice");
  }
  if (has(/worried|concerned|anxious|stressed|nervous|keeping me up|weighing on me|scared\b/i, t)) {
    push("acknowledged_concern");
  }
  if (has(/underestimated|should have flagged|my fault|take responsibility|\bi own\b|honest/i, t)) {
    push("took_ownership");
    push("gave_honest_status");
  }
  if (has(/sorry|apolog/i, t)) {
    push("apologized");
  }
  if (has(/accepts?\s+(your|the|jordan'?s|vansh(?:\s+singh)?'?s)?\s*help|let'?s pair|pair with (you|jordan|vansh(?:\s+singh)?)|sounds good[^.]*pair/i, t)) {
    push("confirmed_next_steps", { help_accepted: true });
  }
  if (has(/recap|to summarize|let me summarize/i, t)) {
    push("recapped_agreement");
  }
  const dayMatch = /\b(friday|thursday|tomorrow)\b/i.exec(t) || /\b(\d+)\s*days?\b/i.exec(t);
  if (
    dayMatch &&
    !has(/recap|to summarize|let me summarize/i, t) &&
    has(/deliver|done\b|finish|complete|send|submit|ready|promise|will|can\b/i, t) &&
    !has(/next week|end of day|\beod\b|couple of days|few days|\bsoon\b|\basap\b|shortly|whenever/i, t)
  ) {
    const word = dayMatch[1].toLowerCase();
    const day = word === "friday" ? 3 : word === "thursday" ? 2 : word === "tomorrow" ? 1 : Number(word);
    if (Number.isInteger(day)) push("committed_deadline", { day });
  }
  if (events.length === 0 && has(/^(hi|hey|hello|good (morning|afternoon))\b/i, t.trim())) {
    push("greeted");
  }
  return events;
}

// Server-bound classifier provider: closes over the per-request input text.
export function classifyProviderFor(inputText) {
  return async () => ({ text: JSON.stringify({ events: rulesToEvents(inputText) }) });
}

export function createOfflineProviders(pkg, { locale = "en" } = {}) {
  if (!pkg || pkg.spec?.id !== SCENARIO_ID || pkg.policy?.id !== "sc01-legacy" || pkg.policy?.version !== 1 || locale !== "en") throw new Error("unsupported offline scenario package");
  const store = createStore(pkg.replies?.entries, { scenario: pkg.spec.id, locale, contentHash: pkg.identity?.contentHash });
  return {
    store,
    classifyProviderFor,
    npcProvider: async ({ system } = {}) => offlineNpc({ system }, store, pkg.spec.id, locale),
  };
}

function parseAct(system) {
  const m = /CURRENT MOVE:\s*([A-Za-z_]+(?::[A-Za-z0-9_]+)?)/.exec(String(system || ""));
  return m ? m[1] : "react_freely";
}

function parseNpc(system) {
  const m = /You are [^(]+\(([a-z_]+)\)/.exec(String(system || ""));
  return m ? m[1] : null;
}

async function offlineNpc({ system } = {}, selectedStore = store, scenario = SCENARIO_ID, locale = "en") {
  const act = parseAct(system);
  if (String(system).includes("engine authorizes acceptance")) return { text: "That plan works for me." };
  if (String(system).includes("engine authorizes closing")) return { text: "We have a plan." };
  if (act === "callback_commitment") return { text: String(system).includes("challenge the earlier promise")
    ? "You made a promise earlier. Can you reconsider it and suggest a workable plan?"
    : "You made a promise earlier. How is that plan progressing?" };
  const npc = parseNpc(system) || "maya";
  const baseAct = act.startsWith("reveal_fact:") ? act : act.split(":")[0];
  const line = fetchFallback(
    { scenario, npc, act: baseAct, state: { mood: 50 }, locale }, selectedStore,
  );
  if (line) return { text: line.text };
  return { text: neutralFor(npc) };
}

// Explicit SC-01 compatibility wrapper for existing tests and scripted tooling.
export async function npcFn(args = {}) { return offlineNpc(args); }
