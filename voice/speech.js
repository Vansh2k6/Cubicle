import { createHash } from "node:crypto";
import { MAX_AUDIO_BYTES } from "./limits.js";

const none = Object.freeze({ available: false, turn_id: "", mode: "none" });
const descriptor = (id, mode) => ({ available: mode !== "none", turn_id: String(id), mode });
function bounded(work, ms, controller) {
  let timer, abort;
  const stopped = new Promise((_, reject) => {
    abort = () => reject(new Error("unavailable"));
    controller.signal.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => controller.abort(), ms);
    if (controller.signal.aborted) abort();
  });
  return Promise.race([work, stopped]).finally(() => {
    clearTimeout(timer); controller.signal.removeEventListener("abort", abort);
  });
}

export function createSpeechService({ config, providers = [], log = () => {}, localReady = Promise.resolve(true), ended = false, onFailure = () => {}, resolveVoice = null } = {}) {
  const sessions = new Map();
  const provider = providers.find((candidate) => typeof candidate?.synthesize === "function");
  const chain = config.ttsChain || [];
  let localAllowed = true;
  const fallback = (id) => descriptor(id, chain.includes("browser") ? "browser" : "none");
  const clear = (id) => {
    const entries = sessions.get(id);
    sessions.delete(id);
    if (entries) for (const entry of entries.values()) entry.controller.abort();
  };
  const touch = (entries, id, entry) => {
    entries.delete(id); entries.set(id, entry);
    while (entries.size > 8) {
      const [key, old] = entries.entries().next().value;
      entries.delete(key); old.controller.abort();
    }
  };
  const eligible = (session) => ended ? session.ended : !session.ended;
  const prefetch = (session, turn) => {
    if (!config.enabled || !eligible(session) || !turn || turn.speaker !== "npc") return none;
    const voice = ended ? (turn.npcId === "alex_coach" ? config.voiceMap?.alex_coach : null)
      : resolveVoice ? resolveVoice(session, turn) : (!session.identity && !session.engine_policy && ["maya", "jordan", "sam"].includes(turn.npcId) ? config.voiceMap?.[turn.npcId] : null);
    if (!voice) return none;
    const id = String(turn.id);
    let entries = sessions.get(session.id);
    if (!entries) sessions.set(session.id, entries = new Map());
    const existing = entries.get(id);
    if (existing) { touch(entries, id, existing); return existing.descriptor; }
    const controller = new AbortController();
    const entry = { controller, descriptor: !localAllowed || chain[0] !== "local" || !provider ? fallback(id) : descriptor(id, "server"), audio: null,
      allowed: () => eligible(session) && (ended || !resolveVoice || resolveVoice(session, turn) === voice) };
    touch(entries, id, entry);
    const started = Date.now();
    let attempted = false;
    const current = () => entry.allowed() && !controller.signal.aborted && sessions.get(session.id)?.get(id) === entry;
    const record = (outcome) => {
      try { log({ event: "tts", session_hash: createHash("sha256").update(session.id).digest("hex").slice(0, 12), turn_id: id,
        provider: "local", bytes: entry.audio?.length || 0, latency_ms: Date.now() - started, outcome }); } catch { /* diagnostics never affect speech */ }
    };
    if (entry.descriptor.mode !== "server") { entry.promise = Promise.resolve(); return entry.descriptor; }
    entry.promise = bounded(new Promise(setImmediate).then(async () => {
      if (!await (typeof localReady === "function" ? localReady() : localReady) || !localAllowed || !current()) throw new Error("unavailable");
      attempted = true;
      return bounded(Promise.resolve().then(() => provider.synthesize({ text: turn.text, voice, signal: controller.signal })), config.ttsTimeoutMs || 6000, controller);
    }), (config.ttsTimeoutMs || 6000) + 500, controller)
      .then((result) => {
        if (!current() || !Buffer.isBuffer(result?.audio) || !result.audio.length || result.audio.length > MAX_AUDIO_BYTES || result.mime !== "audio/wav") throw new Error("unavailable");
        entry.audio = result.audio; record("ok");
      }).catch(() => { try { if (attempted && sessions.get(session.id)?.get(id) === entry && eligible(session)) onFailure(); } catch {} if (sessions.get(session.id)?.get(id) === entry) entry.descriptor = fallback(id); record("unavailable"); });
    return entry.descriptor;
  };
  const audio = async (session, id) => {
    id = String(id);
    const entries = sessions.get(session.id), entry = entries?.get(id);
    if (!entry || !entry.allowed()) return null;
    touch(entries, id, entry);
    await entry.promise;
    if (!entry.allowed() || sessions.get(session.id)?.get(id) !== entry) return null;
    return entry.audio ? { audio: entry.audio, mime: "audio/wav" } : { speech: entry.descriptor };
  };
  return Object.freeze({ prefetch, audio, clear, disableLocal: () => { localAllowed = false; } });
}
