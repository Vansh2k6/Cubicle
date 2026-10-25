# Main-based generation port — 2026-10-25

User requested a fresh branch from current GitHub main, with only scenario generation added and a compact description-first popup. Base: `cd88ef9106b76727247dabe7ad1647aa13878ea4`. Branch: `codex/main-custom-scenario-generation`. This supersedes the earlier divergent PR #4; no changes to main or the main chat checkout.

## Approved bounded design

Reuse main's exact engine, default/HR/legacy packages, cast setup, presentation, classifiers, provider/budget logic and scorer. Import only the existing four authored component frames and immutable reference inventory, their deterministic two request matchers/assemblies, and validation/registry/API integration. Additive prototype registry delegates ordinary lookup/listing to main's registry. Only trusted server-constructed prototype inputs receive the existing private schema validation path and one explicitly bound help-acceptance flag. Reject unsupported requests, tampering, arbitrary client specs and non-loopback prototype access.

The normal classifier → engine → prompt → NPC → guards → commitDelivery path remains. Support hyphenated authored fact IDs in prompt and offline-act parsing. No new events, scoring constants, maps/cast/spawning, provider dispatch or spend grants. The generator does not write dialogue trees. Goal/fact credit remains engine-controlled and delivery-backed. The component contract/versions are copied unchanged, with immutable source hashes.

Five prepared prototype choices and two bounded compositions remain accessible through an additive “Try scenarios” popup. Public description is shown once, custom input and public goals are expandable, explicit local review gates launch, and dynamic text is escaped. Prototype session/turn UI reports offline/live and guarded fallback without exposing private mechanics. No office/voice redesign or generated 3D integration in this port.

Retain the already accepted private local-preview boundary from the source prototype, under a distinct decision entry to avoid colliding with main's HR D-39. Full shared/demo/R-45 and judge/total gates remain blocked; no live call is authorized by this port. No independent subagents are used because this side conversation prohibits them; do not claim independent review.

Test offline natural-wording fact/goal completion, wrong-owner/early/injection, exact selected spec through runtime/scorer/debrief, main's HR/deadline/cast regressions, unsupported/tampered requirements, review gating, escaping, provider fallback privacy and loopback route restrictions. Run focused checks and final `npm run verify:offline`; report exact source identity and limits. Browser/live judge acceptance remains NOT RUN unless separately verified/authorized.

## Integration findings

Main already has package-specific classifier/NPC prompt hooks. Prototype recap/disclosure instructions use those hooks under version `prototype-v1` and a prototype-only session manifest; ordinary HR/deadline prompt versions are unchanged. Main's exact authorized-disclosure instruction takes precedence. Existing provider/grant code is not imported from the divergent branch. Prototype public `provider_mode` and `reply_source` are additive only on prototype sessions; normal response shapes stay unchanged.

Private bundle scanning now includes every prototype's sealed facts and server-only policy material while treating selector IDs/public cast metadata as public. No keyword exemptions were added. Existing main HR/cast packages stay in default lookup and listing.

The first full run exposed a missing additive button in a cast-setup UI fixture; the fixture was updated. A subsequent run repeatedly hit Windows Node's `UV_HANDLE_CLOSING` native assertion in main's terminal script at immediate `process.exit`. The terminal harness now sets `process.exitCode` and lets its requests close naturally, with interactive/script paths kept separate. The existing four ending tests pass after that minimal harness-only correction. No engine/scoring change was used to pass a test.
