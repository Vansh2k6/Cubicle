// Synthetic scripted practice data only; no real user transcripts.
export const ev = (type, params = {}) => ({ type, params });
export const smart = [
  ["maya", "I own the delay and the work is unfinished.", [ev("took_ownership"), ev("gave_honest_status")]],
  ["maya", "Is there flexibility on the deadline?", [ev("asked_deadline_flexibility")]],
  ["maya", "What happens if it slips?", [ev("asked_impact")]],
  ["jordan", "What is left?", [ev("asked_requirement_details")]],
  ["jordan", "Can you help?", [ev("asked_for_help")]],
  ["jordan", "Could you help me with that?", [ev("asked_for_help")]],
  ["jordan", "I accept your help.", [ev("confirmed_next_steps", { help_accepted: true })]],
  ["maya", "Jordan built a module covering half the remaining work.", [ev("relayed_fact", { fact_id: "F2", accurate: true })]],
  ["maya", "I will deliver Thursday.", [ev("committed_deadline", { day: 2 })]],
  ["maya", "To recap, I will deliver Thursday.", [ev("recapped_agreement")]],
];
export const trap = [
  ["maya", "I will deliver tomorrow.", [ev("committed_deadline", { day: 1 })]],
  ["jordan", "Hello.", [ev("greeted")]],
  ["jordan", "Thanks.", []],
  ["jordan", "Understood.", []],
  ["maya", "I am back.", []],
];
