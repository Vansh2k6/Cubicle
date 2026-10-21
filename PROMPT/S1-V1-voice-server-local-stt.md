# S1-V1 — Voice server module, local provider, STT route

> **Head document: `AGENT.md`.** Read `S1-V00-voice-start-here.md` and `VOICE_LOCAL_IMPLEMENTATION.md` first. Follow §6 handoff. **Entry:** D-35 Accepted (V0).
**PHASES.md item:** P6.3 (server half). **Read first:** RULES R-10, R-16, R-50, R-53, R-54, R-60, R-65, R-66; ARCHITECTURE §13; existing `llm/gateway.js`, `llm/config.js`, `llm/providers/*`, `llm/fakeProvider.js`, `services/api/server.js` (route table, session auth, body limits, error shape).

## Contract

- New `/voice` package: `provider.js` (interface + chain runner with per-call timeout and typed errors), `config.js` (env parsing, defaults, validation), `providers/local.js` (HTTP client to the loopback sidecar), `providers/fake.js` (deterministic canned transcripts/audio bytes for tests), `limits.js` (caps, rate limiter).
- **Engine, pipeline, scoring unchanged (R-16).** `/voice` imports nothing from `/engine`.
- Env (add to `.env.example`, allowlisted public defaults, empty secrets): `VOICE_ENABLED=0`, `VOICE_STT_CHAIN=local`, `VOICE_TTS_CHAIN=local,browser`, `VOICE_LOCAL_URL=http://127.0.0.1:8790`, `VOICE_LOCAL_TOKEN=` (shared secret with sidecar, server-side only), `VOICE_STT_TIMEOUT_MS=8000`, `VOICE_TTS_TIMEOUT_MS=6000`.
- Route `POST /sessions/{id}/voice/stt`: body is raw audio bytes with `Content-Type` in an allowlist (`audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`); caps: ≤ 2 MB, ≤ 30 s duration (reject over), per-session rate limit (e.g. 12/min), one in-flight per session. Returns `{text, duration_ms, provider}` or the existing error shape with stable codes (`voice_disabled`, `audio_too_large`, `unsupported_media`, `stt_unavailable`, `stt_empty`). **The route never touches the turn pipeline, transcript, engine state, snapshots or session store.** Disabled voice → 404/`voice_disabled`.
- STT hygiene in the adapter/sidecar contract: empty or sub-0.4 s speech, or output matching known silence hallucinations ("thank you.", "you", ".") → `stt_empty`, so the UI asks the user to retry or type.
- Audio handled only as in-memory Buffer; no temp files, no persistence, nothing in logs/trace (R-54, R-66). Logs may record `{session_hash, bytes, duration_ms, provider, latency_ms, outcome}`.
- Session ID passed to the sidecar as an opaque header at most; no names/transcripts beyond the audio itself (R-53).
- Scripts: `npm run voice:sidecar` (starts the Python sidecar per implementation doc), `npm run voice:smoke` (health check + one STT call with a tiny bundled/synthesized WAV + one TTS call through the sidecar; **local only, no network**; reports `NOT RUN` if the sidecar/models are absent), `npm run voice:bench` (N runs of STT on a fixed ~5 s clip and TTS of a fixed 2-sentence line; prints p50/p95 and time-to-first-byte; writes `evals/reports/voice-bench-<date>.json` with hardware notes; **no audio or transcript content saved**).

## Test plan (offline, no sidecar, no network)

1. Config parser: defaults, invalid chain names rejected, voice disabled by default.
2. Chain runner: first provider times out/fails → next used; all fail → typed error; abort signal honoured.
3. Route: disabled → `voice_disabled`; oversize/unsupported/rate-limit/concurrent → correct codes; unknown or ended session → existing behaviour; valid audio with the fake provider → text.
4. **Isolation:** a successful STT call leaves session transcript, engine state, snapshots, public state and store dumps byte-identical.
5. No filesystem writes during STT (spy on fs write APIs) and no audio in log output.
6. Sidecar unreachable → `stt_unavailable` quickly (within timeout), server keeps serving typed turns.
7. Existing 217 offline + 35 API tests unchanged; bundle scan unchanged (no client change yet).

**Manual (if sidecar installed):** `voice:smoke`, then `voice:bench` on the demo laptop; paste results to the human. Ask the human the hardware question (S1-V00 §5).

## Review focus
No route reachable that synthesizes arbitrary text (none added yet); size/time caps enforced before provider call; secrets server-side; no dependency added to Node side.

## Stop and ask
Any need for a Node dependency; sidecar language/runtime change; any edit to existing route behaviour.

## Gate / exit
Offline suite green; STT route works end to end with fake provider; local smoke/bench either recorded (with numbers and hardware) or `NOT RUN` with reason. Bench numbers are measurements, not acceptance; no demo-ready claim.
