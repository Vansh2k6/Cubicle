// engine/engine.js — P1 pure turn engine (ESM, ZERO imports).
// Pure function of (state, events, scenario-model). No network, no model
// calls, no clock reads, no randomness. Acts are ids only; local user-text
// evidence validates relays. No generated NPC prose is produced or inspected.
//
// R-16 zero-import rule: this file takes no imports, so the numeric
// constants below MIRROR engine/config.js (authoritative source). Keep the
// two files in sync; the test suite cross-checks engine behaviour against
// config.js values.

const B2_BASE_TURN = 4;
const B2_ASSERTIVE_TURN = 3;
const ASSERTIVENESS_B2_CUTOFF = 70;
const B3_GAP_TURNS = 3;
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

function b2TurnFor(assertiveness) {
  return (Number(assertiveness) || 0) >= ASSERTIVENESS_B2_CUTOFF
    ? B2_ASSERTIVE_TURN
    : B2_BASE_TURN;
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

function assistanceActive(session) {
  const f2 = session.facts.F2 ? session.facts.F2.status === "revealed" : false;
  return {
    on: f2 && session.flags.includes("help_accepted_with_jordan"),
    f2delivered: f2,
    helpAccepted: session.flags.includes("help_accepted_with_jordan"),
  };
}

function boundsFor(session) {
  const m = session.model.commitment_model;
  const assist = assistanceActive(session);
  const min = assist.on ? m.assisted_min_day : m.unassisted_min_day;
  return { min, cutoff: session.model.cutoff_day, assist };
}

// Re-evaluate active commitments after an assistance change. Records one
// `commitment_reevaluated` log entry (allocation none) per commitment whose
// verdict flipped. Historical penalty entries are never repeated or erased.
function reevaluateCommitments(session) {
  const { min, cutoff } = boundsFor(session);
  for (const c of session.commitments) {
    if (c.status !== "active") continue;
    const nowRealistic = c.target_day >= min && c.target_day <= cutoff;
    if (nowRealistic === !c.unrealistic) continue;
    c.unrealistic = !nowRealistic;
    c.model_inputs = {
      min_day: min,
      cutoff_day: cutoff,
      assisted: assistanceActive(session).on,
      f2_delivered: assistanceActive(session).f2delivered,
      help_accepted: assistanceActive(session).helpAccepted,
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

function dueB3Commitments(session) {
  const owner = session.model.beats.find((b) => b.id === "B3")?.npc || "maya";
  return session.commitments.filter(
    (c) => c.status === "active" && c.npc_id === owner && !c.callbackFired && session.turn - c.turn_id >= B3_GAP_TURNS,
  );
}

// shortcut: conservative SC-01 relay evidence; add reviewed patterns with new scenarios.
export function relayAccuracy(factId, text) {
  const s = String(text || "").toLowerCase();
  if (/\b(not|never|no|isn't|isnt|didn't|didnt|wasn't|wasnt)\b/.test(s)) return null;
  if (/\?|\b(if|maybe|perhaps|might|guess|not sure)\b/.test(s)) return null;
  if (factId === "F1" && /\b(client|cutoff|deadline)\b/.test(s)) {
    if (/\b(friday|3 days|three days)\b/.test(s) && !/\b(not|no|isn't|isnt)\b/.test(s)) return true;
    if (/\b(tomorrow|thursday|1 day|one day|2 days|two days)\b/.test(s)) return false;
  }
  if (factId === "F2" && /\bjordan\b/.test(s) && /\b(module|remaining work)\b/.test(s)) {
    if (/\b(half|50 percent)\b/.test(s) && /\b(all the remaining work|entire remaining work|nothing built|no module)\b/.test(s)) return null;
    if (/\b(no module|nothing built|all the remaining work|entire remaining work)\b/.test(s)) return false;
    if (/\b(half|50 percent)\b/.test(s) && !/\b(not|no|isn't|isnt)\b/.test(s)) return true;
  }
  if (factId === "F3" && /\b(heads.up|headsup)\b/.test(s) && /\breview\b/.test(s)) {
    if (/\b(counts against|counted against|hurts)\b/.test(s) && !/\b(not|never|isn't|isnt)\b/.test(s)) return false;
    if (/\b(not|never|isn't|isnt)\b/.test(s) && /\b(same.day|same day)\b/.test(s)) return true;
  }
  return null;
}

export function endSession(session) {
  if (!session.ended) { session.ended = true; session.endReason = "user_ended"; session.staged = null; }
  return session;
}

export function applyTurn(session, npc_id, events, opts) {
  const o = opts || {};
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
      const accuracy = relayAccuracy(ref, o.text);
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
        npc_id === "jordan" &&
        session.facts.F2 &&
        session.facts.F2.status === "revealed"
      ) {
        session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
        if (!session.flags.includes("help_accepted_with_jordan")) {
          session.flags.push("help_accepted_with_jordan");
          reevaluateCommitments(session);
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
      const { min, cutoff, assist } = boundsFor(session);
      const realistic = target >= min && target <= cutoff;
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
        pending_acceptance: realistic && npc_id === session.model.commitment_model.agreement_npc,
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
      if (active && npc_id === session.model.commitment_model.agreement_npc && session.goals.G1?.status === "done" && session.goals.G2?.status === "done") {
        active.pending_recap_turn = t;
      }
      session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
      continue;
    }
    session.events_log.push({ turn_id: t, npc_id, type, params, source_id: sourceId, allocation: "none" });
  }

  // 4. Goals.
  const seen = (type, who) =>
    session.events_log.some((e) => e.type === type && (!who || e.npc_id === who));
  if (session.goals.G1 && session.goals.G1.status !== "done") {
    if (seen("took_ownership", "maya") && seen("gave_honest_status", "maya")) {
      session.goals.G1 = { status: "done", turn_id: t };
    }
  }
  if (session.goals.G2 && session.goals.G2.status !== "done") {
    if (seen("asked_requirement_details", "jordan")) {
      session.goals.G2 = { status: "done", turn_id: t };
    }
  }
  if (session.goals.G3 && session.goals.G3.status !== "done") {
    const g1 = !session.goals.G1 || session.goals.G1.status === "done";
    const g2 = !session.goals.G2 || session.goals.G2.status === "done";
    const agreed = session.commitments.some(
      (c) => c.status === "active" && c.accepted_with && (c.recap_turn_id || c.pending_recap_turn),
    );
    if (g1 && g2 && agreed) session.goals.G3 = { status: "pending_delivery", turn_id: t };
  }

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

  // 6. B3 due?
  const b3def = session.model.beats.find((b) => b.id === "B3");
  const b3npc = b3def ? b3def.npc : "maya";
  const dueB3 = dueB3Commitments(session);
  let b3fire = null;
  if (dueB3.length > 0 && npc_id === b3npc) {
    b3fire = dueB3[0];
  } else if (dueB3.length > 0) {
    // Deferred to the owner's next exchange; flag ids only (no knowledge leak).
    session.deferredBeat = { beatId: "B3", commitmentId: dueB3[0].id, dueTurn: t };
  }

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
        const mayaSl = slidersFor(session, "maya");
        const b2turn = session.npcs.maya ? b2TurnFor(mayaSl.assertiveness) : B2_BASE_TURN;
        const noCommit = session.commitments.length === 0;
        if (npc_id === "maya" && session.turn >= b2turn && noCommit) {
          act = "press_for_date";
          if (session.beats.B2) {
            session.beats.B2.status = "fired";
            if (!session.beats.B2.fired_turn) session.beats.B2.fired_turn = t;
          }
        } else {
          // Closing needs every visible required goal done; hidden goals
          // (visible:false) never gate ending or closing.
          const required = session.model.goals.filter((g) => g.required && g.visible);
          const allDone = required.length > 0 && required.every((g) => session.goals[g.id] && ["done", "pending_delivery"].includes(session.goals[g.id].status));
          if (allDone) {
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
  const closingAllowed = act === "close_positive" && session.goals.G3?.status === "pending_delivery";
  if (!closingAllowed) {
    for (const c of session.commitments) { if (c.pending_recap_turn === t) delete c.pending_recap_turn; }
    if (session.goals.G3?.status === "pending_delivery") session.goals.G3 = { status: "pending", turn_id: null };
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
  if (act === "callback_commitment" && b3fire) {
    b3fire.callbackFired = true;
    if (session.beats.B3) {
      session.beats.B3.status = "fired";
      if (!session.beats.B3.fired_turn) session.beats.B3.fired_turn = t;
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

export function commitDelivery(session, turn_id, opts) {
  const delivered = !!(opts && opts.delivered);
  const st = session.staged;
  if (!st || st.turnId !== turn_id) return session;
  if (delivered) {
    for (const c of session.commitments) {
      if (c.status !== "active") continue;
      if (st.agreementAllowed && opts?.agreementExpressed && c.id === st.agreementCommitmentId && c.pending_acceptance) { c.accepted_with = st.npcId; c.pending_acceptance = false; }
      if (st.closingAllowed && opts?.closingExpressed && c.pending_recap_turn === turn_id) { c.recap_turn_id = turn_id; delete c.pending_recap_turn; }
    }
    if (session.goals.G3?.status === "pending_delivery" && st.closingAllowed && opts?.closingExpressed) {
      session.goals.G3.status = "done";
      session.ended = true; session.endReason = "goals_complete";
    }
    if (session.goals.G3?.status === "pending_delivery") session.goals.G3 = { status: "pending", turn_id: null };
    if (st.factId && session.facts[st.factId] && session.facts[st.factId].status === "pending_delivery") {
      session.facts[st.factId].status = "revealed";
      if (!session.user_known.includes(st.factId)) session.user_known.push(st.factId);
    }
    session.staged = null;
    reevaluateCommitments(session);
  } else {
    for (const c of session.commitments) { if (c.pending_recap_turn === turn_id) delete c.pending_recap_turn; }
    for (const c of session.commitments) { if (c.id === st.agreementCommitmentId) c.pending_acceptance = false; }
    if (session.goals.G3?.status === "pending_delivery") session.goals.G3 = { status: "pending", turn_id: null };
    // Failed delivery: fact stays pending, earns nothing, staged cleared for retry.
    session.staged = null;
  }
  const snapshot = deepClone(session);
  delete snapshot.snapshots;
  if (session.snapshots.length) session.snapshots[session.snapshots.length - 1] = snapshot;
  return session;
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
