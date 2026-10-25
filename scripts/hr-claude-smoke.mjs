// One bounded, explicitly authorized test phase. Budget is shared with the HR preview.
import {mkdirSync, writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createAnthropicProvider} from "../llm/providers/anthropic.js";
if (process.env.RUN_LIVE !== "1" || !process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error("Live HR smoke requires RUN_LIVE=1 and a server-side ANTHROPIC_API_KEY."); process.exit(1);
}
const key = process.env.ANTHROPIC_API_KEY;
process.env.LLM_PROVIDER = "offline";
delete process.env.GROQ_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
process.env.VOICE_ENABLED = "0";
mkdirSync(new URL("../out/", import.meta.url), {recursive: true});
const provider = createAnthropicProvider({apiKey: key, budgetPath: fileURLToPath(new URL("../out/claude-hr-testing.json", import.meta.url)), maxUsd: 0.50});
const {createServer} = await import("../services/api/server.js");
const {server} = createServer({debug: true, hrProvider: provider});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`, report = {model: "claude-haiku-5-5", turns: []};
try {
  const post = async (path, body) => {
    const response = await fetch(base + path, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
    if (!response.ok) throw new Error("Local HR test request failed");
    return response.json();
  };
  const session = await post("/sessions", {scenario_id: "workplace_intimidation"});
  for (const [npc_id, text] of [
    ["hr", "Snehal repeatedly shuts me down in meetings, excluded me from planning and then criticized me for missing context. I need help finding a safer way to work."],
    ["hr", "Yes, please do that."],
    ["jordan", "She talks over me in meetings and I was excluded from planning. I want to separate what happened from my assumptions."],
    ["sam", "Can you help me decide what support would make it easier to continue working?"],
  ]) {
    const result = await post(`/sessions/${encodeURIComponent(session.session_id)}/turn`, {npc_id, text});
    report.turns.push({npc: npc_id, reply: result.npc_reply, goals: result.public_state.goals, ended: result.ended,
      source: result._debug?.source, failure: result._debug?.npcFailure, latencyMs: result._debug?.latencyMs});
    // Stop rather than repeatedly spending when authentication/provider setup fails.
    if (["PROVIDER_ERROR", "LLM_BUDGET_EXCEEDED", "PROVIDER_UNAVAILABLE"].includes(result._debug?.npcFailure)) break;
    if (result.ended) {
      for (let n = 0; n < 50; n++) {
        const feedback = await (await fetch(base + `/sessions/${encodeURIComponent(session.session_id)}/debrief`)).json();
        if (feedback.debrief) {report.debrief = {status: feedback.status, goals: feedback.debrief.breakdown.find((row) => row.id === "goals")?.points}; break;}
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      break;
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
  // Give already-dispatched requests time to update their persistent reservations.
  await new Promise((resolve) => setTimeout(resolve, 8500));
  const budget = provider.budget();
  report.budget = budget;
  writeFileSync(new URL("../out/hr-claude-smoke.json", import.meta.url), JSON.stringify(report, null, 2));
  const calculatedUsd = budget?.ledger.reduce((sum, row) => sum + (row.calculatedUsd || 0), 0) || 0;
  const uncertainUsd = budget?.ledger.reduce((sum, row) => sum + (row.uncertainUsd || 0), 0) || 0;
  console.log(JSON.stringify({model: report.model, playerTurns: report.turns.length, goalsComplete: report.turns.at(-1)?.ended || false,
    paidRequests: budget?.calls || 0, calculatedUsd, uncertainUsd, reservedUsd: budget?.reservedUsd || 0, capUsd: 0.50}));
}
