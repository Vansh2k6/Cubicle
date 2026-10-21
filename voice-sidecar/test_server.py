import http.client
import importlib.util
import json
import pathlib
import threading
import unittest

spec = importlib.util.spec_from_file_location("voice_server", pathlib.Path(__file__).with_name("server.py"))
voice = importlib.util.module_from_spec(spec); spec.loader.exec_module(voice)

class Runtime:
    def health(self): return {"ok": True, "voices": ["en_US-lessac-medium"]}
    def transcribe(self, raw, mime):
        if raw == b"empty": raise voice.VoiceFailure("empty")
        return {"text": "safe", "duration_ms": 800}
    def synthesize(self, text, name): return b"RIFF"

class SidecarTests(unittest.TestCase):
    def setUp(self):
        self.server = voice.LocalVoiceServer(("127.0.0.1", 0), Runtime(), "token", read_seconds=.2)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True); self.thread.start()
    def tearDown(self): self.server.shutdown(); self.server.server_close(); self.thread.join()
    def request(self, method, path, body=b"", headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.server.server_address[1], timeout=1); c.request(method, path, body, headers or {}); r=c.getresponse(); data=r.read(); c.close(); return r.status, data
    def test_auth_and_origin_are_rejected(self):
        self.assertEqual(self.request("GET", "/health")[0], 404)
        self.assertEqual(self.request("GET", "/health", headers={"X-Voice-Token":"token", "Origin":"http://x"})[0], 404)
        self.assertEqual(self.request("GET", "/health", headers={"X-Voice-Token":"token"})[0], 200)
    def test_caps_media_and_silence_are_typed(self):
        h={"X-Voice-Token":"token", "Content-Type":"audio/wav"}
        self.assertEqual(self.request("POST", "/stt", b"empty", h)[0], 422)
        self.assertEqual(self.request("POST", "/stt", b"x", {**h,"Content-Type":"text/plain"})[0], 415)
        self.assertEqual(self.request("POST", "/stt", b"x"*(voice.MAX_BYTES+1), h)[0], 413)
    def test_no_request_text_echoes_in_errors(self):
        status, data=self.request("POST", "/tts", b'{"text":"secret","voice":"no"}', {"X-Voice-Token":"token","Content-Type":"application/json"})
        self.assertIn(status, (400,503)); self.assertNotIn(b"secret", data)



    def test_busy_rejection_never_releases_another_operation(self):
        self.server.operation.acquire()
        try:
            headers = {"X-Voice-Token": "token", "Content-Type": "audio/wav"}
            self.assertEqual(self.request("POST", "/stt", b"x", headers)[0], 429)
            self.assertEqual(self.request("POST", "/stt", b"x", headers)[0], 429)
            self.assertFalse(self.server.operation.acquire(blocking=False))
        finally:
            self.server.operation.release()

    def test_upload_deadline_releases_operation(self):
        import socket
        connection = socket.create_connection(self.server.server_address, timeout=1)
        connection.sendall(b"POST /stt HTTP/1.0\r\nX-Voice-Token: token\r\nContent-Type: audio/wav\r\nContent-Length: 4\r\n\r\nx")
        self.assertIn(b"503", connection.recv(4096))
        connection.close()
        headers = {"X-Voice-Token": "token", "Content-Type": "audio/wav"}
        self.assertEqual(self.request("POST", "/stt", b"safe", headers)[0], 200)

    def test_runtime_failure_is_generic_and_audio_is_not_written(self):
        from unittest.mock import patch
        class Broken(Runtime):
            def transcribe(self, raw, mime):
                raise RuntimeError("private-audio-and-key")
        self.server.runtime = Broken()
        headers = {"X-Voice-Token": "token", "Content-Type": "audio/wav"}
        with patch("builtins.open", side_effect=AssertionError("no disk")):
            status, body = self.request("POST", "/stt", b"private-audio-and-key", headers)
        self.assertEqual(status, 503)
        self.assertNotIn(b"private", body)

    def test_decoded_duration_bound_and_resampling(self):
        try:
            import av
        except ImportError:
            self.skipTest("optional audio dependencies absent")
        import io, wave
        def clip(samples, rate):
            output = io.BytesIO()
            with wave.open(output, "wb") as wav:
                wav.setparams((1, 2, rate, 0, "NONE", "not compressed"))
                wav.writeframes(b"\x00\x00" * samples)
            return output.getvalue()
        audio = voice.decode_bounded(clip(48000, 48000))
        self.assertEqual(len(audio), 16000)
        with self.assertRaises(voice.VoiceFailure) as failure:
            voice.decode_bounded(clip(31 * 16000, 16000))
        self.assertEqual(failure.exception.code, "duration")
        with self.assertRaises(voice.VoiceFailure):
            voice.decode_bounded(clip(1600, 16000))


    def test_absolute_header_deadline_releases_workers_despite_trickle(self):
        import socket, time
        sockets = [socket.create_connection(self.server.server_address, timeout=1) for _ in range(4)]
        try:
            for connection in sockets:
                connection.sendall(b"GET /health HTTP/1.0\r\nX-Trickle: ")
            # Activity arrives inside the inactivity window, but must not extend the header deadline.
            for _ in range(4):
                time.sleep(.07)
                for connection in sockets:
                    try:
                        connection.sendall(b"a")
                    except OSError:
                        pass
            headers = {"X-Voice-Token": "token"}
            self.assertEqual(self.request("GET", "/health", headers=headers)[0], 200)
            for connection in sockets:
                try:
                    self.assertEqual(connection.recv(4096), b"")
                except (ConnectionAbortedError, ConnectionResetError):
                    pass  # Windows may report an actively closed expired socket as an abort.
        finally:
            for connection in sockets:
                connection.close()


    def test_device_selection_is_opt_in_and_invalid_values_do_not_echo(self):
        self.assertEqual(voice.stt_settings({}), ("cpu", "int8"))
        self.assertEqual(voice.stt_settings({"VOICE_STT_DEVICE": "cuda"}), ("cuda", "float16"))
        self.assertEqual(voice.cuda_libraries("cpu"), [])
        with self.assertRaises(ValueError) as failure:
            voice.stt_settings({"VOICE_STT_DEVICE": "private-invalid-setting"})
        self.assertNotIn("private-invalid-setting", str(failure.exception))
