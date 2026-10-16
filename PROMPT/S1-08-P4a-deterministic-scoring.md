# S1-08 — P4a Deterministic scoring and timeline flags (HUMAN STOP on one item)

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P4.1, P4.4. **Entry:** S1-07 accepted; recorded session fixtures can be produced by the scripted-bot runner.
**Goal:** exact, repeatable, explainable points for everything code can judge, with every point tied to a source. No LLM in this part.
**Read first:** ARCHITECTURE §11; RULES R-20, R-22, R-24, R-26, R-27; DECISIONS D-07, D-24; PRD §8.

## Ask the human first (HUMAN STOP)

**Relationship averaging population.** ARCHITECTURE §11.1 averages relationship improvement over **scenario NPCs**. A player who never visits Sam leaves Sam at zero improvement, which pulls the average down. Deterministic points max out at 75; the rubric adds ≤25. Options: (a) average over all three NPCs (as written); (b) average only over NPCs the user spoke to at least once; (c) weight Maya only. Show the smart-path subtotal under each option using the fixtures, and recommend one. Until decided, implement (a) behind a config switch and mark it provisional. Any change needs a DECISIONS entry and a `scoring_version` bump (R-27).

## Contract

- **Metric registry:** plugins `(session_record) → {points, evidence[]}` with ids, caps and weights from the scenario config (R-26); weights and `scoring_version` written into the result.
- **Source allocation ledger:** every point or penalty references `{metric, source_id}`; reprocessing is idempotent; duplicates are listed as **excluded** with the reason.
- **Metrics:**
  - **Goals (30):** weights 10/10/10 awarded once per completed goal.
  - **Hidden facts (20):** 8/7/5, only for facts **delivered** (guarded line committed). Debrief-only disclosure earns nothing.
  - **Integrity (15):** start 15; −8 per unrealistic commitment under the model; −4 per contradicted commitment without explanation; −3 per **validated** inaccurate relay; floor 0; **no** extra `overpromised` penalty for the same commitment; callbacks never re-penalise.
  - **Relationship (10):** replay mood from each configured starting mood using only events **not** allocated to goal/fact/integrity credit; `10 × clamp((final − start)/(100 − start), 0, 1)` per NPC; averaged per the decision above.
  - **Rubric (25):** reserved for S1-09; report it as "pending" here.
- **Flags from code (R-24):** `premature_commitment`, `missed_probe`, `constructive_pushback`, `broken_promise`, `great_recap`, `inaccurate_relay`, `ignored_npc_redirect`, each with `turn_id`. Define the minimal rule for `missed_probe` (for example: the user spoke with a fact's owner for ≥1 turn and never fired a trigger) and report it for confirmation.
- **Top-2 priorities:** the two moments with the largest point loss, computed from the ledger (lost credit and penalties).
- Scoring is a **pure function** of the session record (events log, ledger, snapshots).

## Test plan (offline, fixtures from the scripted-bot runner)

1. **Exact breakdown fixtures:** smart path and trap path produce the exact expected points per metric (write the expected numbers by hand from the contract before running).
2. **Idempotence:** score the same record twice, and after re-ingesting the same events → identical output; no double credit.
3. **Duplicate-penalty exclusion:** unrealistic commitment plus an engine-derived `overpromised` plus a callback → one −8, with excluded items listed.
4. **Undelivered reveal** → 0 fact credit; failed-guard fallback → 0; delivered after a retry → credited once.
5. **Debrief-only disclosure** of a missed fact → no credit, no change to earlier snapshots.
6. **Revision:** first commitment penalised once; the superseding realistic one is not; recap of the new ID needed for G3 credit.
7. **Integrity floor** at 0; **relationship edge cases:** start already 100, no improvement, negative change clamps to 0.
8. **Caps/property test:** no metric exceeds its cap; deterministic sum ≤ 75; with rubric pending, total ≤ 100.
9. **Relationship exclusion test:** an ownership event that earned G1 does not also earn relationship points, while it still moved live mood.
10. **Flags:** each flag fires on its fixture with the right `turn_id` and not on the other path; flags never come from an LLM.
11. **Version bump:** results carry `scoring_version`; a test fails if weights change without a version change.
12. Full offline suite green.

## Review focus
R-22 credit-source rule; no LLM calls; ledger readability; constants in config; no silent rounding; the averaging switch default recorded as provisional.

## Stop and ask
Any weight or penalty change; any new flag beyond the list.

## Gate / exit
Exact fixtures pass; idempotent; the human's relationship decision recorded (or the provisional default listed). Report the smart/trap **deterministic** subtotals and the room left for the rubric; do not claim the ≥85 / <50 targets yet.
