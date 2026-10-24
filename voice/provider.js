import { MAX_AUDIO_MS, MAX_TEXT, MIN_SPEECH_MS } from "./limits.js";

export class VoiceError extends Error {
  constructor(code = "stt_unavailable") {
    super(code);
    this.code = code;
  }
}

const SILENCE = new Set(["", "you", "you.", "thank you", "thank you.", "."]);
export function validateTranscript(result, provider = "local") {
  const text = typeof result?.text === "string" ? result.text.trim() : "";
  if (!Number.isSafeInteger(result?.duration_ms) || result.duration_ms > MAX_AUDIO_MS || result.duration_ms < 0) {
    throw new VoiceError("stt_unavailable");
  }
  if (result.duration_ms < MIN_SPEECH_MS || text.length > MAX_TEXT || SILENCE.has(text.toLowerCase())) {
    throw new VoiceError("stt_empty");
  }
  return { text, duration_ms: result.duration_ms, provider: provider === "fake" ? "fake" : "local" };
}

export async function runTranscription(chain, input, { timeoutMs = 8000 } = {}) {
  for (const provider of chain) {
    if (input.signal?.aborted) throw new VoiceError();
    const controller = new AbortController();
    let timer, abort;
    try {
      const deadline = new Promise((_, reject) => {
        abort = () => { controller.abort(); reject(new VoiceError()); };
        input.signal?.addEventListener("abort", abort, { once: true });
        timer = setTimeout(abort, timeoutMs);
      });
      const result = await Promise.race([
        Promise.resolve().then(() => provider.transcribe({ ...input, signal: controller.signal })),
        deadline,
      ]);
      return validateTranscript(result, provider.name);
    } catch (error) {
      if (input.signal?.aborted) throw new VoiceError();
      if (error instanceof VoiceError && error.code === "stt_empty") throw new VoiceError("stt_empty");
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      controller.abort();
    }
  }
  throw new VoiceError();
}
