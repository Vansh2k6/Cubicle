# S1-V4 — Fallbacks, Listen button, latency measurement, voice playthroughs

> **Head document: `AGENT.md`.** Read `S1-V00-voice-start-here.md` first. Follow §6 handoff. **Entry:** V3 accepted.
**PHASES.md items:** P6.5 plus Stage 1 P6 exit ("voice works end-to-end or is hidden behind a flag"). **Read first:** `src/debrief.js`, `scoring/debrief.js`/`coach.js` outputs, D-23 latency targets, RULES R-23, R-25, R-54, R-61.

## Contract

1. **Listen on the improved reply (single voice, `alex_coach` mapping).** Server route `GET /sessions/{id}/debrief/moments/{moment_id}/audio` synthesizes the **stored, already-guarded** `better_reply` text for an ended session's debrief (looked up server-side by id; no text parameter). Only available after the session has ended and the debrief exists. It must contain only information the user had at that moment and no undiscovered sealed facts (R-25) — this is inherited from the stored guarded text; add a test that voiced text equals stored text. Client: Listen button per moment, captions visible, mute respected.
2. **Fallback behaviour end to end:** sidecar down at start → voice toggle shows "voice unavailable" and typed works; sidecar dies mid-session → next STT shows error, TTS degrades to browser mode then none; sidecar returns → recovers without restart (health re-probe with backoff, not per turn spam).
3. **Latency measurement (report separately from text latency, D-23):** a script `npm run voice:latency` that, with the sidecar and offline fake LLM provider (default) or the existing opt-in live provider only if the human authorises a call budget, measures over ≥ 20 runs on the demo laptop: STT time, TTS time-to-first-byte and total, text-turn time, and end-to-end "speech end → first audio". Output p50/p95 JSON to `evals/reports/` with CPU/GPU/RAM notes; no audio or transcript content stored. Targets are **unmeasured until run**; do not assert them. Include the 3D scene running during measurement and record observed stutter (frame-time sample from the existing scene if available).
4. **Decision rule recorded, not automatic:** if added voice latency (STT + TTS-first-byte) on the demo laptop is under about 1.5 s p50 and the scene does not stutter → local stays primary. Otherwise report the numbers and ask the human whether to authorise a cloud adapter (new decision; **do not implement cloud here**).
5. **Scripted voice playthroughs (offline, fake STT/TTS, fake LLM):** drive the smart path and trap path through the voice entry (STT fake returns scripted text → confirm → send) and assert identical engine outcomes, scores and flags as the existing typed fixtures (60/7 deterministic values still hold). Assert that no STT draft that was edited before sending ever appears in the transcript or quotes.
6. **Docs:** update AGENT.md commands (`voice:sidecar`, `voice:smoke`, `voice:bench`, `voice:latency`), PHASES P6.3–P6.5 status (offline accepted / live NOT RUN), ARCHITECTURE §13 as built, and the demo operator script (`evals/reports/s1-p7/demo-script.md`): mic permission, HTTPS/localhost note, sidecar start order, "if voice misbehaves, switch it off and type" line.

## Test plan

Offline: all of the above with fakes; full `npm test`, `npm run test:api`, `npm run verify:offline`, build and corrected bundle scan green. Check that voice-off behaviour is byte-for-byte the previous behaviour (snapshot of responses).
Manual with screenshots: full smart path by voice with the real local sidecar; Listen on a debrief moment; unplug/kill sidecar mid-run; narrow screen.
Live LLM: none required.

## Review focus
Listen speaks only stored guarded text; no new text-accepting route; latency reported honestly with sample counts and hardware; no claim of demo readiness.

## Stop and ask
Cloud adapter, audio retention, any scoring/engine change, or tuning slider/weights from voice playtests.

## Gate / exit
Voice path complete behind the flag or hidden; Listen works; fallbacks verified; latency numbers recorded (or `NOT RUN` with reason); P6.3–P6.5 checked off offline only; Stage 1 live gates remain visibly deferred.
