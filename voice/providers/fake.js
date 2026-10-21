export function createFakeVoiceProvider({ text = "Please let me explain the delay.", durationMs = 800 } = {}) {
  return Object.freeze({ name: "fake", async transcribe() { return { text, duration_ms: durationMs, provider: "fake" }; }, async synthesize() { return { audio: Buffer.from("RIFF"), mime: "audio/wav", provider: "fake" }; } });
}
