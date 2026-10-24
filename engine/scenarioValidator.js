// Scenario validator for S1-01 missed_deadline (pure engine code, stdlib only).
// Static schema import only: no network, provider or filesystem dependency.
import schema from "../scenarios/missed_deadline.schema.json" with { type: "json" };
import schemaV2 from "../scenarios/missed_deadline.v2.schema.json" with { type: "json" };

const TAXONOMY = new Set([
  "asked_deadline_flexibility",
  "asked_why_urgent",
  "asked_requirement_details",
  "asked_background",
  "asked_impact",
  "asked_for_help",
  "asked_advice",
  "asked_expectation",
  "committed_deadline",
  "proposed_scope_cut",
  "proposed_phased_delivery",
  "proposed_plan",
  "confirmed_next_steps",
  "recapped_agreement",
  "gave_honest_status",
  "took_ownership",
  "blamed_others",
  "apologized",
  "acknowledged_concern",
  "pushed_back_constructively",
  "avoided_question",
  "relayed_fact",
  "greeted",
  "small_talk",
  "off_topic",
  "repeated_question",
  "asked_reveal_all",
]);

const PRESSURE_ACTS = new Set(["press_for_date", "callback_commitment"]);
const KNOWN_FLAGS = new Set(["help_accepted_with_jordan"]);
const REQUIRED_TOP = [
  "id",
  "version",
  "locales",
  "title",
  "briefing",
  "player",
  "clock",
  "canon",
  "commitment_model",
  "npcs",
  "goals",
  "facts",
  "beats",
  "end",
  "scoring",
];

function err(errors, code, path, message) {
  errors.push({ code, path, message });
}

// Only the keywords declared in this scenario schema are supported.
function validateShape(value, rule, path, errors) {
  const type = rule.type;
  const matches = type === undefined || (type === "object"
    ? value !== null && typeof value === "object" && !Array.isArray(value)
    : type === "array" ? Array.isArray(value)
    : type === "integer" ? Number.isSafeInteger(value)
    : type === "number" ? typeof value === "number" && Number.isFinite(value)
    : typeof value === type);
  if (!matches) {
    err(errors, "SCHEMA_TYPE", path, `expected ${type}`);
    return;
  }
  if (Object.hasOwn(rule, "const") && value !== rule.const) err(errors, "SCHEMA_CONST", path, "unexpected constant");
  if (typeof value === "number") {
    if (rule.minimum !== undefined && value < rule.minimum || rule.maximum !== undefined && value > rule.maximum || rule.exclusiveMinimum !== undefined && value <= rule.exclusiveMinimum) {
      err(errors, "SCHEMA_RANGE", path, "number outside allowed range");
    }
  }
  if (typeof value === "string" && rule.minLength !== undefined && [...value].length < rule.minLength) err(errors, "SCHEMA_LENGTH", path, "string too short");
  if (Array.isArray(value)) {
    if (rule.minItems !== undefined && value.length < rule.minItems) err(errors, "SCHEMA_ITEMS", path, "array too short");
    if (rule.items) value.forEach((item, i) => validateShape(item, rule.items, `${path}[${i}]`, errors));
  } else if (value !== null && typeof value === "object") {
    for (const key of rule.required || []) {
      if (!Object.hasOwn(value, key)) err(errors, "SCHEMA_REQUIRED", `${path}.${key}`, "required field missing");
    }
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(rule.properties || {}, key)) validateShape(value[key], rule.properties[key], `${path}.${key}`, errors);
      else if (rule.additionalProperties === false) err(errors, "SCHEMA_PROPERTY", `${path}.${key}`, "unknown property");
    }
  }
}

// Extract taxonomy event names from done_when entries.
// Only strings of the form "event:<type>" are event refs; anything else
// is an engine predicate (e.g. date_mutually_agreed) and is skipped.
function extractEvents(doneWhen) {
  const out = [];
  if (!Array.isArray(doneWhen)) return out;
  for (const entry of doneWhen) {
    if (typeof entry !== "string") continue;
    const m = /^event:([A-Za-z_]+)$/.exec(entry.trim());
    if (m) out.push(m[1]);
  }
  return out;
}

function hasCycle(goals) {
  const adj = new Map();
  for (const g of goals) adj.set(g.id, Array.isArray(g.requires) ? g.requires : []);
  const color = new Map(); // 0=unvisited 1=in-stack 2=done
  const ids = new Set(goals.map((g) => g.id));
  function visit(id) {
    if (!ids.has(id)) return false;
    const c = color.get(id) || 0;
    if (c === 1) return true;
    if (c === 2) return false;
    color.set(id, 1);
    for (const r of adj.get(id) || []) {
      if (visit(r)) return true;
    }
    color.set(id, 2);
    return false;
  }
  for (const id of ids) {
    if (visit(id)) return true;
  }
  return false;
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === "object") {
    const ka = Object.keys(a);
    const kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
  }
  return false;
}

// Collect comparable private nodes: non-empty strings, numbers, objects/arrays.
// Booleans/null skipped (shared primitives like true would false-positive).
function collectPrivateNodes(node, out) {
  if (typeof node === "string") {
    if (node.length > 0) out.push(node);
    return;
  }
  if (typeof node === "number") {
    out.push(node);
    return;
  }
  if (Array.isArray(node)) {
    if (node.length > 0) out.push(node);
    for (const v of node) collectPrivateNodes(v, out);
    return;
  }
  if (node !== null && typeof node === "object") {
    if (Object.keys(node).length > 0) out.push(node);
    for (const v of Object.values(node)) collectPrivateNodes(v, out);
  }
}

function publicContains(publicNode, target) {
  if (deepEqual(publicNode, target)) return true;
  if (Array.isArray(publicNode)) return publicNode.some((v) => publicContains(v, target));
  if (publicNode !== null && typeof publicNode === "object") {
    return Object.values(publicNode).some((v) => publicContains(v, target));
  }
  return false;
}

export function validateScenario(spec, { privateProof = false, allowedAssistanceFlags = [] } = {}) {
  const errors = [];
  if (spec === null || typeof spec !== "object" || Array.isArray(spec)) {
    err(errors, "NOT_AN_OBJECT", "$", "spec must be an object");
    return { ok: false, errors };
  }

  for (const field of REQUIRED_TOP) {
    if (!(field in spec)) {
      if (field === "clock" || field === "commitment_model") {
        err(errors, "MISSING_CLOCK_MODEL", field, `missing required section: ${field}`);
      } else {
        err(errors, "MISSING_FIELD", field, `missing required field: ${field}`);
      }
    }
  }

  const deadlineV2 = spec.id === "missed_deadline" && spec.version === 2 && !privateProof;
  const shape = privateProof ? structuredClone(schema) : deadlineV2 ? schemaV2 : schema;
  if (privateProof) {
    delete shape.properties.id.const;
    delete shape.properties.version.const;
    shape.properties.version.type = "integer";
    shape.properties.version.minimum = 1;
    shape.properties.clock.properties.day = { type: "integer", minimum: 0 };
  }
  validateShape(spec, shape, "$", errors);
  // Semantic checks assume declared types; malformed input must return errors, not throw.
  if (errors.some((e) => e.code === "SCHEMA_TYPE")) return { ok: false, errors };

  const npcs = Array.isArray(spec.npcs) ? spec.npcs : [];
  const goals = Array.isArray(spec.goals) ? spec.goals : [];
  const facts = Array.isArray(spec.facts) ? spec.facts : [];
  const beats = Array.isArray(spec.beats) ? spec.beats : [];
  const npcIds = new Set(npcs.map((n) => n && n.id));
  const goalIds = new Set(goals.map((g) => g && g.id));
  const factIds = new Set(facts.map((f) => f && f.id));
  if (deadlineV2) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (!same(npcs.map((n) => n.id), ["maya", "jordan", "sam", "client"]) ||
        !same(facts.map((f) => [f.id, f.owner, f.weight]), [["F1", "maya", 5], ["F2", "jordan", 6], ["F3", "sam", 4], ["F4", "client", 5]]) ||
        !same(goals.map((g) => [g.id, g.weight]), [["G1", 10], ["G2", 10], ["G3", 10]]) ||
        !same(goals.map((g) => [g.done_when, g.requires, g.visible, g.required]), [
          [["event:took_ownership", "event:gave_honest_status"], [], true, true],
          [["event:confirmed_next_steps"], [], true, true],
          [["event:proposed_plan", "event:confirmed_next_steps", "event:recapped_agreement"], ["G1", "G2"], true, true],
        ])) err(errors, "BAD_V2_BINDING", "$", "unsupported v2 actors, facts or goal conditions");
    if (spec.end?.max_turns !== 20 || spec.canon?.public?.launch_day !== 3 || spec.commitment_model?.unassisted_min_day !== 3 || spec.commitment_model?.assisted_min_day !== 3 || spec.commitment_model?.assistance_requires?.length !== 0 || spec.commitment_model?.agreement_npc !== "maya") err(errors, "BAD_V2_BINDING", "$", "unsupported v2 clock or commitment bounds");
    if (spec.clock?.day !== 0 || spec.clock?.advance_on_turn !== false || spec.canon?.public?.original_due_day !== -1 ||
        spec.commitment_model?.latest_day_from !== "canon.public.launch_day" ||
        !same(beats, [{act: "press_for_date", id: "B2", npc: "maya", when: "turn>=4 and no_commitment"},
          {act: "callback_commitment", id: "B3", npc: "maya", when: "commitment_made and turns_since_commitment>=3"}]) ||
        !deepEqual(spec.scoring?.penalties, {unrealistic_commitment: 8, contradicted_commitment: 4, inaccurate_relay: 3}) ||
        !deepEqual(spec.scoring?.bands, [{minimum: 85, label: "Excellent"}, {minimum: 70, label: "Strong"}, {minimum: 50, label: "Developing"}, {minimum: 0, label: "Needs work"}])) err(errors, "BAD_V2_BINDING", "$", "unsupported v2 timing or scoring constants");
  }

  // Unique ids across npc/goal/fact/beat lists.
  for (const [list, label] of [[npcs, "npcs"], [goals, "goals"], [facts, "facts"], [beats, "beats"]]) {
    const seen = new Set();
    for (const item of list) {
      const id = item && item.id;
      if (typeof id !== "string" || id.length === 0) {
        err(errors, "MISSING_ID", label, `${label} entry missing id`);
        continue;
      }
      if (seen.has(id)) err(errors, "DUPLICATE_ID", `${label}.${id}`, `duplicate id: ${id}`);
      seen.add(id);
    }
  }

  // Clock: relative days only.
  const clock = spec.clock;
  if (clock === undefined || clock === null || typeof clock !== "object" || Array.isArray(clock)) {
    if (!errors.some((e) => e.code === "MISSING_CLOCK_MODEL")) {
      err(errors, "MISSING_CLOCK_MODEL", "clock", "clock must be an object");
    }
  } else {
    if (!privateProof && clock.day !== 0) err(errors, "MISSING_CLOCK_MODEL", "clock.day", "clock.day must be 0");
    if (clock.advance_on_turn !== false) {
      err(errors, "MISSING_CLOCK_MODEL", "clock.advance_on_turn", "clock.advance_on_turn must be false");
    }
    for (const banned of ["date", "timezone", "time", "datetime", "timestamp"]) {
      if (banned in clock) err(errors, "CALENDAR_DATE", `clock.${banned}`, `clock must not contain ${banned} (relative days only)`);
    }
  }

  // Commitment model refs.
  const cm = spec.commitment_model;
  if (cm === undefined || cm === null || typeof cm !== "object" || Array.isArray(cm)) {
    if (!errors.some((e) => e.code === "MISSING_CLOCK_MODEL")) {
      err(errors, "MISSING_CLOCK_MODEL", "commitment_model", "commitment_model must be an object");
    }
  } else {
    for (const f of ["unassisted_min_day", "assisted_min_day", "assistance_requires", "latest_day_from", "agreement_npc"]) {
      if (!(f in cm)) err(errors, "MISSING_CLOCK_MODEL", `commitment_model.${f}`, `commitment_model missing ${f}`);
    }
    if (cm.agreement_npc !== undefined && !npcIds.has(cm.agreement_npc)) {
      err(errors, "UNKNOWN_NPC", "commitment_model.agreement_npc", `unknown agreement_npc: ${cm.agreement_npc}`);
    }
    if (Array.isArray(cm.assistance_requires)) {
      for (const req of cm.assistance_requires) {
        if (typeof req !== "string") {
          err(errors, "BAD_ASSISTANCE_REF", "commitment_model.assistance_requires", `bad assistance ref: ${req}`);
          continue;
        }
        if (req.endsWith("_delivered")) {
          const fid = req.slice(0, -"_delivered".length);
          if (!factIds.has(fid)) err(errors, "UNKNOWN_FACT_REF", `commitment_model.assistance_requires.${req}`, `unknown fact ref: ${req}`);
        } else if (!KNOWN_FLAGS.has(req) && !(privateProof && allowedAssistanceFlags.includes(req) && /^help_accepted_with_[a-z][a-z0-9_]*$/.test(req))) {
          err(errors, "UNKNOWN_FLAG", `commitment_model.assistance_requires.${req}`, `unknown assistance flag: ${req}`);
        }
      }
    }
    if (typeof cm.latest_day_from === "string") {
      const parts = cm.latest_day_from.split(".");
      let node = spec;
      let ok = true;
      for (const p of parts) {
        if (node !== null && typeof node === "object" && p in node) node = node[p];
        else { ok = false; break; }
      }
      if (!ok || !Number.isSafeInteger(node) || node < 0) err(errors, "BAD_LATEST_DAY_FROM", "commitment_model.latest_day_from", "cutoff must resolve to a non-negative whole day");
    }
  }

  if (cm && cm.assisted_min_day > cm.unassisted_min_day) err(errors, "BAD_DAY_BOUNDS", "commitment_model", "assisted minimum cannot exceed unassisted minimum");
  if (privateProof && cm && cm.assistance_requires?.length === 0 && cm.assisted_min_day !== cm.unassisted_min_day) err(errors, "BAD_DAY_BOUNDS", "commitment_model", "no assistance requires identical minimums");

  // Facts.
  const factTriggerSet = new Set();
  for (const f of facts) {
    const base = `facts.${(f && f.id) || "?"}`;
    if (!f || typeof f !== "object") {
      err(errors, "BAD_FACT", base, "fact must be an object");
      continue;
    }
    if (!npcIds.has(f.owner)) err(errors, "NO_OWNER", `${base}.owner`, `unknown owner: ${f.owner}`);
    if (!Array.isArray(f.triggers) || f.triggers.length === 0) {
      err(errors, "NO_TRIGGERS", `${base}.triggers`, "fact needs >=1 trigger");
    } else {
      for (const t of f.triggers) {
        if (!TAXONOMY.has(t)) err(errors, "UNKNOWN_EVENT", `${base}.triggers.${t}`, `unknown trigger: ${t}`);
        else factTriggerSet.add(t);
      }
    }
    const kw = f.leak_keywords && f.leak_keywords.en;
    if (!Array.isArray(kw) || kw.length === 0) {
      err(errors, "MISSING_KEYWORDS", `${base}.leak_keywords.en`, "leak_keywords.en must be non-empty");
    }
    if (!(typeof f.weight === "number" && f.weight > 0)) {
      err(errors, "BAD_WEIGHT", `${base}.weight`, "fact weight must be >0");
    }
    if (!(f.content && typeof f.content.en === "string" && f.content.en.length > 0)) {
      err(errors, "MISSING_CONTENT", `${base}.content.en`, "content.en must be non-empty");
    }
    if (!(f.unlock_question && typeof f.unlock_question.en === "string" && f.unlock_question.en.length > 0)) {
      err(errors, "MISSING_UNLOCK", `${base}.unlock_question.en`, "unlock_question.en must be non-empty");
    }
  }
  if (facts.length < 2) err(errors, "TOO_FEW_FACTS", "facts", "need >=2 facts");

  // NPC topics must be known taxonomy events.
  for (const n of npcs) {
    if (!n || typeof n !== "object") continue;
    for (const t of n.topics || []) {
      if (!TAXONOMY.has(t)) err(errors, "UNKNOWN_EVENT", `npcs.${n.id}.topics.${t}`, `unknown topic: ${t}`);
    }
  }

  // Goals.
  const goalEventSet = new Set();
  const PREDICATE_ALLOW = [
    (s) => s === "date_mutually_agreed",
    (s) => /^npc:[a-z_]+$/.test(s),
    (s) => /^fact_revealed:[A-Za-z0-9_]+$/.test(s),
    (s) => /^goal_done:[A-Za-z0-9_]+$/.test(s),
  ];
  for (const g of goals) {
    const base = `goals.${(g && g.id) || "?"}`;
    if (!g || typeof g !== "object") {
      err(errors, "BAD_GOAL", base, "goal must be an object");
      continue;
    }
    for (const ev of extractEvents(g.done_when)) {
      if (!TAXONOMY.has(ev)) err(errors, "UNKNOWN_EVENT", `${base}.done_when.${ev}`, `unknown event: ${ev}`);
      else goalEventSet.add(ev);
    }
    if (Array.isArray(g.done_when)) {
      for (const entry of g.done_when) {
        if (typeof entry !== "string") continue;
        const t = entry.trim();
        if (/^event:[A-Za-z_]+$/.test(t)) continue;
        if (t.startsWith("npc:") && !npcIds.has(t.slice(4))) err(errors, "UNKNOWN_NPC", `${base}.done_when`, "unknown goal actor");
        if (t.startsWith("fact_revealed:") && !factIds.has(t.slice(14))) err(errors, "UNKNOWN_FACT_REF", `${base}.done_when`, "unknown goal fact");
        if (t.startsWith("goal_done:") && !goalIds.has(t.slice(10))) err(errors, "UNKNOWN_REQUIRES", `${base}.done_when`, "unknown goal dependency");
        if (!PREDICATE_ALLOW.some((f) => f(t))) {
          err(errors, "BAD_PREDICATE", `${base}.done_when`, `unknown predicate: ${t}`);
        }
      }
    }
    if (Array.isArray(g.requires)) {
      for (const r of g.requires) {
        if (!goalIds.has(r)) err(errors, "UNKNOWN_REQUIRES", `${base}.requires.${r}`, `unknown requires ref: ${r}`);
      }
    } else {
      err(errors, "MISSING_REQUIRES", `${base}.requires`, "goal requires must be an array");
    }
    if (!(typeof g.weight === "number" && g.weight > 0)) {
      err(errors, "BAD_WEIGHT", `${base}.weight`, "goal weight must be >0");
    }
  }
  if (hasCycle(goals)) err(errors, "REQUIRES_CYCLE", "goals.requires", "goal requires graph has a cycle");
  const visibleGoals = goals.filter((g) => g && g.visible === true);
  if (visibleGoals.length < 2) err(errors, "TOO_FEW_VISIBLE_GOALS", "goals", "need >=2 visible goals");

  // R-22 disjointness: goal events and fact triggers must not overlap.
  for (const ev of goalEventSet) {
    if (factTriggerSet.has(ev)) {
      err(errors, "GOAL_FACT_OVERLAP", `goals↔facts.${ev}`, `event ${ev} is both a goal event and a fact trigger`);
    }
  }

  // Weight sums.
  const goalSum = goals.reduce((s, g) => s + (g && typeof g.weight === "number" ? g.weight : 0), 0);
  const factSum = facts.reduce((s, f) => s + (f && typeof f.weight === "number" ? f.weight : 0), 0);
  if (goalSum !== 30) err(errors, "WEIGHT_SUM", "goals.weight", `goal weights sum to ${goalSum}, expected 30`);
  if (factSum !== 20) err(errors, "WEIGHT_SUM", "facts.weight", `fact weights sum to ${factSum}, expected 20`);

  const weights = spec.scoring?.weights;
  const expectedWeights = { goals: 30, hidden_facts: 20, integrity: 15, relationship: 10, rubric: 25 };
  if (weights && Object.entries(expectedWeights).some(([key, value]) => weights[key] !== value)) {
    err(errors, "BAD_SCORING_WEIGHTS", "scoring.weights", "weights must match the approved version-1 allocation");
  }

  // Pressure beats.
  if (!beats.some((b) => b && PRESSURE_ACTS.has(b.act))) {
    err(errors, "NO_PRESSURE_BEAT", "beats", "need >=1 pressure beat (press_for_date|callback_commitment)");
  }
  for (const beat of beats) if (!npcIds.has(beat.npc)) err(errors, "UNKNOWN_NPC", `beats.${beat.id}.npc`, "unknown pressure actor");

  // Private canon must not appear under public.
  if (spec.canon && typeof spec.canon === "object" && !Array.isArray(spec.canon)) {
    const priv = spec.canon.private;
    const pub = spec.canon.public;
    if (priv !== undefined && pub !== undefined) {
      const nodes = [];
      collectPrivateNodes(priv, nodes);
      for (const target of nodes) {
        if (publicContains(pub, target)) {
          const label = typeof target === "string" ? target.slice(0, 40) : JSON.stringify(target).slice(0, 60);
          err(errors, "PRIVATE_UNDER_PUBLIC", "canon.public", `private value leaked under public: ${label}`);
          break;
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}

// Public view: briefing + visible goal labels + npc names only.
// Must never carry fact contents, keywords, triggers, unlock questions,
// commitment_model, or private canon values.
export function publicScenario(spec) {
  const goals = Array.isArray(spec.goals) ? spec.goals : [];
  const npcs = Array.isArray(spec.npcs) ? spec.npcs : [];
  return {
    id: spec.id,
    version: spec.version,
    title: spec.title,
    briefing: spec.briefing,
    player: spec.player,
    locales: spec.locales,
    npcs: npcs.map((n) => ({ id: n.id, name: n.name, role: n.role })),
    goals: goals
      .filter((g) => g.visible === true)
      .map((g) => ({ id: g.id, label: g.label, requires: g.requires })),
    end: spec.end,
  };
}
