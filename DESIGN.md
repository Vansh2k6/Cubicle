# DESIGN.md — P2c free-text conversation panel

**Surface:** the in-viewport conversation panel (`src/main.js` text mode + `src/api.js` + `src/debug.js`, styles in `src/style.css`).
**Mode:** Operate — the visitor completes a task (a practice conversation). Scanability, consistency with the scripted panel, and native form expectations outrank expression.
**Method:** Impeccable narrow refinement of the incumbent implementation (v4.1.1; owning playbooks `harden.md` + `operate.md`, floor `craft-floor.md`). Preserve the ivory interface, the office viewport, and keyboard-only operation. No quick-reply chips (D-12 unconfirmed — left out).

## What changed and what did not

- SC-01 ("Missed a project deadline") conversations — with Maya, Jordan, or Sam — now render a transcript + text input that calls `POST /sessions/{id}/turn` for the NPC the player is near. E opens it; ESC closes it.
- SC-02/SC-03 keep the scripted button dialogue byte-for-byte in behavior (`renderDialogue`/`choose` untouched); the number-key handler is gated off in text mode.
- The panel shell (`.dialogue`, heading, avatar, close button, primary/secondary buttons, focus ring, `kbd` hints) is reused, not redesigned.

## States (every one is designed, per Operate)

| State | Treatment |
|---|---|
| Empty transcript | One-line coaching placeholder naming the NPC |
| User / NPC lines | Right purple-tinted bubble (user) vs left warm-gray card with NPC name (assistant); same 12px/1.65 measure as `.dialogue-line` |
| Waiting (P2.7) | "Maya is typing…" with three-dot state motion (150–250ms family would be too fast to read; 1.1s loop conveys waiting, killed under `prefers-reduced-motion`) |
| Sending | Input + Send disabled **only** while a turn is in flight; everything else stays live |
| Failure (P2.7) | Warm-amber error box naming the problem and the recovery ("Your message was kept — retry sends the same turn once") + Retry button; input re-enabled, never frozen |
| Server unreachable | Same error pattern at session start with Retry re-creating the session |
| Goals | Visible-goals checklist with explicit Done/Todo words (no glyph icons); updates from `public_state` after each turn |
| Session over | Input replaced by "Wrap up & reflect" |
| Debug (P2.8) | `<details>` trace per turn (events, act, source, guard, per-stage latency). Rendered only via dynamic `import("./debug.js")` when `window.__CUBICLE_DEBUG` is set, and only when the server ran with its dev flag — otherwise the `_debug` field does not exist |

## Resilience contract (UI side)

- Each send carries an idempotency key (`crypto.randomUUID`). The user line is appended **once**; Retry resends the same key and never duplicates the transcript.
- Request timeout (12s) surfaces as a retryable error, not a hang.
- Focus: input autofocused on open and after each round-trip; the existing Tab trap now includes `input`/`textarea` (and skips disabled controls); Enter submits; ESC closes.

## Tokens reused

`--ivory`, `--purple` (`#6b5cce`), `#efedf9`/`#e4e1ee` (response buttons), `#faf5e9`-family feedback amber shifted warmer (`#faf3ea`/`#8a5a3b`) to read as error-adjacent without inventing a new hue, 7–10px radii, DM Sans/Manrope as-is. No new fonts, no new icon set, no gradient text, no new motion language.

## Non-goals

Quick-reply chips, voice, scoring display in the panel (debrief work owns that), multi-line composer (single-line input + 500-char cap is enough for practice turns), offline scripted fallback for SC-01 (server-down shows Retry, per contract).

---

# P3a — Scene threads, goal checklist, knowledge silos

**Surface:** same text panel + office proximity (`src/main.js` threads, `src/office.js` proximity, `src/api.js` unchanged, checklist styles in `src/style.css`).
**Mode:** Operate — the visitor completes a task (hold three separate conversations, watch the checklist follow). Scanability and the existing panel shell outrank expression.
**Method:** Impeccable narrow refinement of the P2c panel above. No new fonts, icons, hues, or motion language.

## What changed and what did not

- One API session is shared by Maya, Jordan, and Sam. Each NPC keeps its own transcript, mood chip, and retry state (**thread**). E near an NPC opens (or resumes) that NPC's thread; ESC, the close button, or walking out of range closes the panel without ending the session. Reopening resumes the thread.
- An in-flight turn survives close: the send is bound to its thread at send time, the server applies it once per idempotency key, and the resolved NPC line lands in the thread and renders on reopen. Retry resends the same key and never duplicates the transcript.
- The checklist renders `public_state.goals` with explicit Done/Todo/Locked words. G3 shows Locked (dashed chip, reduced opacity) until G1 and G2 are done. The one-line hint under the input is the server's goal-state next step: Maya about the missed deadline → Jordan about what's left → back to Maya to agree a plan → wrap up.
- SC-02/SC-03 keep the scripted button dialogue untouched; the number-key handler stays gated off in text mode. The scene holds no scoring or sealed data — the panel shows briefing, mood label, goals, hint, and availability only.

## States (every one is designed, per Operate)

| State | Treatment |
|---|---|
| Empty thread | Same one-line coaching placeholder naming the NPC (per-thread, so each NPC greets fresh) |
| Switching NPC | Panel swaps to the other thread's transcript; shared checklist stays put |
| Waiting (existing) | "{FirstName} is typing…" with the same three-dot 1.1s loop, killed under `prefers-reduced-motion` |
| Closed while sending | No error shown; the turn resolves into the thread and is visible on reopen |
| Locked goal | Dashed chip reading "Locked" at 75% opacity — same gray token as Todo, no new hue |
| Session over | Input replaced by "Wrap up & reflect" (unchanged) |

## Tokens reused

`--ivory`, `--purple`, `.dialogue` shell, `.goal-list`/`.g-state` chips (locked = dashed border + opacity only), amber error box, DM Sans/Manino as-is. No new fonts, no new icon set, no gradient text, no new motion language.

## Non-goals

Mood numbers (label only), per-NPC goal breakdowns (checklist is session-global), unread badges, thread deletion, voice.

## S1-07 ending refinement (Operate)
Reuses the existing completion modal, ivory palette, typography, focus handling and button styles. End waits for the active reply, calls the server End endpoint, and leaves the conversation available on failure. A server-ended session disables all NPC threads. The final placeholder says “Session ended” and “Debrief coming soon”; it does not imply a score or feedback exists. No additional motion, tokens or layout system. The orchestrator verified walking to Maya, typed input with a G1 checklist update, and the End placeholder in the offline browser preview. Full scene smart/trap playthroughs remain NOT RUN.

## S1-10 debrief (Operate, narrow refinement)
The established end modal now hosts the debrief, using the same ivory/purple palette, fonts, close button, Escape behavior and viewport focus return. No animation or new dependency. It expands to a readable 720px maximum with the existing scrollable modal; on small screens padding reduces and tables wrap instead of overflowing.

Order: provisional/final score with explicit deterministic75/judged25 separation; What went well; metric breakdown and expandable quality evidence; two priorities; quoted timeline; one historical coaching moment (positive feedback first); post-session missed facts/questions; settings and scoring version. Values and strings come from the server and are escaped. The browser formats/render values and performs no scoring arithmetic.

States: pending has a readable status message; bounded polling offers Check feedback after a delay; network error offers Check feedback; partial/offline retains deterministic results and labels the rubric/coaching unavailable, with one explicit feedback retry; ready shows available feedback. Cached results remain visible while refreshing. Polls are bound to the originating session/scenario/thread set and modal element, so closing/restarting/switching cannot overwrite a new run. S1-11 retry/progress work followed this accepted S1-10 surface.

Root completed rendered desktop/small-screen debrief verification and saved screenshots; full scene smart/trap and live acceptance remain NOT RUN. Automated browser tooling dependency was not added; pure rendering/escaping/stale-poll tests cover critical state logic.

S1-10 review refinement: priorities for missing achievements name the specific goal/question and say it was not observed by session end; absence is never pinned to an unrelated final quote. If a feedback retry POST has an uncertain network outcome, polling/Check feedback recovers the server job while preserving previous results. Already available judge/coaching sections survive retry. User-facing offline copy says a practice question is shown.

Final S1-10 verification: 390px source labels use Code/Judge to avoid split words; the deterministic75/judged25 distinction remains explicit. Dialog content scrolls without horizontal overflow. Retry/check updates preserve surviving focused controls or restore Close without scrolling when a control disappears. Root verified actual Tab/Shift+Tab, Escape, reopening ended feedback, and focus after retry. Saved synthetic screenshots live under evals/reports/s1-10-debrief-*.jpg. Live scoring remains uncalibrated. No work beyond prompt 10.

## S1-11 retry and basic progress (accepted offline/browser)
The existing debrief modal carries Try again and Try again with new settings actions. Retry starts a separate default-settings session and returns focus to the office; the lightweight setup route explains that controls arrive with S1-12. My progress remains in the modal family and lists only local score summaries, with two selected attempts displayed in a compact comparison table. Version/provisional status stays visible. Historical feedback reopens by its session ID; after an API restart the user gets a friendly unavailable state while the local summary remains. Existing ivory/purple controls, close behavior, escaped content and narrow wrapping are retained. Root verified the fresh B state after A7, A7’s preserved feedback, B25 comparison with zero metrics, reload persistence, the default route, scripted email/call flow, and 390px rendering with no browser errors. Live provider verification remains NOT RUN.

## S1-12 shared conversation settings (accepted offline)

Before the deadline conversation, the established modal presents the public title, briefing and visible goals with four native sliders for all colleagues: assertiveness, patience, warmth and forthcomingness. Readouts update in place so range focus stays stable. The preview says the shared tone direction and the display-only difficulty; it does not calculate a score. Start fixes the draft settings for one new session. A new-settings retry begins with the attempt's applied values, including from historical feedback, while ordinary retry recreates that attempt's same settings. The ivory/purple modal shell, close behavior, asynchronous loading/retry and focus family are unchanged.

Root verified all four controls, stable range focus, Hard/Easy previews, the recorded three-colleague settings, fresh same-settings retry, historical settings independent of the current attempt, Tab wrap and Escape with zero browser errors. The browser ignored the requested 390px viewport, so the two setup captures are labelled desktop and this part's narrow rendering is unverified. Live tone remains NOT RUN. The detector found only the existing avatar border at style.css:312.

## S1-13 setup presets (accepted offline)

When `VITE_PRESETS=1`, the existing setup modal adds one native Starting style select. Supportive, Direct and Impatient copy their approved shared slider values into the editable controls; any manual adjustment shows Custom. The feature is off by default and does not alter an active session.

Root verified all three vectors and Easy/Medium/Hard previews, manual changes returning to Custom, the Direct vector recorded for all three colleagues in the ended debrief, and the disabled selector with all four sliders still usable. No fresh browser errors; changed-file detector returned no findings. Narrow rendering and live tone remain unverified.

## S1-14 local demo (verified offline)

npm run demo serves built assets and the API together on localhost. The production client uses relative API paths; the existing dev base and explicit override remain available. No deployment or live-provider claim is made.

Root verified the actual built app at 127.0.0.1:4173: setup loaded, a typed ownership turn ended with provisional 25/code25/judge0 feedback, Restart retained that summary in My progress and opened a fresh setup and blank conversation. No fresh browser errors. The existing reset control is reused without adding UI. Screenshots are in evals/reports/s1-p7. Live acceptance and new narrow rendering remain deferred.

## 2026-10-18 accepted debrief refinement

The user approved a learning-first debrief: positives, one evidence-backed coaching moment when available, next priorities and replay actions lead; compact results and optional supporting detail follow. Public objectives and optional hints remain guidance only. The refinement keeps the ivory/purple modal and separates deterministic scenario outcomes from optional AI-assessed communication, without changing scoring or making live calls. Implementation verification remains pending with the orchestrator; this is not a browser-check or demo-readiness claim.

## 2026-10-18 handoff and progress refinement

Starting setup from a nearby colleague opens that colleague's empty loading panel immediately; only the still-open matching thread receives the session result or retryable failure. Ended panels and the next-step guidance offer a guarded View debrief action. Progress keeps its existing local summary schema: incomplete assessment hides totals, bands, and rubric values while still showing deterministic metrics; assessed values are rounded only for display. The existing ivory/purple system remains intact, with the objective label darkened for contrast.

## 2026-10-18 compact-summary refinement

The office uses the selected scenario title as its page heading. A closed native Briefing disclosure retains the full scenario description and scenario objective, while the existing `.next-step` panel sits above the office as the only always-visible current objective. Help and the concise movement hint remain available. The text conversation is modal, so it keeps public-only current guidance, visible goals, and optional hints in a closed native `Goals & hints` disclosure; this does not add hidden facts or scoring state.

The debrief is a single-column, learning-first summary: one positive takeaway, one primary coaching moment, and the existing retry action appear before supporting detail. Its compact score strip always distinguishes deterministic scenario outcomes (75) from AI-assessed communication (25); the overall total and band appear only when the assessment is valid. Exactly three native disclosures preserve all additional material without clipping: `Scores & evidence`, `Missed opportunities`, and `Session details`. Existing quoted evidence, escaping, unavailable/general/partial feedback, polling/retry controls, focus recovery, and 390px wrapping continue to use the established modal system.

## 2026-10-18 workspace surface revision

The earlier ivory-and-purple interface record above is historical. The active interface direction is the green-and-graphite workspace contract in `docs/superpowers/specs/2026-10-18-taste-ui-design.md`: a `#f4f6f3` canvas, white panels, graphite text, and restrained deep-green actions. The office scene, all public/session contracts, native disclosures, transcript behavior, scoring presentation rules, and accessibility mechanics remain unchanged. This is a presentation-only revision; it makes no claim of runtime or browser verification.

## S1-V2 voice extension (Operate)

When both client and server voice flags are enabled, the existing graphite-and-green composer gains a compact Voice on/off control and a 44px microphone control. Voice stays off until the visitor explicitly enables it; recording is hold-to-talk with keyboard equivalents, an inline live status, and a 30-second cap. A transcript returns only as an editable draft in the existing input, then uses the unchanged typed Send path. Typed input remains available through unsupported, denied, cancelled, empty, and failed recording states. At narrow phone widths, the voice composer places the input on its own row and keeps the 44px controls together below it.
