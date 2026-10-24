# Client and deadline verification pending

CP-00 through DS-04 are accepted offline, with bounded rendered browser verification. This branch now defaults to the completed deadline content v2/schema 2/scoring v3 package; explicit legacy packages and captured retries remain supported. This handoff does not establish Stage 1 or demo readiness. Detailed evidence and earlier failed gates remain in [status](CLIENT_AND_DEADLINE_STATUS.md).

Implemented safeguards include one shared semantic extractor, core-owned authority/revision/delivery checks, captured package binding, material plan delivery to each approving actor, owner-only NPC fact context, guarded fallback without credit, validated scoring proof, and private-source enumeration. Offline regression coverage does not establish unrestricted natural-language robustness.

| Verification | Status | Evidence / resume with |
|---|---|---|
| Extended natural paraphrases, unusual word order and exact-wording sensitivity beyond authored positive cases | NOT RUN | Extend versioned cases around observed user phrasing; retain one shared extractor and reject unsupported material claims. |
| Extended refusal, attribution, prompt-injection and contradictory-clause permutations beyond essential regressions | NOT RUN | Add concrete failures, review the trust boundary and run affected checks; no exhaustive robustness claim. |
| Real classifier/generator recall, precision, naturalness and leakage evaluation | NOT RUN | Obtain explicit live-call authorization and evaluate authored cases with pinned prompt/model/schema provenance. |
| Final offline suites and default/voice build scans | PASSED AS COMPOSED EVIDENCE | Full gate passed 402 unit / 83 API and default scan before final scanner-only delta (`out/ds04-verified-offline-accepted.log`). Final delta passed 10 scanner tests and both builds/scans: default 6 / voice 7 artifacts, each 383 needles, zero hits (`out/ds04-verified-scanner-final.log`, `out/ds04-default-bundle-final.log`, `out/ds04-voice-bundle-final.log`, `out/ds04-verified-scanner-summary.log`). No full-suite rerun on final scanner hash. |
| New-story desktop/narrow UI walkthrough | PASSED, BOUNDED OFFLINE | Root inspected images and actual full/phased 18-turn paths with walking/client call, four facts, score 65/v3, no runtime exceptions or narrow debrief overflow. Reports: `out/ds04-browser-report.json`, `out/ds04-browser-supplement.json`; includes corrected Practice copy, phone hangup and menu lifecycle. |
| Real microphone/speaker, remote-contact playback, captions/replay across restart/end | NOT RUN | Explicit device/live authorization and existing local voice lifecycle checks; fake providers/headless UI do not establish device behavior. |
| Latency, concurrent load, frame rate and performance budget | NOT MEASURED | Measure accepted final source on representative hardware. Software headless screenshots are not frame-rate evidence. |
| Scoring-v3 proof consumption and historical compatibility | PASSED OFFLINE | DS03 independently passed 123 unit / 19 API; DS04 retained legacy 60/7 and captured retries. Full/phased deterministic 65 plus quality-only fake-judge 25 with verified quotes equals fixture 90, not real-model quality acceptance. |
| Final real-model smart/trap and feedback-quality acceptance | NOT RUN | Execute authorized live acceptance cases; offline deterministic/fake-judge arithmetic and browser paths do not close Stage 1 acceptance. |

Resumption checklist:

1. Read current CONTEXT instructions, accepted master/status and frozen authored manifests; verify hashes before using earlier results.
2. Keep accepted v2 default and exact captured legacy retry binding; preserve other worktrees and the old 5180 preview.
3. Inspect actual logs and distinguish failed gates, composed final evidence and unrun checks. Generated reports/logs/builds stay excluded from authored manifests and commits.
4. Send any concrete fix through coder → reviewer → tester → root; select affected checks from the actual change rather than repeating unneeded stress loops.
5. Obtain explicit authorization before live/provider or device work; retain pending labels until measured evidence exists.

Earlier failures remain recorded in `out/ds04-verified-offline.log`, `out/ds04-verified-offline-final.log` and `out/ds04-verified-voice-bundle.log`. Scanner corrections cover observed public prose/code contexts only, with standalone/private-prose/full-fact/template/policy controls retained. Final accepted source fingerprint: `0fb81fa00f7d6360115cd31d727730a949e9c0b6c3248c2badfed8f36a6617b0`; authored cumulative fingerprint before final docs: `13590f02fd724fda2b75d6a55bfab6c49f203d17ee2f5eb003adb3a5f6874ec2`.

Impeccable detector evidence (`out/ds04-detector.json`, exit 0, no findings) is mechanical; root's browser evidence supplies the bounded rendered checks. The existing >500 kB office-chunk warning remains. Scoring trusts immutable server-captured package identity/records and does not cryptographically authenticate a wholly rewritten server record. No client API accepts arbitrary scoring records. No real-model, hardware, performance or demo-ready claim is made.
