// evals/p2c-latency.NOTRUN.mjs — Guarded-turn latency measurement (NOT RUN).
// Live provider required (D-28 defers live). Saves the run script for the
// user batch, exits 2. Requirement: >=30 guarded text turns on a scripted
// conversation; report p50/p95 end-to-end including guard regeneration, with
// and without retries/fallbacks reported separately. Targets (not results):
// p50 < 3.5s, p95 < 5s.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const scriptedTurns = [
  { npc_id: "maya", text: "Hi Maya, thanks for making time." },
  { npc_id: "maya", text: "I owe you an honest update on the project." },
  { npc_id: "maya", text: "I underestimated the final review and should have flagged the delay sooner." },
  { npc_id: "maya", text: "Is there any flexibility on the deadline?" },
  { npc_id: "maya", text: "What happens if this slips?" },
  { npc_id: "jordan", text: "Hey Jordan, what is left on your side?" },
  { npc_id: "jordan", text: "Can you help me figure out the remaining work?" },
  { npc_id: "jordan", text: "Could we pair for an afternoon on the hard parts?" },
  { npc_id: "maya", text: "I can deliver Friday and will own the delay." },
  { npc_id: "maya", text: "To recap: I will deliver Friday and check in at noon. Does that work?" },
];
while (scriptedTurns.length < 30) {
  scriptedTurns.push(
    { npc_id: "maya", text: "Just confirming our plan still stands." },
    { npc_id: "jordan", text: "Thanks for the help so far." },
    { npc_id: "sam", text: "Hi Sam, quick check-in on team norms." },
  );
}
const plan = {
  turns: scriptedTurns.slice(0, 30),
  measure: "submit -> complete guarded reply delivery per turn (server _debug.stages + latencyMs)",
  report: {
    p50_all: "median over all 30 turns",
    p95_all: "p95 over all 30 turns",
    with_retries: "turns with regen=true or fallback non-null, listed separately",
    without_retries: "clean turns, listed separately",
    context: "sample count, provider/model, warm/cold, region/network conditions, manifest ID, fallback rate",
  },
  targets: { p50_s: 3.5, p95_s: 5.0 },
};
mkdirSync(join(dir, "cases"), { recursive: true });
writeFileSync(join(dir, "cases", "p2c-latency.json"), JSON.stringify(plan, null, 2));
console.log("LIVE EVAL NOT RUN: needs provider + user batch. Saved plan to evals/cases/p2c-latency.json");
console.log("Run with the API in debug mode (npm run api:debug) and record _debug.stages per turn.");
process.exit(2);
