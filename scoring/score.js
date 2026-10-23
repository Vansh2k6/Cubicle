import { CONFIG, normalizeScoringProfile } from "./config.js";
import { legacyGoalProofs } from "./sc01Legacy.js";
import { startMood, warmthGain, patienceDrop, GAIN_EVENTS, VAGUE_EVENTS } from "../engine/config.js";
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

export function createScoreRecord(session, convo, scenario, scoringProfile = session.engine_policy ? undefined : CONFIG[scenario.id]) {
  return structuredClone({ session, convo, scenario, scoringProfile, ...(session.identity ? { identity: session.identity } : {}) });
}

export function turnMap(convo, session) {
  const users = (convo?.turns || []).filter((t) => t.speaker === "user");
  const offset = Math.max(0, (session?.turn || users.length) - users.length);
  return users.map((t, i) => ({ engine_turn_id: t.engineTurn ?? offset + i + 1, user_turn_id: t.id, npc_id: t.npcId }));
}

// Pure server-side scoring. No provider, transcript persistence or client projection.
export function scoreSession(record, scenario = record.scenario) {
  const session = record.session;
  const legacy = !session.engine_policy;
  const legacyProofs = legacy ? legacyGoalProofs(session, scenario) : null;
  const canonical = (value) => value && typeof value === "object"
    ? (Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`)
    : JSON.stringify(value);
  const same = (a, b) => canonical(a) === canonical(b);
  const config = record.scoringProfile || (legacy ? CONFIG.missed_deadline : null);
  const profile = scenario.scoring.bands ? normalizeScoringProfile(scenario) : (legacy ? CONFIG.missed_deadline : null);
  const identity = record.identity;
  const identityMatches = identity && same(identity, session.identity) && identity.scenarioId === scenario.id &&
    identity.contentVersion === scenario.version && identity.scoringVersion === config?.scoring_version && identity.schemaVersion === 1 &&
    typeof identity.contentHash === "string" && /^[a-f0-9]{64}$/.test(identity.contentHash) &&
    identity.policyId === session.engine_policy?.id && identity.policyVersion === session.engine_policy?.version;
  if (!config || !profile || !same(config, profile) || session.scenario_id !== scenario.id || session.scenario_version !== scenario.version ||
      (legacy ? !same(config, CONFIG.missed_deadline) : (!record.scenario || !same(record.scenario, scenario) || !identityMatches || session.engine_policy.proof_version !== 1))) {
    throw new Error("Unsupported scenario scoring version or weights");
  }
  const mapping = turnMap(record.convo, session);
  const userId = (turn) => mapping.find((m) => m.engine_turn_id === turn)?.user_turn_id ?? null;
  const ledger = [], excluded = [], allocated = new Map(), seen = new Set();
  const events = [];
  for (const e of session.events_log || []) {
    if (!e.source_id || seen.has(e.source_id)) { excluded.push({ metric: "events", source_id: e.source_id || null, reason: "duplicate_or_missing_source" }); continue; }
    seen.add(e.source_id); events.push(e);
  }
  const evidence = (id, turn, extra = {}) => ({ source_id: id, turn_id: turn, user_turn_id: userId(turn), ...extra });
  const add = (metric, id, turn, points, extra = {}) => {
    const row = { metric, ...evidence(id, turn), points, loss: Math.max(0, -points), ...extra };
    ledger.push(row); return row;
  };
  const reserve = (e, metric) => { if (e) allocated.set(e.source_id, metric); };
  const metrics = {}, completedGoalTypes = new Map();
  const usedGoalSources = new Set(), validGoals = new Set();

  const goals = [], orderedGoals = [], visitedGoals = new Set(), visitingGoals = new Set();
  const visitGoal = (goal) => {
    if (!goal || visitedGoals.has(goal.id)) return;
    if (visitingGoals.has(goal.id)) throw new Error("cyclic goal dependencies");
    visitingGoals.add(goal.id);
    for (const id of goal.requires) visitGoal(scenario.goals.find((g) => g.id === id));
    visitingGoals.delete(goal.id); visitedGoals.add(goal.id); orderedGoals.push(goal);
  };
  scenario.goals.forEach(visitGoal);
  for (const goal of orderedGoals) {
    const state = session.goals[goal.id];
    const proof = legacy ? legacyProofs[goal.id] : state?.proof;
    const sources = (proof?.source_ids || []).map((id) => events.find((e) => e.source_id === id));
    const closingCommitment = proof?.requires_delivery ? (session.commitments || []).find((c) => c.id === proof.commitment_id &&
      c.status === "active" && !c.unrealistic && c.accepted_with === proof.actor_id && c.recap_turn_id === state?.turn_id) : null;
    const declaredTypes = goal.done_when.filter((x) => x.startsWith("event:")).map((x) => x.slice(6));
    const declaredActor = legacy ? proof?.actor_id : session.model?.policy_rules?.goalActors?.[goal.id];
    const proofMatches = proof?.actor_id === declaredActor && proof?.requires_delivery === goal.done_when.includes("date_mutually_agreed") &&
      declaredTypes.length === sources.length && declaredTypes.every((type) => sources.some((e) => e?.type === type)) &&
      goal.requires.every((id) => validGoals.has(id));
    const done = proofMatches && state?.status === "done" && !!proof && sources.length > 0 && new Set(proof.source_ids).size === sources.length &&
      sources.every((e) => e && e.npc_id === proof.actor_id && e.turn_id <= state.turn_id && !usedGoalSources.has(e.source_id) &&
        (legacy ? e.allocation !== "integrity" : e.allocation === "goals")) &&
      (!proof.requires_delivery || !!closingCommitment);
    const row = add("goals", `goal:${goal.id}`, state?.turn_id || session.turn, done ? goal.weight : 0,
      { loss: done ? 0 : goal.weight, status: done ? "awarded" : "missed", evidence: [] });
    if (done) {
      validGoals.add(goal.id);
      for (const e of sources) {
        usedGoalSources.add(e.source_id);
        completedGoalTypes.set(`${proof.actor_id}:${e.type}`, true);
        reserve(e, "goals"); row.evidence.push(evidence(e.source_id, e.turn_id));
      }
      if (closingCommitment) row.commitment_id = closingCommitment.id;
    }
    goals.push(row);
  }
  goals.sort((a, b) => scenario.goals.findIndex((g) => `goal:${g.id}` === a.source_id) - scenario.goals.findIndex((g) => `goal:${g.id}` === b.source_id));
  ledger.splice(0, goals.length, ...goals);
  metrics.goals = { points: Math.min(config.weights.goals, goals.reduce((n, r) => n + r.points, 0)), cap: config.weights.goals, evidence: goals };

  const facts = [];
  for (const fact of scenario.facts) {
    const deliveredSnapshot = (session.snapshots || []).find((s) => s.facts?.[fact.id]?.status === "revealed" && s.user_known?.includes(fact.id));
    const delivered = session.facts?.[fact.id]?.status === "revealed" && session.user_known?.includes(fact.id) && !!deliveredSnapshot;
    const turn = deliveredSnapshot?.turn || session.turn;
    const row = add("hidden_facts", `fact:${fact.id}`, turn, delivered ? fact.weight : 0,
      { loss: delivered ? 0 : fact.weight, status: delivered ? "awarded" : "missed", evidence: [] });
    if (delivered) for (const e of events.filter((e) => e.npc_id === fact.owner && e.turn_id <= turn && fact.triggers.includes(e.type))) {
      reserve(e, "hidden_facts"); row.evidence.push(evidence(e.source_id, e.turn_id));
    }
    facts.push(row);
  }
  metrics.hidden_facts = { points: Math.min(config.weights.hidden_facts, facts.reduce((n, r) => n + r.points, 0)), cap: config.weights.hidden_facts, evidence: facts };

  const integrity = [add("integrity", "integrity:baseline", 0, config.weights.integrity, { reason: "baseline" })];
  const commitmentIds = new Set(), uniqueCommitments = [], usedCommitmentEvents = new Set();
  const distinctCommitments = [...new Map((session.commitments || []).map((c) => [c.id, c])).values()];
  for (const c of session.commitments || []) {
    if (commitmentIds.has(c.id)) { excluded.push({ metric: "integrity", source_id: `commitment:${c.id}`, reason: "duplicate_commitment" }); continue; }
    commitmentIds.add(c.id);
    uniqueCommitments.push(c);
    const candidates = events.filter((e) => e.type === "committed_deadline" && e.turn_id === c.turn_id && e.npc_id === c.npc_id && !usedCommitmentEvents.has(e.source_id));
    // Current records persist provenance; legacy snapshots bind matching creation events once in ledger order.
    const e = c.source_id ? candidates.find((e) => e.source_id === c.source_id) : candidates.find((e) => {
      const raw = e.params.days ?? e.params.day ?? e.params.target_day;
      const day = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      return typeof day === "number" && Number.isInteger(day) && day === c.target_day;
    });
    if (e) usedCommitmentEvents.add(e.source_id);
    const historicalFault = e?.allocation === "integrity";
    if (historicalFault) {
      integrity.push(add("integrity", `commitment:${c.id}`, c.turn_id, -config.penalties.unrealistic_commitment, { reason: "unrealistic_commitment", event_source_id: e.source_id }));
      reserve(e, "integrity");
    }
    // A narrow standalone denial is evidence; revisions, explanations and quotes are not.
    const denial = (record.convo?.turns || []).find((t) => t.speaker === "user" && t.npcId === c.npc_id &&
      /^I never promised a delivery date[.!]?$/i.test(t.text.trim()) && mapping.find((m) => m.user_turn_id === t.id)?.engine_turn_id > c.turn_id &&
      distinctCommitments.filter((prior) => prior.npc_id === c.npc_id && prior.turn_id < mapping.find((m) => m.user_turn_id === t.id).engine_turn_id)
        .reduce((latest, prior) => !latest || prior.turn_id >= latest.turn_id ? prior : latest, null)?.id === c.id);
    if (denial) {
      const turn = mapping.find((m) => m.user_turn_id === denial.id).engine_turn_id;
      integrity.push(add("integrity", `commitment:${c.id}:denial:${turn}`, turn, -config.penalties.contradicted_commitment, { reason: "contradicted_commitment" }));
      for (const e of events.filter((e) => e.turn_id === turn && e.npc_id === c.npc_id)) reserve(e, "integrity");
    }
  }
  const relaySources = new Set();
  for (const e of events) {
    if (e.type === "overpromised" || e.type === "callback_commitment") { excluded.push({ metric: "integrity", source_id: e.source_id, reason: "commitment_alias_or_callback" }); continue; }
    if (e.type !== "relayed_fact" || e.validated !== true || e.params.accurate !== false || e.allocation !== "integrity") continue;
    const id = `relay:${e.turn_id}:${e.npc_id}:${e.params.fact_id}`;
    if (relaySources.has(id)) { excluded.push({ metric: "integrity", source_id: id, reason: "duplicate_relay" }); continue; }
    relaySources.add(id); reserve(e, "integrity");
    integrity.push(add("integrity", id, e.turn_id, -config.penalties.inaccurate_relay, { reason: "inaccurate_relay", event_source_id: e.source_id }));
  }
  const eventOrder = (row) => row.event_source_id ? events.findIndex((e) => e.source_id === row.event_source_id) : events.length;
  integrity.splice(1, integrity.length - 1, ...integrity.slice(1).sort((a, b) => a.turn_id - b.turn_id || eventOrder(a) - eventOrder(b) || a.source_id.localeCompare(b.source_id)));
  let remaining = config.weights.integrity;
  for (const row of integrity.slice(1)) {
    row.requested_points = row.points;
    row.points = -Math.min(remaining, -row.points);
    remaining += row.points;
    if (row.requested_points !== row.points) excluded.push({ metric: "integrity", source_id: row.source_id, reason: "integrity_floor", excluded_points: row.points - row.requested_points });
    row.loss = -row.points;
  }
  metrics.integrity = { points: remaining, cap: config.weights.integrity, evidence: integrity };

  const population = scenario.npcs.length;
  const relation = [];
  for (const npc of scenario.npcs) {
    const sliders = session.customisation[npc.id] || {};
    const start = session.npcs[npc.id]?.moodHistory?.[0] ?? startMood(sliders.warmth ?? 50);
    let mood = start;
    const eligible = [];
    for (const e of events.filter((e) => e.npc_id === npc.id)) {
      if (allocated.has(e.source_id) || e.allocation === "goals") { excluded.push({ metric: "relationship", source_id: e.source_id, reason: `allocated_to_${allocated.get(e.source_id) || "goals"}` }); continue; }
      if (completedGoalTypes.has(`${npc.id}:${e.type}`)) { excluded.push({ metric: "relationship", source_id: e.source_id, reason: "repeated_goal_achievement" }); continue; }
      let delta = GAIN_EVENTS.includes(e.type) ? warmthGain(sliders.warmth ?? 50) : VAGUE_EVENTS.includes(e.type) ? patienceDrop(sliders.patience ?? 50) : 0;
      if (!delta) continue;
      const before = mood;
      mood = clamp(mood + delta, 0, 100);
      eligible.push({ ...evidence(e.source_id, e.turn_id), delta: mood - before });
    }
    const points = start >= 100 ? 0 : config.weights.relationship * clamp((mood - start) / (100 - start), 0, 1) / population;
    relation.push(add("relationship", `relationship:${npc.id}`, eligible.at(-1)?.turn_id || 0, points, { start, final: mood, evidence: eligible }));
  }
  metrics.relationship = { points: relation.reduce((n, r) => n + r.points, 0), cap: config.weights.relationship, evidence: relation };
  metrics.rubric = { points: 0, cap: config.weights.rubric, status: "pending", evidence: [] };

  const flags = [];
  const flag = (type, source, turn, extra = {}) => flags.push({ type, ...evidence(source, turn), ...extra });
  for (const row of integrity) {
    const type = { unrealistic_commitment: "premature_commitment", contradicted_commitment: "broken_promise", inaccurate_relay: "inaccurate_relay" }[row.reason];
    if (type) flag(type, row.source_id, row.turn_id);
  }
  for (const e of events) if (e.type === "pushed_back_constructively") flag("constructive_pushback", e.source_id, e.turn_id);
  for (const c of uniqueCommitments) if (c.status === "active" && c.accepted_with && c.recap_turn_id) flag("great_recap", `commitment:${c.id}`, c.recap_turn_id);
  for (const fact of scenario.facts) {
    const visits = session.npcs[fact.owner]?.told_by_user || mapping.filter((m) => m.npc_id === fact.owner).map((m) => m.engine_turn_id);
    if (visits.length && !events.some((e) => e.npc_id === fact.owner && fact.triggers.includes(e.type))) flag("missed_probe", `fact:${fact.id}`, visits[0], { fact_id: fact.id, provisional: true });
  }
  const replies = (record.convo?.turns || []).filter((t) => t.speaker === "npc");
  for (let i = 0; i < replies.length - 1; i++) {
    const reply = replies[i], next = mapping[i + 1];
    if (reply.act === "redirect_to_npc" && next?.npc_id === reply.npcId) flag("ignored_npc_redirect", `redirect:${i + 1}`, next.engine_turn_id);
  }
  const priorities = ledger.filter((r) => r.loss > 0).sort((a, b) => b.loss - a.loss || a.turn_id - b.turn_id || a.source_id.localeCompare(b.source_id)).slice(0, 2).map((r) => ({ metric: r.metric, source_id: r.source_id, turn_id: r.turn_id, user_turn_id: r.user_turn_id, loss: r.loss }));
  const deterministic = ["goals", "hidden_facts", "integrity", "relationship"].reduce((n, k) => n + metrics[k].points, 0);
  return { scoring_version: config.scoring_version, weights: { ...config.weights }, penalties: { ...config.penalties }, relationship_population: config.relationship_population,
    metrics, deterministic, rubric: "pending", total: deterministic, ledger, excluded, flags, priorities, turn_map: mapping };
}

export const METRIC_REGISTRY = Object.freeze(Object.fromEntries(["goals", "hidden_facts", "integrity", "relationship", "rubric"].map((id) => [id, Object.freeze({
  id,
  weight(scenario) { return scenario.scoring.weights[id]; },
  evaluate(record, scenario) { return scoreSession(record, scenario).metrics[id]; },
})])));
