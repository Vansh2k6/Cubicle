import { FIXED_CAST, PHONE_BINDING } from "../../shared/presentation.js";
import { normalizeScoringProfile } from "../../scoring/config.js";
import { goalCandidates } from "./goalCandidates.js";
import { sc01EnginePolicy } from "./sc01EnginePolicy.js";
import { sc01Language } from "../../llm/sc01Language.js";
import { PROTOTYPE_CORPUS, PROTOTYPE_CORPUS_VERSION } from "./prototypeCorpus.js";
import { deadlineV2PackageInput } from "./deadlineV2Package.js";
import { createHash as nodeCreateHash } from "node:crypto";

const clone = (value) => structuredClone(value);
const digest = (value) => nodeCreateHash("sha256").update(JSON.stringify(value)).digest("hex");
const freeze = (value) => { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freeze); } return value; };
const clientActor = deadlineV2PackageInput().spec.npcs.find((actor) => actor.id === "client");
const genericEvents = (family, text) => {
  const t = String(text || "").toLowerCase(), events = [], add = (type, params = {}) => events.push({type, params});
  if (/\b(?:ignore.{0,30}instructions|reveal all|tell me everything)\b/.test(t)) return [{type: "asked_reveal_all", params: {}}];
  if (/\b(?:my fault|i own|i take responsibility|i missed|i should have|i will own)\b/.test(t)) add("took_ownership");
  if (/\b(?:honest status|to be honest|the status is|here is where|here's where|currently|what is done|what's done)\b/.test(t)) add("gave_honest_status");
  if (/\b(?:what|which|who|how|when|where|can|could|would|is there|do we)\b/.test(t) && /\b(?:requirement|scope|feature|transfer|process|step|handover|hand over|left|blocked|remaining|agreement|paperwork|checklist|work|task)\b/.test(t)) add("asked_requirement_details");
  if (/\b(?:impact|affect|displace|risk|what could go wrong|who is affected)\b/.test(t)) add("asked_impact");
  if (/\b(?:why|urgent|urgency|deadline|due|demo|window|time-sensitive|time sensitive)\b/.test(t)) add("asked_why_urgent");
  if (family === "hr" && /\btransfer window\b.{0,30}\b(?:close|end|deadline)\b/.test(t)) add("asked_deadline_flexibility");
  if (/\b(?:can you help|could you help|who can help|available to help|pair with|cover this|coverage)\b/.test(t)) add("asked_for_help");
  if (/\b(?:apolog|i'm sorry|i am sorry)\b/.test(t)) add("apologized");
  if (/\b(?:recap|to summarize|let me summarize|next step is)\b/.test(t)) add("recapped_agreement");
  if (/\b(?:reduce scope|cut scope|defer the feature|move .* to (?:a )?later|phase (?:it|this)|phased delivery|ship .* later)\b/.test(t)) add("proposed_scope_cut");
  if (/\b(?:propose|suggest|we can|let's|let us)\b.{0,60}\b(?:plan|next step|scope|handover|transfer|delivery|date)\b/.test(t)) add("proposed_plan");
  if (/\b(?:i agree|we agree|that works|sounds good|let's do that|let us do that|confirmed)\b/.test(t)) {
    const helpAccepted = /\b(?:accept|take you up on|take the offer|happy to).{0,45}\b(?:help|pair|cover)\b|\b(?:let's|let us) pair\b/.test(t);
    add("confirmed_next_steps", helpAccepted ? {help_accepted: true} : {});
  }
  if (/\b(?:expect|expectation|what do you need from me|what would you like me to do)\b/.test(t)) add("asked_expectation");
  if (/\b(?:background|what led to|how did this start|what is the context)\b/.test(t)) add("asked_background");
  if (/\b(?:push back|trade-off|tradeoff|protect the date|what should stop)\b/.test(t)) add("pushed_back_constructively");
  if (/\b(?:phase|phased|in stages|later cycle)\b/.test(t)) add("proposed_phased_delivery");
  if (/\b(?:concerned|worried|anxious|stressful|understand your concern)\b/.test(t)) add("acknowledged_concern");
  const date = /\b(friday|thursday|tomorrow|\d+\s*days?)\b/.exec(t);
  if (date && /\b(?:will|can|deliver|finish|complete|send|submit|ready|commit|by|on)\b/.test(t) && !/\b(?:recap|summarize)\b/.test(t)) {
    const day = date[1] === "friday" ? 3 : date[1] === "thursday" ? 2 : date[1] === "tomorrow" ? 1 : Number.parseInt(date[1], 10);
    if (Number.isInteger(day)) events.push({type: "committed_deadline", params: {day}});
  }
  if (!events.length && /^(?:hi|hello|hey)[!. ]*$/.test(t.trim())) add("greeted");
  return events;
};

function replyCorpus(spec) {
  const entries = [];
  const common = [
    ["greet", "Hi. What would you like to work through?"], ["deflect_sealed", "Let's take that one step at a time. What detail would help most?"],
    ["redirect_to_npc", "A teammate may have more context. You can ask them directly."], ["fallback_clarify", "Could you say a little more about what you need?"],
    ["press_for_date", "What date do you think is workable?"], ["close_positive", "That sounds like a clear next step."],
    ["accept_plan", "I can work with a specific next step. What should we confirm?"], ["walkout", "We can leave it here for now."],
  ];
  for (const actor of spec.npcs) for (const [act, text] of common) entries.push({id: `${actor.id}-${act}`, npc: actor.id, act, variants: [{id: "a", text}, {id: "b", text: `${text} What would you like to ask next?`}]});
  for (const fact of spec.facts) entries.push({id: `${fact.owner}-${fact.id}`, npc: fact.owner, act: `reveal_fact:${fact.id}`, variants: [{id: "a", text: fact.content.en}, {id: "b", text: `${fact.content.en} Is there another detail you need?`}]});
  return {entries};
}

function makePackage(base, family, {composed = null} = {}) {
  const source = PROTOTYPE_CORPUS[family];
  const input = {...base, spec: clone(base.spec), replies: clone(base.replies),
    scoringProfile: clone(base.scoringProfile), presentation: clone(base.presentation), policy: base.policy, aliases: []};
  const spec = clone(source.spec);
  input.spec = spec;
  spec.player = clone(base.spec.player);
  // These current legacy metadata fields are required by the generic scorer;
  // copy them unchanged while preserving the reviewed frame's version/weights.
  for (const field of ["bands", "penalties", "relationship_population"]) spec.scoring[field] = clone(base.spec.scoring[field]);
  // Main's existing engine gates G3 completion on that goal's requires list;
  // it does not implement the older frame's duplicate commitment field.
  delete spec.commitment_model.agreement_requires;
  const idSuffix = composed === "omitted_feature" ? "omitted_feature" : composed === "earlier_delivery" ? "earlier_delivery" : family;
  spec.id = `prototype_${idSuffix}`;
  spec.title = composed === "omitted_feature" ? "A client change with an omitted feature"
    : composed === "earlier_delivery" ? "A client asks for earlier delivery" : source.title;
  spec.briefing = {en: composed === "omitted_feature"
    ? "A client points out that a requested feature was left out after sign-off. Explain the omission, agree what fits the signed scope, and recap who owns the next step."
    : composed === "earlier_delivery"
      ? "A client asks to move delivery earlier. Clarify the need and impact, agree a realistic next step, and recap the owner."
      : source.briefing};
  const replaceNames = (text) => String(text || "").replace(/\bMaya\b/g, "Snehal").replace(/\bJordan\b/g, "Vansh").replace(/\bSam\b/g, "Prathamesh");
  const currentNpcs = new Map(base.spec.npcs.map((npc) => [npc.id, npc]));
  const frameNpcs = new Map(source.spec.npcs.map((npc) => [npc.id, npc]));
  spec.npcs = spec.npcs.map((npc) => {
    const current = currentNpcs.get(npc.id), authored = source.cast[npc.id];
    return {...npc, name: current?.name || npc.name, role: authored?.role || current?.role || npc.role,
      persona: replaceNames([authored?.persona,authored?.motivation].filter(Boolean).join(" ")), public_context: replaceNames(authored?.public_context || ""),
      topics: [...(frameNpcs.get(npc.id)?.topics || npc.topics)]};
  });
  spec.briefing.en = replaceNames(spec.briefing.en);
  spec.facts = source.facts.map((fact) => ({id: fact.id, owner: fact.owner, weight: fact.weight, triggers: [...fact.triggers],
    content: {en: replaceNames(fact.content)},
    leak_keywords: {en: fact.keywords.map(replaceNames)}, unlock_question: {en: replaceNames(fact.question)}}));
  spec.goals = source.goals.map((goal) => ({...goal, label: replaceNames(goal.label)}));
  if (family === "client") {
    if (!clientActor) throw new Error("client contact unavailable in base package");
    spec.npcs.push(clone(clientActor));
    input.presentation = {...FIXED_CAST, client: PHONE_BINDING};
  }
  if (composed === "omitted_feature") {
    spec.briefing.en = "A client points out that a requested feature was left out after sign-off. Explain the omission, agree what fits the signed scope, and recap who owns the next step.";
    spec.goals[0] = {...spec.goals[0], label: "Explain the omitted feature and its impact honestly", done_when: ["event:took_ownership", "event:gave_honest_status"]};
    spec.goals[1] = {...spec.goals[1], label: "Agree the omitted feature's scope with the client", done_when: ["event:proposed_scope_cut", "event:confirmed_next_steps"]};
    spec.goals[2] = {...spec.goals[2], label: "Recap the owner and next step", done_when: ["date_mutually_agreed", "event:recapped_agreement"]};
  } else if (composed === "earlier_delivery") {
    spec.briefing.en = "A client asks to move delivery earlier. Clarify the need and impact, agree a realistic next step, and recap the owner.";
  }
  const defaultActor = family === "hr" ? "sam" : family === "coworker" ? "jordan" : "maya";
  const agreementActor = spec.commitment_model.agreement_npc;
  const goalActors = Object.fromEntries(spec.goals.map((goal) => [goal.id,
    goal.done_when.includes("date_mutually_agreed") ? agreementActor : goal.required ? defaultActor : goal.id.endsWith("R2") ? "jordan" : goal.id.endsWith("R3") ? "sam" : defaultActor]));
  const assistFact = spec.commitment_model.assistance_requires.find((item) => item.endsWith("_delivered"))?.replace(/_delivered$/, "");
  const assistActor = spec.facts.find((fact) => fact.id === assistFact)?.owner || "jordan";
  const sourceFlag = spec.commitment_model.assistance_requires.find((item) => item.startsWith("help_accepted_with_"));
  const assistFlag = sourceFlag;
  const schedules = clone(base.policy.rules.pressureSchedules);
  const beatNpcs = new Map(spec.beats.map((beat) => [beat.id, beat.npc]));
  const rules = {assistanceFact: assistFact, assistanceActor: assistActor, assistanceFlag: assistFlag, goalActors,
    goals: spec.goals, beats: spec.beats, commitment_model: spec.commitment_model,
    cutoff_day: spec.canon.private[Object.keys(spec.canon.private)[0]].day,
    pressureSchedules: Object.fromEntries(Object.entries(schedules).map(([id, schedule]) => [id, {...schedule, npc: beatNpcs.get(id) || schedule.npc}]))};
  const engine = {commitmentBounds: sc01EnginePolicy.commitmentBounds, goalCandidates,
    pressureCandidates: sc01EnginePolicy.pressureCandidates, relayAccuracy: () => null};
  const policyId = `prototype-${idSuffix}`;
  input.prototype = true;
  input.privateProof = false;
  input.aliases = [];
  input.replies = replyCorpus(spec);
  input.scoringProfile = normalizeScoringProfile(spec);
  input.policy = {id: policyId, version: 1, engine, language: sc01Language, rules,
    offline: {classifyEvents(text) {return genericEvents(family, text);}}};
  input.prototypeSources = {corpusVersion: PROTOTYPE_CORPUS_VERSION, family, sourceFrame: source.source,
    sourceFrameSpecSha256: source.specSha256, sourceFrameFileSha256: source.frameFileSha256,
    sourceReferenceFileSha256: source.referenceFileSha256,
    components: ["situation.reference", "goals.reference", ...source.facts.map((fact) => `fact:${fact.id}.reference`)], composition: composed};
  return input;
}

export function createPrototypePackageInputs(base) {
  return ["manager", "hr", "client", "coworker"].map((family) => makePackage(base, family));
}

export function createPrototypeCompositions(base) {
  return [makePackage(base, "client", {composed: "omitted_feature"}), makePackage(base, "client", {composed: "earlier_delivery"})];
}

export function matchPrototypeComposition(text) {
  if (typeof text !== "string" || text.length > 400) return {ok: false, reason: "unsupported_requirements"};
  // These prototypes are fixed authored cases. A supported keyword cannot
  // silently authorize extra domains, cast, or expansion requirements.
  if (/\b(?:mars|space|planet|new cast|new character|add (?:a )?(?:npc|character|actor)|new onboarding|medical|legal case|fantasy|time travel|include (?:a )?new|also add|plus a new)\b/i.test(text)) return {ok: false, reason: "unsupported_requirements"};
  const omitted = /\b(?:missing|missed|omitted|left out|not included|was not included|wasn't included|skipped|forgot(?:ten)? to (?:implement|add|include)|failed to (?:implement|add|include))\b.{0,70}\b(?:feature|functionality|capability|option|requirement|product)\b|\b(?:feature|functionality|capability|option|requirement|product)\b.{0,70}\b(?:missing|omitted|left out|not included|skipped)\b/i.test(text);
  const earlier = /\b(?:client|customer|they|the buyer)\b.{0,80}\b(?:earlier|sooner|pull (?:the )?date forward|move (?:delivery|the date) (?:up|earlier)|advance delivery|expedite|(?:reduce|shorten|tighten)(?: the)? deadline)\b|\b(?:client|customer)\b.{0,80}\b(?:wants|asked|requests|requested|is trying to)\b.{0,50}\b(?:earlier|sooner)\b/i.test(text) && /\b(?:delivery|deliver|deadline|date|timeline|launch|handover)\b/i.test(text);
  if (omitted === earlier) return {ok: false, reason: omitted ? "ambiguous_request" : "unsupported_requirements"};
  return {ok: true, id: omitted ? "prototype_omitted_feature" : "prototype_earlier_delivery"};
}

export const prototypeDescription = Object.freeze([
  {id: "missed_deadline", label: "Missed a project deadline", baseline: true},
  {id: "prototype_manager", label: "Manager scope change"},
  {id: "prototype_hr", label: "Request an internal transfer"},
  {id: "prototype_client", label: "Client change after sign-off"},
  {id: "prototype_coworker", label: "Employee handover"},
]);
