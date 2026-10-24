# S1-V00 — Voice: start here (shared contract for V0–V4)

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2, §3, §6 (coder → reviewer → tester → orchestrator), §8, §9. Read `PROMPT/S1-00-start-here.md` for gate protocol and report format. This file never overrides a project document. If it conflicts with `VOICE_HANDOFF.md`, this file wins (the handoff is suggestions only; it contains known errors listed in §2 below).

**PHASES.md items:** P6.3, P6.4, P6.5. Voice is **optional** under D-23 and must never displace open Stage 1 gates (live acceptance is NOT RUN under D-28; voice does not change that and never supports a demo-ready claim).

## 1. Order of execution

| Prompt | File | Delivers |
|---|---|---|
| V0 | `S1-V0-voice-decision-docs.md` | D-35 recorded, ARCHITECTURE §13 updated. **No code.** Human must confirm D-35 before V1. |
| V1 | `S1-V1-voice-server-local-stt.md` | `/voice` server module, provider interface, local sidecar adapter, `POST /sessions/{id}/voice/stt`, `voice:smoke`, `voice:bench`. |
| V2 | `S1-V2-voice-client-ptt.md` | Push-to-talk recorder, editable transcript confirm, typed fallback, flag. |
| V3 | `S1-V3-voice-tts-npc.md` | Turn-scoped audio for committed guarded NPC lines, per-NPC voices, captions, mute, speaker highlight. |
| V4 | `S1-V4-voice-hardening-listen.md` | Fallback chain, debrief Listen, latency measurement, scripted voice playthroughs, docs. |

Local implementation detail (sidecar, models, install, contracts): `VOICE_LOCAL_IMPLEMENTATION.md`. Run V0 → V4 in order. Each is a bounded slice (R-64/D-23).

Run one prompt per fresh session. This session is V0 only and ends at its handoff even after D-35 approval. V1 begins fresh on `feat/voice-v1` from the accepted V0 tip in its own isolated checkout; apply the same fresh-session, isolated-checkout pattern to each later prompt without creating those branches now.

## 2. Corrections to earlier voice plans (binding)

1. **Audio is R-54, not R-53.** R-53 = no identity details to LLM/speech providers (use opaque session IDs). R-54 = no audio stored beyond transcription. R-66 = no raw audio in logs.
2. **No public arbitrary-text TTS route.** The server never synthesizes text supplied by the client. It synthesizes only text it already committed (a guarded NPC turn, or a stored guarded debrief improved reply), addressed by session + turn/moment id. This keeps TTS strictly after the guards (R-02, R-09) and makes sealed text un-requestable.
3. **TTS must not block the text reply.** The turn response returns the guarded text immediately with a speech descriptor; audio is prefetched server-side right after commit and fetched by the client by id. Failure of speech never changes engine state, discovery credit, scoring or the visible text.
4. **Never pre-render fallback/reveal lines into static files in `public/` or the client bundle.** Fallback-store lines for `reveal_fact:*` contain sealed fact text (R-01, R-08, D-33 bundle scan). Any pre-rendered audio lives server-side, outside the static root, and is served only via the turn-scoped route after the line is committed.
5. **Browser `SpeechRecognition` is not local.** Chrome/Edge send audio to a vendor service. Do not use it as the "local" STT. Capture audio with `MediaRecorder` and transcribe on the server through the provider chain. Browser `speechSynthesis` is genuinely local and is the last-resort TTS fallback only.
6. Scoring uses the **user-confirmed text only** (R-23). The STT draft is never stored as evidence. Quote validation (R-21) runs on the sent text exactly as today.

## 3. Shared contract

- English only. Typed input is permanent and always available. Voice is **off by default**: server `VOICE_ENABLED=1` and client `VITE_VOICE=1` (like `VITE_PRESETS=1`). Enabling voice in the UI is an explicit user click (R-42 opt-in), which also unlocks audio playback.
- Provider interface (server): `transcribe({audio, mime, signal}) → {text, duration_ms, provider}` and `synthesize({text, voice, signal}) → {audio: Buffer, mime, provider}`. Adapters: `local` (sidecar), `fake` (tests), `browser` (client-side TTS marker only). `cloud` is a future adapter slot behind the same interface; **do not implement cloud in this series.**
- Fallback chain is config: `VOICE_STT_CHAIN=local`, `VOICE_TTS_CHAIN=local,browser`. STT has no browser fallback; if STT fails the UI shows "couldn't transcribe — type instead" and the typed box stays focused.
- Per-NPC voice map in server config (`VOICE_MAP_JSON` or a config file): Maya, Jordan, Sam get distinct voices; a fourth entry `alex_coach` for the debrief Listen.
- Audio is held in memory only. No temp files with audio. No audio in logs, snapshots, session dumps, progress summaries or the debug trace. Sessions' audio caches are dropped on session end/delete.
- No new npm dependency for the Node side. The sidecar's Python dependencies are justified in `VOICE_LOCAL_IMPLEMENTATION.md` (R-65).
- `npm test` and `npm run verify:offline` must stay green with no network, no sidecar, no models. Voice tests use the fake provider.
- Never request keys in chat. Local voice needs none.

## 4. Stop and ask (all voice prompts)

Any change to engine, pipeline decisions, scoring, scenario content, or public-state allowlist beyond the single `speech` descriptor; any proposal to add a cloud provider, a dependency, audio retention, or a public synthesize route; any latency/hardware finding that suggests switching primary provider.

## 5. Hardware question for the human (ask once, in V1)

Demo laptop CPU model, core count, RAM, and GPU/VRAM. Defaults assume CPU-only; do not block on the answer.
