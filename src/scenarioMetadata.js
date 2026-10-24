import {publicCast} from "../shared/presentation.js";

// Accept only the public metadata union; a phone binding never carries an anchor.
export function parseScenarioMetadata(data) {
  if (!data || typeof data.id !== "string" || !data.id || typeof data.title !== "string" || typeof data.briefing !== "string" || !Array.isArray(data.npcs) || !Array.isArray(data.goals)) throw new Error("Practice details are unavailable.");
  const bindings = Object.fromEntries(data.npcs.map((actor) => {
    if (!actor || ["id", "name", "role"].some((key) => typeof actor[key] !== "string" || !actor[key]) || ["__proto__", "constructor", "toString"].includes(actor.id)) throw new Error("Invalid practice contact.");
    const keys = actor.contactMode === "phone" ? ["id", "name", "role", "contactMode", "voiceId"] : ["id", "name", "role", "sceneAnchor", "voiceId"];
    if (Object.keys(actor).some((key) => !keys.includes(key)) || keys.some((key) => !Object.hasOwn(actor, key))) throw new Error("Invalid practice contact.");
    return [actor.id, actor.contactMode === "phone" ? {contactMode: actor.contactMode, voiceId: actor.voiceId} : {sceneAnchor: actor.sceneAnchor, voiceId: actor.voiceId}];
  }));
  const goals = data.goals.map((goal) => {
    if (!goal || typeof goal.id !== "string" || typeof goal.label !== "string" || !Array.isArray(goal.requires) || goal.requires.some((id) => typeof id !== "string")) throw new Error("Invalid practice goals.");
    return {id: goal.id, label: goal.label, requires: [...goal.requires]};
  });
  return {id: data.id, title: data.title, briefing: data.briefing, goals, npcs: publicCast(data.npcs, bindings)};
}
