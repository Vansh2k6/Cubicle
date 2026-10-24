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

function naturalForm(text) {
  const t = textForm(text).replace(/\bvansh singh\b/g, "vansh").replace(/\bprathamesh surwase\b/g, "prathamesh")
    .replace(/\btrustworthy receipt\b/g, "reliable confirmation")
    .replace(/\b(?:acknowledgment|acknowledgement)\b/g, "ack")
    .replace(/\bwait for (?:the )?save ack\b/g, "await save ack")
    .replace(/\b(?:test|check)\b/g, "verify").replace(/\b(?:the )?save success, (?:save )?failure and retry\b/g, "save success, save failure and retry");
  return t.replace(/\bverify ([^.;?]+)(?=[.;?]|$)/g, (whole, list) => {
    const checks = list.split(/,\s*| and /).map((item) => item.trim().replace(/^save /, ""));
    return checks.length === 3 && new Set(checks).size === 3 && checks.every((item) => ["success", "failure", "retry"].includes(item))
      ? "verify save success, save failure and retry" : whole;
  });
}
function readProposal(text) {
  for (const route of ["full", "phased"]) if (supportsPlan(text, planSlots(route))) return planSlots(route);
  const clauses = naturalForm(text).replace(/^[, ]*(?:i propose|i suggest|let's|let us|can we|we can)\s+/i, "")
    .replace(/[?]$/, "").split(/[.;]/).map((part) => part.trim()).filter(Boolean);
  const found = new Set();
  for (const clause of clauses) {
    let kind = null;
    const scope = /^(?:deliver|ship|finish|complete) (.+?)(?: (?:on|by))? friday$/.exec(clause)
      || /^(?:by|on) friday[:,]? (?:deliver|ship|finish|complete) (.+)$/.exec(clause);
    const scopeItems = scope?.[1].replace(/^the core: /, "").split(/,\s*| and /).map((item) => item.trim()).filter(Boolean);
    if (scopeItems && new Set(scopeItems).size === scopeItems.length && scopeItems.every((item) => ["submission", "reliable confirmation", "routing", "dashboard"].includes(item))) {
      kind = scopeItems.length === 4 ? "full" : scopeItems.length === 2 && scopeItems.includes("submission") && scopeItems.includes("reliable confirmation") ? "phased" : null;
    } else if (/^(?:deliver|ship|finish|complete) (?:submission, reliable confirmation, routing and dashboard (?:on |by )?friday|all four capabilities (?:on |by )?friday: submission, reliable confirmation, routing and dashboard)$/.test(clause)) kind = "full";
    else if (/^(?:deliver|ship|finish|complete) (?:the core: )?submission and reliable confirmation (?:on |by )?friday$/.test(clause)) kind = "phased";
    else if (/^(?:routing and dashboard|dashboard and routing) (?:will )?(?:follow|wait|ship|be delivered) (?:on |by )?monday$/.test(clause)) kind = "followUp";
    else if (/^(?:by|on) monday[:,]? (?:deliver|ship|follow up with) (?:routing and dashboard|dashboard and routing)$/.test(clause)) kind = "followUp";
    else if (/^client operations (?:will |can )?(?:manually route|handle manual routing)$/.test(clause)) kind = "manual";
    else if (/^(?:i|alex) will (?:provide|send|write) (?:the )?instructions (?:on |by )?friday$/.test(clause)) kind = "instructions";
    else if (/^(?:vansh|jordan) will reserve (?:a |the )?pair (?:before launch|for friday)$/.test(clause)) kind = "pair";
    else if (/^(?:vansh|jordan) will reserve (?:the follow-up |capacity )?for monday$/.test(clause)) kind = "monday";
    else if (/^(?:prathamesh|sam) will (?:fix confirmation (?:to |by )?)?await (?:the )?save ack(?: and verify save success, save failure and retry)?$/.test(clause)) {
      kind = "qa"; if (/ and verify /.test(clause)) found.add("checks");
    } else if (/^verify save success, save failure and retry$/.test(clause)) kind = "checks";
    if (!kind || found.has(kind)) return null;
    found.add(kind);
  }
  const matches = (expected) => found.size === expected.length && expected.every((key) => found.has(key));
  return matches(["full", "pair", "qa", "checks"]) ? planSlots("full")
    : matches(["phased", "followUp", "manual", "instructions", "monday", "qa", "checks"]) ? planSlots("phased") : null;
}

function readRelay(text) {
  const t = naturalForm(text).replace(/[.!]$/, "");
  if (/\b(?:maybe|perhaps|guess|if|might|uncertain)\b|\bnot sure\b|\?/.test(t)) return null;
  const claims = [
    ["F1", /^(?:snehal|maya)(?: mane)? (?:said|told me) (?:that )?routing was (?:not estimated or agreed|never agreed|unapproved)$/, /^(?:snehal|maya)(?: mane)? (?:said|told me) (?:that )?routing was (?:approved|estimated and agreed)$/],
    ["F2", /^(?:vansh|jordan) (?:said|told me) (?:that )?only submission and storage (?:are|is) reusable$/, /^(?:vansh|jordan) (?:said|told me) (?:that )?(?:the entire portal is already complete|nothing is reusable)$/],
    ["F3", /^(?:prathamesh|sam) (?:said|told me) (?:that )?the success message (?:can|may) appear before (?:the )?save (?:ack|is acknowledged)$/, /^(?:prathamesh|sam) (?:said|told me) (?:that )?success always means the save is complete$/],
    ["F4", /^rohan(?: mehta)? (?:said|told me) (?:that )?manual routing requires instructions, a named owner and a monday follow-up$/, /^rohan(?: mehta)? (?:said|told me) (?:that )?manual routing needs no instructions or owner$/],
  ];
  for (const [factId, accurate, inaccurate] of claims) {
    if (accurate.test(t)) return {factId, accurate: true};
    if (inaccurate.test(t)) return {factId, accurate: false};
  }
  return null;
}

// The sole v2 prose interpreter. Classifier, offline provider and core policy
// share these nominations; delivery and authority remain core decisions.
export function extractDeadlineV2({text, actorId, activePlan = null}) {
  const t = naturalForm(text), events = [];
  const add = (type, params = {}) => events.push({type, params});
  const recapPrefix = /^(?:recap:|to recap[:,]?|let me recap[:,]?|to summarize[:,]?|in summary[:,]?)\s*/;
  const isRecap = recapPrefix.test(t);
  const approvalRequest = /^(can you (?:accept|approve) (?:this|the current) (?:plan|revision)|please (?:accept|approve) (?:this|the current) (?:plan|revision)|does (?:this|the current) plan work for you|will (?:this|the current) plan work for you|are you happy to accept (?:this|the current) plan)[?.!:]\s+(.+)$/.exec(t);
  const approvalPlan = approvalRequest ? readProposal(approvalRequest[2]) : null;
  const proposal = isRecap ? null : approvalPlan && (!activePlan || !same(approvalPlan, activePlan.slots)) ? approvalPlan : readProposal(text);
  const recapPlan = isRecap ? readProposal(t.replace(recapPrefix, "")) : null;
  if (proposal) { add("committed_deadline", {day: 3}); add("proposed_plan", {plan: proposal}); }
  if (recapPlan && activePlan && same(recapPlan, activePlan.slots)) add("recapped_agreement", {plan_revision: activePlan.revision, plan: recapPlan});
  if (activePlan) {
    const clean = t.replace(/[.!?]$/, "");
    const engineering = activePlan.slots.route === "full"
      ? /^(?:i (?:will )?|(?:can you|could you|please) )reserve (?:a |the )?pair (?:before launch|for friday)$/
      : /^(?:i (?:will )?|(?:can you|could you|please) )reserve (?:the follow-up |capacity )?(?:for )?monday$/;
    const qa = /^(?:i (?:will )?|(?:can you|could you|please) )(?:fix confirmation (?:to |by )?)?await (?:the )?save ack and verify save success, save failure and retry$/;
    const correction = /^(?:routing was (?:unapproved|not (?:estimated or )?agreed|never agreed)|i (?:must |need to )?correct (?:my |the )?routing promise: (?:it was not agreed|routing was unapproved)|i promised routing without agreement|my routing promise was unapproved|routing was only a suggestion, not an agreed commitment)$/;
    const kind = actorId === "jordan" && engineering.test(clean) ? "engineering"
      : actorId === "sam" && qa.test(clean) ? "qa"
      : actorId === "client" && correction.test(clean) ? "correction"
      : ["client", "maya"].includes(actorId) && ((approvalPlan && same(approvalPlan, activePlan.slots)) || supportsPlan(text, activePlan.slots, "approval")) ? "approval" : null;
    if (kind) add("confirmed_next_steps", {plan_revision: activePlan.revision, ack: kind});
  }
  if (!events.length) {
    const relay = readRelay(text);
    if (relay) add("relayed_fact", {fact_id: relay.factId, accurate: relay.accurate});
    const inquiry = [
      [/^(?:what exactly did i promise on routing|what had actually been agreed about routing|what did we agree about routing|what is the background to routing|how did routing get included)[?]?$/, "asked_background"],
      [/^(?:why is this handover urgent|why the rush|why is friday important|why is the launch urgent|what makes this urgent)[?]?$/, "asked_why_urgent"],
      [/^(?:what can we reuse|what's left and can you help|what is left and can you help|what capacity do you have|can you reserve help for this plan|what help is available)[?]?$/, "asked_for_help"],
      [/^(?:what could go wrong|what could make release unsafe|what should qa verify|what must we fix and verify|what is the release risk)[?]?$/, "asked_impact"],
      [/^(?:what does the client need friday|what do you actually need friday|could operations manually route|what would client operations need|what are your expectations)[?]?$/, "asked_expectation"],
    ].find(([pattern]) => pattern.test(t));
    if (inquiry) add(inquiry[1]);
    else if (/^(?:i own the delay|this is on me|i take responsibility|i missed the handover|the delay is my fault)[.;, ]+(?:the (?:portal|handover) is (?:late|overdue)|the work is unfinished|we have not delivered)[.!]?$/.test(t)) {add("took_ownership"); add("gave_honest_status");}
    else if (/^(?:hi|hello|hey)[.!]?$/.test(t)) add("greeted");
    else if (/ignore.*instructions|tell me everything|reveal all/.test(t)) add("asked_reveal_all");
  }
  const dates = [...t.matchAll(/\b(friday|monday|tuesday|wednesday|thursday|saturday|sunday|tomorrow|day \d+)\b/g)].map((m) => m[0]);
  const day = proposal ? 3 : dates.length === 1 && dates[0] === "friday" ? 3 : null;
  return {events, proposal, recap: recapPlan, day, clarification: proposal || isRecap || !dates.length ? null : day === null ? "unsupported_or_conflicting_dates" : null};
}

// Deliberately conservative DS01 semantic subset. DS02 supplies classifier and
// language adapters; a model never decides what is supported or approved.
export function planEvidence({text, actorId, events, activePlan}) {
  const result = {proposal: null, acknowledgements: [], recap: null};
  const parsed = extractDeadlineV2({text, actorId, activePlan});
  for (const event of events) {
    const p = event.params;
    if (["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"].includes(event.type) && keys(p, ["plan"]) && parsed.proposal && same(p.plan, parsed.proposal)) {
      if (result.proposal) return {proposal: null, acknowledgements: [], recap: null};
      result.proposal = {sourceId: event.sourceId, plan: p.plan};
    }
    if (!activePlan || !Number.isInteger(p?.plan_revision) || p.plan_revision !== activePlan.revision) continue;
    if (event.type === "recapped_agreement" && keys(p, ["plan_revision", "plan"]) && parsed.events.some((e) => e.type === "recapped_agreement" && same(e.params, p))) result.recap = {sourceId: event.sourceId, revision: p.plan_revision, plan: p.plan};
    if (event.type !== "confirmed_next_steps" || !keys(p, ["plan_revision", "ack"])) continue;
    const supported = parsed.events.some((e) => e.type === "confirmed_next_steps" && same(e.params, p));
    if (supported) result.acknowledgements.push({sourceId: event.sourceId, revision: p.plan_revision, ack: p.ack});
  }
  return result;
}
export const deadlineV2EnginePolicy = Object.freeze({
  commitmentBounds: ({rules}) => ({minDay: rules.commitment_model.unassisted_min_day, cutoffDay: rules.cutoff_day, assistance: {active: false, factDelivered: false, helpAccepted: false}}),
  goalCandidates: () => [], pressureCandidates,
  relayAccuracy: ({factId, text}) => {const relay = readRelay(text); return relay?.factId === factId ? relay.accurate : null;},
  planEvidence,
});
