# Scenario foundation implementation plan

## Authority and boundary

D-37 authorises this bounded foundation work while S1-P7 acceptance remains current. It creates no new story, phone mode, deeper story content, voice-cast change, dependency, editor, database, hot reload, plugin, arbitrary-code path, or extra model call. The three selector cards remain; email and call remain scripted until an authored migration. SC-01 is the only temporary explicit binding, and unknown scenarios fail closed.

The plan extracts one shared runtime without changing SC-01 behaviour or its accepted constants: scoring version 2, weights 30/20/15/10/25, fact allocations 8/7/5, penalties 8/4/3, all-NPC relationship population, and the hand-derived deterministic smart/trap results 60/7. Structural extraction does not bump `scoring_version`.

## Target package and ownership contract

Each registered package is an immutable authored value:

```js
{
  spec, replies, scoringProfile, presentation,
  policy: {
    id, version,
    rules,
    engine: { commitmentBounds, goalCandidates, pressureCandidates, relayAccuracy },
    language: { publicCanonLines, normalizeCommitment, canonCheck }
  }
}
```

`presentation` is a private actor-ID binding map: `actorId -> {sceneAnchor, voiceId}`. `publicCast` separately selects approved `id`, `name`, and `role` from public NPC fields and emits only those three fields plus the binding's `sceneAnchor` and `voiceId`. No private canon, facts, prompts, policy, scoring profile, or package identity is public presentation data.

`policy.rules` is private, serializable authored data: for SC-01 it pins actor bindings, the assistance binding, and `pressureSchedules` for date pressure on turn 4, or turn 3 at assertiveness 70, plus the callback gap of 3 turns. It is content-hashed and identity-pinned with the package; runtime functions are excluded from both the hash and session JSON. This is an authored bounded rules record, not a general DSL.

The serialized identity is `{scenarioId, contentVersion, schemaVersion, policyId, policyVersion, scoringVersion, contentHash}`. `contentHash` is calculated from canonical authored data, not functions. Functions remain only in a resolved runtime context; session JSON stores the identity and no package object/function/reference. The session store keeps the immutable resolved context keyed by session ID; ended score records retain a private serializable record plus identity. Old saved records stay readable through an explicit SC-01 version-2 compatibility path and never replay under current rules as a fallback.

The static server-owned registry has `getScenario(scenarioId) -> package | null`, `listScenarios() -> publicScenario[]`, and `publicScenario(package) -> approved public metadata`. It exposes the last two through `GET /scenarios` and existing `GET /scenarios/{id}`; existing `POST /sessions` retains aliases and response compatibility. `resolveSessionContext(sessionId) -> runtimeContext | null` is server-only and uses the session-store binding. All routes bind work to that context; an unknown ID is neither a deadline fallback nor a default scenario.

Policies are pure and read-only target interfaces, introduced by SF-02/SF-03 rather than SF-01. Engine operations are: `commitmentBounds({state,npcId,events,rules}) -> {minDay,cutoffDay,assistance:{active,factDelivered,helpAccepted}}`; `relayAccuracy({factId,text,state,rules}) -> true | false | null`, where `null` is distinct unknown; `goalCandidates({state,npcId,turnId,events,rules}) -> [{goalId,actorId,sourceIds,commitmentId?,requiresDelivery:boolean}]`; and `pressureCandidates({state,npcId,turnId,events,rules}) -> [{beatId,actorId,act,commitmentId?,sourceIds}]`. The core centrally validates all inputs/outputs, including declared beat and priority before selecting pressure. These candidates do not grant eligibility for a private fact outside core permission and do not form a DSL.

Language operations are `publicCanonLines({publicCanon,actorPublicContext,publicCast}) -> string[]`, which can never read private root canon; `normalizeCommitment({text,clock,publicDateLabels}) -> {day:number|null,clarification:string|null}`, which interprets only and never assesses feasibility; and `canonCheck({text,act,permittedCanon,authorisedFact,activeCommitment,clock,bounds}) -> [{code:string,factId?:string}]`. `canonCheck` adds no permission and cannot override the core leak check. The core alone mutates state, creates IDs, stages/commits delivery, allocates credit, controls priority and ends sessions. Pending fact reveal is the only allowed owned pending fact. A failed fallback creates no discovery or agreement credit.

`scoringProfile` is normalized from one authored data source. The scorer reads core-captured goal evidence, rather than recreating G1/G2/G3. Public debrief shape/layout stays unchanged; optional identity metadata is additive and history-compatible.

## Existing touchpoints to preserve

Implementation prompts must inspect and modify only their assigned paths after their coder has confirmed current callers/tests: `engine/engine.js`, `engine/config.js`, `engine/store.js`, `engine/scenarioValidator.js`, `engine/tests/engine.test.js`, `engine/tests/scenarioValidator.test.js`, `scenarios/missed_deadline.json`, `scenarios/missed_deadline.schema.json`, `replies/fallbackStore.js`, `replies/missed_deadline.en.json`, `llm/classifier.js`, `llm/guards.js`, `llm/pipeline.js`, `llm/promptBuilder.js`, `llm/tone.js`, `llm/tests/{classifier,guards,pipeline,prompts,guidance,fallback,bundleScan}.test.js`, `scoring/{config,score,debrief,coach,quotes}.js`, `scoring/tests/{score,feedback,debrief}.test.js`, `services/api/{server,offlineProviders}.js`, `services/api/tests/{api,threads,debrief,ending,static}.test.js`, `services/api/client.mjs`, `scripts/{verify-offline,bundle-scan}.mjs`, and the narrow frontend metadata consumers only where SF-03 proves needed. `engine/tests/engine.test.js` requires `engine.js`, `config.js`, and `store.js` to remain import-pure; inject package context explicitly rather than relaxing that guard. Existing verification scripts remain orchestration/scan touchpoints, not new test scripts.

## Ordered implementation

| Prompt | Deliverable | Required evidence |
|---|---|---|
| SF-00 | contracts, ownership map, baseline capture | existing regressions named; no runtime change |
| SF-01 | static registry, package validation, exact session binding, package-scoped offline/fallback providers and catalogue | SC-01-only legacy adapters; unknown fail-closed; metadata projection/preflight tests |
| SF-02 | bounded engine policy and captured goal-proof extraction; scoring profile extraction | SC-01 behaviour/60-7/constant regressions unchanged |
| SF-03 | language guards, classifier date/claim handling, prompt projections, coaching/guidance and fixed scene/voice metadata | public/private projection and current three-anchor mapping tests |
| SF-04 | non-production private proof package and integration evidence | cross-session/failure/history/scanner coverage; final full gate only |

Each coherent slice follows coder → Sol reviewer → Luna tester → root. Terra handles bounded wiring/docs, Luna prescribed offline checks, and Sol owns engine/security/scoring review. SF-01, SF-02, SF-03 and SF-04 each require their own Sol review/fix cycle; SF-04 also consolidates the final integration review. Live cases are saved as NOT RUN and require fresh user permission.

## Verification scope

SF-00 baseline is `npm test` (313 unit) and `npm run test:api` (63 API), both recorded as UNRUN FRESH until the tester executes them using a sanitized child environment with `LLM_PROVIDER` absent. The baseline map is `engine/tests/engine.test.js`, `llm/tests/{pipeline,guards}.test.js`, `scoring/tests/{score,debrief,feedback}.test.js`, and `services/api/tests/{threads,ending,debrief}.test.js`. Existing smart/trap values are hand-derived (60/7); no generated snapshot is expected or fabricated. `scoring/tests/score.test.js` already draws synthetic evidence from `evals/scriptedBot.mjs`, `evals/scriptedPaths.mjs`, and `evals/fixtures/s1-07-synthetic-sessions.json`; this is allowed synthetic input, not a new live evaluation. SF-01–03 run their respective targeted offline tests first. SF-04 alone runs the final `npm run verify:offline`, registered-private-package scanning, then `VITE_VOICE=1 npm run bundle:scan` in a sanitized environment; no live provider call is authorised.

## Out of scope

No scenario authoring, generated content, new selector cards, procedural scene construction, phone/voice change, public proof catalogue, production proof story, database, editor, plugin, DSL, arbitrary execution, model call, or UI redesign is included.
