# VOICE_PREINSTALL_WINDOWS.md — Windows voice readiness and installation guide

> **Installation authority, 2026-10-21:** the user authorises agent-managed installation for this voice work. Earlier no-install advice is superseded. No installation has occurred; installed versions and model availability still require verification.

Goal: verify voice readiness on **each** demo laptop and, after D-35 approval, install any missing prerequisites using these PowerShell commands. Package and command names are [Likely] correct; record failures for the V1 handoff. Disk needed: about 2 GB. Internet is needed only for installation and model download, not at demo time.

## 1. Tools

| Need | Check | If missing |
|---|---|---|
| Node.js LTS | `node -v` | Already installed for the project |
| Git | `git --version` | Already installed |
| **Python 3.11, 64-bit** | `py -3.11 --version` | Install from python.org, tick "Add python.exe to PATH". Use 3.11, not 3.13 (some audio/ONNX wheels lag on the newest Python) [Likely] |
| VC++ Redistributable 2015–2022 x64 | usually present | Install from Microsoft if import errors mention a missing DLL [Likely] |
| Chrome or Edge, mic works | Settings → Privacy → Microphone | Allow the browser |
| Latest NVIDIA driver (only for the optional GPU step) | `nvidia-smi` | Update via NVIDIA app |

No ffmpeg needed: faster-whisper bundles PyAV for webm/opus decoding. [Likely]

## 2. Create the sidecar environment (repo root)

```powershell
mkdir voice-sidecar -Force
cd voice-sidecar
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install faster-whisper piper-tts
```

If PowerShell blocks scripts, you don't need to activate the venv; always call `.\.venv\Scripts\python.exe` directly.

## 3. Download models now (so demo needs no internet)

```powershell
# STT model (~0.5 GB) into the Hugging Face cache
.\.venv\Scripts\python.exe -c "from faster_whisper import WhisperModel; WhisperModel('small.en', device='cpu', compute_type='int8'); print('stt ok')"

# TTS voices (~60 MB each); try these, names may differ, check Piper's voices list if one fails
.\.venv\Scripts\python.exe -m piper.download_voices en_US-lessac-medium en_US-ryan-medium en_US-amy-medium en_GB-alan-medium
```

Hugging Face may warn about symlinks on Windows. It still works; ignore it, or enable Windows Developer Mode to silence it.

## 4. Quick self-test (proves the install, costs no Codex tokens)

```powershell
.\.venv\Scripts\python.exe -c "import faster_whisper, piper; print('imports ok')"
```

Then, after V1 exists, `npm run voice:smoke`. Windows Firewall may prompt for Python on loopback port 8790: click Allow (private networks).

## 5. Optional GPU step (only after CPU works and the bench says you need it)

```powershell
.\.venv\Scripts\python.exe -m pip install nvidia-cublas-cu12 nvidia-cudnn-cu12
```

Then set `VOICE_STT_DEVICE=cuda`. If it errors on a missing cuBLAS/cuDNN DLL, the fix is usually putting those packages' `bin` folders on PATH, or just staying on CPU. Don't spend more than 20 minutes on it. [Likely]

## 6. Keep out of git

Add to `.gitignore`: `voice-sidecar/.venv/`, `voice-sidecar/models/`, `out/`.

## 7. What to tell Codex at the start of each voice prompt

"Verify the voice environment described in VOICE_PREINSTALL_WINDOWS.md. D-35 is Accepted and the user authorises installation of missing Python, packages, or models; report the installed versions and model readiness before V1. Keep runtime local/offline."

## 8. Checklist to tick before V1

- [ ] `py -3.11 --version` works
- [ ] venv created, `imports ok` printed
- [ ] `stt ok` printed (model cached)
- [ ] at least 3 Piper voices downloaded
- [ ] Microphone permission works in Chrome/Edge
- [ ] Same steps done on the second laptop if you may demo on it
