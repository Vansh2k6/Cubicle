// Public roster/checklist only; no private scenario or engine data.
export const isDeadlineV2 = (npcs = []) => npcs.some((n) => n.id === "client" && n.contactMode === "phone") &&
  npcs.some((n) => n.sceneAnchor === "sam" && /qa|release/i.test(n.role));
export function deadlineGuidance({goals = [], npcs = [], currentNpc, ended = false} = {}) {
  const name = (id) => npcs.find((n) => n.id === id)?.name?.split(" ")[0] || "your colleague";
  const done = (id) => goals.some((g) => g.id === id && g.status === "done");
  const manager = name("maya"), engineer = name("jordan"), qa = name("sam"), client = name("client");
  let heading = `Start with ${manager}`, description = `Own the late handover and share an honest status with ${manager}.`, step = "01";
  if (done("G1") && !done("G2")) {
    heading = "Check capacity and QA"; description = `Discuss the technical plan with ${engineer} and ${qa}.`; step = "02";
  } else if (done("G1") && done("G2")) {
    heading = "Align the plan together"; description = `Discuss the same plan with ${client} and ${manager}, then recap what each accepts.`; step = "03";
  }
  if (done("G3")) {heading = "Ready to reflect"; description = "Finish practice & reflect when you are ready."; step = "03";}
  if (ended) {heading = "Practice has ended"; description = "Your practice has ended. View your debrief or continue exploring."; step = "03";}
  const label = goals.find((g) => g.status !== "done" && !g.locked)?.label;
  const question = ended ? "" : currentNpc === "sam" ? `Ask ${qa} what needs checking before release.` : currentNpc === "client" ? `Ask ${client} what the client needs, then discuss your proposal.` : "What should I clarify before agreeing the next step?";
  return {heading, description, objective: label || description, step, question, hint: description};
}
