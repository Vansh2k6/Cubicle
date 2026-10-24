const DEFAULTS = Object.freeze({
  enabled: false, sttChain: Object.freeze(["local"]), ttsChain: Object.freeze(["local", "browser"]),
  localUrl: "http://127.0.0.1:8790", localToken: "", sttTimeoutMs: 8000, ttsTimeoutMs: 6000,
  voiceMap: Object.freeze({ maya: "en_US-lessac-medium", jordan: "en_US-ryan-medium", sam: "en_US-amy-medium", alex_coach: "en_GB-alan-medium" }),
});

export class VoiceConfigError extends Error {
  constructor() { super("invalid voice configuration"); this.code = "VOICE_CONFIG"; }
}

function positive(value, fallback) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 && n <= 30000 ? n : fallback;
}

function chain(value, fallback, kind) {
  const names = String(value || fallback.join(",")).split(",").map((part) => part.trim());
  if (!names.length || new Set(names).size !== names.length ||
      names.some((name) => name !== "local" && !(kind === "tts" && name === "browser"))) {
    throw new VoiceConfigError();
  }
  return Object.freeze(names);
}

function localUrl(value) {
  let url;
  try { url = new URL(value || DEFAULTS.localUrl); } catch { throw new VoiceConfigError(); }
  if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !/^\d+$/.test(url.port) ||
      url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new VoiceConfigError();
  }
  return url.origin;
}

function voiceMap(value) {
  if (!value) return DEFAULTS.voiceMap;
  let parsed;
  try { parsed = JSON.parse(value); } catch { throw new VoiceConfigError(); }
  const keys = ["maya", "jordan", "sam", "alex_coach"];
  const known = new Set(Object.values(DEFAULTS.voiceMap));
  if (!parsed || typeof parsed !== "object" || Object.keys(parsed).length !== keys.length ||
      keys.some((key) => typeof parsed[key] !== "string" || !known.has(parsed[key])) ||
      new Set(Object.values(parsed)).size !== keys.length) throw new VoiceConfigError();
  return Object.freeze(Object.fromEntries(keys.map((key) => [key, parsed[key]])));
}

export function loadVoiceConfig(env = process.env) {
  const config = {
    enabled: env.VOICE_ENABLED === "1",
    sttChain: chain(env.VOICE_STT_CHAIN, DEFAULTS.sttChain, "stt"),
    ttsChain: chain(env.VOICE_TTS_CHAIN, DEFAULTS.ttsChain, "tts"),
    localUrl: localUrl(env.VOICE_LOCAL_URL),
    localToken: typeof env.VOICE_LOCAL_TOKEN === "string" ? env.VOICE_LOCAL_TOKEN.trim() : "",
    sttTimeoutMs: positive(env.VOICE_STT_TIMEOUT_MS, DEFAULTS.sttTimeoutMs),
    ttsTimeoutMs: positive(env.VOICE_TTS_TIMEOUT_MS, DEFAULTS.ttsTimeoutMs),
    voiceMap: voiceMap(env.VOICE_MAP_JSON),
  };
  if (config.enabled && !config.localToken) throw new VoiceConfigError();
  return Object.freeze(config);
}
export { DEFAULTS };
