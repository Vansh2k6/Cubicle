// Supported, unpublished production package. DS04 alone changes the default.
import spec from "../../scenarios/missed_deadline.v2.json" with {type: "json"};
import replies from "../../replies/missed_deadline.v2.en.json" with {type: "json"};
import {normalizeScoringProfile} from "../../scoring/config.js";
import {FIXED_CAST, PHONE_BINDING} from "../../shared/presentation.js";
import {deadlineV2EnginePolicy, deadlineV2Rules, extractDeadlineV2, planSlots} from "./deadlineV2EnginePolicy.js";
import {deadlineV2Language, PLAN_REPLIES} from "../../llm/deadlineV2Language.js";

const offline = Object.freeze({
  classifyEvents(text, context) {return extractDeadlineV2({text, actorId: context?.actorId, activePlan: context?.activePlan}).events;},
  reply({system}) {
    const match = /\nENGINE-BOUND PLAN REPLY: ("[^\n]+")$/.exec(String(system));
    if (!match) return null;
    let text; try {text = JSON.parse(match[1]);} catch {return null;}
    return Object.values(PLAN_REPLIES).includes(text) ? {text} : null;
  },
});
function freezeData(value) {
  if (value && typeof value === "object") {Object.values(value).forEach(freezeData); Object.freeze(value);}
  return value;
}
freezeData(deadlineV2Rules);
export const deadlineV2Policy = Object.freeze({id: "deadline-v2", version: 1, rules: deadlineV2Rules,
  engine: deadlineV2EnginePolicy, language: deadlineV2Language, offline});
export function deadlineV2PackageInput() {
  return {spec: structuredClone(spec), replies: structuredClone(replies), scoringProfile: normalizeScoringProfile(spec),
    presentation: {...FIXED_CAST, client: PHONE_BINDING}, policy: deadlineV2Policy,
    privateSources: {routeSlots: [planSlots("full"), planSlots("phased")], acknowledgementTexts: {...PLAN_REPLIES}}};
}
