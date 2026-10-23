// Pure language boundary. Runtime identity is session-bound by the server, never selected by user text.
import {sc01Language} from "./sc01Language.js";
export function resolveLanguage(scenario, runtime, locale = "en") {
  if (!scenario || locale !== "en" || !scenario.locales?.includes(locale)) throw new Error("unsupported language context");
  if (runtime !== undefined) {
    if (!runtime || runtime.scenarioId !== scenario.id || runtime.identity?.scenarioId !== scenario.id || runtime.identity?.contentVersion !== scenario.version || runtime.policyId !== runtime.identity.policyId || runtime.policyVersion !== runtime.identity.policyVersion || JSON.stringify(runtime.spec) !== JSON.stringify(scenario) || !runtime.language || ["publicCanonLines", "normalizeCommitment", "canonCheck"].some((key) => typeof runtime.language[key] !== "function")) throw new Error("mismatched language context");
    return runtime.language;
  }
  // Existing hand-written SC-01 callers are the sole legacy adapter; unknown ids never inherit it.
  if (scenario.id !== "missed_deadline" || scenario.version !== 1) throw new Error("unsupported legacy language context");
  return sc01Language;
}
export function publicLanguageInput(scenario, npcId) {
  const actor = scenario.npcs.find((npc) => npc.id === npcId);
  if (!actor) throw new Error("unknown language actor");
  return structuredClone({publicCanon: scenario.canon?.public || {}, actorPublicContext: actor.public_context, publicCast: [...scenario.npcs, ...(scenario.player ? [scenario.player] : [])].map(({id, name, role}) => ({id, name, role}))});
}
export function checkLanguageCanon(language, input) {
  try {
    const findings = language.canonCheck(structuredClone(input));
    if (!Array.isArray(findings) || findings.some((finding) => !finding || typeof finding.code !== "string" || !/^canon_[a-z_]+$/.test(finding.code) || (finding.factId !== undefined && typeof finding.factId !== "string"))) return [{code: "canon_policy_invalid"}];
    return findings.map(({code, factId}) => ({code, ...(factId ? {factId} : {})}));
  } catch { return [{code: "canon_policy_invalid"}]; }
}
