# S1-08 candidate gate — 2026-10-17

PART: S1-08 · PHASE ITEMS: P4.1, P4.4
STATUS: ACCEPTED — implementation/offline progression only; live acceptance remains NOT RUN under D-28

## Implementation
Pure server-side metric registry and deterministic scorer: `scoring/config.js`, `scoring/score.js`, `scoring/tests/score.test.js`. Registry entries evaluate a session record into points/cap/evidence while preserving the shared source-allocation context. Owned record snapshots include scenario/scoring configuration. Results include a source ledger, applied/requested penalties, excluded duplicates and cross-metric sources, mapped user IDs, code flags and largest-two-loss priorities. Rubric remains pending, zero awarded with 25 points reserved. No UI, judge, coach, provider calls or new dependencies.

D-24 technical contract increment: SC-01 `scoring.version` and schema constant are now 2; scenario content/taxonomy version remains 1. Weights remain 30/20/15/10/25 and penalties 8/4/3; changing them without the matching version/config is rejected. D-29 averaging over all three NPCs is already accepted; no new population choice was made. `npm test` now includes scoring tests.

## Hand-derived exact fixture expectations

| Synthetic path | Goals | Delivered facts | Integrity | Relationship | Deterministic | Rubric reserved |
|---|---:|---:|---:|---:|---:|---:|
| Smart | 30 | 15 (F1=8,F2=7) | 15 | 0 | 60 | 25 |
| Trap | 0 | 0 | 7 (15-8) | 0 | 7 | 25 |

Ownership is allocated to G1, so its live mood gain does not also score relationship. Sam is unvisited in these fixtures and contributes zero. These exact subtotals do not establish calibrated final smart >=85 or trap <50 targets. Synthetic source sessions: `evals/fixtures/s1-07-synthetic-sessions.json`; scored outputs: `evals/fixtures/s1-08-synthetic-scores.json`.

## Verification

| Gate | Command/method | Result |
|---|---|---|
| Cumulative offline | npm test | PASS: 165 tests, 0 failures |
| Scoring-specific coverage | scoring/tests/score.test.js, included above | PASS: 23 tests |
| API regression | npm run test:api | PASS: 20 tests, 0 failures (local loopback permission) |
| Build and bundle safety | npm run bundle:scan | PASS: build; five files, 82 needles, zero hits; existing chunk >500 kB warning |
| Live evaluation | No provider calls in this part | NOT RUN; no live authorization remaining; full Stage 1 acceptance remains open |
| Debrief/UI | Future S1-09/S1-10 | NOT RUN / outside this part |

Tests cover exact hand-derived fixtures, pure repeatability, repeated event/commitment ingestion, alias/callback penalty exclusion, failed reveal then retry, debrief-only noncredit, revisions, floor accounting, relationship exclusions/independent events/start100/negative/no improvement, caps/property loops, all seven code flag types, source priorities, version/weight/penalty guard and partial-history quote-ID mapping. Re-ingested duplicate records preserve points/awarded ledger and add explicit exclusion entries.

## Independent acceptance
Reviewer approved the exact candidate after seven source-attribution corrections. The independent tester ran 165 offline tests (23 scoring), 20 API tests, build, bundle scan (five files, 82 needles, zero hits), diff checks and full saved-fixture recomputation; all passed. Root independently reran the 165-test suite and inspected the reviewed implementation. The tester's 43-file before/after hash snapshot found 42 unchanged files and only the allowed generated bundle report changed. No application code changed after approval/testing. Root accepts P4.1/P4.4 for sequential implementation; judge/coach/debrief and live calibration remain pending. Existing build chunk-size warning remains.

## Evidence and conservative boundaries
`turn_map` separates engine turns from conversation IDs (engine 2 corresponds to user ID3 in a complete transcript). Partial histories use explicit engineTurn metadata when available or the session-turn/count offset; unavailable old quote IDs remain null. No raw real-user transcripts or credentials were written; fixtures are labelled synthetic.

The -4 contradiction rule recognizes only a standalone unquoted same-NPC denial, “I never promised a delivery date.”, after that NPC's most recent logged promise. Revisions, explanations, mixed/quoted/uncertain text and other-NPC/no-prior cases receive no such penalty. A distinct later denial source may cost four after an earlier unrealistic promise cost eight; duplicate denials/aliases/callback processing cannot re-charge the same fault. Broader language understanding remains unsupported.

`missed_probe` is PROVISIONAL display guidance: the user spoke to a fact owner at least once and never fired one of that fact's triggers. No new penalty. Record for human confirmation during acceptance. `ignored_npc_redirect`: next user turn remains with that same NPC after a redirect. Both flags derive solely from the recorded code events/acts. No silent rounding of relationship values.

Rules: R-20 separate deterministic/rubric; R-22 source allocation/duplicates; R-24 code flags; R-26/R-27 recorded configuration/version; R-50 synthetic-only fixtures; R-60 offline checks; R-64 review/test handoff required. Docs: ARCHITECTURE scoring candidate and D-31 implementation note. PHASES checkboxes were not edited by coder. No new scoring weights or live calls.

## Review correction evidence
All five reviewer issues have explicit regressions: G3 achievement evidence binds the active commitment's actual delivered recap turn (ignored earlier recaps are excluded); commitment creation now persists its exact engine event source_id in engine/engine.js, and historical records consume matching valid day/turn/NPC creation events one-to-one; integrity penalties are ordered by source turn and recorded event order before the floor; duplicate commitment ingestion cannot duplicate great_recap flags; per-goal and per-fact item allocations are checked against the same versioned config, not only their total caps. No weights changed. The reviewed reproduction of relay turn9, bad commitments10/11 now applies losses3/8/4 in that order. The one-turn day1/day3 commitment reproduction scores integrity7, not0. Latest cumulative coder check is165 PASS; API20 PASS. No new provenance file was needed: the existing engine commitment row gained source_id; scoring/config.js gained the unchanged item allocations. Scored synthetic S108 fixture refreshed; accepted S107 source fixture remains unchanged and exercises historical binding. No live calls or S109 work.

Renewed review corrections: current commitments bind their persisted exact event source without reinterpreting alias fields; historical fallback mirrors engine days ?? day ?? target_day precedence and validates whole-number creation input. A later denial selects the newest prior deduplicated commitment in actual creation order when engine-turn numbers tie. Two additional regressions cover current/legacy conflicting aliases and C1/C2 same-turn supersession followed by denial. Latest cumulative check:165 PASS (23 scoring cases). Scored fixtures remain numerically and structurally unchanged by these two corrections; smart60/trap7.
