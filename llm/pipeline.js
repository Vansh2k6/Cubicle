import {sc01NextHint} from "../shared/sc01Guidance.js";
import {resolveLanguage} from "./languageContext.js";
// llm/pipeline.js — Guarded turn pipeline (ARCHITECTURE.md §5, P2b).
// runTurn: append user turn -> classify -> engine.applyTurn -> generate ->
// guards (leak + canon, at most ONE shared regeneration) -> append guarded
// NPC turn -> commitDelivery -> snapshot (engine) -> trace -> public state
// only (R-03). Regeneration prompts are generic: never sealed text or the
// private guard reason. Second failure -> act-specific store fallback
// (guard-checked) -> else a prevalidated neutral clarification.
//
// The engine package is not imported here by name; callers inject
// {applyTurn, commitDelivery} so engine/ keeps zero LLM/network imports
// (R-16). This module may import classifier/generator/guards/store (code
// side, stdlib only).

import { classifyTurn, buildClassifierInput } from "./classifier.js";
import { readFileSync } from "node:fs";
const MOVE_PROMPTS = JSON.parse(readFileSync(new URL("./prompts/npc/v2-moves.json", import.meta.url), "utf8"));
const expressesAcceptance = (text) => /^that plan works for me[.!]?$/i.test(String(text).trim());
const expressesClosing = (text) => /^we have a plan[.!]?$/i.test(String(text).trim());
import { buildNpcPrompt } from "./promptBuilder.js";
import { toneText } from "./tone.js";
import { generateNpcReply } from "./npc.js";
import { checkReply, checkPositiveReveal } from "./guards.js";
import { fetch as fetchFallback } from "../replies/fallbackStore.js";

const REGEN_INSTRUCTION =
  "Rewrite the reply without stating any private fact, date, commitment term, or agreement. Stay in character, 1-3 sentences, no stage directions.";

// Prevalidated neutral clarifications: no dates, scope, progress, resources,
// meetings, or agreement language. Verified by the guard unit tests.
export const NEUTRAL_CLARIFY = {
  maya: "I hear you. Walk me through the current status in your own words.",
  jordan: "Got it. Tell me where you are stuck and I will see how I can help.",
  sam: "I am listening. Say a little more about what is on your mind.",
};
export const NEUTRAL_DEFAULT = "Can you say a bit more about what you need from me?";
export function neutralFor(npcId) {
  return NEUTRAL_CLARIFY[npcId] || NEUTRAL_DEFAULT;
}

function moodLabel(mood) {
  const m = Number(mood) || 0;
  if (m >= 65) return "Calm";
  if (m >= 40) return "Tense";
  if (m >= 20) return "Frustrated";
  return "Hostile";
}

function factById(scenario, factId) {
  return (scenario.facts || []).find((f) => f && f.id === factId) || null;
}

// Next-step hint driven by PUBLIC goal state only (P3.2 / FR-25). No sealed
// data, no act internals: the mapping is a pure function of goal statuses.
export function nextHintFor(goals, metadata = {id: "missed_deadline"}) {
  if (metadata.id === "missed_deadline") return sc01NextHint(goals, metadata.npcs);
  const visible = Array.isArray(metadata.goals) ? metadata.goals : [];
  const pending = visible.find((goal) => (goals[goal.id]?.status || goal.status) !== "done" && !goal.locked);
  return pending?.label || "Check the visible goals before choosing a next step.";
}

// Visible-goal projection with G3-style dependency locks computed
// server-side from public statuses (P3.2). `locked` is true when any of the
// goal's `requires` ids is not done. Contains ids/labels/statuses only.
export function projectGoals(scenario, session) {
  return (scenario.goals || []).filter((gl) => gl.visible).map((gl) => {
    const st = session.goals[gl.id] || {};
    const requires = Array.isArray(gl.requires) ? gl.requires : [];
    const locked = requires.some((r) => !(session.goals[r] && session.goals[r].status === "done"));
    return { id: gl.id, label: gl.label, status: st.status || "pending", locked };
  });
}

function hintFor(session, act, scenario) {
  // A completed checklist keeps its wrap-up hint even though the session
  // ended on goals_complete; other endings (walkout, max turns) report that
  // the conversation has ended.
  if (scenario.id === "missed_deadline" && (scenario.goals || []).filter((goal) => goal.visible).every((goal) => session.goals?.[goal.id]?.status === "done")) return sc01NextHint(session.goals, scenario.npcs);
  if (session.ended) return "The conversation has ended.";
  void act;
  return nextHintFor(session.goals, {id: scenario.id, npcs: scenario.npcs, goals: projectGoals(scenario, session)});
}

export function createConversation() {
  return { seq: 0, turns: [] };
}

function userTextsToNpc(convo, npcId) {
  return convo.turns.filter((t) => t.speaker === "user" && t.npcId === npcId).map((t) => t.text);
}

function lastUserTextsToNpc(convo, npcId, n) {
  const all = convo.turns.filter((t) => t.speaker === "user" && t.npcId === npcId);
  return all.slice(-n).map((t) => ({ speaker: "user", text: t.text }));
}

function revealedTextsForNpc(session, scenario, npcId) {
  const out = [];
  for (const fid of session.user_known || []) {
    const f = factById(scenario, fid);
    if (f && f.owner === npcId && typeof f.content.en === "string") out.push(f.content.en);
  }
  return out;
}

function activeCommitmentFor(session, npcId) {
  const act = (session.commitments || []).filter((c) => c.status === "active" && c.npc_id === npcId).pop();
  return act || null;
}

function boundsFor(session) {
  const m = session.model && session.model.commitment_model;
  if (!m) return null;
  return { minDay: m.unassisted_min_day, cutoffDay: session.model.cutoff_day };
}

// runTurn({session, scenario, convo, npcId, text, engine:{applyTurn, commitDelivery},
//   providers:{classify, npc}, manifestId, store?})
// Mutates session + convo. Returns {reply, act, publicState, ended, endReason,
// turnId, delivered, trace} where trace holds reason CODES only (R-66).
export async function runTurn(opts = {}) {
  const { session, scenario, convo, npcId, text } = opts;
  const engine = opts.engine || {};
  const providers = opts.providers || {};
  const manifestId = opts.manifestId || null;
  const store = opts.store || null;
  const t0 = Date.now();
  const stages = { classifyMs: 0, engineMs: 0, generateMs: 0, regenMs: 0, guardMs: 0 };
  const guardTimed = (fn) => {
    const g0 = Date.now();
    const out = fn();
    stages.guardMs += Date.now() - g0;
    return out;
  };
  if (!session || !scenario || !convo || !npcId) throw new Error("runTurn: session/scenario/convo/npcId required");
  if (typeof engine.applyTurn !== "function" || typeof engine.commitDelivery !== "function") {
    throw new Error("runTurn: engine.applyTurn/commitDelivery required");
  }

  if (session.identity && opts.runtime === undefined) throw new Error("bound language runtime required");
  resolveLanguage(scenario, opts.runtime, session.locale || "en");
  if (opts.runtime && JSON.stringify(opts.runtime.identity) !== JSON.stringify(session.identity)) throw new Error("session language identity mismatch");
  const trace = { turn: null, events: [], act: null, guardEvents: [], regen: false, delivered: false, replySource: null, npcFailure: null, npcHttpStatus: undefined };

  // 1. Append user turn.
  convo.seq += 1;
  convo.turns.push({ id: convo.seq, speaker: "user", npcId, text: String(text || "") });

  // 2. Classify.
  const clsInput = buildClassifierInput({
    text: String(text || ""),
    lastTurns: lastUserTextsToNpc(convo, npcId, 2).slice(0, -1),
    userKnown: session.user_known || [],
    clock: session.clock || { day: 0 },
  });
  const tCls0 = Date.now();
  const cls = await classifyTurn(
    { provider: providers.classify, manifestId, timeoutMs: 1500, scenario, runtime: opts.runtime, locale: session.locale || "en" },
    clsInput,
  );
  stages.classifyMs = Date.now() - tCls0;
  trace.events = cls.events.map((e) => e.type);

  // 3. Engine.
  const tEng0 = Date.now();
  const applied = engine.applyTurn(session, npcId, cls.events, { text, runtime: opts.runtime });
  stages.engineMs = Date.now() - tEng0;
  const act = applied.act;
  trace.act = act;
  trace.turn = session.turn;

  // 4. Authorise exactly the staged reveal for this npc + act (R-01).
  let authorised = null;
  let pendingContent = null;
  if (act.startsWith("reveal_fact:")) {
    const fid = act.slice("reveal_fact:".length);
    const fact = factById(scenario, fid);
    const staged = session.staged;
    if (fact && fact.owner === npcId && staged && staged.factId === fid && staged.npcId === npcId) {
      authorised = { factId: fid, owner: npcId, act };
      pendingContent = fact.content.en;
    }
  }

  // 5. Generate.
  const guardCtx = () => ({
    scenario,
    npcId,
    act,
    locale: session.locale || "en",
    userSaid: userTextsToNpc(convo, npcId),
    revealedTexts: revealedTextsForNpc(session, scenario, npcId),
    commitments: (session.commitments || []).filter((c) => c.npc_id === npcId),
    revealedIds: (session.user_known || []).filter((id) => factById(scenario, id)?.owner === npcId),
    authorised,
    activeCommitment: activeCommitmentFor(session, npcId),
    clockDay: (session.clock && session.clock.day) || 0,
    bounds: boundsFor(session),
    runtime: opts.runtime,
  });
  const prompt = buildNpcPrompt({
    scenario, runtime: opts.runtime, locale: session.locale || "en",
    npcId,
    act,
    revealedFacts: (session.user_known || []).filter((fid) => {
      const f = factById(scenario, fid);
      return f && f.owner === npcId;
    }),
    pendingReveal: authorised ? { factId: authorised.factId, content: pendingContent } : null,
    userTold: userTextsToNpc(convo, npcId),
    recentTurns: convo.turns.filter((t) => t.npcId === npcId).slice(-6),
    toneText: toneText(session.customisation?.[npcId]),
  });
  if (act === "callback_commitment") {
    const c = activeCommitmentFor(session, npcId);
    prompt.system += c?.unrealistic
      ? "\n" + MOVE_PROMPTS.callbackChallenge : "\n" + MOVE_PROMPTS.callbackAcknowledge;
  }
  if (session.staged?.agreementAllowed) prompt.system += "\n" + MOVE_PROMPTS.agreement;
  if (session.staged?.closingAllowed) prompt.system += "\n" + MOVE_PROMPTS.closing;
  const tGen0 = Date.now();
  let gen = await generateNpcReply({ prompt, provider: providers.npc, manifestId });
  stages.generateMs = Date.now() - tGen0;
  trace.replySource = gen.source;
  if (gen.source === "fallback") {
    trace.npcFailure = gen.failureCode || "PROVIDER_ERROR";
    trace.npcHttpStatus = gen.httpStatus;
  }

  const positiveOk = (replyText) => {
    if (session.staged?.agreementAllowed && !expressesAcceptance(replyText)) return false;
    if (session.staged?.closingAllowed && !expressesClosing(replyText)) return false;
    if (!authorised) return true;
    return checkPositiveReveal(replyText, scenario, authorised.factId, session.locale || "en").ok;
  };

  let verdict = gen.source === "llm" ? guardTimed(() => checkReply(gen.text, guardCtx())) : { ok: false, failures: [] };
  let positive = gen.source === "llm" && positiveOk(gen.text);
  if (gen.source === "llm") trace.guardEvents.push({
    stage: "initial",
    ok: verdict.ok && positive,
    codes: verdict.failures.map((f) => f.code + (f.factId ? ":" + f.factId : "")).concat(positive ? [] : ["reveal_omitted"]),
  });

  // 6. At most ONE shared regeneration for both guards.
  let usedFallback = false;
  let fallbackAct = null;
  if (gen.source === "llm" && (!verdict.ok || !positive)) {
    trace.regen = true;
    const regenPrompt = {
      system: prompt.system + "\nCorrection: " + REGEN_INSTRUCTION,
      messages: prompt.messages,
    };
    const tReg0 = Date.now();
    gen = await generateNpcReply({ prompt: regenPrompt, provider: providers.npc, manifestId });
    stages.regenMs = Date.now() - tReg0;
    trace.replySource = gen.source;
    if (gen.source === "fallback") {
      trace.npcFailure = gen.failureCode || "PROVIDER_ERROR";
      trace.npcHttpStatus = gen.httpStatus;
    }
    verdict = guardTimed(() => checkReply(gen.text, guardCtx()));
    positive = positiveOk(gen.text);
    trace.guardEvents.push({
      stage: "regen",
      ok: verdict.ok && positive,
      codes: verdict.failures.map((f) => f.code + (f.factId ? ":" + f.factId : "")).concat(positive ? [] : ["reveal_omitted"]),
    });
  }

  // 7. Second failure -> act-specific fallback (guard-checked) -> neutral.
  if (gen.source !== "llm" || !verdict.ok || !positive) {
    if (!trace.npcFailure) trace.npcFailure = "GUARD_REJECTED";
    // A failed reveal must never fall back to its own reveal lines (they
    // contain the fact); deflect instead.
    const fbAct = act.startsWith("reveal_fact:") ? "deflect_sealed" : act;
    const tried = [fbAct];
    if (fbAct !== "deflect_sealed") tried.push("deflect_sealed");
    let picked = null;
    for (const a of tried) {
      const fb = fetchFallback({
        scenario: scenario.id, npc: npcId, act: a,
        state: {
          mood: session.npcs[npcId] ? session.npcs[npcId].mood : 50,
          factsRevealed: session.user_known || [],
        },
        locale: session.locale || "en",
      }, store);
      if (!fb) continue;
      const v = guardTimed(() => checkReply(fb.text, { ...guardCtx(), act: a, authorised: null }));
      trace.guardEvents.push({ stage: "fallback:" + a, ok: v.ok, codes: v.failures.map((f) => f.code + (f.factId ? ":" + f.factId : "")) });
      if (v.ok) { picked = fb; fallbackAct = a; break; }
    }
    if (picked) {
      gen = { text: picked.text, source: "fallback", trimmed: false, manifestId };
    } else {
      const neutral = neutralFor(npcId);
      const v = guardTimed(() => checkReply(neutral, { ...guardCtx(), authorised: null }));
      trace.guardEvents.push({ stage: "fallback:neutral", ok: v.ok, codes: v.failures.map((f) => f.code + (f.factId ? ":" + f.factId : "")) });
      const safeText = v.ok ? neutral : "Let's keep going.";
      if (!v.ok && !guardTimed(() => checkReply(safeText, {...guardCtx(), authorised: null})).ok) throw new Error("no guarded fallback available");
      gen = { text: safeText, source: "fallback", trimmed: false, manifestId };
      fallbackAct = "fallback_clarify";
    }
    usedFallback = true;
    trace.replySource = gen.source;
    verdict = { ok: true, failures: [] };
    positive = true;
  }

  // 8. Append guarded NPC turn.
  convo.seq += 1;
  convo.turns.push({ id: convo.seq, speaker: "npc", npcId, text: gen.text, act });

  // 9. Commit delivery: only a guarded, on-act, fact-expressing reply counts.
  // Fallbacks never carry discovery/agreement credit.
  const onAct = !usedFallback;
  const delivered = verdict.ok && positive && onAct && gen.source === "llm";
  engine.commitDelivery(session, session.turn, { delivered, runtime: opts.runtime,
    agreementExpressed: expressesAcceptance(gen.text),
    closingExpressed: expressesClosing(gen.text) });
  trace.delivered = delivered;

  const npcState = session.npcs[npcId] || { mood: 50 };
  const publicState = {
    mood_label: moodLabel(npcState.mood),
    goals: projectGoals(scenario, session),
    next_hint: hintFor(session, act, scenario),
    npc_availability: Object.fromEntries(
      Object.keys(session.npcs || {}).map((id) => [id, !(session.ended && (session.npcs[id] || {}).last_act === "walkout")]),
    ),
    ended: !!session.ended,
  };
  trace.latencyMs = Date.now() - t0;
  trace.stages = { ...stages };

  return {
    reply: gen.text,
    act,
    publicState,
    ended: !!session.ended,
    endReason: session.endReason || null,
    turnId: session.turn,
    delivered,
    usedFallback,
    fallbackAct,
    regen: trace.regen,
    manifestId,
    trace,
  };
}

// Public API projection (R-03 allowlist). Anything not listed here must never
// leave the server during a live session.
const PUBLIC_KEYS = ["npc_reply", "public_state", "ended", "end_reason", "turn_id", "speech"];
const PUBLIC_STATE_KEYS = ["mood_label", "goals", "next_hint", "npc_availability", "ended"];
export function publicResponse(result) {
  const ps = result.publicState || {};
  const goals = Array.isArray(ps.goals)
    ? ps.goals.map((g) => ({ id: g.id, label: g.label, status: g.status, locked: !!g.locked }))
    : [];
  return {
    npc_reply: result.reply,
    public_state: {
      mood_label: ps.mood_label,
      goals,
      next_hint: ps.next_hint,
      npc_availability: ps.npc_availability,
      ended: !!ps.ended,
    },
    ended: !!result.ended,
    end_reason: result.endReason || null,
    turn_id: result.turnId,
    speech: result.speech && typeof result.speech === "object" ? {
      available: !!result.speech.available,
      turn_id: typeof result.speech.turn_id === "string" ? result.speech.turn_id : "",
      mode: ["server", "browser", "none"].includes(result.speech.mode) ? result.speech.mode : "none",
    } : { available: false, turn_id: "", mode: "none" },
  };
}
export { PUBLIC_KEYS, PUBLIC_STATE_KEYS };
