import {publicCast, FIXED_CAST} from "../../shared/presentation.js";
import {sc01Language} from "../../llm/sc01Language.js";
// Static, server-only scenario registry. SF-01 deliberately registers SC-01 only.
import { createHash } from "node:crypto";
import specData from "../../scenarios/missed_deadline.json" with { type: "json" };
import repliesData from "../../replies/missed_deadline.en.json" with { type: "json" };
import { validateScenario } from "../../engine/scenarioValidator.js";
import { sc01EnginePolicy, sc01Rules } from "./sc01EnginePolicy.js";
import { CONFIG, normalizeScoringProfile } from "../../scoring/config.js";
import {deadlineV2PackageInput, deadlineV2Policy} from "./deadlineV2Package.js";

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
    npcs: publicCast(spec.npcs, pkg.presentation),
  };
}

const registeredPackages = new WeakSet();
export const isRegisteredPackage = (pkg) => registeredPackages.has(pkg);

function validatePackage(input, privatePolicies) {
  const approved = privatePolicies[input.policy?.id];
  const privateProof = input.privateProof === true && !!approved;
  if (input.privateProof && (!approved || approved.version !== input.policy.version || approved.engine !== input.policy.engine || approved.language !== input.policy.language || approved.offline !== input.policy.offline || canonical(approved.rules) !== canonical(input.policy.rules))) throw new Error("invalid private policy binding");
  const spec = clone(input.spec);
  if (privateProof && spec.id === "missed_deadline") throw new Error("invalid private scenario binding");
  const replies = clone(input.replies);
  const scoringProfile = clone(input.scoringProfile);
  const presentation = clone(input.presentation || FIXED_CAST);
  publicCast(spec.npcs, presentation);
  const policy = { ...clone({ id: input.policy?.id, version: input.policy?.version }), offline: input.policy?.offline, engine: input.policy?.engine, language: input.policy?.language, rules: clone(input.policy?.rules) };
  const validation = validateScenario(spec, { privateProof });
  const v2 = !privateProof && spec.id === "missed_deadline" && spec.version === 2;
  const privateSources = v2 ? clone(input.privateSources) : undefined;
  if (v2) {
    const supported = deadlineV2PackageInput();
    if (input.privateProof || !validation.ok || canonical(spec) !== canonical(supported.spec) || canonical(replies) !== canonical(supported.replies) ||
        canonical(scoringProfile) !== canonical(supported.scoringProfile) || canonical(presentation) !== canonical(supported.presentation) || canonical(privateSources) !== canonical(supported.privateSources) ||
        policy.id !== deadlineV2Policy.id || policy.version !== deadlineV2Policy.version || policy.engine !== deadlineV2Policy.engine ||
        policy.language !== deadlineV2Policy.language || policy.offline !== deadlineV2Policy.offline || canonical(policy.rules) !== canonical(deadlineV2Policy.rules)) throw new Error("invalid supported deadline v2 package");
  }
  const config = CONFIG.missed_deadline;
  const matchesItems = (items, expected) => Array.isArray(items) && items.length === Object.keys(expected).length && items.every((item) => expected[item.id] === item.weight);
  const scoring = spec.scoring || {};
  if (!privateProof && !v2 && (!validation.ok || spec.id !== "missed_deadline" || spec.locales?.length !== 1 || spec.locales[0] !== "en" || !Array.isArray(replies?.entries) || canonical(scoringProfile) !== canonical(config) || canonical(normalizeScoringProfile(spec)) !== canonical(config) || scoring.version !== config.scoring_version || canonical(scoring.weights) !== canonical(config.weights) || !matchesItems(spec.goals, config.goals) || !matchesItems(spec.facts, config.facts) || (scoring.penalties && canonical(scoring.penalties) !== canonical(config.penalties)) || policy?.id !== "sc01-legacy" || policy?.version !== 1 || Object.keys(sc01EnginePolicy).some((key) => policy.engine?.[key] !== sc01EnginePolicy[key]) || Object.keys(sc01Language).some((key) => policy.language?.[key] !== sc01Language[key]) || canonical(policy.rules) !== canonical(sc01Rules))) throw new Error("invalid scenario package");
  if (!validation.ok || spec.locales?.length !== 1 || spec.locales[0] !== "en" || !Array.isArray(replies?.entries) || canonical(scoringProfile) !== canonical(normalizeScoringProfile(spec)) || !policy.id || !Number.isInteger(policy.version) || policy.version < 1 || ["commitmentBounds", "goalCandidates", "pressureCandidates", "relayAccuracy"].some((key) => typeof policy.engine?.[key] !== "function") || ["publicCanonLines", "normalizeCommitment", "canonCheck"].some((key) => typeof policy.language?.[key] !== "function")) throw new Error("invalid scenario package");
  const ids = new Set();
  for (const npc of spec.npcs || []) { if (!npc?.id || ids.has(npc.id)) throw new Error("invalid npc ids"); ids.add(npc.id); }
  if (Object.keys(policy.rules?.goalActors || {}).length !== spec.goals.length || spec.goals.some((goal) => !ids.has(policy.rules.goalActors[goal.id]))) throw new Error("invalid goal actor bindings");
  for (const entry of replies.entries) {
    if (!ids.has(entry?.npc) || !entry?.id || typeof entry.act !== "string" || !Array.isArray(entry.variants) || entry.variants.length === 0 || entry.variants.some((variant) => !variant?.id || typeof variant.text !== "string" || !variant.text.trim())) throw new Error("invalid reply references");
  }
  // Production registration remains deliberately tied to the accepted SC-01 policy.
  const baselineOwners = Object.fromEntries((specData.facts || []).map((fact) => [fact.id, fact.owner]));
  const owners = Object.fromEntries((spec.facts || []).map((fact) => [fact.id, fact.owner]));
  const baselineNpcs = (specData.npcs || []).map((npc) => npc.id).sort();
  const goalIds = (spec.goals || []).map((goal) => goal.id).sort();
  if (!privateProof && !v2 && (canonical(owners) !== canonical(baselineOwners) || canonical([...ids].sort()) !== canonical(baselineNpcs) || canonical(goalIds) !== canonical(["G1", "G2", "G3"]) || canonical(spec.commitment_model) !== canonical(specData.commitment_model))) throw new Error("incompatible legacy scenario package");
  const identity = freeze({ scenarioId: spec.id, contentVersion: spec.version, schemaVersion: v2 ? 2 : 1, policyId: policy.id, policyVersion: policy.version, scoringVersion: spec.scoring.version,
    contentHash: hash({ spec, replies, scoringProfile, policyId: policy.id, policyVersion: policy.version, policyRules: policy.rules, presentation, ...(v2 ? {privateSources} : {}) }) });
  const pkg = freeze({ spec, replies, scoringProfile, presentation, policy, identity, ...(v2 ? {privateSources} : {}) });
  registeredPackages.add(pkg);
  return pkg;
}

export function createScenarioRegistry(packages = [], { privatePolicies = {} } = {}) {
  const byId = new Map(); const aliases = new Map(); const hidden = new Set();
  for (const input of packages) {
    const pkg = validatePackage(input, privatePolicies);
    if (byId.has(pkg.spec.id)) throw new Error("duplicate scenario id");
    byId.set(pkg.spec.id, pkg);
    if (input.privateProof) hidden.add(pkg.spec.id);
    for (const alias of input.aliases || []) {
      if (!alias || aliases.has(alias) || byId.has(alias)) throw new Error("duplicate scenario alias");
      aliases.set(alias, pkg.spec.id);
    }
  }
  return freeze({
    getScenario(id) { return byId.get(id) || byId.get(aliases.get(id)) || null; },
    listScenarios() { return [...byId.values()].filter((pkg) => !hidden.has(pkg.spec.id)).map(publicScenario); },
    allPackages() { return [...byId.values()]; },
  });
}

export const defaultRegistry = createScenarioRegistry([{ spec: specData, replies: repliesData, scoringProfile: CONFIG.missed_deadline,
  policy: { id: "sc01-legacy", version: 1, engine: sc01EnginePolicy, language: sc01Language, rules: sc01Rules }, aliases: ["deadline"] }]);
