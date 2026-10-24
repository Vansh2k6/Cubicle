"""Optional loopback speech service. Request audio/text never touch disk."""
import io
import json
import logging
import os
from pathlib import Path
import secrets
import socket
import sys
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 2 * 1024 * 1024
MAX_SAMPLES = 30 * 16000
READ_SECONDS = 8
MIMES = {"audio/webm", "audio/ogg", "audio/mp4", "audio/wav"}
VOICES = ("en_US-lessac-medium", "en_US-ryan-medium", "en_US-amy-medium", "en_GB-alan-medium")
SILENCE = {"", "you", "you.", "thank you", "thank you.", "."}
ROOT = Path(__file__).resolve().parent


class VoiceFailure(Exception):
    def __init__(self, code="unavailable"):
        super().__init__(code)
        self.code = code


def stt_settings(env):
    device = env.get("VOICE_STT_DEVICE", "auto").strip().lower()
    if device not in {"auto", "cpu", "cuda"}:
        raise ValueError("invalid local voice device")
    return device


def cuda_available(probe=None):
    """Treat a missing or broken CUDA probe as unavailable, never as a crash."""
    try:
        if probe is None:
            import ctranslate2
            probe = ctranslate2.get_cuda_device_count
        return probe() > 0
    except Exception:
        return False


def cuda_libraries(device):
    handles = []
    if device == "cuda" and sys.platform == "win32":
        # These optional wheels stay inside this venv; never modify the system PATH.
        root = Path(sys.prefix) / "Lib" / "site-packages" / "nvidia"
        directories = [root / name / "bin" for name in ("cublas", "cudnn", "cuda_nvrtc")]
        available = [str(path) for path in directories if path.is_dir()]
        for path in available:
            handles.append(os.add_dll_directory(path))
        if available:
            os.environ["PATH"] = os.pathsep.join([*available, os.environ.get("PATH", "")])
    return handles


def warm_stt(model, numpy):
    # Consume the lazy iterator: loading weights alone is not warm inference.
    segments, _ = model.transcribe(numpy.zeros(16000, dtype="float32"), language="en",
                                   beam_size=1, without_timestamps=True)
    list(segments)


def load_stt_model(env, model_path, model_factory, numpy, cuda_probe=None):
    """Load the requested device, with auto falling back only after CUDA warm-up fails."""
    requested = stt_settings(env)

    def load(device):
        handles = cuda_libraries(device)
        model = model_factory(str(model_path), device=device,
                              compute_type="float16" if device == "cuda" else "int8",
                              cpu_threads=6, local_files_only=True)
        warm_stt(model, numpy)
        return model, device, "float16" if device == "cuda" else "int8", handles

    if requested == "cpu":
        return load("cpu")
    if requested == "cuda":
        if not cuda_available(cuda_probe):
            raise RuntimeError("CUDA unavailable")
        return load("cuda")
    if cuda_available(cuda_probe):
        try:
            return load("cuda")
        except Exception:
            pass
    return load("cpu")


def decode_bounded(raw):
    """Stop decoding at 30s rather than materializing an unbounded audio file."""
    import av
    import numpy as np
    from av.audio.resampler import AudioResampler

    if not raw or len(raw) > MAX_BYTES:
        raise VoiceFailure("size")
    chunks, count = [], 0
    resampler = AudioResampler(format="s16", layout="mono", rate=16000)

    def append(frame):
        nonlocal count
        samples = frame.to_ndarray().reshape(-1)
        count += len(samples)
        if count > MAX_SAMPLES:
            raise VoiceFailure("duration")
        chunks.append(samples)

    try:
        with av.open(io.BytesIO(raw)) as container:
            for frame in container.decode(audio=0):
                for resampled in resampler.resample(frame):
                    append(resampled)
            for resampled in resampler.resample(None):
                append(resampled)
    except VoiceFailure:
        raise
    except Exception:
        raise VoiceFailure("media") from None
    if count < 6400:
        raise VoiceFailure("empty")
    return np.concatenate(chunks).astype("float32") / 32768.0


class LocalRuntime:
    def __init__(self):
        # Local paths only; downloads belong to download_models.py.
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["HF_HUB_DISABLE_TELEMETRY"] = "1"
        logging.getLogger("faster_whisper").disabled = True
        from faster_whisper import WhisperModel
        from piper import PiperVoice
        import numpy as np

        model_dir = ROOT / "models"
        self.model, self.device, self.compute_type, self.dll_handles = load_stt_model(
            os.environ, model_dir / "whisper-small.en", WhisperModel, np)
        self.voices = {name: PiperVoice.load(str(model_dir / "piper" / f"{name}.onnx"))
                       for name in VOICES}
        from faster_whisper.vad import get_speech_timestamps
        get_speech_timestamps(np.zeros(16000, dtype="float32"), sampling_rate=16000)
        for name in VOICES:
            self.synthesize("Ready.", name)

    def health(self):
        return {"ok": True, "stt_model": "small.en", "tts_engine": "piper",
                "device": self.device, "compute_type": self.compute_type,
                "voices": list(VOICES), "warm": True}

    def transcribe(self, raw, mime):
        from faster_whisper.vad import get_speech_timestamps
        audio = decode_bounded(raw)
        spans = get_speech_timestamps(audio, sampling_rate=16000)
        if sum(span["end"] - span["start"] for span in spans) < 6400:
            raise VoiceFailure("empty")
        segments, _ = self.model.transcribe(audio, beam_size=1, language="en",
            condition_on_previous_text=False, vad_filter=True,
            vad_parameters={"min_silence_duration_ms": 250}, without_timestamps=True)
        text = " ".join(segment.text.strip() for segment in segments
                        if segment.no_speech_prob < 0.6).strip()
        if text.lower() in SILENCE or len(text) > 2000:
            raise VoiceFailure("empty")
        return {"text": text, "duration_ms": len(audio) * 1000 // 16000}

    def synthesize(self, text, voice):
        output = io.BytesIO()
        with wave.open(output, "wb") as wav:
            self.voices[voice].synthesize_wav(text, wav)
        return output.getvalue()


class LocalVoiceServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, runtime, token, read_seconds=READ_SECONDS):
        if address[0] != "127.0.0.1" or not token:
            raise ValueError("invalid local voice configuration")
        self.runtime, self.token = runtime, token
        self.read_seconds = read_seconds
        self.operation = threading.BoundedSemaphore(1)
        self.workers = threading.BoundedSemaphore(4)
        super().__init__(address, Handler)

    def process_request(self, request, client_address):
        # Bound threads before parsing headers, including idle/unauthenticated clients.
        if not self.workers.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.workers.release()
            raise

    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.workers.release()

    def handle_error(self, request, client_address):
        pass  # Never print request details, headers, audio or transcripts.


class Handler(BaseHTTPRequestHandler):
    server_version = "voice"
    sys_version = ""

    def setup(self):
        self.request.settimeout(self.server.read_seconds)
        super().setup()
        # Socket timeouts are inactivity-based; trickling headers need a wall-clock bound too.
        self.header_timer = threading.Timer(self.server.read_seconds, self._expire_headers)
        self.header_timer.daemon = True
        self.header_timer.start()

    def _expire_headers(self):
        try:
            self.request.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass

    def parse_request(self):
        try:
            return super().parse_request()
        finally:
            self.header_timer.cancel()

    def finish(self):
        self.header_timer.cancel()
        super().finish()

    def log_message(self, *_):
        pass

    def send_error(self, code, message=None, explain=None):
        self._send(code, {"error": "unavailable"})

    def _send(self, status, body, mime="application/json"):
        encoded = body if isinstance(body, bytes) else json.dumps(body).encode()
        try:
            self.send_response(status)
            self.send_header("Content-Type", mime)
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            self.wfile.write(encoded)
        except (OSError, ValueError):
            pass
        self.close_connection = True

    def _allowed(self):
        supplied = self.headers.get("X-Voice-Token", "").encode("utf-8")
        return "Origin" not in self.headers and secrets.compare_digest(
            supplied, self.server.token.encode("utf-8"))

    def _body(self, limit):
        raw_length = self.headers.get("Content-Length", "")
        if (self.headers.get("Transfer-Encoding") or not raw_length.isascii()
                or not raw_length.isdigit() or len(self.headers.get_all("Content-Length", [])) != 1):
            raise VoiceFailure("size")
        length = int(raw_length)
        if not 0 < length <= limit:
            raise VoiceFailure("size")
        chunks, received = [], 0
        deadline = time.monotonic() + self.server.read_seconds
        while received < length:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise VoiceFailure("unavailable")
            self.connection.settimeout(remaining)
            chunk = self.rfile.read1(min(65536, length - received))
            if not chunk:
                raise VoiceFailure("unavailable")
            chunks.append(chunk)
            received += len(chunk)
        return b"".join(chunks)

    def do_GET(self):
        if self.path != "/health" or not self._allowed():
            self._send(404, {"error": "unavailable"})
            return
        self._send(200, self.server.runtime.health())

    def do_POST(self):
        if self.path not in {"/stt", "/tts"} or not self._allowed():
            self._send(404, {"error": "unavailable"})
            return
        if not self.server.operation.acquire(blocking=False):
            self._send(429, {"error": "busy"})
            return
        try:
            if self.path == "/stt":
                mime = self.headers.get_content_type()
                if mime not in MIMES:
                    raise VoiceFailure("media")
                result = self.server.runtime.transcribe(self._body(MAX_BYTES), mime)
                self._send(200, result)
            else:
                if self.headers.get_content_type() != "application/json":
                    raise VoiceFailure("media")
                data = json.loads(self._body(8192))
                text, voice = data.get("text"), data.get("voice")
                if (not isinstance(text, str) or not text.strip() or len(text) > 600
                        or voice not in self.server.runtime.health()["voices"]):
                    raise VoiceFailure("unavailable")
                self._send(200, self.server.runtime.synthesize(text, voice), "audio/wav")
        except VoiceFailure as error:
            codes = {"empty": 422, "duration": 413, "size": 413, "media": 415}
            code = error.code if error.code in codes else "unavailable"
            self._send(codes.get(code, 503), {"error": code})
        except Exception:
            self._send(503, {"error": "unavailable"})
        finally:
            self.server.operation.release()


def main():
    token = os.environ.get("VOICE_LOCAL_TOKEN", "").strip()
    if not token:
        raise SystemExit("VOICE_LOCAL_TOKEN is required")
    try:
        runtime = LocalRuntime()
        port = int(os.environ.get("VOICE_SIDECAR_PORT", "8790"))
        server = LocalVoiceServer(("127.0.0.1", port), runtime, token)
    except Exception:
        raise SystemExit("Local voice setup unavailable; verify packages and models") from None
    print("Local voice ready on loopback (offline)", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
