// Authored SC-01 decisions only. Inputs are read-only projections supplied by core.
import { b2TurnFor, B3_GAP_TURNS } from "../../engine/config.js";

export const sc01Rules = Object.freeze({
  assistanceFact: "F2", assistanceActor: "jordan", assistanceFlag: "help_accepted_with_jordan",
  goalActors: Object.freeze({ G1: "maya", G2: "jordan", G3: "maya" }),
});

export function commitmentBounds({ state, rules }) {
  const factDelivered = state.facts[rules.assistanceFact]?.status === "revealed";
  const helpAccepted = state.flags.includes(rules.assistanceFlag);
  const active = factDelivered && helpAccepted;
  return { minDay: active ? rules.commitment_model.assisted_min_day : rules.commitment_model.unassisted_min_day,
    cutoffDay: rules.cutoff_day, assistance: { active, factDelivered, helpAccepted } };
}

export function goalCandidates({ state, rules }) {
  return rules.goals.flatMap((goal) => {
    const actorId = rules.goalActors[goal.id];
    const types = goal.done_when.filter((x) => x.startsWith("event:")).map((x) => x.slice(6));
    const commitment = goal.done_when.includes("date_mutually_agreed")
      ? state.commitments.find((c) => c.status === "active" && c.accepted_with === actorId && c.pending_recap_turn === state.turn) : null;
    if (goal.done_when.includes("date_mutually_agreed") && !commitment) return [];
    const sources = types.map((type) => state.events_log.find((e) => e.type === type && e.npc_id === actorId &&
      (!commitment || e.turn_id === commitment.pending_recap_turn)));
    if (sources.some((e) => !e)) return [];
    return [{ goalId: goal.id, actorId, sourceIds: sources.map((e) => e.source_id),
      ...(commitment ? { commitmentId: commitment.id } : {}), requiresDelivery: !!commitment }];
  });
}

export function pressureCandidates({ state, rules }) {
  const callback = rules.beats.find((b) => b.id === "B3");
  const date = rules.beats.find((b) => b.id === "B2");
  const candidates = [];
  if (callback) for (const c of state.commitments) {
    if (c.status === "active" && c.npc_id === callback.npc && !c.callbackFired && state.turn - c.turn_id >= B3_GAP_TURNS)
      candidates.push({ beatId: callback.id, actorId: callback.npc, act: callback.act, commitmentId: c.id, sourceIds: [c.source_id] });
  }
  if (date && state.turn >= b2TurnFor(state.customisation[date.npc]?.assertiveness) && state.commitments.length === 0)
    candidates.push({ beatId: date.id, actorId: date.npc, act: date.act, sourceIds: [] });
  return candidates;
}

// Conservative text evidence: null means unknown, distinct from an inaccurate claim.
export function relayAccuracy({ factId, text }) {
  const s = String(text || "").toLowerCase();
  if (/\b(not|never|no|isn't|isnt|didn't|didnt|wasn't|wasnt)\b/.test(s)) return null;
  if (/\?|\b(if|maybe|perhaps|might|guess|not sure)\b/.test(s)) return null;
  if (factId === "F1" && /\b(client|cutoff|deadline)\b/.test(s)) {
    if (/\b(friday|3 days|three days)\b/.test(s)) return true;
    if (/\b(tomorrow|thursday|1 day|one day|2 days|two days)\b/.test(s)) return false;
  }
  if (factId === "F2" && /\bjordan\b/.test(s) && /\b(module|remaining work)\b/.test(s)) {
    if (/\b(half|50 percent)\b/.test(s) && /\b(all the remaining work|entire remaining work|nothing built|no module)\b/.test(s)) return null;
    if (/\b(no module|nothing built|all the remaining work|entire remaining work)\b/.test(s)) return false;
    if (/\b(half|50 percent)\b/.test(s)) return true;
  }
  if (factId === "F3" && /\b(heads.up|headsup)\b/.test(s) && /\breview\b/.test(s)) {
    if (/\b(counts against|counted against|hurts)\b/.test(s)) return false;
    if (/\b(not|never|isn't|isnt)\b/.test(s) && /\b(same.day|same day)\b/.test(s)) return true;
  }
  return null;
}

export const sc01EnginePolicy = Object.freeze({ commitmentBounds, goalCandidates, pressureCandidates, relayAccuracy });
