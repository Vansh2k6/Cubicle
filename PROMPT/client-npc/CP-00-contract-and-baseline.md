# CP-00 — Contract and baseline

**Head document:** `CONTEXT/AGENT.md` — master: [Client NPC and Deadline Story Implementation Plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md)

## Entry Goal

Freeze the exact D-38 contract and source baseline without changing runtime.

## Read first

`CONTEXT/AGENT.md`, all six CONTEXT documents, `CONTEXT/RULES.md`, D-38, and [master plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md). This is documentation/baseline only: do not alter application runtime.

## Assignments

**Coder:**

Audit the Scenario Foundation package/registry, `shared/presentation.js`, public scenario/session projections, voice map, API routes, office interaction, voice cancellation, engine ledger, validator, scorer, debrief and relevant tests. Produce `out/client-plan-manifest.json` (ignored) listing every proposed changed/new document/code/test path and a content hash; do not put secrets, fact text, or reports in it. Record the current limitations: `publicCast` only supports physical anchors; `agreement_npc` and acceptance/recap are scalar/whole-commitment. Confirm the proposed contract below before later slices:

```js
// Existing physical output stays byte-for-byte compatible.
{ id, name, role, sceneAnchor, voiceId }
// New remote public output only.
{ id, name, role, contactMode: "phone", voiceId: "en_GB-alan-medium" }
// Package-private registered binding input.
{ contactMode: "phone", voiceId: "en_GB-alan-medium" }
```

The actor is an ordinary `npcs[]` actor with normal state, mood, facts, events, provider and thread. There is no Client class, second entity model, phone-session backend, service or protocol. At most three distinct physical anchors plus one registered remote phone contact per package; reject unknown modes/voices and arbitrary phone targets. Keep legacy four-key `VOICE_MAP` compatibility and existing uniqueness rules; allow this explicit known remote voice reuse only through the registered package binding. Pin identity across a session. Freeze schema version 2 and use the sole closed plan/evidence contract in the master plan’s [Closed plan evidence shape](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md#closed-plan-evidence-shape); do not restate or vary it here. Keep `scenarios/missed_deadline.json`, its original schema and replies immutable; freeze new v2 paths as `scenarios/missed_deadline.v2.json`, `scenarios/missed_deadline.v2.schema.json` and `replies/missed_deadline.v2.en.json`. Legacy adapter CONFIG remains v2; modern captured profile is v3, exact captured identity governs retry and unknown identity fails closed.

**Reviewer:** Sol checks the frozen contract/manifest against R-01/R-02/R-08/R-22 before runtime work.

**Tester:** validate document links, manifest JSON and contract consistency only; no runtime test is implied.

**Root:** accepts or returns this documentation candidate.

## Tests

Specify, do not run runtime tests: update `llm/tests/sf03Language.test.js`, `services/api/tests/scenarioRegistry.test.js`, `services/api/tests/threads.test.js`, `services/api/tests/voice.test.js`, `voice/tests/speechWiring.test.js`, `voice/tests/client.test.js`, `engine/tests/scenarioValidator.test.js`, `scoring/tests/debrief.test.js`, and `llm/tests/privateProof.test.js`; add `services/api/tests/clientRemote.test.js` and `engine/tests/deadlineV2Plan.test.js`. Cover public projection privacy, old physical projection unchanged, invalid binding rejection, package actor lifecycle parity, route target authorization, old scoring-v2 record compatibility, and no secret/metadata bundle inclusion.

## Review

Sol must confirm R-01/R-02/R-08/R-22 boundaries, remote identity contract, schema compatibility and bounded plan-ledger extension before code starts.

## Stop and ask

Stop for root if source proves another API route, client model, contact mode, voice mapping, package schema migration, or plan representation is required beyond this contract.

## Exit

Return only the frozen manifest, touched-path inventory, source limitations and unimplemented/test status. Root alone accepts CP-00; do not claim tests or runtime behavior passed.
