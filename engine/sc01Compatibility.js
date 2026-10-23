// Explicit compatibility for existing SC-01 callers. Runtime never enters session JSON.
import * as core from "./engine.js";
import { sc01EnginePolicy, sc01Rules } from "../services/api/sc01EnginePolicy.js";
export { endSession, canonicalState, evaluateDoneWhen } from "./engine.js";
export const runtime = Object.freeze({ scenarioId: "missed_deadline", policyId: "sc01-legacy", policyVersion: 1,
  engine: sc01EnginePolicy, rules: sc01Rules });
export const createSession = (spec, opts = {}) => core.createSession(spec, { ...opts, runtime: opts.runtime || runtime });
export const applyTurn = (session, npc, events, opts = {}) => core.applyTurn(session, npc, events, { ...opts, runtime: opts.runtime || runtime });
export const commitDelivery = (session, turn, opts = {}) => core.commitDelivery(session, turn, { ...opts, runtime: opts.runtime || runtime });
