# Scenario foundation status

| Item | State | Evidence / remaining work |
|---|---|---|
| SF-00 baseline and contract documentation | completed offline | Accepted 2026-10-23 on baseline commit `8768b95`; review approved and Luna verified 313/313 unit and 63/63 API, 0 failures, in a sanitized environment. Evidence: `out/sf00-unit.log`, `out/sf00-api.log`. No runtime changes, build, or live call. |
| SF-01 registry and sessions | not started | Static allowlist, validation, exact package binding, fail-closed unknowns and catalogue remain implementation work. |
| SF-02 engine and evidence | not started | Policy extraction and core-captured goal evidence remain implementation work. |
| SF-03 language and client metadata | not started | Guard/projection/classifier/metadata work remains implementation work. |
| SF-04 proof and integration | not started | Private proof package, integration evidence, history compatibility and final gate remain implementation work. |

Baseline: existing hand-derived SC-01 deterministic fixtures are smart 60 and trap 7 under scoring version 2. The SF-00 candidate fresh baseline is 313/313 unit and 63/63 API with 0 failures; it does not change the historical fixture meaning. Live evaluation cases remain NOT RUN and need fresh user permission. S1 acceptance remains pending; this documentation exception does not claim demo readiness.
