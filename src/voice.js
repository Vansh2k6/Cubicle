const MAX_DURATION_MS = 30000;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MIME_TYPES = ["audio/webm;codecs=opus", "audio/ogg;codecs=opus", "audio/mp4", "audio/wav"];
export { createSpeechPlayback } from "./speech.js";

export function chooseRecordingMime(MediaRecorderCtor) {
  if (!MediaRecorderCtor || typeof MediaRecorderCtor.isTypeSupported !== "function") return "";
  return MIME_TYPES.find((mime) => MediaRecorderCtor.isTypeSupported(mime)) || "";
}

export function voiceErrorMessage(code) {
  if (code === "unsupported") return "Voice input is unavailable here — type your reply instead.";
  if (code === "insecure") return "Voice input needs a secure connection — type your reply instead.";
  if (code === "denied") return "Microphone access was denied — type your reply instead.";
  if (code === "voice_too_long") return "Transcript is too long — shorten it or type your reply.";
  if (["stt_unavailable", "voice_unavailable", "voice_timeout"].includes(code)) return "Speech service unavailable — type your reply or try again.";
  return "Didn't catch that — try again or type.";
}

// Browser-only work stays inside this factory so importing it has no side effects.
export function createVoiceController({ transcribe, storage, navigatorRef, windowRef, documentRef, clock, onMicStart, onVoiceChange } = {}) {
  const win = windowRef || (typeof window === "undefined" ? null : window);
  const nav = navigatorRef || (typeof navigator === "undefined" ? null : navigator);
  const doc = documentRef || (typeof document === "undefined" ? null : document);
  const store = storage || (() => { try { return win && win.localStorage; } catch { return null; } })();
  const timers = clock || {
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    setInterval: (...args) => setInterval(...args),
    clearInterval: (...args) => clearInterval(...args),
    now: () => Date.now(),
  };
  let enabled = false;
  try { enabled = store && store.getItem("cubicle-voice-enabled") === "true"; } catch {}
  let mounted = null;
  let token = 0;
  let recorder = null;
  let stream = null;
  let chunks = null;
  let timer = null;
  let countdown = null;
  let aborter = null;
  let audioContext = null;
  let audioUnlocked = false;
  let waitingForPermission = false;

  const stopTracks = () => {
    if (stream && stream.getTracks) stream.getTracks().forEach((track) => track.stop());
    stream = null;
  };
  const clearRecording = () => {
    timers.clearTimeout(timer); timer = null;
    timers.clearInterval(countdown); countdown = null;
    if (recorder) { recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null; }
    recorder = null; chunks = null;
    stopTracks();
  };
  const setStatus = (message) => { if (mounted && mounted.status) mounted.status.textContent = message || ""; };
  const setRecording = (recording) => {
    if (!mounted) return;
    mounted.mic.setAttribute("aria-pressed", recording ? "true" : "false");
    mounted.mic.classList.toggle("is-recording", recording);
    mounted.mic.disabled = !enabled || !mounted.current();
  };
  const cancel = () => {
    token += 1;
    waitingForPermission = false;
    if (aborter) aborter.abort();
    aborter = null;
    if (recorder && recorder.state !== "inactive") { try { recorder.stop(); } catch {} }
    clearRecording();
    setRecording(false);
  };
  const finish = async (op, mime, localChunks) => {
    if (op !== token || !mounted) return;
    const blob = new Blob(localChunks, { type: mime });
    localChunks.length = 0;
    clearRecording();
    setRecording(false);
    if (!blob.size || blob.size > MAX_AUDIO_BYTES || !mounted.current()) { setStatus(voiceErrorMessage()); return; }
    setStatus("Transcribing…");
    aborter = new AbortController();
    try {
      const result = await transcribe(mounted.sessionId, blob, { signal: aborter.signal, timeoutMs: 18000 });
      if (op !== token || !mounted || !mounted.current()) return;
      const input = mounted.input;
      if (!result.text || !input || !input.isConnected || input.value !== mounted.initialValue || mounted.version() !== mounted.initialVersion) {
        setStatus(result.text ? "Transcript discarded because the reply changed." : voiceErrorMessage());
        return;
      }
      input.value = result.text;
      input.focus({ preventScroll: true });
      input.setSelectionRange(input.value.length, input.value.length);
      setStatus("Transcript ready. Check it, then send.");
    } catch (error) {
      if (op === token && error && error.code !== "voice_cancelled") setStatus(voiceErrorMessage(error.code));
    } finally {
      if (op === token) aborter = null;
    }
  };
  const stop = () => {
    if (waitingForPermission) { cancel(); return; }
    if (!recorder || recorder.state === "inactive") return;
    timers.clearTimeout(timer); timer = null;
    recorder.stop();
    setStatus("Listening…");
  };
  const start = async () => {
    if (!mounted || !enabled || !mounted.current() || recorder || waitingForPermission || aborter) return;
    const MediaRecorderCtor = win && win.MediaRecorder;
    if (!win || !win.isSecureContext) { setStatus(voiceErrorMessage("insecure")); return; }
    if (!nav || !nav.mediaDevices || !nav.mediaDevices.getUserMedia || !MediaRecorderCtor) { setStatus(voiceErrorMessage("unsupported")); return; }
    const mime = chooseRecordingMime(MediaRecorderCtor);
    if (!mime) { setStatus(voiceErrorMessage("unsupported")); return; }
    const op = ++token;
    onMicStart?.();
    mounted.initialValue = mounted.input.value;
    mounted.initialVersion = mounted.version();
    waitingForPermission = true;
    setStatus("Waiting for microphone permission…");
    setRecording(true);
    try {
      const acquired = await nav.mediaDevices.getUserMedia({ audio: true });
      if (op !== token || !mounted || !mounted.current()) { acquired.getTracks().forEach((track) => track.stop()); return; }
      waitingForPermission = false;
      stream = acquired;
      chunks = [];
      let bytes = 0;
      let overLimit = false;
      recorder = new MediaRecorderCtor(stream, { mimeType: mime });
      recorder.ondataavailable = (event) => {
        if (op !== token || !event.data || !event.data.size) return;
        bytes += event.data.size;
        if (bytes > MAX_AUDIO_BYTES) {
          overLimit = true;
          setStatus("Recording limit reached — type your reply instead.");
          timers.clearTimeout(timer); timer = null;
          recorder.stop();
          return;
        }
        chunks.push(event.data);
      };
      recorder.onerror = () => { if (op === token) { cancel(); setStatus(voiceErrorMessage()); } };
      recorder.onstop = () => {
        if (overLimit) { clearRecording(); setRecording(false); return; }
        finish(op, mime, chunks || []);
      };
      recorder.start();
      const deadline = timers.now() + MAX_DURATION_MS;
      const showCountdown = () => setStatus(`Recording… ${Math.max(0, Math.ceil((deadline - timers.now()) / 1000))} seconds remaining`);
      showCountdown();
      countdown = timers.setInterval(showCountdown, 1000);
      timer = timers.setTimeout(() => { if (op === token) { setStatus("Recording limit reached."); stop(); } }, MAX_DURATION_MS);
    } catch (error) {
      if (op !== token) return;
      waitingForPermission = false;
      clearRecording(); setRecording(false);
      setStatus(voiceErrorMessage(error && error.name === "NotAllowedError" ? "denied" : "unsupported"));
    }
  };
  const toggle = () => {
    enabled = !enabled;
    try { if (store) store.setItem("cubicle-voice-enabled", String(enabled)); } catch {}
    if (enabled && win && win.AudioContext) {
      try { audioContext = audioContext || new win.AudioContext(); Promise.resolve(audioContext.resume()).then(() => { audioUnlocked = true; }).catch(() => {}); } catch {}
    }
    if (!enabled) cancel();
    onVoiceChange?.(enabled);
    if (mounted) { mounted.toggle.setAttribute("aria-pressed", String(enabled)); mounted.toggle.textContent = enabled ? "Voice on" : "Voice off"; setRecording(false); setStatus(enabled ? "Hold the microphone to speak." : ""); }
  };
  const mount = ({ toggle: toggleButton, mic, status, input, sessionId, current }) => {
    cancel();
    let version = 0;
    const initialValue = input.value;
    const onInput = () => { version += 1; };
    const onDown = (event) => { event.preventDefault(); if (mic.setPointerCapture && event.pointerId != null) mic.setPointerCapture(event.pointerId); start(); };
    const onUp = () => { if (waitingForPermission || recorder) stop(); };
    const onCancel = () => cancel();
    const onKey = (event) => {
      if ((event.key === " " || event.key === "Enter") && !event.repeat) { event.preventDefault(); recorder || waitingForPermission ? stop() : start(); }
    };
    const onShortcut = (event) => {
      if (event.ctrlKey && event.shiftKey && event.code === "Space" && event.target === input) { event.preventDefault(); recorder || waitingForPermission ? stop() : start(); }
    };
    const onBlur = () => cancel();
    const onVisibility = () => { if (doc && doc.visibilityState === "hidden") cancel(); };
    mounted = { toggle: toggleButton, mic, status, input, sessionId, current, initialValue, initialVersion: version, version: () => version };
    toggleButton.setAttribute("aria-pressed", String(enabled)); toggleButton.textContent = enabled ? "Voice on" : "Voice off";
    toggleButton.addEventListener("click", toggle);
    mic.addEventListener("pointerdown", onDown); mic.addEventListener("pointerup", onUp); mic.addEventListener("pointercancel", onCancel);
    mic.addEventListener("keydown", onKey); input.addEventListener("keydown", onShortcut); input.addEventListener("input", onInput);
    if (win) win.addEventListener("blur", onBlur);
    if (doc) { doc.addEventListener("visibilitychange", onVisibility); doc.addEventListener("pointerup", onUp); doc.addEventListener("pointercancel", onCancel); }
    setRecording(false);
    return () => {
      toggleButton.removeEventListener("click", toggle); mic.removeEventListener("pointerdown", onDown); mic.removeEventListener("pointerup", onUp); mic.removeEventListener("pointercancel", onCancel); mic.removeEventListener("keydown", onKey); input.removeEventListener("keydown", onShortcut); input.removeEventListener("input", onInput);
      if (win) win.removeEventListener("blur", onBlur);
      if (doc) { doc.removeEventListener("visibilitychange", onVisibility); doc.removeEventListener("pointerup", onUp); doc.removeEventListener("pointercancel", onCancel); }
      cancel(); mounted = null;
    };
  };
  return { mount, cancel, isEnabled: () => enabled, isAudioUnlocked: () => audioUnlocked };
}
