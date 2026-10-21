# VOICE_LOCAL_IMPLEMENTATION.md — Local voice provider (sidecar) spec

> **Installation authority, 2026-10-21:** the user authorises agent-managed installation for this voice work. Earlier no-install advice is superseded. No installation has occurred; installed versions and model availability still require verification.

Read-only implementation guidance for V1/V3. Project documents win on conflict. Confidence tags: [Certain] hard evidence, [Likely] strong inference, [Guessing] verify on the demo laptop. Model names, package names and voice ids must be **verified at install time**; do not assume them.

## 1. Shape

```
Browser ──audio blob──► Node API (/voice module) ──loopback HTTP──► Python sidecar (127.0.0.1:8790)
                         ▲  chain, caps, timeouts, auth                ├─ faster-whisper small.en  (STT)
Browser ◄──audio bytes── Node API (turn-scoped route)  ◄──────────────┴─ Piper (default) / Kokoro (opt)  (TTS)
```

Why a sidecar: both models are Python-first; Node stays dependency-free (R-65). The sidecar is a replaceable adapter behind the Node `SpeechProvider` interface. A cloud provider later is a different adapter with the **same interface**; only these differ: network failure modes, cost/rate caps, upload of audio off-machine (R-53 identity rule applies), per-call latency, and no process lifecycle to manage. Nothing else in the architecture changes.

## 2. Sidecar contract (loopback only)

- Bind `127.0.0.1` only. Require header `X-Voice-Token` equal to `VOICE_LOCAL_TOKEN` (random per start if unset; Node reads the same env). Reject otherwise.
- `GET /health` → `{ok, stt_model, tts_engine, device, voices:[...], warm:true|false}`.
- `POST /stt` body = raw audio bytes, header `Content-Type` as uploaded. Decode in memory (faster-whisper accepts file-like objects; it bundles PyAV so webm/opus decodes without a system ffmpeg [Likely]). Returns `{text, duration_ms, no_speech_prob}`. Limits: 2 MB, 30 s.
- `POST /tts` JSON `{text, voice}` (text ≤ 600 chars) → `audio/wav` bytes (or `audio/mpeg` if encoded). Voice must be in the sidecar's allowlist.
- Never write audio or text to disk, never log audio or text bodies; log counts and latencies only (R-54, R-66). No telemetry/network calls at runtime (set model dirs offline: `HF_HUB_OFFLINE=1` after first download).

## 3. STT settings (faster-whisper)

- Model `small.en`; CPU: `compute_type="int8"`; NVIDIA GPU with ample VRAM: `device="cuda"`, `compute_type="float16"` or `int8_float16`. [Likely] `small.en` int8 transcribes a 5 s utterance in roughly 1–2.5 s on a modern 6–8 core CPU; much less on GPU. [Guessing] exact numbers — measure with `voice:bench`.
- Parameters: `beam_size=1`, `language="en"`, `condition_on_previous_text=False`, `vad_filter=True` with a short `min_silence_duration_ms`, `without_timestamps=True`. Drop output if `no_speech_prob` high, if total speech < 0.4 s, or text in the silence-hallucination set (`""`, `"you"`, `"thank you."`, `"."`) → Node returns `stt_empty`.
- Warm up at startup with 1 s of silence so the first real request is not slow. Consider `tiny.en`/`base.en` if `small.en` misses the latency target [Likely faster, less accurate].
- GPU contention: if the laptop GPU also renders the Three.js scene, prefer CPU Whisper to avoid frame stutter [Likely].

## 4. TTS settings

- Default **Piper** (ONNX, CPU, very fast) [Likely ~0.2–0.6 s for a 2-sentence line]. Pick three distinct English voices for Maya, Jordan, Sam plus one for the coach; verify the exact voice model names in the Piper voices list at install [Guessing on names]. Set per-NPC `length_scale`/speaker for variety only if the voice supports it.
- **Kokoro is deferred unless the human asks.** It is an optional 82M ONNX engine for later quality evaluation [Likely better naturalness; Guessing ~1–2 s CPU latency per short line]. If authorised later, make it a sidecar config switch (`TTS_ENGINE=piper|kokoro`); voice map names are engine-specific, so keep the map in server config keyed by engine.
- Output 16/22/24 kHz mono WAV; the client plays it directly. Lines are 1–3 sentences (R-13), so synthesize the whole line in one call; sentence streaming is Stage 2 and cannot start before the guard finishes anyway.

## 5. Install and run (document in AGENT.md only once verified)

- Python ≥ 3.10 venv under `voice-sidecar/` (git-ignored `.venv/` and `models/`); `requirements.txt`: `faster-whisper`, plus `piper-tts` (and `kokoro-onnx` optional). Justification (R-65): the only practical local runtimes for these models; sidecar is optional and off by default. Pin versions after the first working install.
- `voice-sidecar/server.py` using the stdlib `http.server.ThreadingHTTPServer` (no web framework), `voice-sidecar/download_models.py` for one-time model download (run before the demo; demo machine needs no internet afterwards).
- Scripts: `npm run voice:sidecar` (spawns venv Python), `voice:smoke`, `voice:bench`, `voice:latency`. The sidecar is **not** started by `npm run demo`; the operator script lists start order: sidecar → API/demo → browser.
- Disk/RAM: [Likely] `small.en` ≈ <1 GB RAM int8; Piper voices tens of MB each; Kokoro a few hundred MB. Models stay out of git and out of the bundle (`dist` scan must stay clean).

## 6. Failure and security model

- Sidecar down/slow → Node times out per config and moves down the chain; typed input unaffected.
- Node adapter uses `fetch` with `AbortSignal.timeout`, bounded body sizes, and never forwards client headers to the sidecar.
- The sidecar is a dev-machine service, not a deployable component; never expose it beyond loopback.
- Fake provider (`voice/providers/fake.js`) returns canned transcripts and short deterministic byte payloads so all repo tests run with no Python, no models, no network.

## 6a. Demo hardware profile (human-provided, 2026-10-21)

- Laptop A: Ryzen 7 8845HS (8C/16T), RTX 4050 6 GB VRAM, 16 GB RAM. Laptop B: slightly faster CPU, RTX 4060 8 GB, RAM assumed 16 GB (confirm). Windows is assumed; confirm.
- **Defaults: CPU for everything, chosen for setup risk, not scene load.** An audit of `office.js` shows the scene is light (about 350 draw calls, roughly 30–100 MB VRAM, estimated, not measured), so GPU contention is not a concern. STT `small.en` int8 on CPU; Piper on CPU. `VOICE_STT_DEVICE=cpu` default; `cuda` is a second step once CPU works, valuable if `voice:bench` shows CPU misses the target. [Likely] CUDA on Windows needs cuBLAS/cuDNN DLLs for ctranslate2; see VOICE_PREINSTALL_WINDOWS.md.
- Environment readiness is unverified (see VOICE_PREINSTALL_WINDOWS.md). After D-35 approval, the user authorises agent-managed installation of missing prerequisites; verify installed Python, package versions, and model availability before V1.
- Kokoro deferred; Piper only unless the human asks. Use `cpu_threads` of about 6 so the scene and browser keep headroom [Guessing; tune in bench].
- Run `voice:bench` and `voice:latency` on **each** laptop with the scene open. Demo on the laptop that passes; hardware spec alone is not the criterion.
- Windows specifics to verify at install: Python venv activation, `piper-tts` wheel availability for the installed Python version, loopback firewall prompt for port 8790, models downloaded before the demo so no internet is needed.

## 7. Measuring the primary-provider decision

`voice:bench` and `voice:latency` produce p50/p95 for STT, TTS time-to-first-byte, and speech-end → first audio, with hardware notes. Decision rule (D-35): local primary if added voice latency ≲ 1.5 s p50 and no scene stutter; otherwise propose a cloud adapter in a new decision and keep local as the offline mode. These are targets; nothing is measured until the commands run.
