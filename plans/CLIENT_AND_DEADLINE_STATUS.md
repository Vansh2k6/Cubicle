# Client NPC and Deadline Story Status

**Date:** 2026-10-24
**Scope:** D-38 reusable remote client contact and `missed_deadline` content v2 / scoring v3 plan.

| Prompt | Status | Scope |
|---|---|---|
| CP-00 | Completed offline — documentation commit `c738aab` | Contract, baseline and affected-test inventory. Evidence: `out/client-plan-verified.log`. |
| CN-01 | Completed offline — approved source fingerprint `6ae36f049dd095d50dfb4ae18b91b82939585d1682242a64469fcc5751909c3f` | Ordinary remote-NPC metadata/audio only; 54/54 unit and 45/45 API, 0 failed/skipped. Evidence: `out/cn01-verified-unit.log`, `out/cn01-verified-api.log`. Default remains old three actors; invalid prototype actor rejection (400) and scanner-tool fixture are covered. Local commit `5f108c9`. |
| CN-02 | Completed offline/browser fixture only — approved source fingerprint `69bf44f462aca5ecc2d932094122dffd8abec221262bf6cd14451ad612ecd753` | Private-fixture phone UI only; 69/69 unit, 0 failed/skipped; prior API 25/25. Evidence: `out/cn02-verified-final-unit.log`, `out/cn02-verified-api.log`, `out/cn02-browser-report.json` and four desktop/narrow fixture screenshots. Default public scenario remains old three actors; DS-04 activation is required before any production-story enablement. |
| DS-01 | NOT STARTED | Content package, scoring v3, plan/revision rules |
| DS-02 | NOT STARTED | Language, provenance, canon and fallback paths |
| DS-03 | NOT STARTED | Debrief and public guidance |
| DS-04 | NOT STARTED | Integration, activation and final offline gate |

CP-00 documentation, CN-01 backend-only and CN-02 private-fixture UI evidence are recorded above. In the isolated Edge fixture checks (desktop 1440×900 and narrow 390×844), People opened settings without a session until Start; call first opened settings; typed Send then Hang up did not reopen on a pending reply; reopen used one session; narrow layout did not overflow; menu Cancel, keyboard W approach/phone E, and menu Confirm selection behaved as recorded. Detector ONCE exited 2 with baseline avatar/debrief-border matches and no introduced design flags. One earlier focused fixture run failed 15/16 on undefined metadata and was not reproduced; diagnostic coverage is retained in `out/cn02-verified-copy-fix.log` without a root-cause or application-fix claim. Performance is NOT MEASURED (software headless); physical microphone/speaker is NOT RUN. Full gate/build/bundle scans defer to DS-04. Every deadline-story slice remains NOT STARTED. No live evaluation, Stage 1 acceptance, or demo-ready claim is made; root review/document consistency then local checkpoint remain.
