// engine/engine.js — P1 pure turn engine (ESM, ZERO imports).
// Pure function of (state, events, scenario-model). No network, no model
// calls, no clock reads, no randomness. Acts are ids only; local user-text
// evidence validates relays and supported plans. No generated NPC prose is produced or inspected.
//
// R-16 zero-import rule: this file takes no imports, so the numeric
// constants below MIRROR engine/config.js (authoritative source). Keep the
// two files in sync; the test suite cross-checks engine behaviour against
// config.js values.

// PROVISIONAL (P1) mirror of config.js VAGUE_EVENTS.
const VAGUE_EVENTS = ["avoided_question", "off_topic"];
const GAIN_EVENTS = ["apologized", "took_ownership", "acknowledged_concern"];

function clampNum(v, lo, hi) {
  const n = Number(v) || 0;
  return Math.min(hi, Math.max(lo, n));
}

function clampMood(m) {
  return Math.min(100, Math.max(0, Number(m) || 0));
}

// PROVISIONAL (P1) mirrors: patienceDrop {100:-3,50:-8,0:-15} linear;
// walkoutThreshold {0:25,100:5} linear; start 35+0.3*w; gain 4..10 linear;
// B3 extra drop 1..3 scaled by assertiveness.
function patienceDrop(p) {
  const c = clampNum(p, 0, 100);
  if (c <= 50) return -15 + (c / 50) * 7;
  return -8 + ((c - 50) / 50) * 5;
}

function walkoutThreshold(p) {
  return 25 - clampNum(p, 0, 100) * 0.2;
}

function startMood(w) {
  return 35 + 0.3 * clampNum(w, 0, 100);
}

function warmthGain(w) {
  return 4 + (clampNum(w, 0, 100) / 100) * 6;
}

function gateFor(forthcomingness, mood) {
  const f = Number(forthcomingness) || 0;
  const m = Number(mood) || 0;
  if (f >= 70) return { asks: 1, moodMin: 0 };
  if (f >= 30) return { asks: m >= 60 ? 1 : 2, moodMin: 0 };
  return { asks: 2, moodMin: 50 };
}

function b3ExtraDrop(assertiveness) {
  return 1 + (clampNum(assertiveness, 0, 100) / 100) * 2;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function resolvePath(obj, dotted) {
  let node = obj;
  for (const part of String(dotted).split(".")) {
    if (node !== null && typeof node === "object" && part in node) node = node[part];
    else return undefined;
  }
  return node;
}

function stableStringify(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return "[" + value.map(stableStringify).join(",") + "]";
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return (
      "{" +
      keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function slidersFor(session, npcId) {
  const c = session.customisation[npcId] || {};
  return {
    assertiveness: Number(c.assertiveness ?? 50),
    patience: Number(c.patience ?? 50),
    warmth: Number(c.warmth ?? 50),
    forthcomingness: Number(c.forthcomingness ?? 50),
  };
}

function freeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}

function needRuntime(runtime, session) {
  if (!runtime || runtime.scenarioId !== session.scenario_id || typeof runtime.policyId !== "string" ||
      !Number.isInteger(runtime.policyVersion) || !runtime.rules ||
      ["commitmentBounds", "goalCandidates", "pressureCandidates", "relayAccuracy"].some((name) => typeof runtime.engine?.[name] !== "function") ||
      (session.identity && (session.identity.scenarioId !== runtime.scenarioId || session.identity.policyId !== runtime.policyId || session.identity.policyVersion !== runtime.policyVersion)) ||
      (session.engine_policy && (session.engine_policy.id !== runtime.policyId || session.engine_policy.version !== runtime.policyVersion ||
        stableStringify(session.model.policy_rules) !== stableStringify(runtime.rules))) ||
      (session.engine_policy?.proof_version === 2 && stableStringify(session.identity) !== stableStringify(runtime.identity)) ||
      (session.engine_policy?.proof_version === 2 && (runtime.schemaVersion !== 2 || typeof runtime.engine.planEvidence !== "function"))) throw new Error("missing or mismatched engine runtime");
  return runtime;
}

const PLAN_KEYS = ["route", "primary", "followUp", "manual", "engineering", "qa"];
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join() === keys.slice().sort().join();
}
function planSlots(plan) {
  return Object.fromEntries(PLAN_KEYS.map((key) => [key, plan[key]]));
}
function normalizedPlan(session, input) {
  if (!exactKeys(input, PLAN_KEYS) || !["full", "phased"].includes(input.route)) throw new Error("invalid plan slots");
  const m = session.model.plan_model, a = m.actors, full = input.route === "full";
  const expected = {route: input.route,
    primary: {day: m.primaryDay, scope: full ? ["submission", "reliable_confirmation", "routing", "dashboard"] : ["submission", "reliable_confirmation"]},
    followUp: full ? null : {day: m.followUpDay, scope: ["routing", "dashboard"]},
    manual: full ? null : {owner: a.manual, instructionsOwner: a.instructions, instructionsDueDay: m.primaryDay},
    engineering: {actorId: a.engineering, reservation: full ? "pair_before_launch" : "followup_by_day6"},
    qa: {actorId: a.qa, fix: "await_save_ack", checks: ["save_success", "save_failure", "retry"]}};
  // Scope/check lists are sets; unknown fields and duplicate entries still fail.
  const sorted = (v) => Array.isArray(v) ? v.map(sorted).sort((x, y) => stableStringify(x).localeCompare(stableStringify(y)))
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sorted(x)])) : v;
  if (stableStringify(sorted(input)) !== stableStringify(sorted(expected))) throw new Error("invalid plan slots");
  return expected;
}
function currentPlanCommitment(session) {
  return session.commitments.filter((c) => c.status === "active" && !c.unrealistic).pop() || null;
}
function planSource(session, sourceId, actorId, types) {
  const [source] = sourceEvents(session, [sourceId], actorId);
  if (source.turn_id !== session.turn || !types.includes(source.type) || source.allocation !== "none") throw new Error("invalid plan source");
  return source;
}
function deliveredEvidence(session, sourceId, revision) {
  const source = session.events_log.find((e) => e.source_id === sourceId);
  if (!source || !Object.hasOwn(session.npcs, source.npc_id) || source.delivered !== true ||
      (revision !== undefined && source.plan_revision !== revision)) throw new Error("invalid delivered plan evidence");
  return {source_id: source.source_id, turn_id: source.turn_id, actor_id: source.npc_id,
    ...(revision === undefined ? {} : {revision}), delivered: true};
}
function planProof(session, sources, commitment, actors, types) {
  if (!sources.length || new Set(sources).size !== sources.length) throw new Error("duplicate plan evidence");
  const evidence = sources.map((id) => deliveredEvidence(session, id, commitment?.plan.revision));
  if (evidence.some((e, i) => e.actor_id !== actors[i] || !types[i].includes(session.events_log.find((row) => row.source_id === e.source_id).type))) throw new Error("invalid goal plan authority");
  if (evidence.some((e) => session.events_log.find((row) => row.source_id === e.source_id).allocation !== "none")) throw new Error("allocated plan evidence");
  for (const e of evidence) session.events_log.find((row) => row.source_id === e.source_id).allocation = "goals";
  return {source_ids: sources.slice(), evidence, ...(commitment ? {commitment_id: commitment.id,
    plan_id: commitment.plan.generatedPlanId, revision: commitment.plan.revision} : {})};
}
function planReady(session, plan) {
  const a = session.model.plan_model.actors;
  return plan?.delivered === true && plan.approvals[a.engineering] && plan.approvals[a.qa] &&
    plan.correction?.routing_was_unapproved === true && plan.approvals[a.external] && plan.approvals[a.manager];
}
function preparePlanEvidence(session, runtime, actorId, text) {
  const c = currentPlanCommitment(session), plan = c?.plan;
  const events = session.events_log.filter((e) => e.turn_id === session.turn && e.npc_id === actorId)
    .map(({type, params, source_id}) => ({type, params, sourceId: source_id}));
  const input = deepClone({text: String(text || ""), actorId, turnId: session.turn, events,
    activePlan: plan ? {id: plan.generatedPlanId, revision: plan.revision, slots: planSlots(plan), delivered: plan.delivered,
      approvals: plan.approvals, correction: plan.correction, recaps: plan.recaps} : null,
    publicCanon: session.model.public_canon, actorBindings: session.model.plan_model.actors});
  const result = runtime.engine.planEvidence(freeze(input));
  if (!exactKeys(result, ["proposal", "acknowledgements", "recap"]) || !Array.isArray(result.acknowledgements)) throw new Error("invalid plan evidence result");
  const out = deepClone(result), used = new Set();
  const use = (candidate, types) => {
    if (used.has(candidate.sourceId)) throw new Error("duplicate plan source");
    used.add(candidate.sourceId);
    return planSource(session, candidate.sourceId, actorId, types);
  };
  let proposal = null;
  if (out.proposal !== null) {
    if (!exactKeys(out.proposal, ["sourceId", "plan"])) throw new Error("invalid proposal evidence");
    const row = use(out.proposal, ["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"]);
    proposal = normalizedPlan(session, out.proposal.plan);
    if (!exactKeys(row.params, ["plan"]) || stableStringify(normalizedPlan(session, row.params.plan)) !== stableStringify(proposal)) throw new Error("mismatched proposal evidence");
    if (!c || c.target_day !== proposal.primary.day) {
      // Preserve the existing date fault; a scope proposal cannot erase it or
      // turn an unrealistic primary commitment into a valid agreement.
      if (!session.commitments.some((entry) => entry.status === "active" && entry.unrealistic)) throw new Error("missing plan commitment");
      proposal = null; out.proposal = null;
    }
  }
  for (const ack of out.acknowledgements) {
    if (!exactKeys(ack, ["sourceId", "revision", "ack"]) || !Number.isInteger(ack.revision)) throw new Error("invalid acknowledgement evidence");
    const row = use(ack, ["confirmed_next_steps"]), a = session.model.plan_model.actors;
    const actors = {engineering: [a.engineering], qa: [a.qa], correction: [a.external], approval: [a.external, a.manager]};
    if (!Object.hasOwn(actors, ack.ack) || !actors[ack.ack].includes(actorId) || !exactKeys(row.params, ["plan_revision", "ack"]) ||
        row.params.plan_revision !== ack.revision || row.params.ack !== ack.ack || !plan || ack.revision !== plan.revision) throw new Error("invalid acknowledgement authority");
  }
  if (new Set(out.acknowledgements.map((ack) => ack.ack)).size !== out.acknowledgements.length) throw new Error("duplicate acknowledgement kind");
  if (out.recap !== null) {
    if (!exactKeys(out.recap, ["sourceId", "revision", "plan"]) || !Number.isInteger(out.recap.revision)) throw new Error("invalid recap evidence");
    const row = use(out.recap, ["recapped_agreement"]), a = session.model.plan_model.actors;
    if (![a.external, a.manager].includes(actorId) || !plan || out.recap.revision !== plan.revision ||
        !exactKeys(row.params, ["plan_revision", "plan"]) || row.params.plan_revision !== out.recap.revision ||
        stableStringify(normalizedPlan(session, row.params.plan)) !== stableStringify(planSlots(plan)) ||
        stableStringify(normalizedPlan(session, out.recap.plan)) !== stableStringify(planSlots(plan))) throw new Error("invalid recap authority");
  }
  if (proposal) {
    const sourceId = out.proposal.sourceId;
    if (!plan || stableStringify(planSlots(plan)) !== stableStringify(proposal)) {
      if (plan) (c.plan_history ||= []).push(deepClone(plan));
      c.plan = {generatedPlanId: "P" + c.id, existingCommitmentId: c.id, revision: (plan?.revision || 0) + 1,
        ...proposal, delivered: false, proposal_sources: [sourceId],
        proposal_evidence: {source_id: sourceId, turn_id: session.turn, actor_id: actorId, revision: (plan?.revision || 0) + 1, delivered: false},
        correction: null, approvals: {}, recaps: {}};
      c.accepted_with = null; c.recap_turn_id = null;
      // G2 is a one-time achievement; its prior proof is immutable history.
      if (session.goals.G3.status === "done") throw new Error("revision after final agreement");
    } else if (!c.plan.proposal_sources.includes(sourceId)) c.plan.proposal_sources.push(sourceId);
  }
  const active = c?.plan, stage = {proposal: out.proposal?.sourceId || null, acknowledgements: [], recap: null, ownership: []};
  // A new material proposal cannot carry old-revision acknowledgements with it.
  if (active?.delivered && (!proposal || stableStringify(proposal) === stableStringify(planSlots(plan)))) {
    stage.acknowledgements = out.acknowledgements.filter((ack) => ack.revision === active.revision &&
      (["engineering", "qa", "correction"].includes(ack.ack) || !!(active.approvals[session.model.plan_model.actors.engineering] && active.approvals[session.model.plan_model.actors.qa] && active.correction)));
    if (out.recap && planReady(session, active)) stage.recap = out.recap;
  }
  if (actorId === session.model.plan_model.actors.manager && session.goals.G1.status !== "done") {
    const ownership = events.filter((e) => ["took_ownership", "gave_honest_status"].includes(e.type));
    if (ownership.filter((e) => e.type === "took_ownership").length === 1 && ownership.filter((e) => e.type === "gave_honest_status").length === 1) stage.ownership = ownership.map((e) => e.sourceId);
  }
  stage.commitmentId = c?.id || null; stage.revision = active?.revision || null;
  return stage;
}
function finalRecap(session, stage, actorId) {
  const p = currentPlanCommitment(session)?.plan, a = session.model.plan_model.actors;
  return !!(stage.recap && planReady(session, p) && session.goals.G1.status === "done" && session.goals.G2.status === "done" &&
    [a.external, a.manager].every((actor) => actor === actorId || p.recaps[actor]));
}
function deliverPlanEvidence(session, st, opts) {
  const stage = st.planEvidence, c = session.commitments.find((entry) => entry.id === stage.commitmentId && entry.status === "active"), p = c?.plan;
  if (!opts.delivered || !(st.closingAllowed ? opts.closingExpressed : opts.agreementExpressed) ||
      (stage.revision !== null && (!p || p.revision !== stage.revision))) return;
  const mark = (id) => {
    const row = planSource(session, id, st.npcId, ["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery", "confirmed_next_steps", "recapped_agreement", "took_ownership", "gave_honest_status"]);
    row.delivered = true; if (p) row.plan_revision = p.revision;
    return deliveredEvidence(session, id, p?.revision);
  };
  if (stage.ownership.length) {
    stage.ownership.forEach(mark);
    const ordered = ["took_ownership", "gave_honest_status"].map((type) => stage.ownership.find((id) => session.events_log.find((e) => e.source_id === id).type === type));
    session.goals.G1 = {status: "done", turn_id: session.turn, proof: planProof(session, ordered, null,
      [st.npcId, st.npcId], [["took_ownership"], ["gave_honest_status"]])};
  }
  if (!p) return;
  if (stage.proposal) { p.delivered = true; if (!p.proposal_evidence.delivered) p.proposal_evidence = mark(stage.proposal); }
  for (const ack of stage.acknowledgements) {
    const key = st.npcId;
    if (ack.ack === "correction") p.correction ||= {routing_was_unapproved: true, evidence: {ackBy: st.npcId, ...mark(ack.sourceId)}};
    else if (!p.approvals[key]) p.approvals[key] = mark(ack.sourceId);
  }
  if (stage.recap && !p.recaps[st.npcId]) p.recaps[st.npcId] = mark(stage.recap.sourceId);
  const a = session.model.plan_model.actors;
  if (session.goals.G2.status !== "done" && p.approvals[a.engineering] && p.approvals[a.qa]) {
    session.goals.G2 = {status: "done", turn_id: session.turn, proof: planProof(session, [p.approvals[a.engineering].source_id, p.approvals[a.qa].source_id], c,
      [a.engineering, a.qa], [["confirmed_next_steps"], ["confirmed_next_steps"]])};
  }
  if (st.closingAllowed && planReady(session, p) && p.recaps[a.external] && p.recaps[a.manager] && session.goals.G1.status === "done" && session.goals.G2.status === "done") {
    const sources = [p.proposal_evidence, p.correction.evidence, p.approvals[a.external], p.approvals[a.manager], p.recaps[a.external], p.recaps[a.manager]].map((e) => e.source_id);
    const proof = planProof(session, sources, c, [p.proposal_evidence.actor_id, a.external, a.external, a.manager, a.external, a.manager],
      [["proposed_plan", "proposed_scope_cut", "proposed_phased_delivery"], ["confirmed_next_steps"], ["confirmed_next_steps"], ["confirmed_next_steps"], ["recapped_agreement"], ["recapped_agreement"]]);
    proof.prerequisite_evidence = [p.approvals[a.engineering], p.approvals[a.qa]].map((e) => deliveredEvidence(session, e.source_id, p.revision));
    session.goals.G3 = {status: "done", turn_id: session.turn, proof};
    c.accepted_with = a.manager; c.recap_turn_id = session.turn;
  }
}

function policyResult(session, runtime, operation, extra = {}) {
  const state = deepClone({ turn: session.turn, clock: session.clock, facts: session.facts, flags: session.flags,
    user_known: session.user_known, customisation: session.customisation, goals: session.goals,
    commitments: session.commitments.map(({ what, original_words, ...c }) => c),
    events_log: session.events_log.map(({ type, source_id, npc_id, turn_id, allocation }) => ({ type, source_id, npc_id, turn_id, allocation })) });
  const rules = { ...session.model, ...session.model.policy_rules };
  const input = { state, rules: deepClone(rules), ...deepClone(extra) };
  if (input.events) input.events = input.events.map(({ type }) => ({ type }));
  const result = runtime.engine[operation](freeze(input));
  // Copy results immediately: policies cannot retain a mutable reference into core state.
  return result === undefined ? undefined : deepClone(result);
}

function boundsFor(session, runtime, npcId, events = []) {
  const b = policyResult(session, runtime, "commitmentBounds", { npcId, events });
  const a = b?.assistance, r = session.model.policy_rules, m = session.model.commitment_model;
  const factDelivered = session.facts[r.assistanceFact]?.status === "revealed" && session.user_known.includes(r.assistanceFact);
  const helpAccepted = session.flags.includes(r.assistanceFlag);
  if (!a || a.factDelivered !== factDelivered || a.helpAccepted !== helpAccepted || a.active !== (factDelivered && helpAccepted) ||
      !Number.isInteger(b.minDay) || b.minDay !== (a.active ? m.assisted_min_day : m.unassisted_min_day) || b.cutoffDay !== session.model.cutoff_day)
    throw new Error("invalid commitment bounds");
  return { min: b.minDay, cutoff: b.cutoffDay, assist: { on: a.active, f2delivered: a.factDelivered, helpAccepted: a.helpAccepted } };
}

function sourceEvents(session, ids, actorId) {
  if (!Array.isArray(ids) || new Set(ids).size !== ids.length || ids.some((id) => typeof id !== "string")) throw new Error("invalid policy source ids");
  return ids.map((id) => {
    const matches = session.events_log.filter((e) => e.source_id === id);
    if (matches.length !== 1 || matches[0].npc_id !== actorId || matches[0].turn_id > session.turn) throw new Error("invalid policy source ids");
    return matches[0];
  });
}

function captureGoals(session, runtime, npcId, events) {
  const candidates = policyResult(session, runtime, "goalCandidates", { npcId, turnId: session.turn, events });
  if (!Array.isArray(candidates)) throw new Error("invalid goal candidates");
  const used = new Set(Object.values(session.goals).flatMap((g) => g.proof?.source_ids || []));
  const triggerTypes = new Set(session.model.facts.flatMap((f) => f.triggers));
  for (const c of candidates) {
    const goal = session.model.goals.find((g) => g.id === c?.goalId);
    if (!goal || c.actorId !== session.model.policy_rules.goalActors[goal.id] || !session.npcs[c.actorId] || typeof c.requiresDelivery !== "boolean") throw new Error("invalid goal candidate");
    const sources = sourceEvents(session, c.sourceIds, c.actorId);
    if (session.goals[goal.id].status === "done") continue;
    if (goal.requires.some((id) => session.goals[id]?.status !== "done")) continue;
    const types = goal.done_when.filter((x) => x.startsWith("event:")).map((x) => x.slice(6));
    const dateRequired = goal.done_when.includes("date_mutually_agreed");
    if (!sources.length || sources.length !== types.length || types.some((type) => !sources.some((e) => e.type === type)) ||
        sources.some((e) => triggerTypes.has(e.type) || e.allocation !== "none" || used.has(e.source_id)) || c.requiresDelivery !== dateRequired)
      throw new Error("invalid goal evidence");
    const commitment = session.commitments.find((x) => x.id === c.commitmentId);
    if (dateRequired && (!commitment || commitment.status !== "active" || commitment.unrealistic || commitment.accepted_with !== c.actorId ||
        commitment.pending_recap_turn !== session.turn || sources.some((e) => e.turn_id !== session.turn))) throw new Error("invalid goal commitment");
    if (!dateRequired && c.commitmentId !== undefined) throw new Error("unexpected goal commitment");
    if (!evaluateDoneWhen(goal.done_when, { events_log: sources, npc: c.actorId, dateAgreed: dateRequired,
        facts: session.facts, user_known: session.user_known, goals: session.goals })) throw new Error("unsatisfied goal conditions");
    const proof = { actor_id: c.actorId, source_ids: c.sourceIds.slice(), requires_delivery: c.requiresDelivery,
      ...(dateRequired ? { commitment_id: commitment.id } : {}) };
    session.goals[goal.id] = { status: dateRequired ? "pending_delivery" : "done", turn_id: session.turn, proof };
    for (const e of sources) { e.allocation = "goals"; used.add(e.source_id); }
  }
}

function pressureFor(session, runtime, npcId, events) {
  const candidates = policyResult(session, runtime, "pressureCandidates", { npcId, turnId: session.turn, events });
  if (!Array.isArray(candidates)) throw new Error("invalid pressure candidates");
  for (const c of candidates) {
    const beat = session.model.beats.find((b) => b.id === c?.beatId);
    if (!beat || beat.npc !== c.actorId || beat.act !== c.act || !session.npcs[c.actorId] || !["callback_commitment", "press_for_date"].includes(c.act)) throw new Error("invalid pressure candidate");
    const sources = sourceEvents(session, c.sourceIds, c.actorId);
    const commitment = session.commitments.find((x) => x.id === c.commitmentId);
    const schedule = session.model.policy_rules.pressureSchedules?.[beat.id];
    if (c.act === "callback_commitment" && (!commitment || commitment.status !== "active" || commitment.npc_id !== c.actorId || commitment.callbackFired ||
        sources.length !== 1 || sources[0].source_id !== commitment.source_id)) throw new Error("invalid pressure commitment");
    if (c.act === "press_for_date" && (c.commitmentId !== undefined || sources.length !== 0)) throw new Error("invalid pressure source");
    if (c.act === "callback_commitment" && (!Number.isInteger(schedule?.gapTurns) || schedule.gapTurns < 1 || session.turn - commitment.turn_id < schedule.gapTurns))
      throw new Error("ineligible pressure callback");
    if (c.act === "press_for_date") {
      if (![schedule?.baseTurn, schedule?.assertiveTurn].every((turn) => Number.isInteger(turn) && turn >= 1) ||
          !Number.isFinite(schedule?.assertivenessCutoff) || schedule.assertivenessCutoff < 0 || schedule.assertivenessCutoff > 100)
        throw new Error("invalid pressure schedule");
      const threshold = slidersFor(session, c.actorId).assertiveness >= schedule.assertivenessCutoff ? schedule.assertiveTurn : schedule.baseTurn;
      if (session.turn < threshold || session.commitments.length !== 0) throw new Error("ineligible date pressure");
    }
  }
  return candidates;
}

function discardPendingGoals(session) {
  for (const [id, goal] of Object.entries(session.goals)) if (goal.status === "pending_delivery") {
    for (const e of session.events_log) if (goal.proof?.source_ids.includes(e.source_id) && e.allocation === "goals") e.allocation = "none";
    session.goals[id] = { status: "pending", turn_id: null };
  }
}

// Re-evaluate active commitments after an assistance change. Records one
// `commitment_reevaluated` log entry (allocation none) per commitment whose
// verdict flipped. Historical penalty entries are never repeated or erased.
function reevaluateCommitments(session, runtime) {
  const { min, cutoff, assist } = boundsFor(session, runtime);
  for (const c of session.commitments) {
    if (c.status !== "active") continue;
    const nowRealistic = c.target_day >= min && c.target_day <= cutoff;
    if (nowRealistic === !c.unrealistic) continue;
    c.unrealistic = !nowRealistic;
    c.model_inputs = {
      min_day: min,
      cutoff_day: cutoff,
      assisted: assist.on,
      f2_delivered: assist.f2delivered,
      help_accepted: assist.helpAccepted,
      target_day: c.target_day,
      unassisted_min: session.model.commitment_model.unassisted_min_day,
      assisted_min: session.model.commitment_model.assisted_min_day,
      reevaluated: true,
    };
    session.events_log.push({
      turn_id: session.turn,
      npc_id: c.npc_id,
      type: "commitment_reevaluated",
      params: { commitmentId: c.id, now_realistic: nowRealistic },
      source_id: "R" + session.turn + "-" + c.id,
      allocation: "none",
    });
  }
}

export function createSession(scenario, opts) {
  const o = opts || {};
  const runtime = needRuntime(o.runtime, { scenario_id: scenario.id });
  const planMode = runtime.schemaVersion === 2;
  if ((scenario.plan_model && !planMode) || (planMode && (runtime.policyId !== "deadline-v2" || runtime.policyVersion !== 1 || scenario.version !== 2 ||
      !scenario.plan_model || typeof runtime.engine.planEvidence !== "function" ||
      runtime.identity?.schemaVersion !== 2 || runtime.identity?.scoringVersion !== 3 ||
      stableStringify(scenario) !== stableStringify(runtime.spec)))) throw new Error("unsupported plan engine context");
  const seed = o.seed ?? 1;
  const locale = o.locale || (scenario.locales && scenario.locales[0]) || "en";
  const globalSliders = o.sliders || {};
  const perNpc = o.customisation || {};
  const cutoff = resolvePath(scenario, scenario.commitment_model.latest_day_from);
  if (typeof cutoff !== "number") {
    throw new Error("unresolvable commitment_model.latest_day_from");
  }
  const customisation = {};
  const npcs = {};
  for (const n of scenario.npcs) {
    const base = n.default_sliders || {};
    customisation[n.id] = {
      assertiveness: Number(
        (perNpc[n.id] && perNpc[n.id].assertiveness) ??
          globalSliders.assertiveness ??
          base.assertiveness ??
          50,
      ),
      patience: Number(
        (perNpc[n.id] && perNpc[n.id].patience) ??
          globalSliders.patience ??
          base.patience ??
          50,
      ),
      warmth: Number(
        (perNpc[n.id] && perNpc[n.id].warmth) ??
          globalSliders.warmth ??
          base.warmth ??
          50,
      ),
      forthcomingness: Number(
        (perNpc[n.id] && perNpc[n.id].forthcomingness) ??
          globalSliders.forthcomingness ??
          base.forthcomingness ??
          50,
      ),
    };
    const mood = startMood(customisation[n.id].warmth);
    npcs[n.id] = { mood, probes: {}, told_by_user: [], last_act: null, moodHistory: [mood] };
  }
  const facts = {};
  for (const f of scenario.facts) facts[f.id] = { status: "sealed" };
  const goals = {};
  for (const g of scenario.goals) goals[g.id] = { status: "pending", turn_id: null };
  const beats = {};
  for (const b of scenario.beats) beats[b.id] = { status: "pending", fired_turn: null };
  const npcTopics = {};
  for (const n of scenario.npcs) npcTopics[n.id] = (n.topics || []).slice();
  return {
    id: scenario.id + "#s" + seed,
    scenario_id: scenario.id,
    scenario_version: scenario.version,
    engine_policy: { id: runtime.policyId, version: runtime.policyVersion, proof_version: planMode ? 2 : 1 },
    ...(planMode ? {identity: deepClone(runtime.identity)} : {}),
    locale,
    seed,
    customisation,
    clock: { day: scenario.clock.day },
    turn: 0,
    npcs,
    facts,
    user_known: [],
    commitments: [],
    goals,
    beats,
    events_log: [],
    flags: [],
    snapshots: [],
    staged: null,
    clarification: null,
    deferredBeat: null,
    ended: false,
    endReason: null,
    model: {
      policy_rules: deepClone(runtime.rules),
      ...(planMode ? {plan_model: deepClone(scenario.plan_model), public_canon: deepClone(scenario.canon.public)} : {}),
      facts: scenario.facts.map((f) => ({
        id: f.id,
        owner: f.owner,
        triggers: (f.triggers || []).slice(),
      })),
      npcTopics,
      commitment_model: {
        unassisted_min_day: scenario.commitment_model.unassisted_min_day,
        assisted_min_day: scenario.commitment_model.assisted_min_day,
        agreement_npc: scenario.commitment_model.agreement_npc,
      },
      cutoff_day: cutoff,
      goals: scenario.goals.map((g) => ({
        id: g.id,
        visible: g.visible === true,
        required: g.required === true,
        done_when: (g.done_when || []).slice(),
        requires: (g.requires || []).slice(),
      })),
      beats: scenario.beats.map((b) => ({ id: b.id, npc: b.npc, act: b.act })),
      max_turns: (scenario.end && scenario.end.max_turns) || 20,
    },
  };
}

export function endSession(session) {
  if (!session.ended) { session.ended = true; session.endReason = "user_ended"; session.staged = null; }
  return session;
}

function applyDraft(session, npc_id, events, opts) {
  const o = opts || {};
  const runtime = needRuntime(o.runtime, session);
  if (session.ended) {
    return {
      state: session,
      act: (session.npcs[npc_id] && session.npcs[npc_id].last_act) || "react_freely",
      ended: true,
      endReason: session.endReason,
    };
  }
  if (!session.npcs[npc_id]) throw new Error("unknown npc: " + npc_id);
  const list = Array.isArray(events) ? events : [];
  session.turn += 1;
  const t = session.turn;
  const npc = session.npcs[npc_id];
  npc.told_by_user.push(t);
  const sl = slidersFor(session, npc_id);

  // 1. Mood update (slider-scaled). Vague set drops, gain set lifts.
  let delta = 0;
  for (const e of list) {
    const type = e && e.type;
    if (VAGUE_EVENTS.includes(type)) delta += patienceDrop(sl.patience);
    if (GAIN_EVENTS.includes(type)) delta += warmthGain(sl.warmth);
  }
  npc.mood = clampMood(npc.mood + delta);

  // 2. Probes. One turn counts at most one probe per fact for its OWNER npc.
  // `repeated_question` never adds an ask (it is not a fact trigger and is
  // excluded here even if a scenario listed it).
  const firedTypes = new Set(list.map((e) => e && e.type));
  const factById = new Map(session.model.facts.map((f) => [f.id, f]));
  const triggeredFacts = [];
  for (const f of session.model.facts) {
    if (f.owner !== npc_id) continue;
    const hit = (f.triggers || []).some((tr) => tr !== "repeated_question" && firedTypes.has(tr));
    if (!hit) continue;
    triggeredFacts.push(f.id);
    npc.probes[f.id] = (npc.probes[f.id] || 0) + 1;
    if (session.facts[f.id] && session.facts[f.id].status === "sealed") {
      session.facts[f.id].status = "probed";
    }
  }

  // 3. Per-event ledger handling.
  let newCommitmentId = null;
  let ambiguousTurn = false;
  let relayValidated = false;
  const ownerForth = sl.forthcomingness;
  void ownerForth;
  for (let i = 0; i < list.length; i++) {
    const e = list[i] || {};
    const type = e.type;
    const params = e.params && typeof e.params === "object" ? e.params : {};
    const sourceId = "T" + t + "-" + npc_id + "-" + type + "-" + i;
    // `overpromised` is engine-derived and never accepted as input.
    if (type === "overpromised") {
      session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
      if (!session.flags.includes("ignored_overpromised_input")) {
        session.flags.push("ignored_overpromised_input");
      }
      continue;
    }
    if (type === "relayed_fact") {
      const ref = params.fact_id ?? params.factId ?? params.id;
      if (!ref || !session.user_known.includes(ref)) {
        session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
        if (!session.flags.includes("unknown_relay_ignored")) {
          session.flags.push("unknown_relay_ignored");
        }
        continue;
      }
      const accuracy = policyResult(session, runtime, "relayAccuracy", { factId: ref, text: String(o.text || "") });
      if (accuracy !== null && typeof accuracy !== "boolean") throw new Error("invalid relay accuracy");
      if (accuracy === null || accuracy !== params.accurate) {
        session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none", validated: false });
        continue;
      }
      relayValidated = true;
      const duplicate = session.events_log.some((e) => e.turn_id === t && e.type === type && e.params.fact_id === ref && e.validated);
      const alloc = accuracy === false && !duplicate ? "integrity" : "none";
      session.events_log.push({ turn_id: t, npc_id, type, params: { fact_id: ref, accurate: accuracy }, source_id: sourceId, allocation: alloc, validated: true });
      continue;
    }
    if (type === "confirmed_next_steps") {
      if (
        params.help_accepted === true &&
        npc_id === session.model.policy_rules.assistanceActor &&
        session.facts[session.model.policy_rules.assistanceFact]?.status === "revealed" &&
        session.user_known.includes(session.model.policy_rules.assistanceFact)
      ) {
        session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
        if (!session.flags.includes(session.model.policy_rules.assistanceFlag)) {
          session.flags.push(session.model.policy_rules.assistanceFlag);
          reevaluateCommitments(session, runtime);
        }
      } else {
        session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
      }
      continue;
    }
    if (type === "committed_deadline") {
      const raw = params.days ?? params.day ?? params.target_day;
      const day = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
      if (typeof day !== "number" || !Number.isInteger(day)) {
        ambiguousTurn = true;
        session.clarification = {
          kind: "ambiguous_date",
          turn_id: t,
          npc_id,
          detail: "missing_or_noninteger_day",
        };
        session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
        continue;
      }
      const target = day + 0;
      const { min, cutoff, assist } = boundsFor(session, runtime, npc_id, list);
      const realistic = target >= min && target <= cutoff;
      if (session.model.plan_model && currentPlanCommitment(session)?.target_day === target) {
        session.events_log.push({turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none"});
        continue;
      }
      const id = "C" + (session.commitments.length + 1);
      const prior = session.commitments.filter((c) => c.status === "active").pop() || null;
      if (prior) prior.status = "superseded";
      const cm = {
        id,
        source_id: sourceId,
        what: params.what ?? "deadline",
        target_day: target,
        original_words: params.original_words ?? params.what ?? "",
        turn_id: t,
        npc_id,
        status: "active",
        model_inputs: {
          min_day: min,
          cutoff_day: cutoff,
          assisted: assist.on,
          f2_delivered: assist.f2delivered,
          help_accepted: assist.helpAccepted,
          target_day: target,
          unassisted_min: session.model.commitment_model.unassisted_min_day,
          assisted_min: session.model.commitment_model.assisted_min_day,
        },
        unrealistic: !realistic,
        accepted_with: null,
        pending_acceptance: !session.model.plan_model && realistic && npc_id === session.model.commitment_model.agreement_npc,
        recap_turn_id: null,
        supersedes: prior ? prior.id : null,
      };
      session.commitments.push(cm);
      newCommitmentId = id;
      // One integrity penalty source per commitment; no alias event.
      session.events_log.push({
        turn_id: t,
        npc_id,
        type,
        params,
        source_id: sourceId,
        allocation: realistic ? "none" : "integrity",
      });
      continue;
    }
    if (type === "recapped_agreement") {
      const active = session.commitments.filter(
        (c) => c.status === "active" && c.accepted_with,
      ).pop();
      if (!session.model.plan_model && active && npc_id === session.model.commitment_model.agreement_npc && session.model.goals.filter((g) => g.done_when.includes("date_mutually_agreed")).some((g) => g.requires.every((id) => session.goals[id]?.status === "done"))) {
        active.pending_recap_turn = t;
      }
      session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
      continue;
    }
    session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
  }

  // 4. Policies nominate; core verifies declared conditions and allocates proof.
  const planEvidence = session.model.plan_model ? preparePlanEvidence(session, runtime, npc_id, o.text) : null;
  if (!planEvidence) captureGoals(session, runtime, npc_id, list);

  // 5. Eligible reveals (trigger fired + forthcomingness gate passed).
  const eligible = [];
  for (const fid of triggeredFacts) {
    const st = session.facts[fid] ? session.facts[fid].status : null;
    // pending_delivery may re-stage for safe retry after a failed delivery.
    if (st !== "sealed" && st !== "probed" && st !== "pending_delivery") continue;
    const ownerSl = slidersFor(session, factById.get(fid).owner);
    const g = gateFor(ownerSl.forthcomingness, session.npcs[factById.get(fid).owner].mood);
    const probes = (session.npcs[factById.get(fid).owner].probes[fid] || 0);
    if (probes >= g.asks && session.npcs[factById.get(fid).owner].mood >= g.moodMin) {
      eligible.push(fid);
    }
  }
  eligible.sort();
  const gateFailedProbe = triggeredFacts.some((fid) => !eligible.includes(fid));

  // 6. Only declared, validated pressure participates in the fixed priority.
  const pressure = pressureFor(session, runtime, npc_id, list);
  const callback = pressure.find((c) => c.act === "callback_commitment");
  const b3npc = callback?.actorId;
  const b3fire = callback?.actorId === npc_id ? session.commitments.find((c) => c.id === callback.commitmentId) : null;
  if (callback && !b3fire) session.deferredBeat = { beatId: callback.beatId, commitmentId: callback.commitmentId, dueTurn: t };
  const datePressure = pressure.find((c) => c.act === "press_for_date" && c.actorId === npc_id);

  // 7. Act selection (first match wins).
  let act = "react_freely";
  if (!ambiguousTurn) {
    if (npc.mood <= walkoutThreshold(sl.patience)) {
      act = "walkout";
    } else if (b3fire) {
      act = "callback_commitment";
    } else if (eligible.length > 0) {
      act = "reveal_fact:" + eligible[0];
    } else if (gateFailedProbe) {
      act = "deflect_sealed";
    } else {
      // redirect_to_npc: topic belongs to another NPC's area.
      let redirect = false;
      for (const type of firedTypes) {
        const mine = (session.model.npcTopics[npc_id] || []).includes(type);
        if (mine) continue;
        for (const other of Object.keys(session.model.npcTopics)) {
          if (other !== npc_id && (session.model.npcTopics[other] || []).includes(type)) {
            redirect = true;
            break;
          }
        }
        if (redirect) break;
      }
      if (redirect) {
        act = "redirect_to_npc";
      } else {
        if (datePressure) {
          act = "press_for_date";
          const beat = session.beats[datePressure.beatId];
          beat.status = "fired";
          if (!beat.fired_turn) beat.fired_turn = t;
        } else {
          // Closing needs every visible required goal done; hidden goals
          // (visible:false) never gate ending or closing.
          const required = session.model.goals.filter((g) => g.required && g.visible);
          const allDone = required.length > 0 && required.every((g) => session.goals[g.id] && ["done", "pending_delivery"].includes(session.goals[g.id].status));
          if (planEvidence && finalRecap(session, planEvidence, npc_id)) {
            act = "close_positive";
          } else if (planEvidence && (planEvidence.proposal || planEvidence.acknowledgements.length || planEvidence.recap || planEvidence.ownership.length)) {
            act = "accept_plan";
          } else if (!planEvidence && allDone) {
            act = "close_positive";
          } else if (relayValidated) {
            act = "acknowledge_relay";
          } else {
            const priorForNpc = session.events_log.some(
              (e) => e.npc_id === npc_id && e.turn_id < t,
            );
            act = priorForNpc ? "react_freely" : "greet";
          }
        }
      }
    }
  }

  // 8. Apply act effects. A reveal stages ONLY when its act wins; suppressed
  // reveals leave facts sealed/probed with no staged trace.
  const agreementAllowed = session.commitments.some((c) => c.id === newCommitmentId && c.status === "active" && c.pending_acceptance === true) && ["react_freely", "greet"].includes(act);
  const closingAllowed = act === "close_positive" && Object.values(session.goals).some((g) => g.status === "pending_delivery");
  if (!closingAllowed) {
    for (const c of session.commitments) { if (c.pending_recap_turn === t) delete c.pending_recap_turn; }
    discardPendingGoals(session);
  }
  if (act.startsWith("reveal_fact:")) {
    const fid = act.slice("reveal_fact:".length);
    if (session.facts[fid]) session.facts[fid].status = "pending_delivery";
    session.staged = { factId: fid, agreementCommitmentId: null, npcId: npc_id, turnId: t };
  } else {
    session.staged =
      agreementAllowed
        ? { factId: null, agreementCommitmentId: newCommitmentId, agreementAllowed: true, npcId: npc_id, turnId: t }
        : session.commitments.some((c) => c.pending_recap_turn === t)
          ? { factId: null, agreementCommitmentId: null, closingAllowed: true, npcId: npc_id, turnId: t } : null;
  }
  if (planEvidence && ["accept_plan", "close_positive"].includes(act)) session.staged = {
    factId: null, npcId: npc_id, turnId: t, planEvidence, closingAllowed: act === "close_positive"};
  if (act === "callback_commitment" && b3fire) {
    b3fire.callbackFired = true;
    if (session.beats[callback.beatId]) {
      session.beats[callback.beatId].status = "fired";
      if (!session.beats[callback.beatId].fired_turn) session.beats[callback.beatId].fired_turn = t;
    }
    if (session.deferredBeat && session.deferredBeat.commitmentId === b3fire.id) {
      session.deferredBeat = null;
    }
    const ownerSl = slidersFor(session, b3npc);
    const owner = session.npcs[b3npc];
    if (owner) {
      owner.mood = clampMood(owner.mood - b3ExtraDrop(ownerSl.assertiveness));
      owner.moodHistory.push(owner.mood);
    }
  }

  npc.last_act = act;
  if (!(act === "callback_commitment" && session.npcs[b3npc] && b3npc !== npc_id)) {
    npc.moodHistory.push(npc.mood);
  }
  if (!ambiguousTurn && session.clarification) session.clarification = null;

  // 9. End conditions. Hidden goals (visible:false) never gate ending.
  if (act === "walkout") {
    session.ended = true;
    session.endReason = "walkout";
  } else if (o.endSession === true) {
    session.ended = true;
    session.endReason = "user_ended";
  } else {
    const required = session.model.goals.filter((g) => g.required && g.visible);
    if (required.length > 0 && required.every((g) => session.goals[g.id] && session.goals[g.id].status === "done")) {
      session.ended = true;
      session.endReason = "goals_complete";
    } else if (session.turn >= session.model.max_turns) {
      session.ended = true;
      session.endReason = "max_turns";
    }
  }

  // 10. Snapshot after every turn (state minus its own snapshots to stay flat).
  const rest = deepClone(session);
  delete rest.snapshots;
  session.snapshots.push(rest);

  return { state: session, act, ended: session.ended, endReason: session.endReason };
}

function deliverDraft(session, turn_id, opts) {
  const runtime = needRuntime(opts?.runtime, session);
  const delivered = !!(opts && opts.delivered);
  const st = session.staged;
  if (!st || st.turnId !== turn_id) return session;
  if (st.planEvidence) {
    deliverPlanEvidence(session, st, opts);
    session.staged = null;
    const required = session.model.goals.filter((g) => g.required && g.visible);
    if (required.length && required.every((g) => session.goals[g.id]?.status === "done")) {
      session.ended = true; session.endReason = "goals_complete";
    }
    const snapshot = deepClone(session); delete snapshot.snapshots;
    if (session.snapshots.length) session.snapshots[session.snapshots.length - 1] = snapshot;
    return session;
  }
  if (delivered) {
    for (const c of session.commitments) {
      if (c.status !== "active") continue;
      if (st.agreementAllowed && opts?.agreementExpressed && c.id === st.agreementCommitmentId && c.pending_acceptance) { c.accepted_with = st.npcId; c.pending_acceptance = false; }
      if (st.closingAllowed && opts?.closingExpressed && c.pending_recap_turn === turn_id) { c.recap_turn_id = turn_id; delete c.pending_recap_turn; }
    }
    if (st.closingAllowed && opts?.closingExpressed) for (const goal of Object.values(session.goals)) {
      if (goal.status !== "pending_delivery") continue;
      const commitment = session.commitments.find((c) => c.id === goal.proof?.commitment_id && c.status === "active" &&
        c.accepted_with === goal.proof.actor_id && !c.unrealistic && c.recap_turn_id === turn_id);
      if (commitment) goal.status = "done";
    }
    discardPendingGoals(session);
    const required = session.model.goals.filter((g) => g.required && g.visible);
    if (required.length && required.every((g) => session.goals[g.id]?.status === "done")) {
      session.ended = true; session.endReason = "goals_complete";
    }
    if (st.factId && session.facts[st.factId] && session.facts[st.factId].status === "pending_delivery") {
      session.facts[st.factId].status = "revealed";
      if (!session.user_known.includes(st.factId)) session.user_known.push(st.factId);
    }
    session.staged = null;
    reevaluateCommitments(session, runtime);
  } else {
    for (const c of session.commitments) { if (c.pending_recap_turn === turn_id) delete c.pending_recap_turn; }
    for (const c of session.commitments) { if (c.id === st.agreementCommitmentId) c.pending_acceptance = false; }
    discardPendingGoals(session);
    // Failed delivery: fact stays pending, earns nothing, staged cleared for retry.
    session.staged = null;
  }
  const snapshot = deepClone(session);
  delete snapshot.snapshots;
  if (session.snapshots.length) session.snapshots[session.snapshots.length - 1] = snapshot;
  return session;
}

function replaceState(target, source) {
  for (const key of Object.keys(target)) if (!(key in source)) delete target[key];
  for (const [key, value] of Object.entries(source)) {
    if (target[key] === value) continue;
    if (value && typeof value === "object" && target[key] && typeof target[key] === "object" && Array.isArray(value) === Array.isArray(target[key])) replaceState(target[key], value);
    else target[key] = value;
  }
  if (Array.isArray(target)) target.length = source.length;
}

// A policy exception or invalid result never leaves a partially applied session.
function transaction(session, operation) {
  const draft = deepClone(session);
  const result = operation(draft);
  replaceState(session, draft);
  return result?.state ? { ...result, state: session } : session;
}
export function applyTurn(session, npcId, events, opts) {
  return transaction(session, (draft) => applyDraft(draft, npcId, Array.isArray(events) ? deepClone(events) : events, opts));
}
export function commitDelivery(session, turnId, opts) {
  return transaction(session, (draft) => deliverDraft(draft, turnId, opts));
}

export function canonicalState(session) {
  return stableStringify(session);
}

export function evaluateDoneWhen(doneWhen, ctx) {
  const c = ctx || {};
  const entries = Array.isArray(doneWhen) ? doneWhen : [doneWhen];
  for (const raw of entries) {
    if (typeof raw !== "string") return false;
    const s = raw.trim();
    if (s === "date_mutually_agreed") {
      if (!(c.dateAgreed === true)) return false;
      continue;
    }
    let m = /^event:([A-Za-z_]+)$/.exec(s);
    if (m) {
      const log = c.events_log || [];
      const hit = c.npc
        ? log.some((e) => e.type === m[1] && e.npc_id === c.npc)
        : log.some((e) => e.type === m[1]);
      if (!hit) return false;
      continue;
    }
    m = /^npc:([A-Za-z_]+)$/.exec(s);
    if (m) {
      if (c.npc) {
        if (c.npc !== m[1]) return false;
      } else {
        const log = c.events_log || [];
        if (!log.some((e) => e.npc_id === m[1])) return false;
      }
      continue;
    }
    m = /^fact_revealed:([A-Za-z0-9_]+)$/.exec(s);
    if (m) {
      const facts = c.facts || {};
      const uk = c.user_known || [];
      if (!(facts[m[1]] === "revealed" || (facts[m[1]] && facts[m[1]].status === "revealed") || uk.includes(m[1]))) {
        return false;
      }
      continue;
    }
    m = /^goal_done:([A-Za-z0-9_]+)$/.exec(s);
    if (m) {
      const goals = c.goals || {};
      const g = goals[m[1]];
      if (!(g === "done" || (g && g.status === "done"))) return false;
      continue;
    }
    return false;
  }
  return true;
}
