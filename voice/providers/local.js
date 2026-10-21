import { MAX_AUDIO_BYTES } from "../limits.js";
import { VoiceError, validateTranscript } from "../provider.js";

export async function readBounded(response, limit) {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isSafeInteger(declared) && declared > limit) {
    response.body?.cancel().catch(() => {});
    throw new VoiceError();
  }
  const reader = response.body?.getReader();
  if (!reader) throw new VoiceError();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new VoiceError();
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally {
    reader.cancel().catch(() => {});
  }
}

export function createLocalVoiceProvider({ url, token, fetchFn = globalThis.fetch } = {}) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new VoiceError(); }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || parsed.username ||
      parsed.password || parsed.search || parsed.hash || parsed.pathname !== "/" || !token) {
    throw new VoiceError();
  }

  async function request(path, { body, mime, signal }, limit) {
    try {
      const response = await fetchFn(parsed.origin + path, {
        method: "POST", redirect: "error", signal,
        headers: { "content-type": mime, "x-voice-token": token }, body,
      });
      if (!response.ok) {
        response.body?.cancel().catch(() => {});
        if (path === "/stt" && response.status === 422) throw new VoiceError("stt_empty");
        throw new VoiceError();
      }
      return { bytes: await readBounded(response, limit), mime: response.headers.get("content-type") };
    } catch (error) {
      if (error instanceof VoiceError) throw error;
      throw new VoiceError();
    }
  }

  return Object.freeze({
    name: "local",
    async transcribe({ audio, mime, signal }) {
      if (!Buffer.isBuffer(audio) || !audio.length || audio.length > MAX_AUDIO_BYTES) throw new VoiceError();
      const result = await request("/stt", { body: audio, mime, signal }, 16384);
      let data;
      try { data = JSON.parse(result.bytes.toString("utf8")); } catch { throw new VoiceError(); }
      return validateTranscript(data);
    },
    async synthesize({ text, voice, signal }) {
      if (typeof text !== "string" || !text.trim() || text.length > 600 || typeof voice !== "string") {
        throw new VoiceError("tts_unavailable");
      }
      try {
        const result = await request("/tts", {
          body: JSON.stringify({ text, voice }), mime: "application/json", signal,
        }, MAX_AUDIO_BYTES);
        if (result.mime !== "audio/wav" || !result.bytes.length) throw new VoiceError();
        return { audio: result.bytes, mime: "audio/wav", provider: "local" };
      } catch { throw new VoiceError("tts_unavailable"); }
    },
  });
}
