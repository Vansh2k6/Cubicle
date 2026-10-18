// Reusable offline full-pipeline bot runner. All inputs are synthetic.
import { readFileSync } from "node:fs";
import * as engine from "../engine/engine.js";
import { createConversation, runTurn, publicResponse } from "../llm/pipeline.js";
import { npcFn } from "../services/api/offlineProviders.js";
export const scenario = JSON.parse(readFileSync(new URL("../scenarios/missed_deadline.json", import.meta.url), "utf8"));
export async function runBot(steps, { sliders, npc = npcFn, session = engine.createSession(scenario, { seed: 7, sliders }) } = {}) {
  const convo = createConversation(), results = [];
  for (const [npcId, text, events] of steps) {
    const result = await runTurn({ session, scenario, convo, npcId, text, engine,
      providers: { classify: async () => ({ text: JSON.stringify({ events }) }), npc }, manifestId: "synthetic-s1-07" });
    results.push({ ...result, public: publicResponse(result) });
    if (session.ended) break;
  }
  return { session, convo, results };
}
