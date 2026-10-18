import { createScoreRecord, scoreSession } from "./score.js";
import { judgeSession } from "./judge.js";
import { coachSession } from "./coach.js";
import { validateQuote } from "./quotes.js";
import { CONFIG } from "./config.js";
import { difficultyFor } from "../shared/settings.js";
export const bandFor = (total, scenarioId = "missed_deadline") => CONFIG[scenarioId].bands.find((band) => total >= band.minimum)?.label || "Needs work";
const LABELS = { goals: "Goals", hidden_facts: "Hidden facts", integrity: "Integrity", relationship: "Relationship", rubric: "Communication quality" };
export async function assembleDebrief({ record, scenario = record.scenario, providers = {}, manifest, previous = null }) {
  if (!record.session.ended) throw Object.assign(new Error("End the session before requesting feedback"), { code: "NOT_ENDED" });
  const snapshot = createScoreRecord(record.session, record.convo, scenario);
  const deterministic = scoreSession(snapshot);
  const [judge, coach] = await Promise.all([
    (previous?.judged?.status === "available" ? Promise.resolve({ dimensions: previous.judged.dimensions, source: "llm", manifestId: previous.manifest_id }) :
      judgeSession({ record: snapshot, provider: providers.judge, manifest })).catch(() => ({ dimensions: [], source: "fallback", manifestId: manifest?.id || null })),
    (previous?.coach_status === "available" ? Promise.resolve({ moments: previous.moments }) :
      coachSession({ record: snapshot, provider: providers.coach, manifest })).catch(() => ({ moments: [{ general: true, turn_id: null, quote: null,
      what_went_well: "You can take this practice at your own pace.", what_happened: "Detailed coaching is unavailable.", why_it_matters: "A clear question helps you understand a next step.",
      better_reply: "What should I understand before proposing a next step?", source: "fallback", manifestId: manifest?.id || null }] })),
  ]);
  const turns = snapshot.convo?.turns || [];
  const withQuote = (entry) => {
    const turn = turns.find((t) => t.speaker === "user" && String(t.id) === String(entry.user_turn_id));
    const quote = turn && validateQuote(turns, turn.id, turn.text) ? turn.text : null;
    return { ...entry, user_turn_id: quote ? turn.id : null, quote };
  };
  const dimensions = judge.dimensions.map((d) => validateQuote(turns, d.turn_id, d.quote) ? d : { ...d, score: null, points: 0, quote: "", turn_id: null, status: "insufficient" });
  const judged = dimensions.reduce((n, d) => n + d.points, 0);
  const moments = coach.moments.map((m) => m.general ? m : validateQuote(turns, m.turn_id, m.quote) ? m :
    { general: true, turn_id: null, quote: null, what_went_well: "You can take this practice at your own pace.", what_happened: "The original line could not be verified.", why_it_matters: "Checking missing information helps clarify a next step.", better_reply: "What should I understand before proposing a next step?", source: "fallback", manifestId: m.manifestId });
  const judgeAvailable = judge.source === "llm";
  const coachAvailable = moments.every((m) => m.source === "llm");
  const total = deterministic.deterministic + judged;
  const positives = [];
  if (snapshot.session.goals.G1?.status === "done") positives.push("You took responsibility and shared an honest update.");
  if (deterministic.metrics.hidden_facts.points > 0) positives.push("Your questions uncovered more context.");
  if (!positives.length) positives.push("You made time to practice a difficult conversation.");
  const priorities = deterministic.priorities.map((entry) => {
    const goal = scenario.goals.find((g) => entry.source_id === `goal:${g.id}`);
    const fact = scenario.facts.find((f) => entry.source_id === `fact:${f.id}`);
    if (goal || fact) return { ...entry, kind: "not_observed", turn_id: null, user_turn_id: null, quote: null,
      label: goal ? goal.label : `Ask ${scenario.npcs.find((n) => n.id === fact.owner)?.name || fact.owner}: ${fact.unlock_question.en}`,
      description: goal ? "This goal was not completed by session end." : "This fact was not discovered by session end." };
    return { ...withQuote(entry), kind: "recorded_moment", label: "Review this commitment or relay", description: "This recorded moment reduced integrity points." };
  });
  return {
    session_id: snapshot.session.id, status: judgeAvailable && coachAvailable ? "ready" : "partial",
    total, total_cap: 100, total_status: judgeAvailable ? "assessed" : "provisional", band: bandFor(total, scenario.id), bands: structuredClone(CONFIG[scenario.id].bands),
    deterministic: { points: deterministic.deterministic, cap: 75 },
    judged: { points: judged, cap: 25, status: judgeAvailable ? "available" : "unavailable", dimensions },
    breakdown: Object.entries(deterministic.metrics).map(([id, metric]) => ({ id, label: LABELS[id], points: id === "rubric" ? judged : metric.points, cap: metric.cap, source: id === "rubric" ? "judged" : "deterministic" })),
    what_went_well: positives, timeline: deterministic.flags.map(withQuote), priorities,
    moments, coach_status: coachAvailable ? "available" : "unavailable",
    missed_facts: scenario.facts.filter((f) => !snapshot.session.user_known.includes(f.id) || snapshot.session.facts[f.id]?.status !== "revealed")
      .map((f) => ({ id: f.id, owner: f.owner, content: f.content.en, unlock_question: f.unlock_question.en })),
    weights: deterministic.weights, penalties: deterministic.penalties, scoring_version: deterministic.scoring_version,
    settings: structuredClone(snapshot.session.customisation), difficulty: difficultyFor(snapshot.session.customisation?.maya), end_reason: snapshot.session.endReason,
    manifest_id: judge.manifestId, manifest: manifest || null,
  };
}
