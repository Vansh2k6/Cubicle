# S1-11 — P5 Retry and basic progress

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P5.1, P5.2, P5.3 and the **S1-P5 exit**. **Entry:** S1-10 accepted.
**Goal:** play → feedback → try again → compare two attempts, with the first debrief still viewable.
**Read first:** PRD FR-40, FR-41, FR-100; ARCHITECTURE §17 (S1 storage), §18; RULES R-27, R-51; DECISIONS D-18, D-23; the existing `cubicle-progress` / `workplay-progress` localStorage logic in `src/main.js`.

## Contract

- **Try again (P5.1):** starts a **new** session of the same scenario with the same settings; engine state is fully fresh (no facts, commitments, mood, goals or histories carried over). The previous debrief stays available by session ID from the server-side JSON dump (D-18).
- **Try again with new settings (P5.2):** routes to the setup step. Until S1-12 lands it can launch with default settings; wire it so the P6.2 controls plug in without rework.
- **Basic My progress (P5.3):** a list of attempts per scenario with date, total score, band and `scoring_version`; select two attempts to compare totals and the five metrics. Cross-version comparisons are **labelled** (R-27).
- **Storage:** attempt summaries (scores, band, version, date, session ID) in the existing progress storage shape or a migrated one; **do not** store transcripts in localStorage (R-51). Keep reading the old `workplay-progress` fallback. SC-02/SC-03 scripted completion counts keep working.
- **Reset hygiene:** corrupt or missing progress data degrades to an empty list, never a crash.

## Test plan

**Offline (mandatory):**
1. **Isolation:** run session A to completion, start session B; B's state equals a fresh session's initial state; facts/commitments/mood/goals/threads from A are absent. Run in both orders to catch ordering bugs.
2. Previous debrief fetched by A's ID after B exists and after B ends; unchanged.
3. Progress storage: add/read/compare; migration from the old shape; malformed JSON; missing keys; version label shown when `scoring_version` differs; quota-error handling.
4. Two attempts → compare view data (totals and five metrics) correct to the debrief records.
5. SC-02/SC-03 scripted completion and the "try another scenario" cycle still work (smoke).
6. Full offline suite green; bundle scan clean.

**Manual with screenshots saved:** finish a run → debrief → Try again; Try again with new settings; open My progress; compare; reload the page and confirm history persists.

**Live (provider; else `NOT RUN`):** two real attempts (one trap, one smart) → compare scores; confirm the second run starts clean (no knowledge of F1 carried over).

## Review focus
No state bleed between attempts; no transcript stored client-side; old storage still readable; nothing here requires accounts.

## Stop and ask
Any request to add accounts, cloud sync or employer views (Stage 2).

## Gate / exit (PHASES.md S1-P5)
A user can play, see feedback, retry, and compare two scores; previous feedback preserved. Report evidence for the isolation tests specifically.
