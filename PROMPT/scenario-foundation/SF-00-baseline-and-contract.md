# SF-00 — Baseline and contract

> **Head document: `CONTEXT/AGENT.md`.** Follow its precedence and coder → reviewer → tester → orchestrator workflow. This prompt implements documentation only and never claims the target runtime exists.

**Entry:** D-37 authorises the bounded foundation exception. **Goal:** record exact interfaces, ownership, source touchpoints and an honest baseline before runtime work.

## Read first

All six `CONTEXT` documents; `plans/SCENARIO_FOUNDATION_IMPLEMENTATION.md`; `package.json`; the listed source/test files in the master plan needed to verify names. Do not read secrets, transcript artifacts, `graphify-out`, `dist`, `node_modules`, or historical prompts.

## Assignments

Coder: create the master plan and status documents; add D-37, the R-63 reflection, current-phase clarification, architecture target contract and AGENT continuation pointer. Lock the package shape and boundaries exactly as recorded. Capture only existing regression commands and values; do not edit code or add tests.

Reviewer: check that claims distinguish target contract from implementation, that SC-01 numbers and scoring relationship population are preserved, and that the exception does not waive S1 acceptance.

Tester: run the existing `npm test` and `npm run test:api` only after review; report fresh results or failure. No live calls.

## Tests

Baseline expected only: `npm test` (historical 313 unit) and `npm run test:api` (historical 63 API). Status is UNRUN FRESH until tester output exists. Existing hand-derived deterministic SC-01 smart/trap scores are 60/7, not fresh test results.

## Review

Confirm source paths are real, API compatibility is explicit, functions are excluded from session JSON, private proof is not public catalogue content, and no runtime feature is represented as approved or built.

## Stop and ask

Stop only for a new numeric semantic/scoring decision or scope beyond D-37. The authorised contracts here do not need repeated approval.

## Exit

Documents are internally consistent; review and test remain pending until separately completed.
