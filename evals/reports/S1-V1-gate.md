# S1-V1 — Local STT server gate, 2026-10-21

PART: S1-V1 · PHASE ITEM: P6.3 server half
STATUS: ACCEPTED — bounded implementation and local synthetic verification only

Branch: feat/voice-v1, based on accepted V0 c979a7b. Isolated checkout: C:/Users/shubh/Cubicle/.worktrees/voice-v1. Primary checkout and the friend's work were not edited. P6.3–P6.5 remain unchecked: recording, editable confirmation, NPC playback and Listen are later prompts.

## Changes

- Voice boundary: voice/config.js, voice/limits.js, voice/provider.js, voice/http.js, voice/providers/local.js, voice/providers/fake.js.
- Integration/checks: services/api/server.js, services/api/tests/voice.test.js, voice/tests/voice.test.js, package.json, scripts/verify-offline.mjs, llm/tests/secrets.test.js, .env.example.
- Local service: voice-sidecar/server.py, voice-sidecar/test_server.py, voice-sidecar/requirements.txt, voice-sidecar/requirements-gpu.txt, voice-sidecar/download_models.py, voice-sidecar/README.md.
- Operator scripts: scripts/voice-sidecar.mjs, scripts/voice-smoke.mjs, scripts/voice-bench.mjs.
- Docs: CONTEXT/AGENT.md, CONTEXT/ARCHITECTURE.md, CONTEXT/PHASES.md (D-35 references corrected, boxes remain unchecked), VOICE_PREINSTALL_WINDOWS.md, plans/VOICE_V1_STATUS.md.
- Evidence: this report, bundle-scan-2026-10-21.json, voice-bench-2026-10-21.json, voice-bench-2026-10-21-cuda.json.

No engine/, src/, llm/pipeline.js, scoring/, scenario, scoring-weight, provider-model or lockfile changes. No npm dependency added.

## Gates

| Gate | Command / method | Result |
|---|---|---|
| Independent security review | Sol review; fixes re-reviewed before tester | PASS |
| Cumulative offline gate | npm run verify:offline | PASS, exit 0 |
| Unit tests | npm test (inside offline gate) | PASS: 245/245 |
| API tests | npm run test:api (inside offline gate) | PASS: 46/46 |
| Frontend build | npm run build (inside bundle scan) | PASS; existing large-chunk warning remains |
| Bundle content scan | npm run bundle:scan | PASS: 5 artifacts, 81 needles, zero hits |
| Python handler/decoder regressions | voice-sidecar/.venv/Scripts/python.exe -m unittest discover -s voice-sidecar -p test_server.py | PASS: 9/9, no skips |
| Whitespace | git diff --check | PASS |
| Package readiness | imports + pip check | PASS: no broken requirements |
| Local smoke | actual health + one internal TTS + one STT, in-memory synthetic speech | PASS: 4237ms clip; STT 2218ms; TTS TTFB 229ms, total232ms |
| Local benchmark | five warm CPU plus five warm CUDA samples | PASS as measurement; CUDA meets timing component only, see below |
| Actual API integration | synthetic WAV through POST /sessions/{id}/voice/stt using local provider | PASS: 1917ms, duration4307ms, complete captured session byte-identical |
| GPU smoke | same health/TTS/STT flow, CUDA float16 | PASS: 4202ms clip; STT336ms; TTS TTFB216ms, total218ms |
| GPU API integration | same synthetic upload through Node, local CUDA provider | PASS:242ms, duration4017ms, captured session byte-identical |
| Microphone, editable confirmation, scene load, human transcription accuracy, V4 acceptance | Outside V1 | NOT RUN |
| Groq/cloud | No calls authorised or required for V1 | NOT RUN; zero calls |

Node logs: ignored out/verify-v1.log. Python logs: ignored out/python-v1.log. The local runner was temporary ignored operator code at out/voice-local-check.mjs; its token was random in memory/process environment and never printed or stored in a file.

## Measured local performance

Windows, AMD Ryzen 7 8845HS, 16 logical CPUs, 15631MiB RAM. Python3.13; faster-whisper1.2.1, ctranslate2 4.8.3, av19.0.2, onnxruntime1.31.0, piper-tts1.8.0. Whisper small.en CPU int8, six threads; Piper CPU. Four verified Piper voice models and Whisper weights are installed under ignored voice-sidecar/models/. The isolated environment is ignored too.

Five warm samples of a fixed Piper-generated English line, about4.1s audio; no recording/audio/transcript saved. STT p50/p95: 2049/2080ms. TTS TTFB p50/p95:196/251ms; total198/253ms. Paired STT plus TTS-first-byte p50/p95:2258/2300ms. These small synthetic-sample percentiles do not establish human accuracy or scene performance. CPU misses D-35's about1.5s timing target. Keep local-primary acceptance pending V4; no cloud adapter or model switch is introduced.

## Additional user-authorised GPU comparison

The user requested testing on the GPU on 2026-10-21. NVIDIA GeForce RTX4050 Laptop GPU, 6141MiB VRAM, driver592.82; CTranslate2 detected one CUDA device. An initial warmup identified missing cuBLAS. Installed optional Windows wheels in the ignored venv only: nvidia-cublas-cu12 12.9.2.10, nvidia-cudnn-cu12 9.27.0.42, nvidia-cuda-nvrtc-cu12 12.9.86. No driver, system CUDA toolkit or permanent PATH change. Pip check passed.

VOICE_STT_DEVICE=cuda opts Whisper into float16; CPU/int8 remains the default and Piper stays on CPU. DLL lookup uses exact directories in the active venv; handles are retained and PATH edits are process-only. Device validation, accurate health metadata and separate GPU report filenames were reviewed by Sol. The final full gate passed again:245 unit,46 API,9 Python, build/bundle scan and diff checks. No GPU is needed for those offline tests.

Five warm CUDA samples of the same fixed English line: STT p50/p95 249/268ms; TTS TTFB253/280ms; TTS total256/282ms. Paired added voice overhead p50/p95 521/537ms, about4.3x faster median than CPU2258ms. This excludes the NPC/classifier LLM response time. The GPU local smoke and actual Node STT route both passed; session state remained unchanged. Raw audio and transcript were not saved or logged. CPU evidence was preserved separately.

GPU meets the timing component in this limited synthetic check, but scene stutter and microphone accuracy remain NOT RUN; this does not close V4 or establish the demo-primary decision. Temporary GPU/CPU sidecars and APIs were stopped after checks. Optional setup/reproduction commands are in voice-sidecar/README.md; no browser controls were added.

## Review findings and verification history

The first draft was sent back before review completion. Root handled security/concurrency changes after escalation from the bounded coder.

Sol required an absolute pre-auth header deadline (an inactivity timeout alone lets trickling clients hold all workers) and actual scoped filesystem/log privacy spies. Both were added and approved. Python inference remains non-cancellable after Node abort; its single-operation lease bounds concurrent work while typed turns remain usable.

Initial test URLs failed because raw opaque session IDs include #. The tests now encode them and bound their provider-start wait; no application route semantics were changed for that test issue.

The first full gate then exposed an oversized-upload connection reset. Early rejection now frames the JSON response and drains without buffering, bounded by byte count and deadline, before closing the incomplete upload. Sol re-reviewed it and the chunked-upload regression. The full Node gate then passed.

The Python trickle test initially treated Windows connection abort/reset as a test error. Sol approved accepting explicit abort/reset or EOF while still rejecting timeouts and unrelated errors; the worker-recovery assertion remains. The CPU-stage Python suite passed8/8; the later GPU-option gate passed9/9.

The initial CPU verification used26-path fingerprint A38D1BD873BDD0571103A8D301C754D1C4C89D779468A8F7596E93D0F790AFD6. After the additional GPU request, the final reviewed/tested27-path fingerprint was D966A79570883B2B8A1CE60B3E5AB382204F1EEF60C014746897E1E52EFE1CD4 (excluding generated reports). Root reconfirmed it after GPU runtime checks; no application logic changed after the final full gate. Evidence/status docs were updated afterwards. The staged whitespace check then caught extra blank lines in new files; terminal newlines were normalised without changing any non-newline bytes. All31 staged/working files were compared after Git line-ending and terminal-newline normalisation before re-staging.

## Rules / limits / handoff

R-10: existing approved STT/TTS purpose only. R-16: no engine dependency in voice. R-23/R-42: STT returns a draft only; no automatic turn or scoring. R-50/R-53/R-54/R-66: shared token server-only; no root .env reads/changes; audio and draft stay memory-only, no persistence/logging; no identity forwarded. R-60/R-64: offline cumulative checks, independent review/test/root gate. R-65: no Node dependency; Python packages justified by local speech inference.

Technical defaults: off; raw audio allowlist; 2MiB/30s; minimum400ms speech; 12/minute/session; one in-flight/session; upload and STT deadlines8s; local endpoint127.0.0.1:8790. Rejection draining is separately bounded to2MiB+64KiB and the upload deadline. These are transport defaults, not scenario/scoring constants.

Rule bent: none. Python3.13 replaces the draft3.11 suggestion based on compatible Windows wheels and successful installation/import/runtime checks. New cloud infrastructure, streaming and Kokoro were omitted. GPU runtime setup was added only after the user explicitly requested the GPU test.

V2 starts in a fresh isolated checkout from the accepted V1 commit. Follow voice-sidecar/README.md. Runtime/models do not follow Git branches; reuse this V1 sidecar or install the same pinned environment in the new checkout. The verification sidecar/API were stopped after checks. No push, PR, demo deployment or demo-readiness claim.
