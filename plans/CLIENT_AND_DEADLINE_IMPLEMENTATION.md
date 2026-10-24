# Client NPC and Deadline Story Implementation Plan

> **For agentic workers:** execute each prompt in order. The mandatory handoff is coder → Sol reviewer → Luna tester → root orchestrator. This plan is design only; it does not claim runtime implementation or passing checks.

**Goal:** Add one package-driven, reusable remote client contact and replace only the `missed_deadline` content with the accepted v2 story and scoring v3.

**Architecture:** Reuse the Scenario Foundation package/registry, pure engine, guarded pipeline, existing typed/voice/thread/caption/replay paths, and one scorer/debrief. Extend public presentation with an explicit remote-contact discriminator while preserving three physical anchors. Extend the existing commitment ledger with a bounded plan revision and participant approvals; do not build telephony, WebRTC, a phone session API, a separate conversation pipeline, new taxonomy, or a new room.

**Tech stack:** Existing JavaScript ES modules, Node `node:test`, Vite, Three.js, local voice sidecar; no dependency or live-provider call.

**Spec:** `CONTEXT/AGENT.md`, `CONTEXT/RULES.md`, D-38, and this plan.

## Global constraints

- Current phase remains S1-P7 acceptance pending. D-38 only permits these bounded coherent slices under R-63/R-64; it closes no acceptance gate and authorises no demo claim.
- Server packages remain private. R-08 public metadata retains physical `{id,name,role,sceneAnchor,voiceId}` unchanged, or remote `{id,name,role,contactMode:"phone",voiceId}` with no `sceneAnchor`; never leak facts, policy, prompts, or private canon.
- The fixed three physical anchors are internal IDs `maya`, `jordan`, `sam`, presented as Snehal Mane, Vansh Singh, Prathamesh Surwase. The new remote actor is `client`, Rohan Mehta, Client Operations Lead, `contactMode:"phone"`, no avatar/anchor, voice `en_GB-alan-medium` reused only by this new contact. It remains an ordinary NPC spec/state/mood/facts/events/provider/thread actor; contact mode only changes presentation.
- Phone entry lives at the existing shared work island with nearby E/context button; People/text-only lists the remote contact too. Before session creation it reads only existing `GET /scenarios/{id}` public metadata; it makes no session, LLM or microphone call and imports no frontend private fixture. Server never enforces physical proximity for remote. Existing typed/voice/thread/captions/replay stay shared; hangup cancels capture/playback and closes UI, preserving thread. Restart/end/scenario change invalidates late UI/audio; hidden scene has no interaction.
- New content uses public scenario ID `missed_deadline`, content v2 and scoring v3. Keep `scenarios/missed_deadline.json`, its original schema and legacy replies immutable. Author `scenarios/missed_deadline.v2.json`, `scenarios/missed_deadline.v2.schema.json` and `replies/missed_deadline.v2.en.json`; DS-04 alone switches the default binding. Existing captured scoring-v2 records, profile/identity pins and 60/7 smart/trap history remain meaningful; no replay. Schema v2 is required for the plan shape.
- Preserve weights 30/20/15/10/25, penalties 8/4/3, bands, 20-turn cap, assertiveness pressure turns 4/3 and callback gap 3 unless targeted evidence proves an incompatibility. Report a root decision rather than inventing alternate numbers.
- No fact discovery/reveal condition (direct or indirect) may complete a goal. Each goal uses distinct delivered proposal/confirmation/recap source IDs; no source is allocated twice. An actor may acknowledge an attributed player claim but never confirm an undisclosed fact.

## Package content to author exactly

**Briefing:** The onboarding portal handover is overdue since yesterday; its public launch is Friday (day 3). The package covers submission, reliable confirmation, automatic routing, and dashboard. Do not add volumes, hours, or other numeric constraints.

| Fact | Owner / weight | Precise private content and safe trigger class |
|---|---|---|
| F1 | Snehal / 5 | The player wrote that routing was “included,” but routing was only a possible improvement and was never estimated or agreed with Vansh. Triggers: `asked_background`, `asked_why_urgent`; neither is a goal event. |
| F2 | Vansh / 6 | A reusable submission/storage module exists only. A full Friday plan needs a reserved pair for fix plus QA; an alternative is core Friday and a separately agreed Monday (day 6) routing/dashboard follow-up. Trigger: `asked_for_help`, never a goal event. |
| F3 | Prathamesh / 4 | The success message can appear before save acknowledgement, causing a failed save to look successful; either route must fix and verify save, failure and retry. Triggers: `asked_impact`, `asked_advice`; neither is a goal event. |
| F4 | Rohan / 5 | “I asked about the dashboard because I thought submission and confirmation were already done.” Friday needs core business functionality plus a trustworthy receipt; client operations can manually route only with instructions, an explicit owner, and Monday follow-up. Trigger: `asked_expectation`, never a goal event. |

Every fact needs these authored values in the package, with a guarded 1–3 sentence reveal compatible with the existing response limit:

| Fact | Reveal text | Paraphrase questions | Leak-keyword examples | Debrief question |
|---|---|---|---|---|
| F1 | “You wrote that routing was included. Vansh had only raised it as a possible improvement; it was not estimated or agreed.” | “What exactly did I promise on routing?”; “Why is this handover urgent?” | `routing`, `included`, `possible improvement`, `estimated`, `agreed` | “What had actually been agreed about routing?” |
| F2 | “The submission and storage piece is reusable, but that is all. Friday needs a reserved pair for the fix and QA; otherwise we can discuss core Friday with routing and dashboard followed up Monday.” | “What can we reuse?”; “Can you reserve help for this plan?” | `submission`, `storage`, `reserved pair`, `QA`, `Monday`, `dashboard` | “What capacity and sequencing did Vansh need?” |
| F3 | “The success message can appear before the save is acknowledged. We need to fix and verify save, failure and retry on either route.” | “What could make release unsafe?”; “What should QA verify?” | `success message`, `save acknowledgement`, `failed save`, `failure`, `retry` | “What must be fixed and verified before either route?” |
| F4 | “I asked about the dashboard because I thought submission and confirmation were already done. For Friday we need core business functionality and a receipt the customer can trust. Client operations can manually route only with instructions, a named owner and a Monday follow-up.” | “What does the client need Friday?”; “Could operations manually route?” | `trustworthy receipt`, `manual route`, `instructions`, `owner`, `Monday follow-up`, `dashboard` | “What would client operations need for a manual route?” |

Possibility of a workaround is not approval of a plan. No echo/relay duplicates discovery.

| Goal | Weight | Engine-owned delivered proof, disjoint from fact triggers |
|---|---:|---|
| G1 Own the late handover and honest status | 10 | Snehal turn with distinct `took_ownership` + `gave_honest_status`; guarded delivery commits it. Routing correction cannot earn G1. |
| G2 Establish capacity and QA plan | 10 | Technical-readiness achievement only: Vansh’s reservation and Prathamesh’s QA fix/test-plan are distinct delivered `proposed_plan`/`confirmed_next_steps` evidence. It does not require F2/F3 revelation. |
| G3 Correct routing promise and form agreement | 10 | External-alignment achievement only: routing correction is acknowledged by `client`, then `client` and `maya` accept the same revision and matching recaps are delivered to each. Valid `jordan`/`sam` technical approvals on that current revision are a prerequisite, never re-scored/reallocated G2 evidence. |

The classifier may emit two different supported events for one turn, but cannot relabel one achievement or allocate one source twice. Reconfirmation of the same technical readiness earns no additional credit even with new IDs. A revision invalidates current approvals/recaps; completed G2 can remain earned once, but G3 cannot rely on stale approval.

## Closed plan evidence shape

Every approval/recap record has stable actor IDs and `{source_id,turn_id,actor_id,revision,delivered}`. All slot claims need supporting user text; classifier output never approves a slot. Core stages evidence, then commits it only after guarded delivery. The generated plan is attached to the existing commitment as:

```js
{ generatedPlanId, revision, existingCommitmentId, route: "full" | "phased",
  primary: { day: 3, scope: ["submission", "reliable_confirmation", "routing", "dashboard"] },
  followUp: null | { day: 6, scope: ["routing", "dashboard"] },
  manual: null | { owner: "client_operations", instructionsOwner: "alex", instructionsDueDay: 3 },
  engineering: { actorId: "jordan", reservation: "pair_before_launch" | "followup_by_day6" },
  qa: { actorId: "sam", fix: "await_save_ack", checks: ["save_success", "save_failure", "retry"] },
  correction: { routing_was_unapproved: true, evidence: { ackBy: "client", source_id, turn_id, actor_id: "client", revision, delivered: true } } }
```

`full` has all primary scope and no follow-up/manual slot. `phased` has primary submission/reliable confirmation, the day-6 routing/dashboard follow-up, and the required manual slot. A policy-only `accept_plan` act may stage these acknowledgements after higher-priority pressure/reveal acts and before generic replies; final closing priority remains unchanged. It is not a taxonomy event or classifier decision.

Two permitted route shapes attach to one existing commitment and one proposed plan revision:

- **FULL:** all four capabilities Friday/day 3; Vansh’s explicit pair, fix and QA checks; client acceptance; Snehal approval; player corrects routing expectation; same plan is recapped to Rohan and Snehal.
- **PHASED:** core Friday/day 3; routing is manually performed by client operations and dashboard waits to Monday/day 6; player gives instructions; client confirms capacity/consent, Vansh reserves Monday and QA plan, Snehal approves; same plan is recapped to Rohan and Snehal.

Neither route earns a bonus. Unsupported date, wrong authority, unknown scope, omitted manual owner/instructions/follow-up, or player claim without an engine-confirmed actor approval fails or asks for clarification. A new plan revision invalidates affected approvals/recaps. Do not model Monday as a global deadline or invent a new commitment type.

## Ordered assignments

1. **CP-00 contract and baseline** — freeze public/engine/package shapes, tests and a manifest before runtime work.
2. **CN-01 remote actor and API** — implement reusable remote metadata/contact selection and shared interaction lifecycle without migrating SC-02/03.
3. **CN-02 phone and conversation** — attach client entry at the work island and apply cancellation/staleness/accessibility tests.
4. **DS-01 package and plan rules** — create content v2/scoring v3 and the minimal plan-revision approval extension.
5. **DS-02 language and fallbacks** — package-bound classifier/provenance/canon/relay/fallback paths.
6. **DS-03 feedback and guidance** — scorer/debrief/guidance using v3 evidence, no legacy shortcuts.
7. **DS-04 integration and activation** — activate only after gates, preserve legacy records, run one full offline verification and write the ignored manifest.

## Required verification matrix

Each slice runs affected offline unit/API tests early; only DS-04 runs `npm run verify:offline` after the frozen reviewed candidate, then default/voice bundle scans with sanitized environment. No generated reports/logs/manifest are committed. Live cases are saved as **NOT RUN** and never invoked.

- Scenario validation: four facts total 20, goals 10 each/30, v3, unchanged categories/weights/penalties/bands, private/public projection, old v2 compatibility.
- Full and phased positive paths; premature/bad plan; wrong authority; missing client consent, manual owner/instructions, or Monday follow-up; missing QA plan; revision invalidation; no approval/credit on fallback or failure.
- R-01/R-02/R-09: untriggered secrets, injection, echo/relay, attributed claim, guarded fallback, and no leaked approval.
- Remote public privacy, exactly three physical identities/anchors, fourth remote identity, cross-session identity pin, old legacy cast; phone hangup/audio cancellation and late UI rejection.
- Smart/trap authored fixtures target ≥85 / <50 with hand-checked expected arithmetic. Any quality-only fake judge is offline fixture evidence, never real-model acceptance.

## File map

Expected bounded files include `shared/presentation.js`, package registry/metadata and public projections, `engine/engine.js` plus validator/tests, new `scenarios/missed_deadline.v2.json`, `scenarios/missed_deadline.v2.schema.json`, `replies/missed_deadline.v2.en.json`, explicitly supported production-policy registration, package language/scoring assets, `services/api/*` tests, `src/main.js`/office/voice lifecycle and targeted CSS/tests, guidance/debrief/scoring tests. Do not alter legacy `scenarios/missed_deadline.json`, its original schema/replies, legacy adapter CONFIG, unrelated SC-02/03 or voice architecture. New captured profiles use v3; unknown identities fail closed.

## Stop conditions

Stop and ask root if an implementation needs new taxonomy, additional date/volume/hour number, a second engine/pipeline, a telephony/WebRTC session route, a physical fourth anchor, a voice download/new voice path, a score category/weight/penalty/band change, a fact-reveal goal dependency, or an unbounded multi-party commitment rewrite. Sol owns unresolved scoring/security/concurrency correctness.

## Completion handoff

Root reviews the frozen candidate against D-38/R-08/R-22/R-63/R-64, then Luna runs the defined gate. Runtime remains unimplemented until that workflow completes.
