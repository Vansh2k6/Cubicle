// Shared event/dependency candidate projection; core validates every source and delivery.
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
