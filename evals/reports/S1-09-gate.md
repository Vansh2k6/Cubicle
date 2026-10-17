# S1-09 candidate gate — 2026-10-17

PART: S1-09 · PHASE ITEMS: P4.2, P4.3, P4.5
STATUS: ACCEPTED — implementation/offline progression only; live feedback acceptance remains NOT RUN under D-28

## Changes
New server-only `scoring/judge.js`, `scoring/quotes.js`, `scoring/coach.js`, and `scoring/tests/feedback.test.js`. Versioned judge/coach v2 prompts; role config records prompt/schema version2. Existing gateway gained bounded schema constraints and a caller validation hook inside its original retry loop. Synthetic feedback fixture and saved NOT RUN live-case plan added. No API/UI wiring, new dependencies, live calls, scoring weight tuning or phase-checkbox changes.

Judge v2 uses exactly honest_status, ownership, recovery_planning, communication, collaboration_under_pushback. Initial 0/3/5 quality anchors have one generic observable utterance each and are explicitly uncalibrated. Input is transcript plus an already-scored achievement projection; complete scenario/sealed fact definitions are absent. Both prompts call transcript payloads untrusted evidence, not instructions. Length/accent/speed/filler/grammar polish do not merit points. Scores are nullable integers0..5; exact five unique IDs and valid shape/ranges are enforced before acceptance. Individual invalid user quotes become insufficient/zero. Deterministic subtotal and verified rubric points remain separate; all outputs reference a manifest.

Both feedback modules return pending/unavailable without provider calls for active sessions. Tests end cloned trap/partial records in memory; accepted S1-07 source fixtures are unchanged. Ended empty history receives a general tip with null turn/quote, never fabricated evidence.

S1 coaching selects the first code flag with an available nonempty user moment; all other code flags remain available from deterministic scoring. Input transcript stops at that user line and known facts come from the latest snapshot strictly before its engine turn. The current NPC reply's reveal is unavailable even if the saved after-turn snapshot includes it. Schema, quote, tone and historical keyword/semantic checks share two provider attempts total, including regeneration. Fallback prefers the flagged fact or an unknown fact owned by the moment's NPC; authored unlock questions are scanned too, otherwise a generic starter question is used. What went well is returned before what happened/why/improvement.

## Verification

| Gate | Method | Result |
|---|---|---|
| Cumulative offline | npm test | PASS:187 tests,0 failures |
| Feedback-specific | scoring/tests/feedback.test.js (included above) | PASS:21 tests with validation tables |
| API regression | npm run test:api | PASS:20 tests,0 failures on final candidate |
| Build and bundle safety | npm run bundle:scan | PASS:build,5 files,82 needles,0 hits; existing >500 kB chunk warning |
| Live consistency/fairness/quote integrity | evals/cases/s1-09-feedback.NOTRUN.json | NOT RUN:no remaining live allowance |
| Debrief integration/manual UI | S1-10 scope | NOT RUN / not implemented in this part |

Offline cases cover user-only quotes, unknown/NPC/wrong/empty evidence, normalized whitespace/case/curly quotes/dashes and partial-word substring behavior; exact unique dimensions/range/null/shape/malformed/provider/terminal-budget paths; temperature0 and provenance; exclusions/fairness prompt plumbing; same-turn F1 reveal historically unknown; previous facts retained and future turns absent; fabricated coaching quotes/personal labels/secret responses/authored fallback leaks; shared two-call budget; general starter and active-session no-call guards. Tone check: what_went_well is explicit and first; obvious personal labels fail neutral/fallback handling. These finite English checks and fake-provider tests do not prove universal semantic safety or fairness.

Synthetic output fixture: `evals/fixtures/s1-09-synthetic-feedback.json`, with fake model names and an explicit no-live-measurement label. Recorded judge values are shape/evidence examples, not calibrated scores. No real user transcripts, API keys or raw audio were saved.

## Independent acceptance
Reviewer approved the exact candidate after historical-claim, whitespace, typography and mixed-date corrections. Independent tester verified 187 offline tests (21 feedback cases), 20 API tests, build, bundle scan (five files, 82 needles, zero hits), diff check and complete saved synthetic feedback recomputation. All five saved judge quotes and the saved coach quote passed validation. All 53 captured candidate hashes remained unchanged; only the allowed generated bundle report changed. Root independently reran the 187-test suite and inspected the implementation. Root accepts P4.2/P4.3/P4.5 for sequential offline progression. No application edits followed verification. The fake rubric example proves plumbing only; live calibration and debrief integration remain pending.

## Rules and limitations
R-10 permits the existing post-session judge and coach uses; no extra model role was added. R-12 uses one shared retry then fallback. R-13 judge temperature0. R-14 prompt/schema v2 plus manifest refs. R-20 separates code/rubric points. R-21 verifies user-turn quotes in code. R-22 marks already-scored achievements and quality-only scope; offline only verifies instructions/plumbing, real model no-reaward behavior remains NOT RUN. R-23 fairness instructions/probes saved, not measured. R-25 knowledge snapshot strictly before moment and historical leak checking. R-44 supportive fields/person-label checks. R-50 synthetic-only fixtures. R-61 relevant live requests/cases saved NOT RUN. No new constants or calibrated anchor changes were introduced.

Quote matching accepts normalized partial-word substrings per the stated substring contract; it does not infer meaning. Personal-label/leak checks are conservative local safeguards, not general guarantees. All-moment coaching, actual debrief rendering, judge consistency, fairness and final >=85/<50 acceptance remain subsequent/unverified work. Root alone may accept this candidate and update PHASES.

## Review correction evidence
All three requested corrections have regressions. Coaching reuses the existing canonCheck with historical context to reject unsupported dates/resources/scope, including the reproduced tomorrow deadline and three-extra-engineers claims; authored fallback questions receive the same checks. Exact already-known fact spans remain permitted, and F1's known date may be reused; surrounding new claims are still scanned. Generic clarification questions remain usable; because canonCheck treats every scope mention as material, three explicit neutral scope questions (What is the scope? / Can we clarify the scope? / Could you clarify the scope?) are permitted without asserting a scope change. Other uncertain material forms conservatively fall back; no general semantic-NLP guarantee is claimed. All substantive coaching fields must be nonblank after trim, and better_reply must contain one to three nonblank letter/number-bearing sentences; whitespace/punctuation-only responses fall back. Judge explanations must also be nonblank. Personal-label checks normalize Unicode quotes/dashes/whitespace before matching, so curly-apostrophe You’re lazy is rejected in both modules. Latest final-candidate cumulative checks:185 PASS; API20 PASS. Existing synthetic feedback output remains unchanged and valid. No live calls or UI/API integration edits.

Renewed review correction: the shared llm/guards.js resolver now enumerates every named weekday, day-count and tomorrow occurrence, validating each with the existing authorization/echo/canon rules. An authorized first Friday can no longer mask a later tomorrow/Thursday/Monday claim, even within the same sentence. Shared guard and coach regressions cover these combinations, known-F1-only permission and the authorized F1 reveal line. This fixes the common date-claim root for both NPC pipeline and coaching instead of adding a separate date checker. Existing NPC/pipeline/bot/API regressions remain green. Final cumulative187 PASS, feedback21 cases, API20 PASS. No live calls or output fixture changes.
