# S1-14 — local demo hardening and exit matrix

PART: S1-14. PHASE ITEMS: P7.3, P7.3a, P7.4 implementation; P7.1 live execution and P7.2 tuning deferred. Date: 2026-10-18.

STATUS: accepted for offline implementation after code review, root execution, an independent Sol tester evidence/hash audit and root acceptance. **Stage 1 is not demo-ready.** D-28 already authorizes deferring live gates; no additional call or tuning was made.

IMPLEMENTED: built-only loopback demo server with same-origin API, immutable preloaded regular assets, private/hidden-path and traversal rejection, no symlink traversal, explicit static method/MIME/HEAD handling, API-first routes and debug disabled. Development API defaults/override remain supported. One offline verification command clears live-provider/key/debug child environment and runs all existing checks fail-fast. Existing Restart scenario is reused; it clears the active run and keeps saved progress. No new UI, provider, engine, prompt, scoring rule or dependency.

FOCUSED EVIDENCE: 6/6 static/API/base tests passed before full verification, including raw HTTP forbidden paths against combined demo and API, copied private fixture paths, immutable bytes, symlinked directory/root, HEAD/MIME/405, missing dist and production/dev/override API selection. Review also exposed an existing malformed-URL crash boundary; sanitized 400 handling and a same-server recovery regression now pass. Full execution and browser results follow separately.

FINAL EXECUTION: after Sol approval, root ran `npm run verify:offline`, exit 0: 217/217 offline tests, 35/35 API tests, build PASS and bundle scan PASS (5 files, 81 needles, zero hits). The unchanged large-chunk warning remains. Root then ran the separately reviewed evidence script `node evals/reports/s1-p7/check-serving.mjs`, exit 0: 24 current-build path checks passed, HTML/HEAD/MIME and malformed-target recovery passed, and all 87 runtime hashes matched the captured baseline. Exact path/status results and hashes are in s1-14-verification.json. The full command was root-executed after a delegated test turn stalled. The independent Sol tester approved an evidence audit, recomputed all 87 current hashes with zero drift, passed git diff --check and parsed the NOT RUN case; it did not claim to have run the HTTP checks. This preserves the reviewed candidate and explicit execution attribution.

BROWSER: root opened the actual built app at 127.0.0.1:4173, loaded setup through the same-origin API, typed an ownership/status response and ended with provisional 25/code25/judge0 feedback. Restart retained the score summary in My progress and led to fresh setup plus an empty thread. No fresh browser errors. Screenshots: s1-p7/built-debrief-desktop.jpg and reset-preserved-progress.jpg. This is a limited synthetic offline rehearsal, not a full smart/trap live acceptance run.

| Stage 1 criterion | Existing evidence and outstanding acceptance | Status |
|---|---|---|
| 1. Hidden fact hidden | Offline guards and owner tests exist. >=5 real untriggered runs for each F1–F3 are absent. | NOT RUN |
| 2. Right question reveals | Engine probe/gate and paraphrase fixtures exist. Real-classifier paraphrases and moderate second asks remain unmeasured. | NOT RUN |
| 3. Trap works | Synthetic trap deterministic 7, code flag/quote fixtures and limited offline browser run. Repeated live callback/quote acceptance absent. | NOT RUN |
| 4. Smart path works | Synthetic deterministic 60 with 25 judged points reserved. Live high score >=85 and positive close are unproven. | NOT RUN |
| 5. Injection reveals nothing | Offline injection/guard fixtures exist. Three real-model injection runs absent. | NOT RUN |
| 6. Evidence integrity | Offline quote validator and debrief fixtures. Real judge/coach transcript evidence not collected. | NOT RUN |
| 7. Latency and resilience | Mocked timeout/429/budget fallback and retry fixtures. No guarded-turn p50/p95 with sample/model/network/manifest context. | NOT RUN |
| 8. Retry preserves feedback | Offline/API/browser same-settings, history, comparison and failure-recovery checks passed in S1-11/12. Three live comparisons absent. | NOT RUN live; offline PASS |
| 9. Fixed sliders change engine/tone and appear in debrief | Offline anchors, 10/90 trajectories, tone prompt and browser/debrief checks passed in S1-12/13. Paired real-model tone/guard runs absent. | NOT RUN live; offline PASS |
| 10. Credit and canon | Offline disjointness/idempotency, delivered-only disclosure, canon/echo, historical coaching and quote checks exist. Real-model acceptance batch absent. | NOT RUN |

DEFERRED PLAN: evals/cases/s1-14-acceptance.NOTRUN.json lists repetitions, >=5 untriggered runs per fact, paired settings and measured latency requirements. Existing NOTRUN runners are plan stubs; an executing batch harness still needs implementation/review before authorized execution. The operator guide is evals/reports/s1-p7/demo-script.md and includes separate provider-fallback and network-Retry plans. A smoke connectivity result is not any matrix gate.

RULES: R-08 built-asset boundary, R-03 debug/public allowlist, R-50/R-66 credentials/logs, R-61/R-62/R-63 unrun live gates and no demo-ready claim, R-64 independent review. No rule bent. D-33 corrected scanner evidence applies. No weights, anchors or provisional engine constants were changed; scoring version remains 2.

LIMITS: private raw acceptance transcripts must stay out of Git under R-50; store privately and commit sanitized summaries only. New narrow-screen browser verification remains unverified from S1-12. Existing large-bundle warning persists. In-memory API feedback expires with its process. This server is loopback-only and has no production authentication or deployment configuration. Push/PR remains postponed.

CHANGES: package scripts; scripts/verify-offline.mjs; services/static.js and demo.mjs; minimal API dispatch option; src/api.js and apiBase.js; focused static/API tests; architecture/design/status documents; this matrix, deferred case, operator guide and verification artifacts. STATUS.md and local credentials excluded.
