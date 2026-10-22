const complete = (goals, id) => goals.some((goal) => goal && goal.id === id && goal.status === "done");

// This projection deliberately accepts only the public checklist, public hint,
// current NPC, and ended state. Keep scenario facts and scoring out of it.
export function projectGuidance({ goals = [], currentNpc = null, hint = "", ended = false } = {}) {
  const g1 = complete(goals, "G1");
  const g2 = complete(goals, "G2");
  const g3 = complete(goals, "G3");
  let heading = "Start with Snehal";
  let description = "Own the delay and share an honest status with Snehal.";
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
    heading = "Check in with Vansh";
    description = "Ask Vansh what work remains and where support could help.";
    step = "02";
    question = "Ask Vansh what remains and where a teammate could help.";
  } else if (g1 && g2) {
    heading = "Return to Snehal";
    description = "Agree a next step with Snehal, then recap it together.";
    step = "03";
    question = "Ask Snehal about a workable next step, then recap what you agree.";
  }

  if (!ended && currentNpc === "sam") question = "Ask Prathamest for advice on how to approach the conversation.";
  return { heading, description, step, objective: description, question, hint: String(hint || "") };
}
