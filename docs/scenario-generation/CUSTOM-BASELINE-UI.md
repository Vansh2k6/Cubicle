# Custom scenario baseline popup — 2026-10-25

Branch: `codex/custom-scenario-baseline-ui` for `Vansh2k6/Cubicle`. This branch carries the existing committed custom scenario prototype from `0c8368b076632f7cee3128d145ccd5a99f526d06`, with a focused popup simplification. It was created in a separate checkout so the main chat's unfinished office/voice changes are not included or modified.

GitHub main was inspected at `cd88ef9106b76727247dabe7ad1647aa13878ea4`; it has additional HR/cast/deadline work beyond the prototype's original main base `e3d4e445d37d1be62fcea5708809a2c6637f6ffd`. Those divergent changes are not merged here. This is a prototype baseline branch, not a claim that all latest-main work has been integrated. GitHub main is unchanged.

## Scope

The five prepared choices remain: missed deadline, manager scope change, internal transfer, client change after sign-off and employee handover. The two existing custom compositions remain omitted feature and earlier client delivery. No broader generation, new mechanics or cast is added.

The popup now shows its scenario selector and description without the long introductory paragraph. Custom input is inside an expandable “Create a custom scenario” section. Public goals remain available under “Practice goals”, and the explicit local-review checkbox still gates Start. Dynamic public wording remains HTML-escaped, unsupported requests retain an actionable error, and launch uses the selected scenario ID. Existing guarded replies, provider indicators, retry handling, hidden-fact boundaries and scoring are unchanged.

Examples: “I forgot to implement a feature in the product” or “The client wants delivery sooner.” Generate, inspect the description and goals, confirm local review, then start practice.

## Design and verification

Bounded design approved for this request: presentation-only edits in `src/prototypeEntry.js` and scoped styles in `src/style.css`; no API, engine, schema, component, scoring, provider, environment or budget changes. Existing D-39 local-preview limits continue. No LLM calls are needed for these edits/tests. The side-conversation instruction forbids subagents, so implementation and verification were performed locally without a separate reviewer/tester agent; no independent-review claim is made.

`node --test voice/tests/prototypePopup.test.js`: PASS, 3/3. Tests use the repository's VM-based UI test convention with offline API stubs. They cover compact initial markup and preserved baseline choices/goals, local-review Start gating, escaped custom wording and exact selected scenario launch, and unsupported-request error without a session launch. These are UI wiring tests, not rendered-browser or live-model acceptance.

`npm run verify:offline`: PASS on candidate tree `5027a8ef5167fbba7c831b783e7a62d365be7d6c` (before this results-only documentation update). Unit tests PASS; API 99/99 PASS; build PASS; bundle scan PASS, six artifacts / 383 needles / zero hits. `git diff --cached --check`: PASS. Existing office chunk warning: 547.65 kB. Log: local ignored `verification-custom-ui.log`. No application files changed after verification.

Browser, live model, judge /25 and full total acceptance are NOT RUN for this slice. Shared readiness, publication and R-45 remain blocked by the existing requirements. No live model dispatch or spend occurred in this task. The already-running app in the main chat is not restarted or modified by this branch handoff.
