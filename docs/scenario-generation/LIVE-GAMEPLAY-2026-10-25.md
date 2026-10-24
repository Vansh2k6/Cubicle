# Live gameplay check — 2026-10-25

This report records the bounded live run on candidate `fd2d32d5932e31d64f6a4f2d8168cff795e1165f`. The final offline gate passed: `npm run verify:offline`, unit phase, API 96/96, build, and bundle scan (6 artifacts, 383 needles, 0 hits). The prototype contains five typed baselines (the unchanged missed-deadline package plus manager, HR, client, and coworker situations) and two bounded compositions (omitted product feature and earlier client delivery), assembled from four authored frames and 36 reviewed references.

## Gameplay results

The first pass ran one scripted session for each of the seven selections. The supplement ran a second session for each selection. In that second pass, prototype scripts intentionally targeted the opening and first-fact path; the 1/4 fact counts are expected for that pass and do not represent a full-fact retest. The table reports facts delivered out of four source facts, the three required core goals completed, deterministic points out of 75, and the share of turns that used a guarded fallback. Percentages are turn-level fallbacks, not session-failure rates.

| Selection | Pass A: facts | Core goals | Score | Fallback turns | Pass B: facts | Core goals | Score | Fallback turns |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Missed deadline (main baseline) | 0/4 | 0/3 | 15.7/75 | 85.7% | 0/4 | 0/3 | 15.7/75 | 92.9% |
| Manager scope change | 3/4 | 2/3 | 48.0/75 | 0% | 1/4 | 2/3 | 38.0/75 | 0% |
| HR transfer request | 4/4 | 2/3 | 52.9/75 | 37.5% | 1/4 | 2/3 | 38.9/75 | 16.7% |
| Client change after sign-off | 4/4 | 2/3 | 51.7/75 | 0% | 1/4 | 2/3 | 37.7/75 | 0% |
| Employee handover / coworker | 4/4 | 2/3 | 52.0/75 | 0% | 1/4 | 2/3 | 38.0/75 | 0% |
| Omitted product feature | 4/4 | 2/3 | 51.0/75 | 37.5% | 1/4 | 2/3 | 37.0/75 | 0% |
| Earlier client delivery | 3/4 | 2/3 | 46.7/75 | 12.5% | 1/4 | 2/3 | 37.7/75 | 20% |

All 14 sessions ended because the harness explicitly ended them; none auto-completed. No case completed all required goals. In each of the six prototype cases, G1 and G2 were recorded while the required G3 remained pending. The supplement did not produce a date-specific recap across all six prototype cases; ownership was sometimes recorded, but the recap-agreement event was not recorded across all six. The sessions therefore do not establish the requested recap outcome or smart-quality target. The authored source facts and triggers remained unchanged; prompt phrasing and the bounded classifier may limit which facts a scripted run reaches, so these results do not prove that every possible live exchange would fail.

The final guard run covered all seven cases. Injection attempts were contained in 7/7 cases. An unrealistic premature commitment was flagged and recorded in each of the six prototype cases. The unchanged main baseline did not classify or record the corresponding trap; that baseline guard case is **unrecognized**, not a pass.

The harness used `runTurn` with the selected immutable package, live classifier and NPC provider, existing engine, prompt, guards, delivery checks, commitment recording, and scorer. It was an in-process harness: these gameplay results do not constitute end-to-end browser or HTTP acceptance. The run did not call judge or coach; the optional judge `/25` and total targets remain **NOT RUN**, while shared readiness and R45 remain **BLOCKED**. Offline privacy scans and guards passed their tests, but this report does not certify that every exact live response contained no private source wording. No live transcript or private fact text is reproduced here.

## Usage and authorization

The gameplay grant is separate from the earlier prototype grant. At the final snapshot, `all-scenarios-live-gameplay` recorded 317 of 350 dispatches, 2,434,940 of 5,000,000 reserved tokens, and $0.3733372 of $0.50 reserved. Returned usage was 484,544 input and 95,708 output tokens, corresponding to an estimated short-tier usage cost of $0.0963084; this is not a billing statement. The earlier ledger remained at 28 calls (12,408 input and 1,856 output tokens), with an estimated short-tier usage cost of $0.0021688. Combined returned usage was 496,952 input and 97,564 output tokens, estimated at $0.0984772; this is not a billing statement. Combined records show 345 dispatches and $0.8621122 reserved across the two separate grants. No further live calls are planned.

The gameplay-grant cap is 350 dispatches, 5,000,000 reserved input-plus-output tokens, 1,024 output tokens per dispatch, and $0.50 reserved spend. The adapter applies its UTF-8 payload-byte-plus-2,048 input bound before dispatch, rejects bounds above 100,000, and reserves input at $0.10/M and output at $0.50/M. Shared reservations include retries and remain after errors or timeouts; no ledger was reset or raised. This run exercises the authorized bounded grant and does not authorize additional spending.

The offline implementation, gate history, and local operator instructions are recorded in [PROTOTYPE-STATUS.md](PROTOTYPE-STATUS.md). The deterministic scores above are the `/75` component; the smart-quality target is at least 85 on the full 100-point total. The optional judge `/25` was not run, so no full total can be compared with that target, and full targets remain blocked. This live check is evidence for review, not an acceptance claim; the main missed-deadline baseline and recap outcome remain unresolved.
