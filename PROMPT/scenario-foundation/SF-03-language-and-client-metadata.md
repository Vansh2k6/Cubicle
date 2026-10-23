# SF-03 — Language and client metadata

> **Head document: `CONTEXT/AGENT.md`.** Follow its workflow; D-37 authorises this bounded implementation prompt.

**Entry:** SF-02 accepted. **Goal:** make package-bound language checks and public metadata explicit without changing the current UI or voice scope.

## Read first

All six `CONTEXT` documents; master plan; `llm/{classifier,guards,pipeline,promptBuilder,tone}.js`; `scoring/{coach,quotes,debrief}.js`; relevant LLM/scoring tests; narrow metadata consumers only after identifying them.

## Assignments

Coder: replace only the applicable SF-01 legacy language adapter with the target pure language interfaces from the master plan: public canon lines, commitment normalization and canon checks. Route classifier date/claim treatment, prompt projections, coaching/guidance and public metadata through the bound package. `canonCheck` remains an additional finding source and cannot override core leak/ownership permission. Preserve guard ownership/leak limits. Map character IDs only to the current three fixed physical scene anchors and approved voice identity metadata; do not build procedural scenes, phone mode or alter voice casts. Keep existing key maps where possible and do not redesign UI.

Reviewer: verify public context receives approved public/known values only and all registered private sources, including the later proof package, are scan-covered. Ensure language policy cannot grant broad permissions.

Tester: run targeted classifier/guards/pipeline/prompts/guidance/feedback tests after approval; no provider calls.

## Tests

Cover approved public projection versus private root, multi-date/claim canonical checks, coach historical knowledge boundaries, locale-bound fallback, fixed three-anchor mappings and absence of private package exports to the frontend.

## Review

Confirm no UI redesign, model call, story expansion or voice-cast change entered the candidate.

## Stop and ask

Stop for a new locale semantic, new voice cast, public private-canon field, or new scene anchor.

## Exit

Language and metadata are package-bound while current visible product scope remains intact.
