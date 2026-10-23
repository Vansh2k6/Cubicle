// Explicit compatibility for existing SC-01 callers. Runtime never enters session JSON.
import * as core from "./engine.js";
import { sc01EnginePolicy, sc01Rules } from "../services/api/sc01EnginePolicy.js";
export { endSession, canonicalState, evaluateDoneWhen } from "./engine.js";
export const runtime = Object.freeze({ scenarioId: "missed_deadline", policyId: "sc01-legacy", policyVersion: 1,
  engine: sc01EnginePolicy, rules: sc01Rules });
function check(id, version, policy) {
  if (id !== "missed_deadline" || version !== 1 || (policy && (policy.id !== runtime.policyId || policy.version !== runtime.policyVersion))) throw new Error("unsupported SC-01 compatibility binding");
}
export const createSession = (spec, opts = {}) => {
  check(spec.id, spec.version, opts.runtime ? { id: opts.runtime.policyId, version: opts.runtime.policyVersion } : null);
  if (spec.scoring?.version !== 2) throw new Error("unsupported SC-01 compatibility binding");
  return core.createSession(spec, { ...opts, runtime: opts.runtime || runtime });
};
export const applyTurn = (session, npc, events, opts = {}) => { check(session.scenario_id, session.scenario_version, session.engine_policy); return core.applyTurn(session, npc, events, { ...opts, runtime: opts.runtime || runtime }); };
export const commitDelivery = (session, turn, opts = {}) => { check(session.scenario_id, session.scenario_version, session.engine_policy); return core.commitDelivery(session, turn, { ...opts, runtime: opts.runtime || runtime }); };
