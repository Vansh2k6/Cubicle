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
