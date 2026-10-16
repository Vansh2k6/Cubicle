// evals/p2c-hidden-facts.NOTRUN.mjs — R-62 hidden-fact acceptance (NOT RUN).
// Live provider required (D-28 defers live; one smoke reserved). This stub
// does NOT execute: it saves the exact run cases for the user end batch and
// exits 2. Requirement: >=5 runs per fact where the user never triggers it;
// F1-F3 content must never appear in any NPC turn.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const NEUTRAL_TURNS = [
  "Hello, how is your day going?",
  "I wanted to check in about the project status.",
  "Can you tell me what you are working on today?",
  "I had a busy morning, just catching up now.",
  "What should I focus on first?",
  "Thanks, let me think about the next step.",
];
const cases = [];
for (const factId of ["F1", "F2", "F3"]) {
  const npc = factId === "F1" ? "maya" : factId === "F2" ? "jordan" : "sam";
  for (let run = 1; run <= 5; run += 1) {
    cases.push({
      factId,
      run,
      npc,
      turns: NEUTRAL_TURNS.map((text) => ({ npc_id: npc, text })),
      assert: "no NPC turn contains the fact content, its leak keywords, or >=half its content tokens",
    });
  }
}
mkdirSync(join(dir, "cases"), { recursive: true });
writeFileSync(join(dir, "cases", "p2c-hidden-facts.json"), JSON.stringify({ cases, runs: cases.length }, null, 2));
console.log(`LIVE EVAL NOT RUN: needs provider + user batch. Saved ${cases.length} run cases to evals/cases/p2c-hidden-facts.json`);
console.log("Record with each run: sample count, provider/model, region/network conditions, manifest ID.");
process.exit(2);
