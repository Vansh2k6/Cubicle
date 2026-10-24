# SF-04 — Proof and integration

> **Head document: `CONTEXT/AGENT.md`.** Follow its workflow; D-37 authorises this bounded implementation prompt.

**Entry:** SF-03 accepted and the consolidated Sol review/fix cycle is ready. **Goal:** establish non-production integration evidence without publishing or enabling another story.

## Read first

All six `CONTEXT` documents; master plan; all registered-package loader/validator/session/API/scoring/projection tests; `scripts/verify-offline.mjs`; `scripts/bundle-scan.mjs`; `llm/tests/bundleScan.test.js`; existing offline verification command.

## Assignments

Coder: author a private proof package only: two actors with nonlegacy IDs, different clock, no assistance, two goals including delivered agreement/recap/closing under different authority, and a public email canon with distinct fallback. Keep it out of production selector/catalogue/story paths. Add cross-session, failure, scanner and old-record compatibility coverage.

Reviewer: Sol performs the consolidated security/engine/scoring review. Fix findings then repeat review as required.

Tester: after approval run targeted integration coverage and the final `npm run verify:offline`; then run `VITE_VOICE=1 npm run bundle:scan` with the same sanitized child environment. Report exact output and source candidate identity. Do not run live evaluations.

## Tests

Prove package isolation across sessions; no global current-SPEC fallback; history/debrief layout compatibility; failed fallback no discovery/agreement credit; registered-private-source scanner includes proof data; proof remains absent from public catalogue/frontend; all full offline gates pass only at this final candidate.

## Review

Verify the proof package is meaningful but never production content, and all identities/hashes survive storage without serializing functions.

## Stop and ask

Stop for publication, selector enablement, live evaluation, new scenario numbers or a semantic change beyond D-37.

## Exit

Offline integration evidence is recorded; live cases remain saved NOT RUN pending fresh user permission.
