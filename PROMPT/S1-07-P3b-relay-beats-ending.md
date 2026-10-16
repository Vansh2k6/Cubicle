# S1-07 — P3b Relay detection, beats and callback, scenario ending

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P3.4, P3.5, P3.6 and the **S1-P3 exit**. **Entry:** S1-06 accepted.
**Goal:** the full SC-01 loop works end to end: relay, pressure beats, commitment callback, and an ending that hands off to the debrief.
**Read first:** ARCHITECTURE §6.2 (relay interpretation), §6.5; PRD §SC-01 (beats B1–B4, trap/smart paths); RULES R-04, R-09, R-22, R-34, R-41, R-62; DECISIONS D-24, D-25, D-26.

## Contract

- **Relay (P3.4):** classifier may label `relayed_fact{fact_id, accurate}`. **Engine validates:** the referenced fact must be in `user_known`, and supporting text must exist in the user's turn; unsupported or uncertain judgments earn **no credit and no penalty**. Inaccurate validated relays feed the integrity penalty (once per source). Maya reacts to what the user **said** via `acknowledge_relay`, never to the underlying fact (R-04).
- **Open decision:** the docs define no mood effect for an **accurate** relay. Default: none. Ask the human before adding one.
- **B2/B3 (P3.5):** B2 press-for-date at turn 4 (turn 3 at high assertiveness). B3 fires 3 user turns after a commitment, on Maya's next exchange; if the user is with Jordan or Sam when it is due, defer it to Maya without sharing her knowledge. Unrealistic → challenge using a permitted act that does **not** reveal why (no cutoff, no bounds). Realistic → acknowledge. Once per active commitment; a revision starts a new evaluation; never a duplicate penalty.
- **Ending (P3.6):** all required goals done → session ends → end screen that hands off to the debrief (a placeholder "session ended" view is acceptable until S1-10). Also: user clicks End, max 20 turns, NPC walkout. The model cannot end a session by wording; agreement and closing commit only with their guarded line.
- **Text-only fallback:** the terminal harness completes smart and trap runs against the same API.

## Test plan

**Scripted-bot runner (build now; reused later).** A driver that feeds scripted user lines through the **full pipeline** (classifier mocked by the fake provider mapping each scripted line to events; NPC lines mocked or fixed). Required playthroughs, all offline:
1. **Smart path:** G1 → F1 → Jordan G2 → F2 → accept help → relay accurately → day 2 → Maya accepts → recap → G1–G3 done, ended. Optional Sam run discovers F3 (`asked_advice`).
2. **Trap path:** commit "tomorrow" without probing → unrealistic → callback challenges at the right turn **without** revealing day 3, Friday or the reason → one integrity source only → F1/F2 stay undiscovered.
3. **Relay matrix:** accurate relay (no credit/penalty beyond defined effects); inaccurate relay (penalty source once); unsupported relay (nothing); relay of a fact not yet discovered (nothing).
4. **Callback deferral:** commit, then spend three turns with Jordan → Maya raises it on her next exchange; Jordan never mentions it.
5. **Revision:** commit day 1, revise to day 3 → old ID superseded, no repeated penalty, recap required for the new ID.
6. **Ending conditions:** goals complete, user End, 20 turns, walkout (low patience + `avoided_question`).
7. **Guess-and-confirm:** user guesses "Friday?" before F1 → Maya does not confirm; no discovery credit.
8. **Beat timing:** B2 at turn 4 and at turn 3 for high assertiveness.
9. Full offline suite green; bundle scan still zero hits; public-state allowlist holds on every response.

**Manual, with transcripts/screenshots saved:** one smart and one trap run in the scene; one in the text-only harness. Transcript must show callbacks that do not state the cutoff.

**Live (provider; else `NOT RUN`):** one real smart run and one real trap run; confirm B3 wording contains no day-3/Friday/cutoff unless F1 was already delivered; record transcripts and manifest ID.

## Review focus
Engine (not prose) decides agreement and completion; relay validation before effect; callback deferral doesn't leak Maya's knowledge; one penalty per commitment; no new taxonomy events.

## Stop and ask
Mood effect for accurate relay; any scoring consequence beyond D-24.

## Gate / exit (PHASES.md S1-P3)
Smart path completes G1–G3 (optional Sam finds F3); trap triggers the callback; scene and text-only both work; callbacks neither reveal private bounds nor repeat penalties. Record the live runs or `NOT RUN`.
