export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
export const MAX_AUDIO_MS = 30000;
export const MIN_SPEECH_MS = 400;
export const MAX_TEXT = 2000;
export const ALLOWED_MIME = new Set(["audio/webm", "audio/ogg", "audio/mp4", "audio/wav"]);

export class VoiceRateLimiter {
  constructor({ limit = 12, windowMs = 60000, now = Date.now } = {}) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.now = now;
    this.calls = new Map();
    this.leases = new Set();
  }

  acquire(id) {
    const now = this.now();
    for (const [key, values] of this.calls) {
      const fresh = values.filter((time) => now - time < this.windowMs);
      if (fresh.length) this.calls.set(key, fresh);
      else this.calls.delete(key);
    }
    if (this.leases.has(id)) return "busy";
    const values = this.calls.get(id) || [];
    if (values.length >= this.limit) return "rate";
    values.push(now);
    this.calls.set(id, values);
    this.leases.add(id);
    return "ok";
  }

  release(id) { this.leases.delete(id); }
}
