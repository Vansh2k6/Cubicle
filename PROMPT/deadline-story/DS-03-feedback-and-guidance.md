# DS-03 — Feedback and guidance

**Head document:** `CONTEXT/AGENT.md` — master: [Client NPC and Deadline Story Implementation Plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md)

## Entry Goal

Present v3 evidence and safe public guidance while preserving v2 history.

## Read first

DS-01/DS-02, D-38, [master plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md), scorer/debrief/guidance modules and tests.

## Assignments

**Coder:**

Use the existing scorer and debrief layout with the captured v3 package identity/profile. Show deterministic goal/fact/integrity/relationship evidence separately from quality-only judge output. New public guidance names the three visible goals and safely directs the player toward QA and client conversations without exposing F1–F4, private plan rules, or the old HR/module-half/day-2 shortcut. Author debrief text that explains the four missed facts only after end and gives each fact’s question; it must not confuse discovery with goal credit. Preserve captured v2 historical debrief/profile/identity behavior; never replay old records using v3.

Implement exact schema-v2 cross-actor proof consumption from the master's [DS-01 implementation boundary](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md#ds-01-implementation-boundary-approved-target-contract-2026-10-24); until this slice it remains explicitly unsupported by scoring. Revalidate committed source/actor/revision/delivery and allocation, reject forged or incomplete evidence, award G2 technical readiness once and never score G3's referenced technical prerequisites again. Unacknowledged revisions cannot finalize using old approvals. Keep historical schema-v1 proof handling unchanged.

Do not add metrics, categories, score changes, model calls or new UI layout. Judge fixtures remain offline quality-only mocks with verified quotes and never become acceptance evidence for a real model.

**Reviewer:** Sol checks R-20–27, arithmetic, privacy and historical compatibility.

**Tester:** run affected scoring/debrief/guidance suites after review.

**Root:** verifies resulting evidence remains package-bound and scoped.

## Tests

Update `scoring/tests/score.test.js`, `scoring/tests/debrief.test.js`, `scoring/tests/feedback.test.js`, `llm/tests/guidance.test.js`, `llm/tests/progress.test.js`, and `services/api/tests/debrief.test.js`; add `scoring/tests/deadlineV2Feedback.test.js`. Cover v3 fact weights/goal allocations/relationship exclusions, full and phased evidence presentation, missing QA/client agreement guidance, no fact-to-goal credit, debrief post-end disclosure only, old v2 record display, and public guidance privacy. Run affected scoring/debrief/guidance suites.

## Review

Sol reviews score arithmetic, R-20–27, sealed-data boundaries and historical record compatibility.

## Stop and ask

Stop for root if the current debrief record cannot carry v3 identity/evidence without broad storage migration, or if a public hint needs private content.

## Exit

Return paths, exact offline results and remaining integration/activation work; no acceptance or live-model assertion.
