// SC-01 scoring contract v2 implements D-24 and D-29; weights remain unchanged.
export const CONFIG = Object.freeze({
  missed_deadline: Object.freeze({ scoring_version: 2,
    weights: Object.freeze({ goals: 30, hidden_facts: 20, integrity: 15, relationship: 10, rubric: 25 }),
    penalties: Object.freeze({ unrealistic_commitment: 8, contradicted_commitment: 4, inaccurate_relay: 3 }),
    goals: Object.freeze({ G1: 10, G2: 10, G3: 10 }),
    facts: Object.freeze({ F1: 8, F2: 7, F3: 5 }),
    bands: Object.freeze([{ minimum: 85, label: "Excellent" }, { minimum: 70, label: "Strong" },
      { minimum: 50, label: "Developing" }, { minimum: 0, label: "Needs work" }].map(Object.freeze)),
    relationship_population: "all_scenario_npcs",
  }),
});
