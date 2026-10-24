# DS-02 — Language and fallbacks

**Head document:** `CONTEXT/AGENT.md` — master: [Client NPC and Deadline Story Implementation Plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md)

## Entry Goal

Classify and guard the two routes without granting model or fallback decision power.

## Read first

DS-01, D-38, [master plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md), classifier schema/prompts, language policy, guards, replies, fake providers and affected tests.

## Assignments

**Coder:**

Bind the new package’s typed classifier proposal parameters, date/scope normalization and provenance to the existing language policy and schema. Reuse only `proposed_plan`, `proposed_scope_cut`, `proposed_phased_delivery`, `confirmed_next_steps`, `recapped_agreement`, and `committed_deadline`; add no taxonomy, LLM decision or DSL. Reject/clarify ambiguous, unsupported, conflicting or non-authoritative date/scope claims before engine input. Bump role prompt versions only where role text actually changes and keep `{model,prompt_version,schema_version}` provenance/runs intact.

Use the exact wire and semantic/core split in the master's [DS-01 implementation boundary](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md#ds-01-implementation-boundary-approved-target-contract-2026-10-24). Reuse DS-01's reviewed text-corroboration operation rather than adding a second authority parser. Complete the actual language/offline hooks and explicit strict production-package allowlist here; no `privateProof` flag, legacy substitution or placeholder hooks. The default remains unchanged until DS-04. Unacknowledged material revisions block old-plan closing; bare recaps or classifier-proposed approvals never create evidence.

Implement package-bound public canon, relay and guarded fallback paths for all four actors. The model can acknowledge a player-attributed claim but cannot confirm an undisclosed fact, approval, capacity, date, scope or route. Apply the same full fail-closed path to offline/fallback outputs: parse/schema retry once then neutral guarded fallback, with no reveal/approval/recap/delivery credit. Keep English scope unless separately authorised.

**Reviewer:** Sol checks classifier/guard trust boundaries and provenance.

**Tester:** run changed classifier/guard/pipeline suites after review.

**Root:** decides any proposed taxonomy/schema expansion before it is implemented.

## Tests

Update `llm/tests/classifier.test.js`, `llm/tests/guards.test.js`, `llm/tests/pipeline.test.js`, `llm/tests/prompts.test.js`, `llm/tests/sf03Language.test.js`, and `services/api/tests/threads.test.js`; add `llm/tests/deadlineV2Language.test.js`. Add ≥5 classifier examples per changed event/language including full/phased proposal, ambiguous plan, unsupported date, wrong authority, scope mismatch and attributed claim. Test guarded canon/relay/injection, reveal isolation for F1–F4, fallback no secret/no approval credit, offline response, and role provenance. Run changed classifier/guard/pipeline tests only.

## Review

Sol reviews parser trust boundaries, R-01/R-02/R-09/R-10–14 and fallback credit denial.

## Stop and ask

Stop for root if a route needs a new event taxonomy, free-text agreement decision, extra locale, provider call, or a permissive fallback.

## Exit

Report prompt/schema versions, changed examples/tests and explicitly list live eval cases as NOT RUN. Hand off through reviewer → tester → root.
