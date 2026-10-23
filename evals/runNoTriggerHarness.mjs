// evals/runNoTriggerHarness.mjs — R-62 offline harness (S1-04 P2b).
// node evals/runNoTriggerHarness.mjs [N]
// Plays the scenario for N>=5 runs WITHOUT touching any trigger and asserts
// F1-F3 content/keywords never appear in any delivered NPC turn. Runs against
// a "tempted-to-leak" provider that stuffs every NPC reply with sealed
// material, proving the guards (not the generator) keep the transcript clean.
// Offline, stdlib only. Exit non-zero on any violation.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as engine from "../engine/sc01Compatibility.js";
import { createConversation, runTurn } from "../llm/pipeline.js";
import { normalize } from "../llm/guards.js";

const dir = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(dir, "..", "scenarios", "missed_deadline.json"), "utf8"));

const N = Math.max(5, Number(process.argv[2] || 8));

const TEMPTED_NPC_TEXT =
  "Maya here. The client hard cutoff is Friday in 3 days, and Jordan's reusable module covers half the work. " +
  "Also same-day heads-up is our norm and will not affect review. Let us meet Monday, deal locked in.";

// Tempted provider: classifier never fires a trigger; generator always leaks.
function temptedProvider() {
  return {
    classify: async () => ({ text: JSON.stringify({ events: [], clarify: [] }), tokens: { in: 0, out: 0 } }),
    npc: async () => ({ text: TEMPTED_NPC_TEXT, tokens: { in: 0, out: 0 } }),
  };
}

// Benign, trigger-free user script rotating across NPCs.
const USER_TURNS = [
  ["maya", "Hello. I wanted to check in about the project."],
  ["jordan", "Hi. How is your day going?"],
  ["sam", "Hey. Can we chat for a minute?"],
  ["maya", "I wanted to say I own the delay on my side."],
  ["jordan", "What are you working on today?"],
  ["sam", "Thanks for making time."],
];

function sealedPhrases() {
  const out = [];
  for (const f of scenario.facts) {
    for (const k of (f.leak_keywords.en || [])) out.push(normalize(k));
  }
  return out;
}
const PHRASES = sealedPhrases();

let violations = 0;
let fallbacks = 0;
for (let run = 0; run < N; run++) {
  const session = engine.createSession(scenario, { seed: 1000 + run, locale: "en" });
  const convo = createConversation();
  const providers = temptedProvider();
  for (const [npcId, text] of USER_TURNS) {
    const res = await runTurn({ session, scenario, convo, npcId, text, engine, providers, manifestId: "harness" });
    if (res.usedFallback || res.regen) fallbacks += 1;
    const norm = normalize(res.reply);
    for (const p of PHRASES) {
      if (p.length >= 4 && norm.includes(p)) {
        console.error(`RUN ${run} VIOLATION (${npcId}): reply contains ${JSON.stringify(p)}: ${res.reply}`);
        violations += 1;
      }
    }
    if (session.user_known.length > 0) {
      console.error(`RUN ${run} VIOLATION: user_known non-empty: ${JSON.stringify(session.user_known)}`);
      violations += 1;
    }
    for (const f of scenario.facts) {
      if (session.facts[f.id].status === "revealed") {
        console.error(`RUN ${run} VIOLATION: ${f.id} marked revealed without trigger`);
        violations += 1;
      }
    }
  }
}

console.log(`runs=${N} turns_per_run=${USER_TURNS.length} guarded_turns=${fallbacks} violations=${violations}`);
if (violations > 0) {
  console.log("R-62 HARNESS: FAIL");
  process.exit(1);
} else {
  console.log("R-62 HARNESS: PASS — F1-F3 never appeared in any NPC turn across all runs");
}
