import spec from "../../scenarios/workplace_intimidation.json" with {type: "json"};
import replies from "../../replies/workplace_intimidation.en.json" with {type: "json"};
import {normalizeScoringProfile} from "../../scoring/config.js";
import {FIXED_CAST} from "../../shared/presentation.js";
import {hrRules, hrEngine, hrLanguage, hrOfflineEvents} from "./hrPolicy.js";
const offline = Object.freeze({classifyEvents: hrOfflineEvents, reply({system}) {
  const match = /\nHR-BOUND RESPONSE: ("[^\n]+")/.exec(String(system));
  if (!match) return null;
  try {return {text: JSON.parse(match[1])};} catch {return null;}
}});
export const hrPolicy = Object.freeze({id: "hr-reporting", version: 1, rules: hrRules, engine: hrEngine, language: hrLanguage, offline});
export function hrPackageInput() {
  return {spec: structuredClone(spec), replies: structuredClone(replies), scoringProfile: normalizeScoringProfile(spec),
    presentation: {...FIXED_CAST, hr: {sceneAnchor: "hr", voiceId: "en_US-ryan-medium"}}, policy: hrPolicy};
}
