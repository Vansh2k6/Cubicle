# Local voice service — V1

Optional, English-only speech-to-text. No microphone UI ships until V2. No public synthesis route ships in V1. The Python service's token-protected /tts endpoint is internal to Node/operator checks. Typed input, engine, guards and scoring are unchanged. Voice defaults off.

## Installation (Windows, from this checkout)

Python 3.13 is verified on this laptop. The older guide's Python 3.11 requirement was compatibility advice; supported Windows wheels now work on 3.13.

    py -3.13 -m venv voice-sidecar/.venv
    voice-sidecar/.venv/Scripts/python.exe -m pip install --only-binary=:all: -r voice-sidecar/requirements.txt
    voice-sidecar/.venv/Scripts/python.exe voice-sidecar/download_models.py

Primary packages: faster-whisper 1.2.1 (local STT) and piper-tts 1.8.0 (local TTS). No npm dependency added. Model downloads require internet once; inference loads local paths only. Whisper small.en uses CPU int8 and six threads. GPU STT is optional via VOICE_STT_DEVICE=cuda; CPU remains the default. Kokoro/cloud remain deferred.

Verified model paths: voice-sidecar/models/whisper-small.en and voice-sidecar/models/piper. All four Piper voices are loaded: en_US-lessac-medium, en_US-ryan-medium, en_US-amy-medium, en_GB-alan-medium. Installation and models are ignored, never committed. Piper runtime is GPLv3; retain the upstream runtime and voice-model licence notices when distributing them.

## Run

Use a private terminal with a shared token in the process environment. Never paste or print it, store it in tracked files, or use a VITE_ variable. The scripts do not read .env.

    $env:VOICE_LOCAL_TOKEN = [Convert]::ToHexString([System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    npm run voice:sidecar

In a separate terminal set the same token privately for Node. Start the API with VOICE_ENABLED=1; VOICE_LOCAL_URL defaults to http://127.0.0.1:8790. Keep LLM_PROVIDER=offline for voice checks. An operator can instead launch both processes from one parent environment. The demo command never launches the Python service automatically. Missing token/model/setup fails with a generic message.

From an environment with that token:

    npm run voice:smoke
    npm run voice:bench

Smoke runs health, one internal TTS generation and one STT transcription. Benchmark defaults to five samples (VOICE_BENCH_RUNS=1..20), generates a fixed line into memory, and saves metadata only to evals/reports/voice-bench-YYYY-MM-DD.json. Neither command uses Groq or records audio/transcript content. Failed measurements do not become successful samples. Synthetic speech is not a microphone/accuracy evaluation. V4 must measure with the office open before the local-primary decision.

Stop the service with Ctrl+C. Keep port 8790 on loopback. Do not forward it or run a file server over this repository. Future worktrees can use this already-running V1 service through the same URL and token; ignored environments/models do not follow Git branches.

## Checks and boundary

    npm run verify:offline
    voice-sidecar/.venv/Scripts/python.exe -m unittest discover -s voice-sidecar -p test_server.py

Node checks use fake/mocked providers; no Python or model required. Python handler tests use a fake runtime. A decoder test uses installed PyAV when available and reports a skip otherwise.

POST /sessions/{id}/voice/stt accepts raw audio/webm, audio/ogg, audio/mp4 or audio/wav (MIME codec parameters accepted). Limits: 2 MiB, actual decoded duration at most 30s, at least 400ms speech, 12 requests/minute/session, one upload/transcription in flight/session. Upload deadline and per-provider deadline are each 8s. Unknown/ended sessions cannot transcribe. Silence asks the user to retry/type. Only a draft is returned; it never enters the transcript, state or score. A future UI must let the user edit and confirm it.

Audio remains in memory. No raw bodies, transcript text, arbitrary provider errors or tokens are logged. Sidecar worker admission and model operations are bounded. Sidecar /health requires the same token; browser Origin requests are refused. Node voice CORS permits local development UI origins only. Session IDs remain the existing bearer-capability model; account/auth infrastructure is outside V1.

No microphone, client confirmation, NPC playback, debrief Listen, cloud adapter, scene-load test or demo-readiness claim is included.


## Optional GPU check (Windows)

The user authorised the GPU comparison on 2026-10-21. Keep the base environment first; the optional NVIDIA runtime wheels stay inside the ignored venv. No driver/toolkit or permanent PATH change is needed.

    voice-sidecar/.venv/Scripts/python.exe -m pip install --only-binary=:all: -r voice-sidecar/requirements-gpu.txt
    $env:VOICE_STT_DEVICE = "cuda"
    npm run voice:sidecar

Whisper uses float16 on CUDA; Piper remains on CPU. The service temporarily locates the NVIDIA wheel DLL directories inside its own process. Invalid devices fail setup with a generic message. Set VOICE_STT_DEVICE=cpu or unset it to restore CPU/int8. No automatic GPU-to-CPU substitution hides a failed measurement.

Run the same smoke/bench commands. GPU reports receive a -cuda filename suffix so the CPU report is preserved. These are synthetic timing checks; scene stutter and microphone accuracy still need V4 measurement. Package readiness alone is not a passing GPU benchmark.
