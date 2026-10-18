# S1-07 implementation gate — 2026-10-17

PART: S1-07 · PHASE ITEMS: P3.4, P3.5, P3.6
STATUS: ACCEPTED — implementation/offline gate only; full scene smart/trap and live acceptance remain NOT RUN

## Changes
Engine validates conservative SC-01 relay evidence against actual user text and known facts, with no accurate-relay mood bonus and one integrity allocation per turn/fact. Agreement, recap and G3 ending wait for guarded delivery. Existing B2/B3 timing/deferral is exercised end to end. API adds idempotent End and per-session in-flight protection; scene and terminal harness use it. Ending is a debrief placeholder only. No new dependencies, taxonomy, scoring weights or live calls.

## Verified checks

| Gate | Method | Result | Evidence |
|---|---|---|---|
| Cumulative offline tests | npm test | PASS: 142 tests, 0 failures | engine/tests and llm/tests including scripted.test.js |
| API and terminal parity | npm run test:api | PASS: 20 tests, 0 failures | services/api/tests/ending.test.js invokes real terminal harness smart/trap against local offline API |
| Production build | npm run build | PASS; existing >500 kB chunk warning | generated dist |
| Bundle secrecy | npm run bundle:scan | PASS: 5 files, 82 needles, zero hits | evals/reports/bundle-scan-2026-10-16.json (existing report name) |
| Scene smart/trap visual | Manual browser | NOT RUN by coder | pending independent visual verification |
| Live smart/trap | Real provider | NOT RUN: outside consumed bounded smoke allowance | no live acceptance claim |

Synthetic full-pipeline bot paths and recorded engine sessions: `evals/scriptedPaths.mjs`, `evals/scriptedBot.mjs`, `evals/fixtures/s1-07-synthetic-sessions.json`. These are authored fake data, not real user transcripts. Manifest: `synthetic-s1-07`. Smart ends goals_complete with F1/F2 delivered; trap defers callback through three Jordan turns, then challenges on Maya without cutoff disclosure and has one integrity source. Tests also cover relay matrix, duplicate interpretation, revision, optional F3, failed delivery, B2 timing, max turns, walkout and guess-confirm rejection.

## Rules and limits
R-01/R-04/R-09: guarded delivery and NPC silos retained; no underlying relay fact injected into another NPC prompt. R-11/R-34: engine alone controls agreement/end; failed closing cannot complete G3. R-22: relay effects require matching independent evidence, unknown/uncertain has none. R-50/R-66: no keys or real transcripts; fixtures explicitly synthetic. R-60/R-64: the candidate passed review and the checks recorded below before implementation acceptance. Accurate relay has no new mood effect; no provisional constants introduced. Conservative relay patterns deliberately decline unrecognized paraphrases; expand only with reviewed scenario evidence. Scoring and debrief remain future prompts. Full live quality/safety/latency gates remain NOT RUN.

Docs: AGENT implementation snapshot/commands, ARCHITECTURE S1-07 contract, root-updated PHASES implementation tracking, DESIGN ending refinement. Impeccable detection and the limited browser check are recorded below. No human decision needed for this bounded scope.

## Orchestrator acceptance
Independent reviewer approved the final candidate. The tester confirmed 142 offline tests, 20 API tests, the build and clean diff; Impeccable detection returned zero findings. Its final reporting turn hit an account usage limit, so the orchestrator completed verification with a fresh 142/142 offline and 20/20 API rerun and inspected the unchanged candidate. Browser verification on an isolated offline API confirmed office movement to Maya, typed input with G1 checklist update, and End opening the Session ended / Debrief coming soon view. This is a limited browser check, not a full scene smart/trap playthrough. No additional live calls were made. Phase exit and demo readiness are not accepted. Next: S1-08 deterministic scoring.

## Review correction evidence
All six initial review findings plus G3 prerequisite ordering and cross-NPC discovery isolation were corrected. Production NPC move asset is now v2 (callback, agreement and closing instructions); both live config and offline server manifests identify v2. Agreement/closing require the exact positive acceptance/closing line and the engine-authorized pending outcome. Unrelated or higher-priority replies cannot finalize it. Conservative negation declines relay judgment. Delayed-body End and final-turn replay have deterministic API regressions; delayed UI End uses a tested run-bound coordinator. User End disables duplicate submissions and sends while pending. Cross-NPC revealed IDs are filtered to the current owner before guard authorization. Synthetic fixtures regenerated for this candidate. Relevant live eval subset (smart/trap/relay/callback/guess paths) remains NOT RUN after the NPC prompt version change; offline cases are saved in scriptedPaths and scripted tests.

Final re-review corrections: acceptance authorization requires an active realistic Maya commitment; Jordan/day-1 promises cannot emit acceptance. Mixed half/all evidence declines a relay judgment. Turn and create-session responses are bound to their originating session/scenario/thread set before shared UI writes. B3 eligibility requires the commitment to have been made to B3's owner, preventing Jordan-to-Maya reverse leakage. Latest coder checks: 142 offline tests PASS, 20 API tests PASS, rebuilt bundle scan PASS (five files, 82 needles, zero hits). Additional delayed-run, nonauthority, mixed-subject, reverse-silo and production-v2-manifest regressions are included.
