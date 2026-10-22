export function createFakeVoiceProvider({ text = "Please let me explain the delay.", durationMs = 800, voices = null } = {}) {
  return Object.freeze({ name: "fake", async health() { return voices; }, async transcribe() { return { text, duration_ms: durationMs, provider: "fake" }; }, async synthesize() { return { audio: Buffer.from("RIFF"), mime: "audio/wav", provider: "fake" }; } });
}
