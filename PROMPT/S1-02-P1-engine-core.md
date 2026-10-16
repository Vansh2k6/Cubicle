# S1-02 — P1 Engine core (no LLM)

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P1.1–P1.7. **Entry:** S1-01 accepted; validated `missed_deadline.json` exists; test command chosen.
**Goal:** a pure, deterministic engine `(state, events, scenario) → (state', act)` that can play SC-01 from hand-written event lists. No network, no LLM, no database code (R-16).
**Read first:** ARCHITECTURE §5–§6 (esp. §6.4 act priority, §6.5 commitments and delivered outcomes); RULES R-01, R-04, R-16, R-22, R-30, R-31, R-33–R-35, R-60; DECISIONS D-24, D-25, D-26.

## Contract the coder must implement

- **State** exactly per ARCHITECTURE §6.1, fully serialisable. Facts move `sealed → probed → pending_delivery → revealed`. Commitments carry `id, what, target_day, original_words, turn_id, npc_id, status, model_inputs, unrealistic, accepted_with, recap_turn_id, supersedes`.
- **applyTurn(session, npc_id, events) → { state, act, ended }.** Events are classifier-shaped, never free text.
- **Delivery commit** (separate call): `commitDelivery(session, turn_id, outcome)` marks a staged reveal/agreement as delivered or not. Only delivery adds a fact to `user_known` and creates discovery credit (R-01, D-26). Failure/override leaves the fact `pending_delivery` for safe retry; retries are idempotent.
- **Mood and sliders** per ARCHITECTURE §6.3: patience drop anchors (100→−3, 50→−8, 0→−15) and walkout thresholds (patience 0→25, 100→5); warmth start mood `35 + 0.3×warmth` and gains +4…+10; forthcomingness asks needed (≥70→1; 30–69→2, or 1 if mood ≥60; <30→2 and mood ≥50); assertiveness moves B2 from turn 4 to 3. Where the docs give anchors but not rules (interpolation, what counts as "high"), use linear interpolation and `assertiveness ≥ 70`, keep every constant in config, and list them as **provisional** in the report.
- **Probe rule:** one ask = one turn in which a trigger event for that fact reaches its owner NPC. `repeated_question` is its own event and does not add a second ask. Document this.
- **Commitments (D-25):** day offsets from the fixed clock; realistic iff `min ≤ day ≤ cutoff` where min is 3 unassisted, 2 only after F2 is **delivered** and help is explicitly accepted in Jordan's conversation (`confirmed_next_steps{help_accepted:true}`, validated by code). Store model inputs per evaluation; assistance changes trigger a recorded re-evaluation. Revision supersedes the old ID and clears acceptance/recap. Ambiguous date → clarification state, no commitment. One penalty source per commitment; callbacks never re-penalise. `overpromised` is engine-derived only.
- **Agreement and goals:** `date_mutually_agreed` is engine state for the active realistic commitment in Maya's conversation. `done_when` mini-expression language per §6.5. G3 also needs a recap of the same active ID after G1/G2. Required goals gate ending; hidden goals never end a session (R-34).
- **Beats:** B2 and B3 per scenario spec; B3 is evaluated once per active commitment; if due while the user is with another NPC, defer it to Maya's next exchange without sharing Maya's knowledge.
- **Acts:** exactly the §6.4 priority order. Reveal staging happens only when the reveal act wins; suppressed reveals leave no prompt-visible trace.
- **Source ledger:** every event gets a `source_id` and an allocation tag (`goal`, `fact`, `integrity`, `none`) so P4 can score and replay mood without double counting (R-22). Record mood history per NPC per turn.
- **Snapshots** after every turn (R-30); **SessionStore** with in-memory + JSON-dump implementation (`create, getState, applyTurn, getSnapshot, endSession, dump`).
- **Determinism (R-35):** seeded; same scenario + events + sliders + seed → byte-identical canonical JSON state.

## Test plan — offline, hand-written event lists (R-60)

Each case below is a named test; the tester runs them all plus the S1-01 validator tests.

1. **Smart path:** owns delay + honest status (Maya) → asks impact (F1 staged, delivered) → Jordan: requirement details → asks help (F2 staged, delivered) → accepts help → relays → commits day 2 → Maya accepts → recap → G1–G3 done, `ended` with goals-complete; F1/F2 `user_known`; no penalties.
2. **Trap path:** commit day 1 with no probing → `unrealistic`, one integrity-penalty source, B3 fires exactly 3 user turns later and only once, flag-ready metadata recorded, no duplicate penalty on callback.
3. **Bounds table:** day 3 unassisted ✔; day 2 unassisted ✘; day 2 with F2 discovered but help not accepted ✘; day 2 after delivered F2 + accepted help ✔; day 4 ✘ (past cutoff); day 0 ✘.
4. **Late assistance:** commit day 2, then accept help later → recorded re-evaluation; historical penalty not repeated or erased silently.
5. **Revision:** second commitment supersedes the first; prior acceptance/recap cleared; G3 not done until recap of the **new** ID.
6. **Ambiguous date:** clarification state, no commitment, no penalty.
7. **Forthcomingness table:** each band (≥70, 30–69 with mood <60 and ≥60, <30 with mood <50 and ≥50) reveals on the correct ask.
8. **Pending vs delivered:** reveal outranked by walkout/callback stays `pending_delivery`, not in `user_known`; failed delivery earns nothing; retry delivers once; double `commitDelivery` is idempotent.
9. **Redirect:** asking Maya a Jordan-topic question → `redirect_to_npc` (uses NPC `topics`).
10. **Walkout:** sustained `avoided_question` ends the session at patience 0 sooner than at patience 100 (compare turn counts).
11. **Silos:** an event owned by Jordan's fact sent to Maya never touches Jordan's fact; `told_by_user` is per NPC.
12. **End conditions:** goals complete, user end, max 20 turns, walkout; hidden goal alone does not end.
13. **Determinism:** run the same list twice → identical canonical JSON; snapshot at turn N equals state after N turns; serialise/parse/replay round-trip equals original.
14. **Purity (R-16):** a test or script scans `/engine` imports and fails on network, LLM, filesystem-DB or env-key access (the JSON dump lives in the store adapter, not in engine logic).
15. **Offline proof:** run the engine suite with network disabled and no provider env vars; it must pass.

## Review focus
R-16 purity; no LLM/prompt strings in `/engine`; no dialogue text decisions; delivered-vs-pending semantics; ledger idempotence; constants in config and flagged provisional; no speculative abstractions.

## Stop and ask
Any rule not in the docs that changes what counts as revealed, agreement, or credit; any change to the act priority list (needs a DECISIONS entry, R-33).

## Gate / exit (PHASES.md S1-P1)
All engine tests pass offline; same inputs → same outputs (R-35). Update AGENT.md §5 `test engine` to the real command. Report with the provisional-constants list and the probe-rule note.
