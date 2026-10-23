import {sc01Guidance} from "../shared/sc01Guidance.js";

// Inputs are public checklist/metadata only. The default is the existing direct SC-01 compatibility entry.
export function projectGuidance({scenarioId = "missed_deadline", goals = [], currentNpc = null, hint = "", ended = false, npcs} = {}) {
  if (scenarioId === "missed_deadline") return sc01Guidance({goals, currentNpc, hint, ended, ...(npcs ? {npcs} : {})});
  const pending = goals.find((goal) => goal?.status !== "done" && !goal?.locked);
  const complete = goals.length > 0 && goals.every((goal) => goal?.status === "done");
  const description = ended ? "Your practice has ended. View your debrief or continue exploring." : String(hint || pending?.label || "Check the visible goals before choosing a next step.");
  return {heading: ended ? "Practice has ended" : complete ? "Ready to reflect" : "Next step", description,
    step: String(Math.min(goals.filter((goal) => goal?.status === "done").length + 1, Math.max(goals.length, 1))).padStart(2, "0"),
    objective: description, question: ended ? "" : "What should I clarify before taking the next step?", hint: String(hint || "")};
}
