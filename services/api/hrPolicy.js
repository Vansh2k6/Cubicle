// Scenario-local interpretation and pure policy; no deadline rules are inherited.
import {readFileSync} from "node:fs";
import {normalize} from "../../llm/languagePrimitives.js";
import {goalCandidates} from "./goalCandidates.js";
import authoredReplies from "../../replies/workplace_intimidation.en.json" with {type: "json"};

export const HR_OFFER = "I acknowledge your concern, without deciding the outcome. With your agreement, I will document your report, discuss interim support with you privately, and meet privately on the next working day to follow up. Shall we proceed on that basis?";
export const HR_ACCEPT = "I acknowledge your report and we have agreed the next step: I will document it, discuss interim support with you privately, and meet privately on the next working day to follow up. We will discuss any necessary sharing on a need-to-know basis; this does not mean the concern has been investigated or resolved.";
const classifierPrompt = readFileSync(new URL("../../llm/prompts/classifier/hr-v1.md", import.meta.url), "utf8");
const npcBoundary = readFileSync(new URL("../../llm/prompts/npc/hr-v1.md", import.meta.url), "utf8");
const ALLOWED = new Set(["gave_honest_status", "asked_for_help", "asked_background", "asked_advice", "confirmed_next_steps", "pushed_back_constructively", "greeted", "off_topic", "asked_reveal_all"]);
const injection = (text) => /\b(ignore|override)\b.{0,50}\b(instruction|rule|prompt)|reveal (all|everything)|mark.{0,25}(goal|complete)|system prompt/i.test(text);
const consent = (text) => /\b(yes|agree|agreed|proceed|go ahead|sounds good|works for me|please do|please record|lets do|let s do)\b/.test(normalize(text)) && !/\b(no|not|never|dont|don t|maybe|if)\b/.test(normalize(text)) && !String(text).includes("?");

export function hrOfflineEvents(text, context = {}) {
  if (injection(text)) return [{type: "asked_reveal_all", params: {quote: text}}];
  const t = normalize(text), events = [];
  const add = (type) => events.push({type, params: {quote: text}});
  if (/\b(dismiss|dismissed|dismisses|excluded|excluding|criticised|criticized|blamed|intimidat\w*|shut down|talks? over|left (me )?out|wasn t invited|not invited|missing context|scared|afraid|worried|unsafe)\b/.test(t) || /\b(meeting|discussion)\b.*\b(ignored|interrupt\w*|cut|concern)\b/.test(t)) add("gave_honest_status");
  if (/\b(help|support|options|safer|accompany|prepare|report|what (can|should) i do|what next|next step)\b/.test(t) && !/\b(no help|don t need help)\b/.test(t)) add("asked_for_help");
  if (context.actorId === "jordan" && /\b(see|saw|witness|observ\w*|notice\w*|there|happened|assum\w*)\b/.test(t)) add("asked_background");
  if (context.actorId === "sam" && /\b(accompany|come with|prepare|write|written|confront|straight to hr|directly to hr|support|options|advice)\b/.test(t)) add("asked_advice");
  if (context.actorId === "hr" && consent(text)) add("confirmed_next_steps");
  if (!events.length && /^(hi|hello|hey)\b/.test(t)) add("greeted");
  return events;
}

export const hrRules = Object.freeze({assistanceFact: null, assistanceActor: null, assistanceFlag: null,
  goalActors: {G1: "jordan", G2: "sam", G3: "hr"}, deliveredGoals: ["G1", "G2", "G3"], noWalkoutActors: ["hr", "sam"],
  pressureSchedules: {SUPPORT: {baseTurn: 4, assertiveTurn: 4, assertivenessCutoff: 100}}});
export const hrEngine = Object.freeze({
  commitmentBounds: ({rules}) => ({minDay: rules.commitment_model.unassisted_min_day, cutoffDay: rules.cutoff_day, assistance: {active: false, factDelivered: false, helpAccepted: false}}),
  goalCandidates(input) {return goalCandidates(input).filter((candidate) => candidate.actorId === input.npcId).map((candidate) => ({...candidate, requiresDelivery: true}));},
  pressureCandidates: ({state, npcId}) => npcId === "hr" && state.turn >= 4 && state.goals.G3?.status !== "done"
    ? [{beatId: "SUPPORT", actorId: "hr", act: "press_for_date", sourceIds: []}] : [],
  relayAccuracy: () => null,
});

export const hrLanguage = Object.freeze({
  classifierPrompt, npcBoundary,
  classificationContext({turns}) {return {processOffered: turns.some((row) => row.speaker === "npc" && row.text === HR_OFFER)};},
  publicCanonLines({actorPublicContext}) {return [actorPublicContext, "A report is an allegation to be heard, not a finding. HR is available without proof or manager confrontation."];},
  normalizeCommitment: () => ({day: null, clarification: null}),
  normalizeEvents({events, text, planContext}) {
    if (injection(text)) return {events: [{type: "asked_reveal_all", params: {}}], clarify: [], dropped: []};
    const seen = new Set(), valid = [];
    for (const event of events) {
      if (!ALLOWED.has(event.type) || seen.has(event.type)) continue;
      const quote = event.params?.quote;
      if (typeof quote !== "string" || quote.trim().length < 2 || !normalize(text).includes(normalize(quote))) continue;
      if (event.type === "confirmed_next_steps" && (planContext?.actorId !== "hr" || !planContext.processOffered || !consent(text))) continue;
      if (event.type === "asked_background" && planContext?.actorId !== "jordan" || event.type === "asked_advice" && planContext?.actorId !== "sam") continue;
      seen.add(event.type); valid.push({type: event.type, params: {quote}});
    }
    return {events: valid, clarify: [], dropped: []};
  },
  boundResponse({npcId, act, goalIds, events}) {
    if (act === "accept_plan" && goalIds.some((id) => hrRules.goalActors[id] === npcId) && npcId !== "hr") {
      return authoredReplies.entries.find((entry) => entry.npc === npcId && entry.act === act)?.variants[0]?.text || null;
    }
    if (npcId !== "hr" || !["greet", "react_freely", "accept_plan", "press_for_date"].includes(act)) return null;
    if (goalIds.includes("G3")) return HR_ACCEPT;
    return events.some((e) => ["gave_honest_status", "asked_for_help"].includes(e.type)) || act === "press_for_date" ? HR_OFFER : null;
  },
  canonCheck({text, act, npcId, permittedCanon, authorisedFact}) {
    if (text === HR_ACCEPT) return npcId === "hr" && act === "accept_plan" ? [] : [{code: "canon_unauthorised_agreement"}];
    if (text === HR_OFFER) return npcId === "hr" && ["greet", "react_freely", "accept_plan", "press_for_date"].includes(act) ? [] : [{code: "canon_unauthorised_process"}];
    if (text === authorisedFact?.content || permittedCanon?.facts?.some((fact) => fact.content === text)) return [];
    if (authoredReplies.entries.some((entry) => entry.npc === npcId && entry.act === act && !act.startsWith("reveal_fact:") && entry.variants.some((variant) => variant.text === text))) return [];
    // Fail closed on factual assertions: generated language may ask questions or
    // acknowledge feelings, but only exact authored spans establish process/facts.
    const sentences = String(text).match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
    const safeStatement = /^(?:(?:hi|hello|hey)(?: shubhankar)?|i (?:hear you|am listening|can listen|understand (?:your concern|that this is difficult))|thank you for (?:sharing|telling me|raising this)|that sounds (?:difficult|uncomfortable|stressful)|it (?:makes sense|is understandable) to (?:want|ask for|seek) (?:help|support|a clear support path)|you (?:can|may|are allowed to) (?:speak (?:with|to) hr|ask for (?:help|support))|we can (?:talk|keep going|take this at your pace)|let s keep going|can you say a bit more about what you need from me)$/;
    for (const sentence of sentences) {
      const t = normalize(sentence);
      if (!t) continue;
      if (safeStatement.test(t)) continue;
      // Neutral question forms cannot embed an invented event in their premise.
      if (sentence.trim().endsWith("?") && /^(?:what (?:happened|did you (?:see|observe|experience)|would (?:help|feel useful|make this more manageable)|support (?:would you like|do you want|would help)|would you like (?:to share|to happen next|help with)|do you (?:need|want) (?:from me|help with)|should i understand before proposing a next step)|how (?:are you feeling|has this affected (?:you|your work)|can i (?:help|support you)|would you like to proceed)|would you (?:like to (?:tell me more|share an example|discuss support|pause)|prefer to (?:pause|continue))|could you (?:tell me (?:more|what happened)|share (?:an example|what you observed)|say a little more)|can you (?:say a bit more about what you need from me|tell me more|describe what happened))$/.test(t)) continue;
      return [{code: "canon_unverified_support_claim"}];
    }
    return sentences.length ? [] : [{code: "canon_empty_support"}];
  },
});
