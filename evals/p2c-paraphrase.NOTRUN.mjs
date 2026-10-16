// evals/p2c-paraphrase.NOTRUN.mjs — Reveal-on-paraphrase acceptance (NOT RUN).
// Live provider required (D-28 defers live). Saves cases for the user batch,
// exits 2. Paraphrases: "Is there any flexibility on the deadline?",
// "When do you actually need it by?", "What happens if this slips?" -> F1
// reveals under the right forthcomingness; second ask works at moderate
// forthcomingness.
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const cases = [
  {
    id: "paraphrase-high",
    npc: "maya",
    sliders: { maya: { forthcomingness: 85 } },
    turns: [
      "Hi Maya, can we talk about the timeline?",
      "Is there any flexibility on the deadline?",
    ],
    assert: "F1 revealed (delivered + user-known) on the first probe at high forthcomingness",
  },
  {
    id: "paraphrase-moderate-first",
    npc: "maya",
    sliders: { maya: { forthcomingness: 50 } },
    turns: ["When do you actually need it by?"],
    assert: "F1 NOT revealed on the first probe at moderate forthcomingness (deflect_sealed)",
  },
  {
    id: "paraphrase-moderate-second",
    npc: "maya",
    sliders: { maya: { forthcomingness: 50 } },
    turns: ["When do you actually need it by?", "What happens if this slips?"],
    assert: "F1 revealed on the second probe at moderate forthcomingness",
  },
];
mkdirSync(join(dir, "cases"), { recursive: true });
writeFileSync(join(dir, "cases", "p2c-paraphrase.json"), JSON.stringify({ cases }, null, 2));
console.log("LIVE EVAL NOT RUN: needs provider + user batch. Saved cases to evals/cases/p2c-paraphrase.json");
console.log("Record with each run: sample count, provider/model, region/network conditions, manifest ID.");
process.exit(2);
