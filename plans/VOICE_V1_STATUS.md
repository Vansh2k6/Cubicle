# Voice V1 status — 2026-10-21

V1 server implementation verified on feat/voice-v1, isolated from the primary checkout. See [S1-V1 gate](../evals/reports/S1-V1-gate.md) for final acceptance, test evidence and limitations.

V1 adds a default-off local STT endpoint and provider boundary, fake providers and offline tests, an optional loopback Python service, pinned requirements/model downloader, smoke and benchmark scripts. No engine, pipeline, scoring or client application code changes. P6.3 remains unchecked because recording and editable confirmation are V2; P6.4/P6.5 remain unchecked.

Installed locally: Python 3.13; faster-whisper 1.2.1; piper-tts 1.8.0; ctranslate2 4.8.3; av 19.0.2; onnxruntime 1.31.0. Package imports and pip dependency check succeeded. Whisper small.en loaded locally in CPU int8 and optional CUDA float16 modes; four Piper voices downloaded. Optional NVIDIA wheels are installed inside the ignored venv; no system driver/toolkit or permanent PATH change. Environment/models are ignored and not committed. The original root .env was not read or changed.

Independent review, 245 unit tests, 46 API tests, 9 Python tests, build/bundle scan and local synthetic smoke/API checks passed. Five CPU samples measured added voice latency p50 2258ms; the user-requested CUDA comparison measured521ms on the RTX4050. GPU meets the timing component in this synthetic check; scene-load and microphone acceptance remain unverified. CPU stays the default; CUDA is opt-in. See the V1 gate report for details. No Groq/cloud calls, microphone/browser verification, scene-load acceptance or V4 provider decision is implied. No rule exception. Verified Python 3.13 replaces the draft Python 3.11 installation suggestion; no system Python installation was needed.

V2 starts fresh from the accepted V1 commit in a separate checkout. A separately started V1 sidecar can be reused through its loopback URL and private shared process token; ignored runtime/models do not follow Git branches. Follow voice-sidecar/README.md.
