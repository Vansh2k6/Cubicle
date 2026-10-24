# DS-01 — Package and plan rules

**Head document:** `CONTEXT/AGENT.md` — master: [Client NPC and Deadline Story Implementation Plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md)

## Entry Goal

Author the v2 story/v3 profile and smallest safe plan-revision extension.

## Read first

CP-00, D-38, [master plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md), current `missed_deadline` package/template, validator, engine, policy and scoring tests.

## Assignments

**Coder:**

Author `scenarios/missed_deadline.v2.json`, `scenarios/missed_deadline.v2.schema.json` and `replies/missed_deadline.v2.en.json` for public scenario ID `missed_deadline`, content v2, scoring v3 and schema v2. Do not modify `scenarios/missed_deadline.json`, its original schema/replies or legacy adapter CONFIG. Use the ordinary four-NPC package structure: Snehal (`maya`) manager, Vansh (`jordan`) engineer, Prathamesh (`sam`) QA/release engineer for this story, and Rohan (`client`) remote client operations lead. Author the exact briefing, F1–F4 (weights 5/6/4/5), safe taxonomy triggers, leak-keyword examples, paraphrase unlock questions, 1–3 sentence owner reveals and debrief questions from the master. Preserve 20 turns, pressure turn 4/3 at assertiveness ≥70 and callback gap 3 unless a targeted test proves incompatibility; report it instead of inventing a number.

Retain weights 30/20/15/10/25, penalties 8/4/3 and bands. Author G1/G2/G3 at 10 each with event sets disjoint from every fact trigger, including indirect conditions. Facts may explain feasibility but no `fact_revealed`/user-known status may be a goal condition. G2 uses distinct delivered technical reservation/pair and QA fix/verify confirmations; G3 uses distinct delivered route/scope/approval/recap evidence.

Follow the master's [DS-01 implementation boundary](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md#ds-01-implementation-boundary-approved-target-contract-2026-10-24) exactly for wire parameters, the optional read-only `planEvidence` operation, closed private model and core-owned cross-actor proof. Make one `plan_model` revision attached to the existing commitment, holding primary day 3 and optional follow-up day 6 scope plus participant approvals/recaps. It is not a second commitment, global date replacement or special client system. A valid material proposal immediately activates an undelivered revision, clears current approvals/recaps and blocks finalization; failed delivery cannot silently restore the old plan. Repeating the same current canonical slots reuses the revision. Malformed/unsupported input never mutates it. Implement only FULL/PHASED and their listed authorities/conditions. Core stages then commits acknowledgements/recaps and all goal proof only after guarded delivery; fallback cannot create credit.

DS-01 provides the explicit supported production-policy engine-context validation/test seam only, never the `privateProof` flag or a playable placeholder language/offline package. DS-02 owns complete strict package registration after its actual hooks exist; DS-04 alone activates the default. Capture trustworthy v3 proof now, retain the scorer's unsupported-schema failure until DS-03, and verify old schema-v1/scoring-v2 records remain intact and unreplayed. No early playable/scorable claim is permitted.

**Reviewer:** Sol checks the plan ledger, authority and R-22 allocations.

**Tester:** run hand-authored affected engine/package/scoring tests after review.

**Root:** resolves any required contract change before the next prompt.

## Tests

Update `engine/tests/scenarioValidator.test.js`, `engine/tests/engine.test.js`, `llm/tests/pipeline.test.js`, `llm/tests/guards.test.js`, `llm/tests/scripted.test.js`, `scoring/tests/score.test.js`, and `services/api/tests/scenarioRegistry.test.js`; add `engine/tests/deadlineV2Plan.test.js`. Write hand-authored event-list tests for package/schema validation; F1–F4 privacy/reachability; G1, G2 and G3 source allocations; full/phased positives; premature/bad plan; each omitted phase condition; QA omission; wrong authority; revision invalidation; fallback no credit; old v2 compatibility. Early deterministic arithmetic is capped at 75; final DS-04 combines it with a quality-only fake judge fixture (25) to assert smart ≥85 / trap <50, never claiming real-model acceptance.

## Review

Sol reviews R-01/R-09/R-22/R-27, all plan/approval authority checks, compatibility, and arithmetic before tester runs affected suites.

## Stop and ask

Stop for root if existing taxonomy cannot express an explicit bounded parameter without a new taxonomy, if an extra numeric constraint is needed, or if multi-party proof cannot attach to the existing commitment/revision model.

## Exit

Report exact schema/content/scoring/engine paths, evidence, remaining language/debrief work and any unresolved engine limitation. Do not activate production story yet.
