# S1-V4 offline checkpoint gate — 2026-10-22

Implementation: ended-only stored-coaching Listen, revision-scoped audio invalidation, bounded deduplicated health/backoff, explicit retry recovery, one playback unlock owner, modal-local Voice/Sounds controls and an offline-only latency runner. No engine/scoring/scenario or dependency changes.

Coder checks use fake providers and local loopback only. Focused tests cover stored exact guarded text and coach voice; live/unknown/query/method/origin refusal; pending/stale retry cancellation; voice-off response equivalence; startup-down/mid-session failure/recovery; bounded health and audio; consent/mute/close/stale-run behavior; persisted opt-in Send unlock; and smart/trap confirmed voice text matching typed 60/7 scores and flags. These are coder checks, not independent acceptance.

Focused coder checks passed: `node --test "voice/tests/*.test.js" scoring/tests/debrief.test.js` — 68 tests; elevated loopback `node --test services/api/tests/listen.test.js services/api/tests/speech.test.js services/api/tests/voice.test.js` — 27 tests. `git diff --check` passed. No full gate or real sidecar benchmark was run by the coder.

Independent source review: Sol approved the 25-file source manifest, fingerprint `ad2c6e781a671ecb7b36446aff10bfa8cb59d89e057338fdd038b7cd0209e6bd`, with no blockers. Luna tester verification on that unchanged source manifest: `npm run verify:offline` exit 0, 294/294 unit tests and 63/63 API tests; default build scan 5 artifacts/81 needles/0 hits; `VITE_VOICE=1` scan 6 artifacts/81 needles/0 hits. The existing >500 kB chunk warning remains. Logs are ignored at `out/voice-v4-verify-offline.log` and `out/voice-v4-voice-bundle-scan.log`. This documentation handoff follows the source checkpoint.

Root ran the real local 20-run warmed CUDA sidecar measurement, recorded in `voice-latency-2026-10-22.json`: `small.en` float16 STT 351/394 ms, guarded text 3/5 ms, Piper TTS first byte 190/207 ms and total 190/208 ms, added voice 543/587 ms, speech-end-to-first-audio 546/590 ms p50/p95. Hardware: Ryzen 7 8845HS, 16 logical CPUs, 15,631 MiB reported memory. Scene stutter/performance is NOT RUN: the scene was not running and no frame-time sampler exists. No microphone, physical playback, live LLM, Groq/cloud call, or `.env` read was involved.

Root's local HTTP checks: before status was 200 with `stt: true`/`server`; after stopping only its own sidecar it was 200 with `stt: false`/`browser`, and a typed turn remained 200; restarting the same token restored `stt: true`/`server` without an API restart. New NPC audio returned a 160,300-byte WAV; provisional partial-feedback coaching Listen returned a 170,028-byte no-store WAV. Cached existing fallback IDs remain fallback after recovery, while new turns recover. These are API checks only, not browser or perceived-speech acceptance.

V4 browser/narrow/full smart path, microphone, physical-speaker/distinct-voice, playback-unlock perception, browser Listen/loss-recovery, and scene-load/stutter checks remain NOT RUN. Chrome automation stopped after user input was detected. Any V3 browser coverage is historical only.

P6.3–P6.5 remain unchecked. This offline checkpoint is accepted for root review only; it does not close a latency target, local-primary/cloud decision, scene-performance acceptance, Stage 1 live gate, or demo-ready status.
