// Reusable offline full-pipeline bot runner. All inputs are synthetic.
import { defaultRegistry } from "../services/api/scenarioRegistry.js";
import * as engine from "../engine/sc01Compatibility.js";
import { createConversation, runTurn, publicResponse } from "../llm/pipeline.js";
import { npcFn } from "../services/api/offlineProviders.js";
const pkg = defaultRegistry.getScenario("missed_deadline");
export const scenario = pkg.spec;
export const scoringProfile = pkg.scoringProfile;
export async function runBot(steps, { sliders, npc = npcFn, session = engine.createSession(scenario, { seed: 7, sliders }) } = {}) {
  session.identity ??= pkg.identity;
  const convo = createConversation(), results = [];
  for (const [npcId, text, events] of steps) {
    const result = await runTurn({ session, scenario, convo, npcId, text, engine,
      providers: { classify: async () => ({ text: JSON.stringify({ events }) }), npc }, manifestId: "synthetic-s1-07" });
    results.push({ ...result, public: publicResponse(result) });
    if (session.ended) break;
  }
  return { session, convo, scenario, scoringProfile, identity: session.identity, results };
}
