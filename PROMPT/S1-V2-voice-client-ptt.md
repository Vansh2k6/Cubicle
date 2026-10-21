# S1-V2 — Client push-to-talk, transcript confirmation

> **Head document: `AGENT.md`.** Read `S1-V00-voice-start-here.md` first. Follow §6 handoff. **Entry:** V1 accepted. For UI work follow D-28 (update `DESIGN.md`, apply the Impeccable skill).
**PHASES.md item:** P6.3 (client half). **Read first:** RULES R-12, R-21, R-23, R-41, R-42, R-54; `src/main.js` (`renderTextDialogue`, `sendTextTurn`, retry/idempotency handling), `src/api.js`, `src/apiBase.js`, `src/style.css`, `DESIGN.md`.

## Contract

- New `src/voice.js` (+ styles in `style.css` or `src/voice.css`). Gate: `VITE_VOICE=1` **and** server reports voice enabled (probe with a lightweight capability field already available, or a `GET /voice/status` returning only `{enabled, stt, tts_mode}`; add only if no existing capability channel fits). Flag off → zero voice UI and zero extra requests.
- **Voice toggle** (opt-in, off by default, persisted per browser in localStorage with try/catch). The first click that enables voice creates/resumes the `AudioContext` (user-gesture unlock, used by V3).
- **Push-to-talk:** mic button next to the text input; hold (pointer/touch) or toggle via keyboard (Space/Enter on the focused mic button; also a documented shortcut that does not collide with WASD/E/ESC when the chat input is focused). Uses `navigator.mediaDevices.getUserMedia` + `MediaRecorder` (pick a supported mime via `MediaRecorder.isTypeSupported`). Recording max 30 s with visible countdown; auto-stop.
- Secure-context check: if `window.isSecureContext` is false or permission is denied/unavailable, show a plain message and keep typing fully working; never block the typed path.
- **Flow:** record → stop → POST blob to `/sessions/{id}/voice/stt` → show a "Listening… / Transcribing…" state → put the result into `#text-input` and focus it with the text selected-at-end → **the user reviews/edits, then presses Send/Enter.** **Voice never auto-sends** (R-42). Empty/`stt_empty`/error → inline message "Didn't catch that — try again or type", input stays usable.
- The Send path is the existing `sendTextTurn()` unchanged: same idempotency key behaviour, same retry. The sent text is what is scored and quoted (R-21/R-23). Do not add input-mode metadata to the turn payload.
- Mic is disabled while a turn is in flight (`thread.busy`) and while NPC audio is playing; pressing the mic during playback stops playback first (V3 provides the stop hook; stub it here).
- Release the `MediaStream` tracks after each recording; no recording blobs kept after upload (null references; no localStorage/IndexedDB audio) (R-54). No audio in any console/debug output.
- Accessibility: buttons have labels and `aria-pressed`; recording state announced via an `aria-live` region; reduced-motion respected for any level meter; works keyboard-only (R-41).

## Test plan

**Offline:** unit tests for pure helpers (mime selection, state machine idle→recording→transcribing→ready/error, duration cap, "never auto-send" invariant) with the DOM and `MediaRecorder` mocked; mocked fetch for STT success/empty/oversize/unavailable; flag-off renders no voice DOM; bundle scan (D-33) still zero hits and no private needles; full offline suite and API tests green.
**Manual with screenshots (desktop + narrow):** grant permission → speak → transcript appears editable → send → NPC replies via the normal path; deny permission → typed path works; stop sidecar → graceful error; keyboard-only run; Help/pause behaviour unaffected; no console errors.
**Live:** none required (local STT only). Record real-STT sample transcripts as informal evidence, not acceptance.

## Review focus
No auto-send; typed fallback intact; no audio retained; no scene/WASD key conflicts; no change to `sendTextTurn` semantics.

## Stop and ask
Any change to the turn payload, scoring inputs, or scene key bindings.

## Gate / exit
Voice-in works behind the flag; typed path unchanged with flag off; offline suite and build/bundle scan green; screenshots saved.
