// Explicit v2 engine/language test seam. Uses the registry identity recipe;
// the production default remains v1 until DS04.
import {createScenarioRegistry} from "./scenarioRegistry.js";
import {deadlineV2PackageInput} from "./deadlineV2Package.js";
export function loadDeadlineV2EngineContext() {
  const pkg = createScenarioRegistry([deadlineV2PackageInput()]).getScenario("missed_deadline");
  return Object.freeze({scenarioId: pkg.spec.id, policyId: pkg.policy.id, policyVersion: pkg.policy.version,
    schemaVersion: pkg.identity.schemaVersion, spec: pkg.spec, identity: pkg.identity,
    rules: pkg.policy.rules, engine: pkg.policy.engine, language: pkg.policy.language,
    scoringProfile: pkg.scoringProfile, replies: pkg.replies, presentation: pkg.presentation});
}
