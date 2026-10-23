# SF-01 — Registry and sessions

> **Head document: `CONTEXT/AGENT.md`.** Follow its workflow; D-37 authorises this bounded implementation prompt.

**Entry:** SF-00 reviewed and baseline recorded. **Goal:** bind every route/session to an immutable static package without enabling another authored story.

## Read first

All six `CONTEXT` documents; `plans/SCENARIO_FOUNDATION_IMPLEMENTATION.md`; `engine/{engine,scenarioValidator,store}.js`; `scenarios/{missed_deadline.json,missed_deadline.schema.json}`; `replies/{fallbackStore,missed_deadline.en.json}`; `services/api/{server,offlineProviders}.js`; relevant engine/API/fallback tests.

## Assignments

Coder: add a static server registry with a validated SC-01 package only, exact identity `{scenarioId, contentVersion, schemaVersion, policyId, policyVersion, scoringVersion, contentHash}` and server-side session-context binding. Implement `getScenario`, `listScenarios`, `publicScenario`, and session-context resolution with the signatures in the master plan. Add `GET /scenarios` public allowlist catalogue while preserving `GET /scenarios/{id}`, `POST /sessions` aliases, response shape and existing SC-01 behaviour. Use an explicit, bounded SC-01 legacy engine/language adapter only; SF-01 must not introduce the target runtime hooks, because SF-02/SF-03 own that extraction. Bind offline providers and fallback selection to package and locale; choose only the actual selected NPC act. Unknown IDs fail closed. Add metadata preflight and targeted tests. No engine behaviour rewrite.

Reviewer: verify no global SPEC fallback, no function in serialized session state, no private export, unknown fail-closed behaviour and alias compatibility.

Tester: run the specified targeted engine/API/fallback tests after approval and report commands/results.

## Tests

Cover registry validation, public catalogue projection, unknown ID rejection, aliases, immutable package identity across sessions, package-scoped locale/fallback, and no fallback discovery/agreement credit. No live calls.

## Review

Validate package identity includes schema/content/policy/scoring/hash and sessions retain exact references. Confirm no other selector/story becomes enabled.

## Stop and ask

Stop for a new package, scenario content, schema semantic or public catalogue disclosure beyond D-37. Do not stop for the already-approved D-37 package identity or adapter contract.

## Exit

One explicit SC-01 package binds all paths; unregistered scenarios remain closed.
