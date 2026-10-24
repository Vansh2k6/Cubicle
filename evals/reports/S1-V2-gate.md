# S1-V2 gate — 2026-10-22

Stage: Stage 1 optional local voice. Phase: V2 push-to-talk and editable confirmation, following accepted V1 commit `4e686b8`. Branch: `feat/voice-v2`, isolated worktree. Implementation verified offline on 2026-10-22; the human confirmed microphone input works. Complete real-device playthrough remains pending. This is not a complete voice or demo-readiness claim.

## Implemented scope

- Client flag plus cached server capability gate; opt-in voice controls beside the existing composer, accessible keyboard recording and visible countdown.
- Raw, bounded microphone upload to the existing STT route; editable draft only, with unchanged user-confirmed Send/idempotency/engine/scoring path.
- Cancellation and stale-result checks across typing, close, thread replacement, send, End, hidden page and blur. Tracks released; no audio/transcript persistence or logging.
- Exact public capability response with no inference; local voice CORS/no-store.
- D-36 automatic GPU preference with honest explicit-device selection and CPU portability fallback. No cloud speech or new dependencies.

## Evidence

Sol independently approved the full source, mobile/error-copy deltas and final turn-transition fix. Luna verified the same frozen candidate; root inspected the logs and browser outcome.

- Initial `npm run verify:offline`: exit 0; 257 unit tests and 47 API tests passed, no failures/skips. Default build scanned 5 text artifacts against 81 private needles, zero hits; no voice chunk emitted.
- Installed V1 Python environment running V2 `test_server.py`: exit0, 10 tests passed including PyAV, no skips. No real model inference in this suite.
- Final turn/error-copy batch: `npm test` exit 0, 258/258 passed with no skips; includes 12 client tests and 3 production-function movement tests. `VITE_VOICE=1 npm run bundle:scan` exit 0, lazy voice chunk emitted; 6 artifacts/81 needles/zero hits. All candidate application/test fingerprints matched before/after. Earlier 47 API/10 Python results remain applicable because no backend changed. Existing >500 kB main-bundle warning remains.
- Actual auto-selection smoke used V2 server source with the existing ignored V1 models/environment: CUDA/float16 selected and warmed, synthetic STT495ms and complete TTS257ms. Metadata only in `voice-v2-auto-gpu-2026-10-21.json`; one sample, no microphone or Groq.
- Root browser checked the1280x900 desktop and390x844 phone layouts. The narrow reply field now spans302px instead of78px; microphone target is44px. The saved voice preference did not start recording. Normal Enter/Send delivered one offline reply and advanced the public objective; Escape closed the conversation, and Help opened/closed normally. No error/warning console entries in the final walkthrough. Screenshots are local ignored artifacts: `out/voice-v2-desktop.png` and `out/voice-v2-narrow.png`.

The human confirmed that microphone input fills the reply box after the local service was connected. The agent did not record a microphone or retain the user's audio/text. Full real-microphone playthrough, real sidecar-loss recovery in the browser and V4 scene-load acceptance remain unverified. Those states have mocked client/API coverage, which does not replace complete real-device acceptance. NPC playback and Listen remain V3/V4. P6.3 remains unchecked.

User testing found that the temporary UI preview had voice configured but its local service was stopped (`ECONNREFUSED` on8790). Root corrected the preview startup to warm the installed GPU service first with a private shared process token, then passed one synthetic clip through the actual Node STT endpoint. No microphone was recorded by the agent and no Groq call occurred. The client now distinguishes service-unavailable/timeout errors from silence using fixed safe copy. The human subsequently reported `Mic works; movement still laggy`, then clarified that motion felt less fluid rather than delayed.

At diagnosis, the office source was byte-identical to the primary checkout. Two10-second local browser samples measured parent animation-frame intervals around the same-origin app iframe: idle/walking p95 intervals16.8/16.9ms with zero intervals over50ms, using the RTX4050 renderer. These are not direct child render/input timings. The warmed speech model was idle; concurrent inference/physical input latency were not measured. This did not reproduce or dismiss the user's reported motion issue. Metadata is in `voice-v2-frame-check-2026-10-22.json`; the temporary diagnostic page stays under ignored `out/`. Duplicate agent-created diagnostic/preview tabs were closed.

The human clarified that changing direction, rather than straight walking, felt jittery. Root reproduced actual heading changes in the browser: the original scene could flip 180 degrees in one frame. The final fix smooths only displayed heading along the shortest rotation path. Positions, fixed 60 Hz simulation, speed 3.3, collisions, proximity, rings and minimap retain their original code. Movement changes direction immediately; facing eases over the following frames. Reduced-motion preference snaps heading, and pause/reset/visibility behavior is covered by production-function tests. The earlier position-interpolation attempt was removed.

Actual browser W→D→A comparison: original largest change 180 degrees in a 16.8 ms frame; final largest change 59.44 degrees in a 16.7 ms frame, with turning distributed across 49 frames in the captured sequence. Numeric metadata is in `voice-v2-turn-check-2026-10-22.json`; temporary instrumentation, comparison servers and tabs were removed/stopped. This is a synthetic visual trace, not a full speech acceptance result or a guarantee of subjective feel. This user-requested correction changes no engine, score, scenario or key binding.

Initial failures were resolved without weakening checks: a browser-only native timer binding error and stale permission race were fixed; a brittle existing hint-source assertion now explicitly includes the conditional shortcut; the phone composer wraps only when voice controls exist. The opt-in scan rejected the ordinary instruction word `review`, so the new status now says `Check it, then send` instead of adding a scanner exemption. The first sandbox run's temp-Git/loopback permission errors were rerun with narrowly elevated local test access. Initial and intermediate logs are retained under ignored `out/`; final logs are `unit-v2-turn-final.log` and `voice-bundle-v2-turn-final.log`, with backend evidence in `verify-v2.log` and `python-v2.log`.

The specifically requested live Groq check completed exactly two HTTP calls (HTTP200 classifier and NPC, no fallback). STT307ms + guarded text turn1333ms + TTS first byte453ms = combined2093ms to first audio byte. The report `voice-groq-one-turn-2026-10-21.json` contains numeric timing/token metadata only. It excludes speaking, user review and browser playback and is one sample, not acceptance percentiles. No further live-call allowance remains.

## Rules and handoff

No engine, scenario, scoring, guard or turn payload changes. No key displayed/committed; private root `.env` loading explicitly permitted by the user. Prompts are guidance; the user authorized GPU preference as an improvement over the original CPU-default draft. No rule exception is claimed. Coder → reviewer → tester → orchestrator acceptance remains required.

## Files changed

- `.env.example`, `AGENTS.md`
- `CONTEXT/AGENT.md`, `CONTEXT/ARCHITECTURE.md`, `CONTEXT/DECISIONS.md`, `CONTEXT/PHASES.md`
- `DESIGN.md`, `plans/VOICE_V2_STATUS.md`, `voice-sidecar/README.md`
- `src/voice.js`, `src/api.js`, `src/main.js`, `src/style.css`, `src/office.js`
- `voice/http.js`, `voice/tests/client.test.js`, `services/api/tests/voice.test.js`
- `voice-sidecar/server.py`, `voice-sidecar/test_server.py`
- `llm/tests/guidance.test.js`, `llm/tests/secrets.test.js`, `llm/tests/officeMovement.test.js`
- `evals/reports/S1-V2-gate.md`, `evals/reports/bundle-scan-2026-10-22.json`, `evals/reports/voice-groq-one-turn-2026-10-21.json`, `evals/reports/voice-v2-auto-gpu-2026-10-21.json`, `evals/reports/voice-v2-frame-check-2026-10-22.json`, `evals/reports/voice-v2-turn-check-2026-10-22.json`
