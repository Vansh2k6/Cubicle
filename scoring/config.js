import spec from "../scenarios/missed_deadline.json" with { type: "json" };
const freeze = (value) => {
  if (value && typeof value === "object") { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
};

// The authored spec is the sole source of weights, allocations and penalties.
export function normalizeScoringProfile(scenario) {
  const s = scenario.scoring;
  return freeze({ scoring_version: s.version, weights: { ...s.weights }, penalties: { ...s.penalties },
    goals: Object.fromEntries(scenario.goals.map((g) => [g.id, g.weight])),
    facts: Object.fromEntries(scenario.facts.map((f) => [f.id, f.weight])),
    bands: structuredClone(s.bands), relationship_population: s.relationship_population });
}
export const CONFIG = freeze({ missed_deadline: normalizeScoringProfile(spec) });
