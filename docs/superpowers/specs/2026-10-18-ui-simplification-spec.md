# Compact-summary UI simplification

## Goal

Simplify the office and ended-session debrief while keeping Cubicle's ivory and purple visual identity, its public-state boundary, and every existing recovery path.

## Agreed experience

- The selected scenario title is the page heading. Remove the marketing eyebrow, subtitle, office slogans/floor labels, and duplicate motivational copy.
- A native closed `Briefing` disclosure holds the scenario description and objective. The normal layout shows exactly one current objective: the existing next-step panel, relabelled and driven by the current public guidance.
- Keep movement available through the existing concise move hint and Help. The chat's `aria-modal` boundary receives an optional native `Goals & hints` disclosure so its current public objective remains available while the outer page is inert. Full visible goals and safe public hints remain reachable there.
- Debrief opens as a compact, single-column summary. It shows deterministic 75 and AI 25 separately, shows a total only when the AI assessment is valid, starts with one `What worked` takeaway, then one primary coaching moment with a verified original quote and better reply, and retains one existing primary `Try again` action.
- The three top-level native disclosures are exactly `Scores & evidence`, `Missed opportunities`, and `Session details`. They retain full breakdown/evidence, extra coaching and positives, missed facts/timeline, and settings/version without dropping evidence or truncating text.
- Pending, partial, unavailable, general-coaching, escaping, refresh/retry, historical, polling/stale-result, keyboard focus, and responsive 390px/desktop states keep their existing contract. No score, provider, API, prompt, engine, or scenario behaviour changes.

## Constraints

R-03 keeps live public guidance free of hidden facts and score internals. R-20 keeps deterministic and judged points distinct. R-21 preserves quote validation and only renders verified coaching quotes. R-44 places a positive takeaway before coaching. Existing IDs used by retry, refresh, debrief actions, guidance, and scene hooks remain available. SC-02/SC-03 scripted behaviour remains untouched.

## Candidate baseline (frozen before review)

| File | SHA-256 |
| --- | --- |
| `index.html` | `CE5B79603D2ECF89D4EF64D9ADCA7544E64B93C144736DE0D5B33F135C938229` |
| `src/main.js` | `82B98B4B3349698ADF14E68A2A42D85E1FB75BB005B0DC9102600635FB7BFB7A` |
| `src/debrief.js` | `ACD3E57D3F4B90F677831EDDF219FA59AE744999640D263C64F5A8359191D341` |
| `src/style.css` | `B3F3DFB00622102FFD88E7F3D2B1EA150DE1C90C79BAF1B3112730EA713FBD4A` |
| `src/guidance.css` | `443290B8AC2875A6ED0A237409DAC219CC09E6D4BB95742836DA9A8D455E4852` |
