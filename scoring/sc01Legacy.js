// Read-only adapter for pre-foundation SC-01 v2 records; never replays a session.
import { sc01Rules } from "../services/api/sc01EnginePolicy.js";

export function legacyGoalProofs(session, scenario) {
  const identity = session.identity;
  if (session.engine_policy || session.model?.policy_rules || Object.values(session.goals || {}).some((g) => g.proof) || session.scenario_id !== "missed_deadline" || session.scenario_version !== 1 ||
      scenario.id !== "missed_deadline" || scenario.version !== 1 || scenario.scoring.version !== 2 ||
      (identity && (identity.scenarioId !== "missed_deadline" || identity.contentVersion !== 1 || identity.scoringVersion !== 2 ||
        identity.policyId !== "sc01-legacy" || identity.policyVersion !== 1))) throw new Error("unsupported legacy score record");
  const proofs = {};
  for (const goal of scenario.goals) {
    const state = session.goals[goal.id];
    if (state?.status !== "done") continue;
    const actor = sc01Rules.goalActors[goal.id];
    const date = goal.done_when.includes("date_mutually_agreed");
    const commitment = date ? session.commitments.find((c) => c.status === "active" && c.accepted_with === actor && c.recap_turn_id === state.turn_id) : null;
    if (date && !commitment) continue;
    const sources = goal.done_when.filter((x) => x.startsWith("event:")).map((x) => session.events_log.find((e) =>
      e.type === x.slice(6) && e.npc_id === actor && (date ? e.turn_id === state.turn_id : e.turn_id <= state.turn_id)));
    if (sources.some((e) => !e)) continue;
    proofs[goal.id] = { actor_id: actor, source_ids: sources.map((e) => e.source_id), requires_delivery: date,
      ...(date ? { commitment_id: commitment.id } : {}) };
  }
  return proofs;
}
