// Static, server-only scenario registry. SF-01 deliberately registers SC-01 only.
import { createHash } from "node:crypto";
import specData from "../../scenarios/missed_deadline.json" with { type: "json" };
import repliesData from "../../replies/missed_deadline.en.json" with { type: "json" };
import { validateScenario } from "../../engine/scenarioValidator.js";
import { CONFIG } from "../../scoring/config.js";

const clone = (value) => structuredClone(value);
function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");

export function publicScenario(pkg) {
  const spec = pkg?.spec;
  if (!spec) return null;
  return {
    id: spec.id, title: spec.title, briefing: spec.briefing.en,
    difficulty: spec.difficulty, duration_min: spec.duration_min,
    goals: (spec.goals || []).filter((goal) => goal.visible).map((goal) => ({ id: goal.id, label: goal.label, requires: Array.isArray(goal.requires) ? goal.requires : [] })),
    npcs: (spec.npcs || []).map((npc) => ({ id: npc.id, name: npc.name, role: npc.role })),
  };
}

function validatePackage(input) {
  const spec = clone(input.spec);
  const replies = clone(input.replies);
  const scoringProfile = clone(input.scoringProfile);
  const policy = clone(input.policy);
  const validation = validateScenario(spec);
  const config = CONFIG.missed_deadline;
  const matchesItems = (items, expected) => Array.isArray(items) && items.length === Object.keys(expected).length && items.every((item) => expected[item.id] === item.weight);
  const scoring = spec.scoring || {};
  if (!validation.ok || spec.id !== "missed_deadline" || spec.locales?.length !== 1 || spec.locales[0] !== "en" || !Array.isArray(replies?.entries) || canonical(scoringProfile) !== canonical(config) || scoring.version !== config.scoring_version || canonical(scoring.weights) !== canonical(config.weights) || !matchesItems(spec.goals, config.goals) || !matchesItems(spec.facts, config.facts) || (scoring.penalties && canonical(scoring.penalties) !== canonical(config.penalties)) || policy?.id !== "sc01-legacy" || policy?.version !== 1) throw new Error("invalid scenario package");
  const ids = new Set();
  for (const npc of spec.npcs || []) { if (!npc?.id || ids.has(npc.id)) throw new Error("invalid npc ids"); ids.add(npc.id); }
  for (const entry of replies.entries) {
    if (!ids.has(entry?.npc) || !entry?.id || typeof entry.act !== "string" || !Array.isArray(entry.variants) || entry.variants.length === 0 || entry.variants.some((variant) => !variant?.id || typeof variant.text !== "string" || !variant.text.trim())) throw new Error("invalid reply references");
  }
  // SF-01's adapter remains deliberately tied to the accepted SC-01 runtime.
  const baselineOwners = Object.fromEntries((specData.facts || []).map((fact) => [fact.id, fact.owner]));
  const owners = Object.fromEntries((spec.facts || []).map((fact) => [fact.id, fact.owner]));
  const baselineNpcs = (specData.npcs || []).map((npc) => npc.id).sort();
  const goalIds = (spec.goals || []).map((goal) => goal.id).sort();
  if (canonical(owners) !== canonical(baselineOwners) || canonical([...ids].sort()) !== canonical(baselineNpcs) || canonical(goalIds) !== canonical(["G1", "G2", "G3"]) || canonical(spec.commitment_model) !== canonical(specData.commitment_model)) throw new Error("incompatible legacy scenario package");
  const identity = freeze({ scenarioId: spec.id, contentVersion: spec.version, schemaVersion: 1, policyId: policy.id, policyVersion: policy.version, scoringVersion: spec.scoring.version,
    contentHash: hash({ spec, replies, scoringProfile, policyId: policy.id, policyVersion: policy.version }) });
  return freeze({ spec, replies, scoringProfile, policy, identity });
}

export function createScenarioRegistry(packages = []) {
  const byId = new Map(); const aliases = new Map();
  for (const input of packages) {
    const pkg = validatePackage(input);
    if (byId.has(pkg.spec.id)) throw new Error("duplicate scenario id");
    byId.set(pkg.spec.id, pkg);
    for (const alias of input.aliases || []) {
      if (!alias || aliases.has(alias) || byId.has(alias)) throw new Error("duplicate scenario alias");
      aliases.set(alias, pkg.spec.id);
    }
  }
  return freeze({
    getScenario(id) { return byId.get(id) || byId.get(aliases.get(id)) || null; },
    listScenarios() { return [...byId.values()].map(publicScenario); },
  });
}

export const defaultRegistry = createScenarioRegistry([{ spec: specData, replies: repliesData, scoringProfile: CONFIG.missed_deadline,
  policy: { id: "sc01-legacy", version: 1 }, aliases: ["deadline"] }]);
