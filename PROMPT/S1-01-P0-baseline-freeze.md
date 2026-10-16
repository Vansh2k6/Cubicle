# S1-01 — P0 Baseline freeze (HUMAN STOP part)

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P0.2, P0.3, P0.4, P0.5 (P0.1 is already `[x]`).
**Goal:** make the docs match reality, get the human's blocking decisions, and freeze a validated SC-01 spec so the engine has something to build against.
**Read first:** all six `/CONTEXT` documents; `src/main.js`, `src/office.js`, `index.html`, `package.json`; `DECISIONS.md` D-12, D-22–D-26, O-06; `PRD.md` §SC-01; `ARCHITECTURE.md` §4 and §6.5.

## Step 1 — Decision packet (no code yet)

Prepare one packet and **ask the human, then wait**. Do not decide for them. For each item give 2–3 options, trade-offs, a recommendation, and what it blocks.

1. **P0.2 Provider and models per role** (classifier, NPC generator, judge, coach). Constraints: provider-agnostic interface, JSON/structured output, temperature control, latency target p50 < 3.5 s / p95 < 5 s per guarded turn (D-23), budget unknown. Keys are set server-side by the human; never ask for them in chat. Record in DECISIONS.md under O-06. If the human defers, leave P0.2 unchecked and say that P2 cannot start.
2. **P0.3 SC-01 content and constants.** Show the proposed fixture (clock Tue 2026-10-13 Asia/Kolkata day 0, Friday day 3; unassisted min day 3; assisted min day 2 only after F2 is delivered **and** help is accepted with Jordan; cutoff day 3 owned by Maya; goals G1–G3 with weights 10/10/10; F1/F2/F3 with weights 8/7/5; beats B1–B4). Ask for confirm/edit per constant. Also ask D-12 (typed replies primary, Beginner assist optional) and D-22 (SC-01 is the demo scenario).
3. **P0.4 Backend and engine language** (existing frontend is plain JS + Vite 8 + Three.js; no backend or tests exist). Options include a Node/TS server with the built-in `node:test` runner (one language, no new test dependency) versus Python/FastAPI (a second runtime). The engine must run server-side (R-08) and stay pure (R-16).
4. **Schema additions the engine will need** (a schema change needs approval, AGENT.md §9):
   - NPC `topics`: which event types belong to which NPC, so the engine can choose `redirect_to_npc`.
   - Clarification representation for ambiguous dates. Recommended: a separate `clarify` field on classifier output, **not** a new event type (avoids taxonomy churn and a scoring-version bump, R-27).
   - Full `canon.public` / `canon.private`, per-fact `leak_keywords`, `unlock_question`, and F2/F3 (the ARCHITECTURE §4 sample is partial).
5. **Test/lint commands** to add to AGENT.md §5 once the language is chosen.

**Stop here until the human answers.** Record answers in DECISIONS.md (O-06, D-22; D-12 stays Proposed unless confirmed).

## Step 2 — Assignments (after answers)

**Coder A — layout and commands (P0.4).** Create only the folders that will hold files in the next two parts (`/engine`, `/engine/tests`, `/scenarios`, `/evals`; add `/llm`, `/services/api`, `/replies`, `/scoring` when their parts start). Add the real test command(s) to `package.json`/project config. Update AGENT.md §4–§5 to reflect reality; mark unavailable commands as unavailable.

**Coder B — schema, spec, validator (P0.5).**
- Scenario JSON Schema (versioned) and `scenarios/missed_deadline.json` with: fixed `clock`; `canon.public` / `canon.private`; `commitment_model`; NPCs (persona, public_context, default sliders, `topics`); goals G1–G3 with `done_when`, `requires`, `required`, weights; facts F1–F3 (owner, triggers, per-locale `leak_keywords`, weight, `unlock_question`); beats B2/B3 (B1/B4 documented as acts); `end.max_turns: 20`; scoring weights (30/20/15/10/25) and `scoring.version`.
- `validateScenario(spec)` returning structured errors. Checks: schema; unique IDs; every fact has an owner NPC, ≥1 trigger from the taxonomy, keywords, weight; goal DAG is acyclic and `requires` resolve; weights sum (goals 30, facts 20); **R-22 disjointness:** union of goal-completion event types ∩ union of fact-trigger event types = ∅; commitment model references real facts; ≥2 facts, ≥2 visible goals, ≥1 pressure beat (RULES §G items 1–4, 9, 11).
- `publicScenario(spec)` projection: briefing, visible goals, NPC names/roles only (R-08).

## Test plan (all offline)

- Valid `missed_deadline.json` passes.
- Mutation tests, each must fail with a specific error: fact with no owner; fact with no triggers; unknown event type; goal event also used as a fact trigger (e.g. add `asked_for_help` to G2); `requires` cycle; weights not summing; missing `clock`/`commitment_model`; `private` canon placed under `public`; duplicate IDs.
- `publicScenario` leak test: serialize the projection and assert none of these strings appear: any fact `content`, any `leak_keywords`, any trigger name, `commitment_model`, `canon.private` values, `unlock_question`.
- The validator runs with network and keys unavailable.
- Doc consistency check (manual, report it): AGENT.md §4–§5, ARCHITECTURE known unknowns, DECISIONS O-06/D-22, PHASES.md items match what now exists. Do not claim features are built.

## Review focus
Schema additions were approved; public projection is minimal; no secret strings outside the server-side spec; no extra dependencies; docs claim only what exists.

## Stop and ask
Any constant the human has not confirmed; any schema field beyond those listed; any request for keys.

## Gate / exit (PHASES.md S1-P0)
Docs reflect reality; SC-01 spec validates; provider chosen (or P0.2 explicitly left open with P2 blocked). Report in the standard format; list every provisional constant.
