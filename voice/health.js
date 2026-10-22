// One bounded probe shared by status, STT and TTS; no background polling.
export function createVoiceHealth({ config, provider, now = Date.now, timeoutMs = 500, retryMs = 1000, healthyMs = 5000 } = {}) {
  let snapshot = { stt: false, tts: false }, pending = null, controller = null, next = 0, failures = 0, closed = false;
  const unavailable = () => {
    snapshot = { stt: false, tts: false };
    next = now() + Math.min(30000, retryMs * 2 ** Math.min(failures++, 5));
    return snapshot;
  };
  const check = () => {
    if (closed || !config.enabled) return Promise.resolve({ stt: false, tts: false });
    if (!provider?.health) return Promise.resolve({ stt: !!provider?.transcribe, tts: !!provider?.synthesize });
    if (pending) return pending;
    if (now() < next) return Promise.resolve(snapshot);
    controller = new AbortController();
    const own = controller;
    let timer, abort;
    const deadline = new Promise((resolve) => {
      abort = () => resolve(null);
      own.signal.addEventListener("abort", abort, { once: true });
      timer = setTimeout(() => own.abort(), timeoutMs);
    });
    pending = Promise.race([Promise.resolve().then(() => provider.health({ signal: own.signal })).catch(() => null), deadline])
      .then((voices) => {
        if (closed || !Array.isArray(voices)) return unavailable();
        failures = 0; next = now() + healthyMs;
        snapshot = { stt: typeof provider.transcribe === "function", tts: typeof provider.synthesize === "function" && Object.values(config.voiceMap || {}).every((voice) => voices.includes(voice)) };
        return snapshot;
      }).finally(() => { clearTimeout(timer); own.signal.removeEventListener("abort", abort); own.abort(); pending = null; if (controller === own) controller = null; });
    return pending;
  };
  return { check, unavailable, close() { closed = true; controller?.abort(); } };
}
