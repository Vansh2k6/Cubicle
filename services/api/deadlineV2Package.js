// Supported production package; default activation is owned by the server registry.
import spec from "../../scenarios/missed_deadline.v2.json" with {type: "json"};
import replies from "../../replies/missed_deadline.v2.en.json" with {type: "json"};
import {normalizeScoringProfile} from "../../scoring/config.js";
import {FIXED_CAST, PHONE_BINDING} from "../../shared/presentation.js";
import {deadlineV2EnginePolicy, deadlineV2Rules, extractDeadlineV2, planSlots} from "./deadlineV2EnginePolicy.js";
import {deadlineV2Language, PLAN_REPLIES} from "../../llm/deadlineV2Language.js";
import {contentTokens} from "../../llm/languagePrimitives.js";

const offline = Object.freeze({
  classifyEvents(text, context) {return extractDeadlineV2({text, actorId: context?.actorId, activePlan: context?.activePlan}).events;},
  reply({system, messages = []}) {
    const match = /\nENGINE-BOUND PLAN REPLY: ("[^\n]+")$/.exec(String(system));
    if (match) {
      let text; try {text = JSON.parse(match[1]);} catch {return null;}
      if (Object.values(PLAN_REPLIES).includes(text)) return {text};
    }
    const act = /CURRENT MOVE:\s*([A-Za-z_]+)/.exec(String(system))?.[1];
    const actorId = /You are [^(]+\(([a-z0-9_]+)\)/.exec(String(system))?.[1];
    const latest = [...messages].reverse().find((row) => row?.role === "user")?.content;
    const fact = spec.facts.find((entry) => entry.owner === actorId && messages.some((row) => row?.role === "assistant" && row.content === entry.content.en));
    if (!fact || !["react_freely", "deflect_sealed"].includes(act) || typeof latest !== "string") return null;
    const priorTokens = new Set(contentTokens(fact.content.en));
    return contentTokens(latest).some((token) => priorTokens.has(token)) ? {text: fact.content.en} : null;
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
