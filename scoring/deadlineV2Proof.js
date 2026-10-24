import {validateScenario} from "../engine/scenarioValidator.js";

const canonical = (value) => value && typeof value === "object"
  ? Array.isArray(value) ? `[${value.map(canonical)}]` : `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)}}` : JSON.stringify(value);
const same = (a, b) => canonical(a) === canonical(b);
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === expected.slice().sort().join();
const slotKeys = ["route", "primary", "followUp", "manual", "engineering", "qa"];
const slots = (p) => p && Object.fromEntries(slotKeys.map((key) => [key, p[key]]));
const slotSet = (v) => Array.isArray(v) ? v.map(slotSet).sort((a, b) => canonical(a).localeCompare(canonical(b))) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, slotSet(x)])) : v;
const sameSlots = (a, b) => same(slotSet(a), slotSet(b));
function validSlots(p, model) {
  const a = model.actors, full = p?.route === "full";
  return ["full", "phased"].includes(p?.route) && same(slots(p), {route: p.route,
    primary: {day: model.primaryDay, scope: full ? ["submission", "reliable_confirmation", "routing", "dashboard"] : ["submission", "reliable_confirmation"]},
    followUp: full ? null : {day: model.followUpDay, scope: ["routing", "dashboard"]},
    manual: full ? null : {owner: a.manual, instructionsOwner: a.instructions, instructionsDueDay: model.primaryDay},
    engineering: {actorId: a.engineering, reservation: full ? "pair_before_launch" : "followup_by_day6"},
    qa: {actorId: a.qa, fix: "await_save_ack", checks: ["save_success", "save_failure", "retry"]}});
}
export function supportedDeadlineV2(session, scenario, identity) {
  return scenario.id === "missed_deadline" && scenario.version === 2 && scenario.scoring.version === 3 && validateScenario(scenario).ok &&
    identity?.schemaVersion === 2 && identity.policyId === "deadline-v2" && identity.policyVersion === 1 && session.engine_policy?.proof_version === 2 &&
    same(session.model?.plan_model, scenario.plan_model) &&
    same(session.model?.commitment_model, {unassisted_min_day: 3, assisted_min_day: 3, agreement_npc: "maya"}) && session.model?.cutoff_day === 3 &&
    same(session.model?.policy_rules, {assistanceFact: null, assistanceActor: null, assistanceFlag: null, goalActors: {G1: "maya", G2: "jordan", G3: "maya"},
      pressureSchedules: {B2: {baseTurn: 4, assertiveTurn: 3, assertivenessCutoff: 70}, B3: {gapTurns: 3}}}) &&
    same(session.model?.facts, scenario.facts.map(({id, owner, triggers}) => ({id, owner, triggers}))) &&
    same(session.model?.goals, scenario.goals.map(({id, visible, required, done_when, requires}) => ({id, visible, required, done_when, requires})));
}

// Consume captured core evidence, never reclassify prose or replay a session.
// A malformed goal earns zero; an unsupported package is rejected by scorer.
export function deadlineV2Goal(record, goal, used) {
  try {
    const s = record.session, state = s.goals[goal.id], proof = state?.proof, a = s.model.plan_model.actors;
    const expectedKeys = goal.id === "G1" ? ["source_ids", "evidence"] : ["source_ids", "evidence", "commitment_id", "plan_id", "revision", ...(goal.id === "G3" ? ["prerequisite_evidence"] : [])];
    if (state?.status !== "done" || !Number.isInteger(state.turn_id) || !keys(proof, expectedKeys) || !Array.isArray(proof.source_ids) || !Array.isArray(proof.evidence) ||
        proof.source_ids.length !== proof.evidence.length || new Set(proof.source_ids).size !== proof.source_ids.length || proof.source_ids.some((id) => used.has(id))) return null;
    const capture = s.snapshots.find((snapshot) => snapshot.turn === state.turn_id && same(snapshot.goals?.[goal.id], state));
    if (!capture) return null;
    const source = (evidence, actor, types, revision, allocated = true) => {
      if (!keys(evidence, ["source_id", "turn_id", "actor_id", "delivered", ...(revision === undefined ? [] : ["revision"])]) ||
          evidence.actor_id !== actor || evidence.delivered !== true || !Object.hasOwn(s.npcs, actor) ||
          !Number.isInteger(evidence.turn_id) || evidence.turn_id < 1 || evidence.turn_id > state.turn_id ||
          (revision !== undefined && evidence.revision !== revision)) throw new Error("invalid evidence");
      const matches = s.events_log.filter((e) => e.source_id === evidence.source_id);
      const e = matches[0];
      if (matches.length !== 1 || !e || e.npc_id !== actor || e.turn_id !== evidence.turn_id || e.delivered !== true || !types.includes(e.type) ||
          (revision !== undefined && e.plan_revision !== revision) || (allocated && e.allocation !== "goals") ||
          record.scenario.facts.some((f) => f.triggers.includes(e.type))) throw new Error("invalid source");
      const snapshot = s.snapshots.find((snap) => snap.turn === e.turn_id && snap.events_log.some((row) => row.source_id === e.source_id && row.npc_id === e.npc_id &&
        row.turn_id === e.turn_id && row.type === e.type && row.delivered === true && row.plan_revision === e.plan_revision && same(row.params, e.params)));
      if (!snapshot) throw new Error("uncommitted source");
      return e;
    };
    if (goal.id === "G1") {
      if (proof.source_ids.length !== 2) return null;
      const sources = proof.evidence.map((e, i) => source(e, a.manager, [i === 0 ? "took_ownership" : "gave_honest_status"]));
      if (!sources.every((e, i) => e.source_id === proof.source_ids[i] && e.turn_id === state.turn_id)) return null;
      return {sources, prerequisites: []};
    }
    if (!Number.isInteger(proof.revision) || proof.revision < 1) return null;
    const commitments = s.commitments.filter((c) => c.id === proof.commitment_id);
    if (commitments.length !== 1) return null;
    const c = commitments[0], plans = [...(c.plan_history || []), ...(c.plan ? [c.plan] : [])].filter((p) => p.revision === proof.revision);
    if (plans.length !== 1) return null;
    const p = plans[0];
    if (p.generatedPlanId !== proof.plan_id || p.existingCommitmentId !== c.id || c.target_day !== s.model.plan_model.primaryDay || c.unrealistic ||
        !validSlots(p, s.model.plan_model) || p.delivered !== true || p.proposal_evidence?.delivered !== true) return null;
    const proposed = source(p.proposal_evidence, p.proposal_evidence.actor_id, ["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"], p.revision, false);
    if (!keys(proposed.params, ["plan"]) || !sameSlots(proposed.params.plan, slots(p))) return null;
    const technical = [a.engineering, a.qa].map((actor, i) => {
      const e = source(p.approvals[actor], actor, ["confirmed_next_steps"], p.revision, goal.id === "G2");
      if (!keys(e.params, ["plan_revision", "ack"]) || e.params.plan_revision !== p.revision || e.params.ack !== (i === 0 ? "engineering" : "qa")) throw new Error("invalid technical acknowledgement");
      if (e.turn_id <= proposed.turn_id) throw new Error("technical acknowledgement predates proposal");
      return e;
    });
    if (goal.id === "G2") {
      if (proof.source_ids.length !== 2 || !same(proof.evidence, [p.approvals[a.engineering], p.approvals[a.qa]]) ||
          !same(proof.source_ids, technical.map((e) => e.source_id))) return null;
      return {sources: technical, prerequisites: [], commitment: c};
    }
    if (goal.id !== "G3" || c.status !== "active" || p !== c.plan || c.accepted_with !== a.manager || c.recap_turn_id !== state.turn_id ||
        p.correction?.routing_was_unapproved !== true || p.correction.evidence.ackBy !== a.external || proof.source_ids.length !== 6 ||
        !same(proof.prerequisite_evidence, [p.approvals[a.engineering], p.approvals[a.qa]]) ||
        technical.some((e) => proof.source_ids.includes(e.source_id))) return null;
    const correction = {...p.correction.evidence}; delete correction.ackBy;
    const expected = [p.proposal_evidence, correction, p.approvals[a.external], p.approvals[a.manager], p.recaps[a.external], p.recaps[a.manager]];
    if (!same(proof.evidence, expected)) return null;
    const actors = [p.proposal_evidence.actor_id, a.external, a.external, a.manager, a.external, a.manager];
    const types = [["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"], ["confirmed_next_steps"], ["confirmed_next_steps"], ["confirmed_next_steps"], ["recapped_agreement"], ["recapped_agreement"]];
    const sources = proof.evidence.map((e, i) => source(e, actors[i], types[i], p.revision));
    if (!sources.every((e, i) => e.source_id === proof.source_ids[i])) return null;
    if (!sameSlots(sources[0].params.plan, slots(p)) || !keys(sources[0].params, ["plan"])) return null;
    if (sources.slice(1, 4).some((e, i) => !keys(e.params, ["plan_revision", "ack"]) || e.params.plan_revision !== p.revision || e.params.ack !== (i === 0 ? "correction" : "approval"))) return null;
    if (sources.slice(4).some((e) => !keys(e.params, ["plan_revision", "plan"]) || e.params.plan_revision !== p.revision || !sameSlots(e.params.plan, slots(p)))) return null;
    if (technical.some((e) => e.turn_id >= sources[2].turn_id || e.turn_id >= sources[3].turn_id) || sources[1].turn_id >= sources[2].turn_id || sources[1].turn_id >= sources[3].turn_id ||
        sources[4].turn_id <= Math.max(sources[2].turn_id, sources[3].turn_id) || sources[5].turn_id <= Math.max(sources[2].turn_id, sources[3].turn_id)) return null;
    return {sources, prerequisites: technical, commitment: c};
  } catch {return null;}
}
