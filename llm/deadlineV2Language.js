import replies from "../replies/missed_deadline.v2.en.json" with {type: "json"};
import {extractDeadlineV2} from "../services/api/deadlineV2EnginePolicy.js";
import {normalize, hasAttribution, hasConfirmLanguage} from "./languagePrimitives.js";

export const PLAN_REPLIES = Object.freeze({
  ownership: "Thank you for taking responsibility and giving a clear status.",
  proposal: "I understand the plan you are proposing.",
  engineering: "I will reserve that capacity for this revision.",
  qa: "I will carry out those checks for this revision.",
  correction: "I acknowledge your correction to the earlier promise.",
  approval: "I accept this revision as proposed.",
  recap: "That recap matches the revision I accepted.",
  closing: "We have a plan.",
});
const WIRE = new Set(["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery", "committed_deadline", "confirmed_next_steps", "recapped_agreement", "relayed_fact"]);
const INQUIRIES = new Set(["asked_background", "asked_why_urgent", "asked_for_help", "asked_impact", "asked_expectation"]);
const neutralTexts = new Set(replies.entries.filter((e) => !e.act.startsWith("reveal_fact:")).flatMap((e) => e.variants.map((v) => normalize(v.text))));
const canonSpans = ({publicCanon = {}} = {}) => [
  "The onboarding portal handover is overdue since yesterday.",
  ...(typeof publicCanon.launch_label === "string" && Number.isInteger(publicCanon.launch_day) ? [`The public launch is ${publicCanon.launch_label} (day ${publicCanon.launch_day}).`] : []),
  "The package covers submission, reliable confirmation, automatic routing, and dashboard.",
];
const clauses = (text) => (String(text || "").match(/[^.!?]+[.!?]?/g) || []).map((s) => s.trim()).filter(Boolean);
const wording = (text) => String(text).toLowerCase().trim().replace(/[.!?]$/, "").replace(/\s+/g, " ");
// Ordinary improvisation is allowed. Material assertions still need supported
// canon or the selected plan move; leak scanning independently checks secrets.
const nonmaterial = (text) => !/\b(?:friday|monday|tuesday|wednesday|thursday|saturday|sunday|deadline|scope|routing|dashboard|submission|confirmation|receipt|storage|save|acknowledgement|acknowledgment|retry|pair|reserve|capacity|qa|checks|instructions|owner|reusable|module|complete|completed|finish|finished|build|built|deliver|delivered|ship|tested|implemented|consent|signoff|schedule|meeting|approve|approved|agree|agreed|accept|accepted|confirmed|guaranteed|promised)\b|\bday\s+\d+|\d+\s*(?:%|percent|hours?)|\b(?:that|this|your) plan works\b|\b(?:is|are|was|were|already)\s+(?:done|ready)\b|\b(?:everything|the (?:portal|work|project|system|implementation|feature|release))\s+(?:is|looks|seems|works|has)\s*(?:working|perfect|ready|successful)|\b(?:by|due|ready)\s+(?:today|tomorrow|next week)\b/i.test(text);
function publicClaim(text, publicCanon = {}) {
  const t = wording(text);
  if (/^the (?:onboarding )?(?:portal )?handover (?:is|remains) (?:late|overdue)(?: since yesterday)?$/.test(t)) return true;
  if (publicCanon.launch_day === 3 && /^the (?:public )?launch (?:is|stays|remains)(?: on| scheduled for)? friday(?: \(day 3\))?$/.test(t)) return true;
  const scope = /^the (?:package|public scope) (?:covers|includes) (.+)$/.exec(t);
  if (!scope) return false;
  const parts = scope[1].replace(/automatic routing/g, "routing").split(/,\s*| and /).map((s) => s.trim()).filter(Boolean);
  return parts.length === 4 && new Set(parts).size === 4 && parts.every((s) => ["submission", "reliable confirmation", "routing", "dashboard"].includes(s));
}
function ownFactClaim(text, facts) {
  const t = wording(text), have = new Set(facts.map((f) => f.id));
  if (have.has("F1") && /^(?:routing was (?:only a suggestion|a possible improvement) and (?:was )?(?:never agreed|not estimated or agreed)|the routing promise was (?:unapproved|never agreed with vansh))$/.test(t)) return true;
  if (have.has("F2") && /^(?:only (?:the )?submission and storage (?:piece is|are) reusable|(?:a )?full friday (?:plan )?(?:needs|requires) a reserved pair for (?:the )?fix and qa)$/.test(t)) return true;
  if (have.has("F3") && /^(?:the success message (?:can appear|may appear) before (?:the )?save (?:is acknowledged|acknowledgement|acknowledgment)|we (?:need to|must) (?:fix and verify|verify) save, failure and retry)$/.test(t)) return true;
  if (have.has("F4") && /^(?:i (?:asked for|requested) the dashboard because i (?:thought|assumed) submission and confirmation were (?:already )?(?:done|finished)|manual routing (?:would need|requires) instructions, a named owner and a monday follow-up)$/.test(t)) return true;
  return false;
}
function acknowledgementKind({act, stage}) {
  if (act === "close_positive") return stage.recap ? "closing" : null;
  return stage.ownership ? "ownership" : stage.proposal ? "proposal" : stage.acknowledgements.length === 1 ? stage.acknowledgements[0] : stage.recap ? "recap" : null;
}
const acknowledgementForms = {
  ownership: /^(?:thank you for taking responsibility and giving a clear status|thanks for owning the delay and explaining where things stand|i appreciate you taking responsibility and explaining the status)$/,
  proposal: /^(?:i understand the plan you are proposing|i (?:have heard|have noted|can consider) (?:your|the|this) (?:proposed )?(?:plan|revision)|i understand your proposal)$/,
  engineering: /^(?:i will (?:reserve|commit|set aside) (?:that|the requested|this) (?:capacity|pair|engineering capacity) for (?:this|the current) (?:plan|revision)|i agree to reserve the requested pair for this revision)$/,
  qa: /^(?:i will (?:carry out|run|perform|follow) (?:those|the requested|these) (?:checks|tests|qa checks) for (?:this|the current) (?:plan|revision)|i agree to the proposed fix and checks)$/,
  correction: /^(?:i (?:acknowledge|understand|accept) (?:your|the) correction(?: to (?:the|your) earlier promise)?|thank you for correcting the earlier promise)$/,
  approval: /^(?:i (?:accept|approve|agree to) (?:this|the current|your proposed) (?:revision|plan)(?: as proposed)?|(?:this|that) plan works for me)$/,
  recap: /^(?:(?:that|your|this) (?:recap|summary) matches (?:the|this) (?:revision|plan) i (?:accepted|approved)|that is a faithful recap of the revision i accepted)$/,
  closing: /^(?:we have a plan|we have agreed on this revision|this completes our agreement on the current plan)$/,
};
function planReplyMatches({text, act, stage}) {
  const kind = acknowledgementKind({act, stage}), parts = clauses(text);
  if (!kind || !acknowledgementForms[kind] || parts.length < 1 || parts.length > 3) return false;
  const matched = parts.filter((part) => acknowledgementForms[kind].test(wording(part)));
  return matched.length === 1 && parts.every((part) => acknowledgementForms[kind].test(wording(part)) || nonmaterial(part));
}
export const deadlineV2Language = Object.freeze({
  publicCanonLines(input) {return canonSpans(input).map((line) => "- " + line);},
  permittedReplySpans(input) {
    const facts = [...(input.facts || []), ...(input.authorisedFact ? [input.authorisedFact] : [])];
    const plan = input.planDelivery;
    const kind = plan?.stage && this.checkPlanReply({text: input.text, act: input.act, actorId: plan.actorId, turnId: plan.turnId, stage: plan.stage})
      ? acknowledgementKind({act: input.act, stage: plan.stage}) : null;
    return [...canonSpans(input), ...clauses(input.text).filter((part) => publicClaim(part, input.publicCanon) || ownFactClaim(part, facts) ||
      (kind && acknowledgementForms[kind].test(wording(part)))).filter((part) => part.length >= 20)];
  },
  normalizeCommitment({text, planContext}) {
    const parsed = extractDeadlineV2({text, actorId: planContext?.actorId, activePlan: planContext?.activePlan});
    return {day: parsed.day, clarification: parsed.clarification || (parsed.day === null ? "missing_day" : null)};
  },
  normalizeEvents({events, text, planContext}) {
    const parsed = extractDeadlineV2({text, actorId: planContext.actorId, activePlan: planContext.activePlan});
    const out = [], dropped = [];
    if (parsed.proposal && events.some((e) => WIRE.has(e.type))) {
      const type = events.find((e) => ["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"].includes(e.type))?.type || "proposed_plan";
      return {events: [{type: "committed_deadline", params: {day: 3}}, {type, params: {plan: structuredClone(parsed.proposal)}}], dropped, clarify: []};
    }
    // A role/topic-backed query is a source nomination, not a provider claim:
    // retain exactly one supported inquiry even if the classifier says empty
    // or mislabels it, without synthesizing a plan, approval, or relay.
    const inquiry = parsed.events.find((event) => INQUIRIES.has(event.type));
    if (inquiry) return {events: [structuredClone(inquiry)], dropped, clarify: []};
    for (const event of events) {
      if (!WIRE.has(event.type)) {
        if (!parsed.events.some((e) => WIRE.has(e.type))) out.push(event);
        continue;
      }
      const type = ["proposed_scope_cut", "proposed_phased_delivery"].includes(event.type) ? "proposed_plan" : event.type;
      const supported = parsed.events.find((e) => e.type === type);
      if (!supported) {dropped.push({type: event.type, reason: "unsupported_plan_claim"}); continue;}
      if (!out.some((e) => e.type === event.type)) out.push({type: event.type, params: structuredClone(supported.params)});
    }
    // A supported dated proposal has two distinct meanings in the existing
    // ledger: primary date commitment and material plan proposal.
    if (out.some((e) => ["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"].includes(e.type)) && !out.some((e) => e.type === "committed_deadline")) out.unshift({type: "committed_deadline", params: {day: 3}});
    return {events: out, dropped, clarify: parsed.clarification ? [{reason: "ambiguous_plan", detail: parsed.clarification}] : []};
  },
  planReply({act, actorId, turnId, stage}) {
    if (!stage || stage.npcId !== actorId || stage.turnId !== turnId || !["accept_plan", "close_positive"].includes(act)) return null;
    if (act === "close_positive") return stage.recap ? PLAN_REPLIES.closing : null;
    if (stage.ownership) return PLAN_REPLIES.ownership;
    if (stage.proposal) return PLAN_REPLIES.proposal;
    if (stage.acknowledgements.length === 1) return PLAN_REPLIES[stage.acknowledgements[0]] || null;
    return stage.recap ? PLAN_REPLIES.recap : null;
  },
  checkPlanReply({text, act, actorId, turnId, stage}) {
    return !!stage && stage.npcId === actorId && stage.turnId === turnId && ["accept_plan", "close_positive"].includes(act) && planReplyMatches({text, act, stage});
  },
  canonCheck({text, act, permittedCanon = {}, authorisedFact, planDelivery}) {
    if (planDelivery?.stage && this.checkPlanReply({text, act, actorId: planDelivery.actorId, turnId: planDelivery.turnId, stage: planDelivery.stage})) return [];
    const permitted = [authorisedFact?.content, ...(permittedCanon.facts || []).map((f) => f.content), ...canonSpans({publicCanon: permittedCanon.public})].filter(Boolean);
    let rest = normalize(text);
    for (const span of permitted) rest = rest.replace(normalize(span), " ").trim();
    if (!rest || neutralTexts.has(normalize(text)) || text === "Can you say a bit more about what you need from me?" || text === "Let's keep going.") return [];
    const knownFacts = [...(permittedCanon.facts || []), ...(authorisedFact ? [authorisedFact] : [])];
    if (clauses(text).length <= 3 && clauses(text).every((part) => nonmaterial(part) || publicClaim(part, permittedCanon.public) || ownFactClaim(part, knownFacts))) return [];
    if (hasAttribution(text) && !hasConfirmLanguage(text) && (permittedCanon.userSaid || []).some((said) => normalize(said).includes(rest.replace(/^you (?:said|proposed|mentioned) /, "")))) return [];
    // Unverified progress, feasibility, agreement and background claims cannot
    // be made true by echoing user words or public scope nouns.
    return [{code: "canon_unverified_claim"}];
  },
});
