# S1-12 — shared conversation settings

PART: S1-12. PHASE ITEM: P6.2. Date: 2026-10-18.

STATUS: accepted for offline implementation progression after coder → Sol reviewer → tester → root. Live acceptance remains NOT RUN under D-28; this is not demo readiness.

IMPLEMENTED: The API accepts strict shared integer sliders (0–100; missing keys default to 50), applies them to all three NPCs and returns applied settings plus display-only difficulty outside public_state. Invalid values, per-NPC customisation and turn-time changes are rejected. Engine parameters, score weights and scoring version remain unchanged. The setup modal shows the public briefing/goals, four native controls and a tone/difficulty preview. Settings remain in memory, fixed for an attempt and recorded in its ended debrief. Retry uses the originating feedback's settings, including recovery after a failed create.

| Check | Evidence | Result |
|---|---|---|
| Parameter effects | Existing engine anchor table at 0/50/100; identical avoided-question script at patience 10/90 | PASS offline |
| Tone and disclosure boundary | Server v3-tone asset plus v2 move instructions identify NPC composition v3; tone/silo fixtures and unchanged guards | Offline tests; live NOT RUN |
| Strict API and debrief | Creation/default/invalid/immutable settings tests and debrief difficulty; 29 API tests | PASS |
| Setup and retry | Root moved all four controls to 100/0/100/0, observed Hard preview and stable range focus, started a typed attempt and saw the same settings for all three colleagues in its debrief. Ordinary retry began with an empty thread and retained Hard settings. | PASS |
| Historical attempt and draft | After selecting Easy 0/100/100/100 for a new attempt, opening the earlier Hard attempt's feedback populated its own Hard settings. | PASS |
| Keyboard and browser | Close/Start Tab wrap, Escape, no fresh browser errors | PASS |
| Corrected bundle scan | Actual artifact scan: 5 text files, 81 needles, zero hits; build passed | PASS |
| Secret boundary and full suite | Initial suite 212/213 exposed the root .env scan boundary. D-34 repair checks effective ignore/tracking and a later negation. Final full suite: 216/216 pass. No credential displayed or changed. | PASS |

HUMAN ANSWERS: D-29 confirms one shared set for all colleagues and display-only mean difficulty (Easy below 34, Medium below 67). D-32 confirms S1-13 preset vectors and voice disabled; presets have not shipped in this part. The user approved restoring the sample RUN_LIVE blank default; it now matches HEAD.

RULES CHECKED: R-01–R-04/R-08–R-12 sealed data, acts and guards; R-14 manifest composition; R-27 unchanged scoring version; R-31/R-32 fixed shared settings; R-40 recoverable failure; R-50 credential boundary; R-61/R-63 deferred live gates; R-64 independent handoff. No new exception. D-33 corrects a scanner defect: earlier content-scan reports skipped all contents and are not proof of absence. D-34 fixes the local credential-file test boundary while retaining tracking protection.

CHANGES: shared/settings.js; src/settingsPreview.js, main.js, api.js, debrief.js and style.css; llm/tone.js, versioned v3-tone asset, config/pipeline; API creation/turn validation; debrief difficulty; focused engine/LLM/API tests; scanner core/CLI and tests; CONTEXT documents and DESIGN; evidence and deferred cases. Pre-existing STATUS.md is excluded.

EVIDENCE: s1-12-setup-desktop.jpg, s1-12-setup-easy-desktop.jpg, s1-12-debrief-settings.jpg; s1-12-verification.json; bundle-scan-2026-10-18.json. The second setup screenshot is desktop: the browser ignored the requested 390px viewport, so new narrow-screen rendering is NOT VERIFIED. The file detector reports only the existing style.css:312 avatar border finding (exit 1); no new findings.

PROVISIONAL CONSTANTS: existing engine anchors remain provisional and unchanged; no tuning. Defaults and difficulty are user-approved D-29 values.

NOT RUN / LIMITATIONS: live low/high tone and guard comparison, real-provider latency and the full demo matrix. Explicit paired 10/90 settings and identical typed inputs are saved in evals/cases/s1-12-shared-settings.NOTRUN.json. Historical full feedback lasts only while its API process lives. Existing large-bundle warning remains. No new dependencies, live calls or remote actions.

VERIFICATION: npm test 216/216 (escalated for the isolated OS-temp Git fixture); npm run test:api 29/29 (escalated after sandbox EACCES); npm run bundle:scan PASS, build PASS, git diff --check exit 0. Final hashes cover 81 inputs. The original 80-input baseline matches all runtime/build inputs, excluding the explicitly revised secrets test; no unexpected changes. The expanded pre-run snapshot was saved in sandbox TEMP and was unavailable to the escalated shell, so a complete expanded before/after comparison is not claimed. Root inspected the final test repair and unchanged application candidate; API/build results are reused with that recorded baseline evidence. Failed attempts remain in the verification artifact.

HANDOFF: proceed to approved S1-13 presets. Push/PR remains postponed by the user. No rule was bent; D-28 live deferral remains explicit.
