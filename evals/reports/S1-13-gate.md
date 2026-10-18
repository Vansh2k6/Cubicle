# S1-13 — setup presets, accepted offline

PART: S1-13. PHASE ITEM: P6.1. Date: 2026-10-18. Coder → Sol reviewer → tester → root acceptance completed for offline progression only.

IMPLEMENTED: `VITE_PRESETS=1` enables the native Starting style selector. Default-off builds hide it. D-32 values in assertiveness/patience/warmth/forthcomingness order: Supportive 30/80/80/80 (Easy), Direct 80/50/40/50 (Medium), Impatient 80/20/30/30 (Hard). Selecting fills the existing editable sliders; manual changes show Custom. Start uses the established fixed-session path. No API, engine, scoring, prompt, model or dependency change.

VERIFICATION: fresh npm test 217/217; preset-enabled npm run bundle:scan PASS (5 artifacts/81 needles/zero hits); separate default-off build PASS; git diff --check exit 0. All 86 scoped hashes matched across tester checks. The 67 API-relevant inputs match S1-12, so its 29/29 API result is reused. See s1-13-verification.json. Changed-file design detector returned [] with exit 0.

BROWSER: all three preset vectors and difficulties matched; ArrowLeft changed Impatient to Custom; Direct started an attempt and its debrief recorded 80/50/40/50 for Maya, Jordan and Sam with Medium difficulty. With the flag disabled, #setup-preset count was zero and four sliders remained. No fresh browser errors. Screenshot: s1-13-presets-desktop.jpg.

CHANGES: shared/presets.js; src/main.js; llm/tests/settings.test.js; CONTEXT/AGENT.md, ARCHITECTURE.md, PHASES.md; DESIGN.md; this gate, verification and screenshot, generated bundle report. STATUS.md and credentials excluded.

RULES: R-32 fixed session settings; R-42/R-54 voice not shipped, no speech provider/audio path; R-50 no credential changes; R-64 independent handoff. Human approval is D-29/D-32. No new provisional constants or rule exception. Voice input, spoken replies and Listen were explicitly cut and remain absent; there are no speech calls or recordings.

LIMITS: live tone/guard acceptance and new narrow rendering remain NOT RUN. Existing bundle-size warning remains. Enable the flag before building or starting development to see presets. Push/PR remains postponed. Proceed to S1-14 hardening, preserving the unrun demo gates.
