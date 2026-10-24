import { pressureCandidates } from "./sc01EnginePolicy.js";

export const deadlineV2Rules = Object.freeze({
  assistanceFact: null, assistanceActor: null, assistanceFlag: null,
  goalActors: {G1: "maya", G2: "jordan", G3: "maya"},
  pressureSchedules: {B2: {baseTurn: 4, assertiveTurn: 3, assertivenessCutoff: 70}, B3: {gapTurns: 3}},
});
const canonical = (value) => value && typeof value === "object"
  ? Array.isArray(value) ? value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
    : Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const keys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).sort().join() === [...expected].sort().join();
export function planSlots(route) {
  return {route, primary: {day: 3, scope: route === "full" ? ["submission", "reliable_confirmation", "routing", "dashboard"] : ["submission", "reliable_confirmation"]},
    followUp: route === "full" ? null : {day: 6, scope: ["routing", "dashboard"]},
    manual: route === "full" ? null : {owner: "client_operations", instructionsOwner: "alex", instructionsDueDay: 3},
    engineering: {actorId: "jordan", reservation: route === "full" ? "pair_before_launch" : "followup_by_day6"},
    qa: {actorId: "sam", fix: "await_save_ack", checks: ["save_success", "save_failure", "retry"]}};
}
const textForm = (text) => String(text).trim().toLowerCase().replace(/\s+/g, " ");
// Closed affirmative forms for the DS01 engine seam, not a general language
// classifier. Match the entire utterance so refusal/attribution cannot hide
// beside otherwise valid words. DS02 owns wider semantic interpretation.
const fullPlan = /^full (?:friday|day 3) submission, reliable confirmation, routing and dashboard\. (?:vansh|jordan) (?:will )?reserve a pair before launch\. (?:prathamesh|sam) (?:will )?await (?:the )?save (?:ack|acknowledgement); verify save success, save failure and retry\.?$/;
const phasedPlan = /^phased (?:friday|day 3) submission and reliable confirmation\. routing and dashboard (?:monday|day 6)\. client operations manually route; (?:i|alex) will provide instructions (?:friday|day 3)\. (?:vansh|jordan) (?:will )?reserve (?:monday|day 6)\. (?:prathamesh|sam) (?:will )?await (?:the )?save (?:ack|acknowledgement); verify save success, save failure and retry\.?$/;
function supportsPlan(text, plan, form = "proposal") {
  let t = textForm(text);
  if (!["full", "phased"].includes(plan?.route) || !same(plan, planSlots(plan.route))) return false;
  if (form === "approval") {
    const match = /^i (?:approve|accept)\. (.+)$/.exec(t);
    if (!match) return false;
    t = match[1];
  } else if (form === "recap") {
    const match = /^recap: (.+)$/.exec(t);
    if (!match) return false;
    t = match[1];
  }
  return (plan.route === "full" ? fullPlan : phasedPlan).test(t);
}

// Deliberately conservative DS01 semantic subset. DS02 supplies classifier and
// language adapters; a model never decides what is supported or approved.
export function planEvidence({text, actorId, events, activePlan}) {
  const result = {proposal: null, acknowledgements: [], recap: null};
  const t = textForm(text);
  for (const event of events) {
    const p = event.params;
    if (["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"].includes(event.type) && keys(p, ["plan"]) && supportsPlan(text, p.plan)) {
      if (result.proposal) return {proposal: null, acknowledgements: [], recap: null};
      result.proposal = {sourceId: event.sourceId, plan: p.plan};
    }
    if (!activePlan || !Number.isInteger(p?.plan_revision) || p.plan_revision !== activePlan.revision) continue;
    if (event.type === "recapped_agreement" && keys(p, ["plan_revision", "plan"]) && same(p.plan, activePlan.slots) && supportsPlan(text, p.plan, "recap")) result.recap = {sourceId: event.sourceId, revision: p.plan_revision, plan: p.plan};
    if (event.type !== "confirmed_next_steps" || !keys(p, ["plan_revision", "ack"])) continue;
    const route = activePlan.slots.route;
    const supported = p.ack === "engineering" ? actorId === "jordan" && (route === "full" ? /^i (?:will )?reserve a pair before launch\.?$/.test(t) : /^i (?:will )?reserve (?:monday|day 6)\.?$/.test(t))
      : p.ack === "qa" ? actorId === "sam" && /^i (?:will )?await (?:the )?save (?:ack|acknowledgement) and verify save success, save failure and retry\.?$/.test(t)
      : p.ack === "correction" ? actorId === "client" && /^routing was (?:unapproved|not (?:estimated or )?agreed|never agreed)\.?$/.test(t)
      : p.ack === "approval" ? ["client", "maya"].includes(actorId) && supportsPlan(text, activePlan.slots, "approval")
      : false;
    if (supported) result.acknowledgements.push({sourceId: event.sourceId, revision: p.plan_revision, ack: p.ack});
  }
  return result;
}
export const deadlineV2EnginePolicy = Object.freeze({
  commitmentBounds: ({rules}) => ({minDay: rules.commitment_model.unassisted_min_day, cutoffDay: rules.cutoff_day, assistance: {active: false, factDelivered: false, helpAccepted: false}}),
  goalCandidates: () => [], pressureCandidates, relayAccuracy: () => null, planEvidence,
});
