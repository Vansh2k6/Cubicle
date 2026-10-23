This implements the Stage 1 deadline-practice loop: typed multi-colleague conversations, deterministic scoring with verified quote evidence, an evidence-backed debrief, recorded-settings retries, local attempt history, and built same-origin demo serving. The opt-in Groq adapter includes process budgets, throttling, bounded timeouts, schema checks, and guarded authored fallback replies with sanitized failure diagnostics.

The workspace now presents a public next objective with optional hints, clearer conversation controls, and a compact learning-first debrief. Scenario outcomes (75 points) remain separate from AI-assessed communication (25 points); unavailable AI assessment does not appear as a final overall score. Evidence labels retain the transcript's user turn ID.

This combines the existing local Stage 1 commits through S1-14 with the final provider, guidance, feedback, and visual refinements. The green/graphite taste design supersedes the earlier ivory/purple design notes. Engine scoring weights and hidden-fact rules are preserved.

Validation:
- Full offline gate passed: 236 offline tests and 36 API tests; zero failures, cancellations, or skips. Production build, bundle scan (5 artifacts / 81 needles), and git diff --check also passed.
- Desktop, tablet, and phone browser checks covered movement, setup, typed chat, next objectives, hints, debrief disclosures, keyboard focus, retries, and historical feedback.
- Secret-pattern scan passed for the selected files and outgoing commit patches. Local keys, attachments, backups, stale STATUS.md, and extracted presentation assets are excluded.

Draft status: full live-provider acceptance, model calibration, and live latency/guard evaluations remain NOT RUN. No live Groq calls were made for this PR. The existing production bundle-size warning remains.

<details>
<summary>Before and after: offline UI screenshots</summary>

Before:
![Earlier office](https://raw.githubusercontent.com/wexer02/Cubicle/feat/live-provider/presentation/ui-simplified-2026-10-18/office-desktop.jpg)

After:
![Updated office](https://raw.githubusercontent.com/wexer02/Cubicle/feat/live-provider/presentation/taste-ui-2026-10-18/office-desktop.jpg)

Updated debrief from an offline test session (AI assessment correctly unavailable):
![Offline debrief](https://raw.githubusercontent.com/wexer02/Cubicle/feat/live-provider/presentation/taste-ui-2026-10-18/debrief-desktop-offline.jpg)

</details>
