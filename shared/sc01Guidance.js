// Explicit SC-01 presentation adapter. Public copy only; no private package imports.
const complete = (goals, id) => goals.some((goal) => goal && goal.id === id && goal.status === "done");

// This projection deliberately accepts only the public checklist, public hint,
// current NPC, and ended state. Keep scenario facts and scoring out of it.
export function sc01Guidance({ goals = [], currentNpc = null, hint = "", ended = false, npcs = [{id: "maya", name: "Snehal"}, {id: "jordan", name: "Vansh"}, {id: "sam", name: "Prathamesh"}] } = {}) {
  const name = (id) => npcs.find((npc) => npc.id === id)?.name?.split(" ")[0] || "your colleague";
  const manager = name("maya"), teammate = name("jordan"), adviser = name("sam");
  const g1 = complete(goals, "G1");
  const g2 = complete(goals, "G2");
  const g3 = complete(goals, "G3");
  let heading = `Start with ${manager}`;
  let description = `Own the delay and share an honest status with ${manager}.`;
  let step = "01";
  let question = "Try naming the delay and sharing the status you can confirm.";

  if (ended) {
    heading = "Practice has ended";
    description = "Your practice has ended. View your debrief or continue exploring.";
    step = "03";
    question = "";
  } else if (g1 && g2 && g3) {
    heading = "Ready to reflect";
    description = "Finish practice & reflect when you are ready.";
    step = "03";
    question = "Summarize what you agreed, then finish practice when you are ready.";
  } else if (g1 && !g2) {
    heading = `Check in with ${teammate}`;
    description = `Ask ${teammate} what work remains and where support could help.`;
    step = "02";
    question = `Ask ${teammate} what remains and where a teammate could help.`;
  } else if (g1 && g2) {
    heading = `Return to ${manager}`;
    description = `Agree a next step with ${manager}, then recap it together.`;
    step = "03";
    question = `Ask ${manager} about a workable next step, then recap what you agree.`;
  }

  if (!ended && currentNpc === "sam") question = `Ask ${adviser} for advice on how to approach the conversation.`;
  return { heading, description, step, objective: description, question, hint: String(hint || "") };
}

export function sc01NextHint(goals, npcs = [{id: "maya", name: "Snehal"}, {id: "jordan", name: "Vansh"}]) {
  const name = (id) => npcs.find((npc) => npc.id === id)?.name?.split(" ")[0] || "your colleague";
  const done = (id) => !!(goals[id] && goals[id].status === "done");
  if (done("G3")) return "Nice work — wrap up and reflect on the conversation.";
  if (done("G1") && done("G2")) return `Go back to ${name("maya")} and agree a plan.`;
  if (done("G1")) return `Check in with ${name("jordan")} about what's left.`;
  return `Talk to ${name("maya")} about the missed deadline.`;
}
