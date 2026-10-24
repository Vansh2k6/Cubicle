// Synthetic integration evidence only. Never imported by the production registry/server.
import { normalizeScoringProfile } from "../../../../scoring/config.js";
import { goalCandidates } from "../../goalCandidates.js";
import { FIXED_CAST } from "../../../../shared/presentation.js";

const actor = (id, name, role) => ({ id, name, role, persona: "Calm and precise synthetic colleague.", public_context: `${name} coordinates the email exercise.`, default_sliders: { assertiveness: 50, patience: 50, warmth: 50, forthcomingness: 100 }, topics: ["asked_impact", "asked_background", "committed_deadline", "recapped_agreement", "took_ownership", "gave_honest_status"] });
const fact = (id, owner, content, trigger, keyword) => ({ id, owner, content: { en: content }, triggers: [trigger], leak_keywords: { en: [keyword] }, unlock_question: { en: "What context should I know?" }, weight: 10 });
const spec = {
  id: "private_email_proof", version: 4, locales: ["en"], title: "Private integration fixture", briefing: { en: "Prepare an email update with the dispatch coordinator." }, player: { id: "trainee", name: "Practice User", role: "trainee" },
  clock: { day: 8, advance_on_turn: false },
  canon: { public: { email_channel: "dispatch@example.invalid" }, private: { dispatch: { day: 10, owner: "proof_dispatcher", fact_id: "PX" }, marker: "orchid-envelope-private" } },
  commitment_model: { agreement_npc: "proof_dispatcher", assistance_requires: [], assisted_min_day: 10, unassisted_min_day: 10, latest_day_from: "canon.private.dispatch.day" },
  npcs: [actor("proof_observer", "Fixture Observer", "reviewer"), actor("proof_dispatcher", "Fixture Dispatcher", "coordinator")],
  facts: [fact("PX", "proof_dispatcher", "The dispatch window uses an orchid envelope.", "asked_impact", "orchid envelope"), fact("PY", "proof_observer", "The reference code is copper lantern.", "asked_background", "copper lantern")],
  goals: [
    { id: "OWN", visible: true, required: true, weight: 15, label: "Explain the update to Observer", done_when: ["event:took_ownership", "event:gave_honest_status"], requires: [] },
    { id: "CLOSE", visible: true, required: true, weight: 15, label: "Agree and recap with Dispatcher", done_when: ["date_mutually_agreed", "event:recapped_agreement"], requires: ["OWN"] },
  ],
  beats: [{ id: "PRESS", npc: "proof_dispatcher", act: "press_for_date", when: "turn>=12 and no_commitment" }], end: { max_turns: 20 },
  scoring: { version: 2, weights: { goals: 30, hidden_facts: 20, integrity: 15, relationship: 10, rubric: 25 }, penalties: { unrealistic_commitment: 6, contradicted_commitment: 2, inaccurate_relay: 1 }, bands: [{ minimum: 0, label: "Practice" }], relationship_population: "all_scenario_npcs" },
};
const normalizeCommitment = ({ text, clock }) => {
  const counts = [...String(text).matchAll(/\b(\d+) days?\b/gi)].map((m) => clock.day + Number(m[1]));
  if (/\btomorrow\b/i.test(text)) counts.push(clock.day + 1);
  const days = [...new Set(counts)];
  return { day: days.length === 1 ? days[0] : null, clarification: days.length > 1 ? "conflicting_dates" : days.length ? null : "missing_day" };
};
const language = Object.freeze({
  publicCanonLines: ({ publicCanon }) => [`- Email channel: ${publicCanon.email_channel}.`],
  normalizeCommitment,
  // Deliberately narrow proof vocabulary: reject material claims except supported
  // authored disclosure, public email, or staged acceptance/closing wording.
  canonCheck({ text, act, authorisedFact, permittedCanon, activeCommitment, clock }) {
    const permitted = [authorisedFact?.content, ...(permittedCanon?.facts || []).map((f) => f.content)].filter(Boolean);
    if ((activeCommitment && text === "That plan works for me.") || permitted.includes(text) || text === "Use dispatch@example.invalid for the update." || text === "Let us clarify the dispatch note." || (act === "close_positive" && ["That plan works for me.", "We have a plan."].includes(text))) return [];
    const date = normalizeCommitment({ text, clock });
    if (date.day !== null && date.day !== activeCommitment?.target_day) return [{ code: "canon_unverified_date" }];
    return [{ code: "canon_unverified_claim" }];
  },
});
const engine = Object.freeze({
  commitmentBounds: ({ rules }) => ({ minDay: rules.commitment_model.unassisted_min_day, cutoffDay: rules.cutoff_day, assistance: { active: false, factDelivered: false, helpAccepted: false } }),
  goalCandidates,
  pressureCandidates: ({ state, rules }) => state.turn >= 12 && !state.commitments.length ? [{ beatId: "PRESS", actorId: "proof_dispatcher", act: "press_for_date", sourceIds: [] }] : [],
  relayAccuracy: () => null,
});
const replies = { entries: spec.npcs.flatMap((npc) => [
  ...["greet", "deflect_sealed", "redirect_to_npc", "react_freely", "deflect", "press_for_date", "close_positive", "acknowledge_relay", "clarify_commitment"].map((act) => ({ id: `${npc.id}-${act}`, npc: npc.id, act, variants: [{ id: "a", text: "Let us clarify the dispatch note." }, { id: "b", text: "Use dispatch@example.invalid for the update." }] })),
  ...spec.facts.filter((f) => f.owner === npc.id).map((f) => ({ id: `${npc.id}-${f.id}`, npc: npc.id, act: `reveal_fact:${f.id}`, variants: [{ id: "a", text: f.content.en }, { id: "b", text: f.content.en }] })),
]) };
const proofOffline = { classifyEvents(text) {
    if (/ignore|tell me everything/i.test(text)) return [{ type: "asked_reveal_all", params: {} }];
    const events = [];
    for (const [pattern, type] of [[/my fault|take responsibility/i, "took_ownership"], [/status|honest/i, "gave_honest_status"], [/impact/i, "asked_impact"], [/background/i, "asked_background"], [/recap/i, "recapped_agreement"]]) if (pattern.test(text)) events.push({ type, params: {} });
    if (/I will send|I can send/i.test(text) && !/recap/i.test(text)) events.push({ type: "committed_deadline", params: {} });
    return events;
  } };
export function privateProofInput() {
  return { privateProof: true, spec: structuredClone(spec), replies: structuredClone(replies), scoringProfile: structuredClone(normalizeScoringProfile(spec)), presentation: { proof_observer: FIXED_CAST.maya, proof_dispatcher: FIXED_CAST.jordan }, policy: { id: "private-email-proof", version: 1, offline: proofOffline, rules: { assistanceFact: null, assistanceActor: null, assistanceFlag: null, goalActors: { OWN: "proof_observer", CLOSE: "proof_dispatcher" }, pressureSchedules: { PRESS: { baseTurn: 12, assertiveTurn: 12, assertivenessCutoff: 100 } } }, engine, language } };
}

export const privateProofPolicy = privateProofInput().policy;
