# Client and deadline verification pending

This is a verification handoff, not an acceptance or demo-readiness claim. DS02 is accepted offline (checkpoint `963ddc2`). The production default remains the legacy story. DS03 now implements schema-v2/scoring-v3 evidence consumption in a candidate awaiting independent review and verification; it is not final integration acceptance.

Implemented safeguards in the DS02 candidate include one shared semantic extractor, core-owned authority/revision/delivery checks, exact package binding, material plan delivery to each approving actor, owner-only NPC fact context, guarded fallback without credit, and private-source enumeration. Their verification status is determined by the frozen manifest and reviewer/tester reports; implementation alone does not establish correctness.

| Deferred verification | Status | Resume with |
|---|---|---|
| Extended natural paraphrases, unusual word order and exact-wording sensitivity beyond the authored positive cases | NOT RUN | Extend the versioned language cases around observed user phrasing; keep one shared extractor and reject unsupported material claims. |
| Extended refusal, attribution, prompt-injection and contradictory-clause permutations beyond essential regressions | NOT RUN | Add concrete failing examples, review the trust boundary, then run affected tests. No exhaustive robustness claim is made. |
| Real classifier/generator recall, precision, naturalness and leakage evaluation | NOT RUN | Obtain explicit live-call authorization, use the pinned prompt/model/schema manifest, and evaluate the authored cases without publishing private inputs. |
| Full offline gate, default/voice build and artifact scans for the final deadline integration | NOT RUN | After DS03/DS04 source review, run the authorized final gate once on the frozen candidate. Synthetic scanner controls do not replace artifact scans. |
| New-story browser and narrow-screen walkthrough | NOT RUN | After approved integration, use an isolated browser profile and the normal public API; preserve other previews/worktrees. |
| Real microphone, speaker, remote-contact playback, captions and replay across restart/end | NOT RUN | Use explicit device/live authorization and the existing local voice lifecycle checks. Offline fake providers do not establish device behavior. |
| Latency, concurrent load and performance budget for the new story | NOT RUN | Measure the accepted final source and report observed timings and limits. No repeated stress loops are claimed. |
| New scoring-v3 consumption and historical-record compatibility | CODER CHECKS PASSED; independent review/verification pending | DS03 affected checks: 123 unit and 19 API tests, zero failed/skipped; `out/ds03-coder-unit.log`, `out/ds03-coder-api.log`. Full/phased records score 65 deterministic; an offline quality-only fake judge adds 25 with verified quotes. These fixtures do not establish real-model quality. Follow the frozen manifest through Sol → Luna → root. |
| Final integrated smart/trap and feedback-quality acceptance | NOT RUN | Complete DS04 activation/integration and its authorized final gates. DS03 preserves legacy 60/7 fixtures and the existing debrief layout; it does not establish live quality or final demo readiness. |

Resumption checklist:

1. Read the current CONTEXT instructions, accepted master plan and latest frozen manifest; verify source hashes before trusting earlier results.
2. Finish only the assigned slice, retaining unpublished v2 registration and the legacy default until DS04 authorization.
3. Inspect affected test logs for actual commands, counts and failures. A draft or partial pass is not final approval.
4. Send the exact source candidate through reviewer → tester → root. Any later fix repeats that handoff.
5. Update this handoff with concrete verified evidence only; leave unrun live, device, browser, performance and extended-language checks marked NOT RUN.

DS03 candidate UI checks are limited to public-guidance/scene-label unit coverage and the Impeccable detector (`out/ds03-detector.json`, exit 0, no findings). Rendered browser verification remains deferred to the final DS04 pass. Scoring trusts server-captured package identity and immutable records; it does not authenticate an attacker-rewritten server record cryptographically. No client API accepts arbitrary scoring records.
