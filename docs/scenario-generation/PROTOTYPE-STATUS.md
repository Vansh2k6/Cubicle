# Prototype status — 2026-10-25

Candidate: source commit `6c3816d9cbb95d09cafbb4a71cfa27534bd0a3c8`, tree `36b2b090639509362296fd883075150771559770`. Final offline gate: `npm run verify:offline` **PASS**; unit phase **PASS**; API **96/96**; build **PASS**; bundle scan checked 6 artifacts and 383 needles with 0 hits. Manifest SHA-256: `a82a9050da704f68514ce38e50a33092e0b38eb3446f447e4c4b97858ea52533`.

## Scope and implementation

The additive text-modal prototype offers five typed baseline situations: the unchanged main missed-deadline case, manager scope change, HR transfer request, client change after sign-off, and employee handover. Existing email and call entry cards remain. Two bounded keyword compositions are available: an omitted product feature and a client asking for earlier delivery. The exact tested user phrasings include “I forgot to implement a feature in a product” and “create a scenario where client is trying to reduce deadline.” Unsupported domains, extra cast, and mixed/ambiguous intents return a visible rejection.

The server catalog assembles six private prototype packages from four authored frames and 36 reviewed reference components. The normal main registry and main UI are preserved; the prototype uses a separate visible entry point and modal, with no new 3D integration. Selected package identity remains pinned through its session and debrief. Preview and session routes are loopback-only. Public session content omits private facts, triggers, policy and provenance. Existing engine guards, delivery checks and score weights remain in force.

Deterministic score evidence remains separate from the optional judge score. The approved engine fixture currently proves 59/75; it does not meet the 85 smart-quality target, even with a theoretical full judge score. That target remains **blocked** pending valid end-to-end evidence; no new scoring arithmetic or goal predicates were added. The local preview is not shared/demo/community approval, R45, or full-total acceptance.

## Validation and known limits

Earlier gate history: an initial full gate reported 409 tests with five failures, including response allowlists and sandbox Git/temp-file errors. A later gate reported unit 411, API 95, and build passing; subsequent frozen-candidate checks resolved the remaining findings. The final passing gate above supersedes those earlier results.

Offline focused checks passed after the latest edits: prototype catalog 8/8, prototype API 5/5, immersive entry 11/11, bundle scanner 4/4, and Anthropic adapter 10/10. Root verified the browser entry, modal visibility, composed preview, and offline chat before the final composed-situation selector-label and authored-role adjustments; those final UI adjustments were not browser-verified because the Work browser was unavailable.

The coworker frame's authored first-fact question (“What else is on your plate this week?”) does not match its unchanged `asked_why_urgent` trigger in the bounded offline classifier. That wording remains safely sealed. The test uses a supported urgency question for the positive reveal; no source trigger or event meaning was changed.

Anthropic transport uses the standard Messages API and local gateway/schema validation. However, full live classification and play are **NOT VERIFIED**: the live batch covered 11 cases and 26 provider dispatches; four injection attempts stayed safe, while seven authored unlock attempts returned empty classifier events. A follow-up live retest was blocked by the remaining grant budget. An earlier one-call synthetic adapter smoke is not full-play evidence. Do not describe live classification, full play, smart completion, or acceptance as passing.

The later, separately authorized all-scenarios gameplay run on candidate `fd2d32d5932e31d64f6a4f2d8168cff795e1165f` supersedes the earlier partial live evidence above for its seven-case runs. Its [dated report](LIVE-GAMEPLAY-2026-10-25.md) records aggregate results and limitations; it does not change the blocked acceptance status.

## Local operator setup

The ignored server-side key file is `C:\Project\Codeapex\Cubicle-scenario-prototype\.env`. Keep any existing file and key intact; add or edit only the `ANTHROPIC_API_KEY` line locally. The tracked `.env.example` contains blank placeholders and is not a credential source. Never put the key in a `VITE_*` variable, source file, command output, or commit.

For an offline local demo after building, from PowerShell in the checkout:

```powershell
npm run build
$env:PORT = '4196'
$env:LLM_PROVIDER = 'offline'
node --env-file=.env services/demo.mjs
```

Open `http://127.0.0.1:4196`. The demo serves the built UI and API from one localhost process. The environment override keeps this command offline even when the ignored file contains Anthropic configuration.

The persistent task ledger is `.state\anthropic-budget-ledger.json`. It is shared across roles, retries and processes; reservations are locked, fail closed and are never refunded/reset. Current recorded state: 28 calls, 12,408 input tokens, 1,856 output tokens; 195,510/200,000 reserved tokens and $0.488775/$4 reserved. Returned usage yields an estimated token cost of $0.0021688 at the short-tier rate; this is not a billing statement, and failed or timed-out calls may have additional unmeasured charges. No calls were made after the 28 recorded dispatches. Do not reset, replace, or raise this ledger's caps. No additional paid calls are authorized by this status note.

