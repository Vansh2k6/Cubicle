// Engine-only supported production-policy seam. No language/offline provider,
// catalogue registration or session route is available until DS02/DS04.
import {createHash} from "node:crypto";
import specData from "../../scenarios/missed_deadline.v2.json" with {type: "json"};
import repliesData from "../../replies/missed_deadline.v2.en.json" with {type: "json"};
import {validateScenario} from "../../engine/scenarioValidator.js";
import {normalizeScoringProfile} from "../../scoring/config.js";
import {publicCast, FIXED_CAST, PHONE_BINDING} from "../../shared/presentation.js";
import {deadlineV2EnginePolicy, deadlineV2Rules} from "./deadlineV2EnginePolicy.js";
const freeze = (value) => {if (value && typeof value === "object") {Object.values(value).forEach(freeze); Object.freeze(value);} return value;};
const canonical = (v) => v && typeof v === "object" ? Array.isArray(v) ? `[${v.map(canonical)}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)}}` : JSON.stringify(v);
export function loadDeadlineV2EngineContext() {
  const spec = structuredClone(specData), replies = structuredClone(repliesData), rules = structuredClone(deadlineV2Rules);
  const validation = validateScenario(spec);
  if (!validation.ok) throw new Error(`Invalid supported deadline v2 context: ${validation.errors.map((e) => e.code).join(",")}`);
  const presentation = {...FIXED_CAST, client: PHONE_BINDING};
  publicCast(spec.npcs, presentation);
  const scoringProfile = normalizeScoringProfile(spec);
  const identity = {scenarioId: spec.id, contentVersion: 2, schemaVersion: 2, policyId: "deadline-v2", policyVersion: 1, scoringVersion: 3,
    contentHash: createHash("sha256").update(canonical({spec, replies, rules, presentation, scoringProfile})).digest("hex")};
  return freeze({scenarioId: spec.id, policyId: identity.policyId, policyVersion: identity.policyVersion, schemaVersion: 2,
    spec, identity, rules, engine: deadlineV2EnginePolicy, scoringProfile, replies, presentation});
}
