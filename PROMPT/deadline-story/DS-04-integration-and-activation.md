# DS-04 — Integration and activation

**Head document:** `CONTEXT/AGENT.md` — master: [Client NPC and Deadline Story Implementation Plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md)

## Entry Goal

Activate only the reviewed package and produce the final bounded offline evidence.

## Read first

CP-00, CN-01/CN-02, DS-01–DS-03, D-38, [master plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md), and every prior reviewer/tester handoff.

## Assignments

**Coder:**

Integrate the reviewed slices only after their gates pass. Switch the default `missed_deadline` binding to the supported v2/v3 package only here, preserving immutable old sources, captured v2 sessions/records and SC-02/03. Exact captured identity selects legacy v2 or modern v3 retry/debrief behavior; unknown identity fails closed and never replays under new rules. Verify public catalogue/session creation binds package identity and only exposes valid physical/remote metadata. Ensure ordinary client actor routing works in scene and text-only paths, voice uses the shared lifecycle and no stale post-end/restart/scenario-change effect appears. Do not claim a stage demo, production readiness, real call, WebRTC, actual QA execution, or user live approval; the story ends at a credible agreement, not work completion.

Write `out/client-plan-manifest.json` from the frozen candidate with all changed/new docs/source/tests and hashes; it stays ignored. Generated logs/reports/manifests are not committed. Save real-provider scenarios/cases as NOT RUN; do not make live calls.

**Reviewer:** Sol confirms the exact source manifest and unresolved correctness issues before testing.

**Tester:** Luna runs the final prescribed offline gate only after Sol approval.

**Root:** compares the tested source/hash and accepts or returns it.

## Tests

After Sol approval and frozen-source confirmation, Luna runs one `npm run verify:offline`, plus default and voice-enabled bundle scans with a sanitized environment. The final scope includes `engine/tests/deadlineV2Plan.test.js`, `services/api/tests/clientRemote.test.js`, `llm/tests/clientRemotePhone.test.js`, `llm/tests/deadlineV2Language.test.js`, and `scoring/tests/deadlineV2Feedback.test.js` with their named modified suites in CP-00–DS-03. Validate the complete matrix in the master plan: full/phased positive and all negative plan/authority/revision/fallback/privacy/phone lifecycle/legacy-pin paths. If the existing full command cannot express a required case, add the focused offline test before the gate; do not fabricate a pass.

## Review

Sol confirms the exact source manifest and unresolved correctness issues before testing. Root compares tester manifest/hash to the candidate and independently accepts or returns it.

## Stop and ask

Stop for root if any earlier gate is absent, a merge changes frozen files, the full gate fails, bundle scan shows private data, or activation requires live/provider/browser/device evidence.

## Exit

Return the manifest path, commands/exit codes/counts, changed paths, NOT RUN live/browser/device checks and any failure. Only root may accept; no commit/push from this prompt.
