# UI simplification implementation plan

1. **Refine the static office shell** in `index.html` and `src/style.css`: replace the marketing header with a scenario-title heading target; move briefing/objective content into a native `Briefing` disclosure; preserve scenario/select, people, Help, restart, viewport, movement, talk, map, and all queried IDs. Remove redundant copy only. At 390px, keep briefing content available inside its disclosure rather than relying on currently hidden sidebar selectors.

2. **Rebind public guidance without changing its projection** in `src/main.js` and `src/guidance.css`: update the heading safely from `updateScenario`; repurpose the existing `.next-step` as the sole always-visible current objective; retain the ended-session external `View debrief` button. Add the chat-local native `Goals & hints` disclosure because `aria-modal` makes the outer objective inaccessible; it exposes only current public guidance, visible checklist, and existing public hint/question. Leave SC-02/SC-03 rendering and setup slider semantics unchanged, apart from concise duplicate instruction removal.

3. **Restructure `renderDebrief` only** in `src/debrief.js`: construct a single-column summary with separate deterministic and AI scores, assessed-only total, first positive takeaway, and one primary coach moment. Put remaining score/evidence, missed facts/timeline and extra coaching/positives, plus settings/version in exactly the named native disclosures. Keep `feedback-retry`, `feedback-refresh`, `data-debrief-actions`, quote escaping, unavailable/general/partial output, and action insertion stable.

4. **Tighten focused regressions** in `scoring/tests/debrief.test.js` and `llm/tests/guidance.test.js`: assert compact disclosure labels, no assessed total for unavailable/partial results, one primary verified quote/better reply and safe escaped rendering; adjust only the existing guidance source assertion needed for the new chat disclosure/public projection. Do not add snapshot-like cosmetic tests.

5. **Document the narrowed interface** in `DESIGN.md` with the one-objective/Briefing/debrief disclosure contract and accessibility behaviour.

6. **Freeze and hand off**: record candidate hashes after edits; send the exact candidate to the reviewer. Only after approval, the tester runs one `npm run verify:offline`. Root then performs the isolated offline-browser desktop and 390px screenshots plus keyboard/focus checks, retaining live port 4188 untouched. Any fix after review repeats reviewer then tester.

## Non-goals

No backend, provider, scoring, prompt, facts, goals, API, scenario, asset, dependency, font, or live-call changes. No nested cards, new navigation, or invented evidence.
