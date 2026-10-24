# Local voice service — V1/V2

Optional, English-only speech-to-text. V2 adds opt-in push-to-talk and editable transcript confirmation. NPC playback remains V3. The Python service's token-protected /tts endpoint is internal to Node/operator checks. Typed input, engine, guards and scoring are unchanged. Voice defaults off.

## Installation (Windows, from this checkout)

Python 3.13 is verified on this laptop. The older guide's Python 3.11 requirement was compatibility advice; supported Windows wheels now work on 3.13.

    py -3.13 -m venv voice-sidecar/.venv
    voice-sidecar/.venv/Scripts/python.exe -m pip install --only-binary=:all: -r voice-sidecar/requirements.txt
    voice-sidecar/.venv/Scripts/python.exe voice-sidecar/download_models.py

Primary packages: faster-whisper 1.2.1 (local STT) and piper-tts 1.8.0 (local TTS). No npm dependency added. Model downloads require internet once; inference loads local paths only. `VOICE_STT_DEVICE=auto` (default) prefers available CUDA/float16 after successful warm inference, otherwise CPU/int8 with six threads. Explicit `cpu` or `cuda` pins that device; explicit CUDA failure does not silently switch to CPU. Kokoro/cloud remain deferred.

Verified model paths: voice-sidecar/models/whisper-small.en and voice-sidecar/models/piper. All four Piper voices are loaded: en_US-lessac-medium, en_US-ryan-medium, en_US-amy-medium, en_GB-alan-medium. Installation and models are ignored, never committed. Piper runtime is GPLv3; retain the upstream runtime and voice-model licence notices when distributing them.

## Run

Use a private terminal with a shared token in the process environment. Never paste or print it, store it in tracked files, or use a VITE_ variable. The voice scripts do not read .env automatically. Private loading is permitted by the user; live calls require their specific request (D-36).

    $env:VOICE_LOCAL_TOKEN = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    npm run voice:sidecar

In a separate terminal set the same token privately for Node. Start the API with VOICE_ENABLED=1; VOICE_LOCAL_URL defaults to http://127.0.0.1:8790. Keep LLM_PROVIDER=offline for voice checks. An operator can instead launch both processes from one parent environment. The demo command never launches the Python service automatically. Missing token/model/setup fails with a generic message.

For the V2 web client, set `VITE_VOICE=1` before starting Vite or building the frontend. The client also requires Node's `GET /voice/status` to report enabled STT. Leave either flag off to keep voice hidden. In a conversation, enable Voice, hold the mic or focus it and press Space/Enter to start/stop. Ctrl+Shift+Space toggles recording only while the reply input is focused. Review/edit the resulting draft, then press Send. Neither enabling voice nor receiving a draft sends a turn. A saved preference never starts recording automatically. Recordings stop at 30 seconds; denied permissions, silence and unavailable speech services leave typing usable. Transcript drafts longer than the composer's 500-character limit are rejected rather than silently truncated.

From an environment with that token:

    npm run voice:smoke
    npm run voice:bench

Smoke runs health, one internal TTS generation and one STT transcription. Benchmark defaults to five samples (VOICE_BENCH_RUNS=1..20), generates a fixed line into memory, and saves metadata only to evals/reports/voice-bench-YYYY-MM-DD.json. Neither command uses Groq or records audio/transcript content. Failed measurements do not become successful samples. Synthetic speech is not a microphone/accuracy evaluation. V4 must measure with the office open before the local-primary decision.

Stop the service with Ctrl+C. Keep port 8790 on loopback. Do not forward it or run a file server over this repository. Future worktrees can use this already-running V1 service through the same URL and token; ignored environments/models do not follow Git branches.

## Checks and boundary

    npm run verify:offline
    voice-sidecar/.venv/Scripts/python.exe -m unittest discover -s voice-sidecar -p test_server.py

Node checks use fake/mocked providers; no Python or model required. Python handler tests use a fake runtime. A decoder test uses installed PyAV when available and reports a skip otherwise.

POST /sessions/{id}/voice/stt accepts raw audio/webm, audio/ogg, audio/mp4 or audio/wav (MIME codec parameters accepted). Limits: 2 MiB, actual decoded duration at most 30s, at least 400ms speech, 12 requests/minute/session, one upload/transcription in flight/session. Upload deadline and per-provider deadline are each 8s. Unknown/ended sessions cannot transcribe. Silence asks the user to retry/type. Only a draft is returned; it never enters the transcript, state or score until explicitly sent. `GET /voice/status` exposes only `{enabled, stt, tts_mode:"none"}`, with local-origin voice CORS and no provider calls.

Audio remains in memory. No raw bodies, transcript text, arbitrary provider errors or tokens are logged. Sidecar worker admission and model operations are bounded. Sidecar /health requires the same token; browser Origin requests are refused. Node voice CORS permits local development UI origins only. Session IDs remain the existing bearer-capability model; account/auth infrastructure is outside V1.

V2 includes client recording/confirmation; real microphone, scene-load and demo readiness acceptance are recorded separately in the V2 gate, not implied by unit tests or synthetic speech. NPC playback, debrief Listen and a cloud adapter are not included.


## Optional GPU check (Windows)

The user authorised the GPU comparison on 2026-10-21. Keep the base environment first; the optional NVIDIA runtime wheels stay inside the ignored venv. No driver/toolkit or permanent PATH change is needed.

    voice-sidecar/.venv/Scripts/python.exe -m pip install --only-binary=:all: -r voice-sidecar/requirements-gpu.txt
    $env:VOICE_STT_DEVICE = "cuda"
    npm run voice:sidecar

Whisper uses float16 on CUDA; Piper remains on CPU. The service temporarily locates the NVIDIA wheel DLL directories inside its own process. Invalid devices fail setup with a generic message. Set `VOICE_STT_DEVICE=cpu` to force CPU/int8; unset it or select `auto` to prefer GPU with CPU portability fallback. Pin `cuda` when measuring GPU so automatic fallback cannot hide a failed measurement. Health reports the actual device and compute type only to token-authorized operators.

Run the same smoke/bench commands. GPU reports receive a -cuda filename suffix so the CPU report is preserved. These are synthetic timing checks; scene stutter and microphone accuracy still need V4 measurement. Package readiness alone is not a passing GPU benchmark.
