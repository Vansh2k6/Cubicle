import { ALLOWED_MIME, MAX_AUDIO_BYTES, VoiceRateLimiter } from "./limits.js";
import { runTranscription, VoiceError } from "./provider.js";

function allowedOrigin(origin) {
  if (origin === undefined) return true; // CLI clients use the existing opaque session capability.
  try {
    const url = new URL(origin);
    return url.origin === origin && url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname);
  } catch { return false; }
}

function drainRejectedUpload(req, res, timeoutMs) {
  // Closing while a client is still sending can reset its socket before it reads the error.
  // Discard only a bounded amount, without allocating a second audio buffer.
  let bytes = 0;
  const socket = req.socket;
  const cleanup = () => {
    clearTimeout(timer);
    req.off("data", discard); req.off("end", end); socket.off("close", cleanup);
  };
  const end = () => { cleanup(); socket.end(); };
  const discard = (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_AUDIO_BYTES + 65536) { cleanup(); socket.destroy(); }
  };
  const timer = setTimeout(() => { cleanup(); socket.destroy(); }, timeoutMs);
  timer.unref();
  socket.once("close", cleanup);
  req.on("error", () => {});
  req.on("data", discard); req.once("end", end);
  // Keep the connection open until the already-started upload completes or hits the drain cap.
  res.shouldKeepAlive = true;
  req.resume();
}

function readAudio(req, signal, uploadTimeoutMs) {
  return new Promise((resolve, reject) => {
    let bytes = 0, finished = false;
    const chunks = [];
    const cleanup = () => {
      clearTimeout(timer);
      req.off("data", data); req.off("end", end); req.off("error", error);
      req.off("aborted", error); signal.removeEventListener("abort", error);
    };
    const finish = (failure, value) => {
      if (finished) return;
      finished = true; cleanup();
      if (failure) { req.pause(); reject(failure); }
      else resolve(value);
    };
    const data = (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_AUDIO_BYTES) finish(new VoiceError("audio_too_large"));
      else chunks.push(chunk);
    };
    const end = () => finish(null, Buffer.concat(chunks));
    const error = () => finish(new VoiceError());
    const timer = setTimeout(error, uploadTimeoutMs);
    req.on("data", data); req.on("end", end); req.on("error", error); req.on("aborted", error);
    signal.addEventListener("abort", error, { once: true });
    if (signal.aborted) error();
  });
}

export function createSttHandler({ config, providers, getSession, uploadTimeoutMs = 8000, health = null }) {
  const limiter = new VoiceRateLimiter();
  return async (req, res, path) => {
    if (path === "/voice/status") {
      if (req.method !== "GET") return false;
      const origin = req.headers.origin;
      if (!allowedOrigin(origin)) {
        res.writeHead(403, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify({ error: "voice_unavailable" }));
        return true;
      }
      const ready = health ? await health.check() : { stt: !!config.enabled && config.sttChain.length > 0, tts: false };
      const chain = config.ttsChain || [];
      const body = JSON.stringify({ enabled: !!config.enabled, stt: ready.stt,
        tts_mode: config.enabled && chain[0] === "local" && ready.tts ? "server" : config.enabled && chain.includes("browser") ? "browser" : "none" });
      const headers = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store",
        "content-length": Buffer.byteLength(body) };
      if (origin) { headers["access-control-allow-origin"] = origin; headers.vary = "Origin"; }
      res.writeHead(200, headers); res.end(body);
      return true;
    }
    const match = /^\/sessions\/([^/]+)\/voice\/stt$/.exec(path);
    if (!match || !["POST", "OPTIONS"].includes(req.method)) return false;
    const origin = req.headers.origin;
    const send = (status, errorOrResult) => {
      if (res.destroyed || res.writableEnded) return;
      const body = JSON.stringify(errorOrResult);
      const headers = { "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store", "content-length": Buffer.byteLength(body) };
      if (!req.complete) drainRejectedUpload(req, res, uploadTimeoutMs);
      else headers.connection = "close";
      if (allowedOrigin(origin) && origin) {
        headers["access-control-allow-origin"] = origin;
        headers.vary = "Origin";
      }
      res.writeHead(status, headers);
      res.end(body);
    };
    if (!config.enabled) { send(404, { error: "voice_disabled" }); return true; }
    if (!allowedOrigin(origin)) { send(403, { error: "voice_unavailable" }); return true; }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
        "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type",
      });
      res.end(); return true;
    }
    let id;
    try { id = decodeURIComponent(match[1]); } catch { send(400, { error: "invalid request path" }); return true; }
    const session = getSession(id);
    if (!session) { send(404, { error: "unknown session" }); return true; }
    if (session.ended) { send(409, { error: "session ended" }); return true; }
    const mime = String(req.headers["content-type"] || "").split(";", 1)[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) { send(415, { error: "unsupported_media" }); return true; }
    const length = Number(req.headers["content-length"]);
    if (Number.isFinite(length) && length > MAX_AUDIO_BYTES) {
      send(413, { error: "audio_too_large" }); return true;
    }
    const lease = limiter.acquire(id);
    if (lease !== "ok") {
      send(lease === "busy" ? 409 : 429, { error: lease === "busy" ? "stt_busy" : "rate_limited" });
      return true;
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    res.on("close", abort);
    let attempted = false;
    try {
      const audio = await readAudio(req, controller.signal, uploadTimeoutMs);
      if (!audio.length) throw new VoiceError("stt_empty");
      if (getSession(id) !== session || session.ended) { send(409, { error: "session ended" }); return true; }
      if (health && !(await health.check()).stt) throw new VoiceError();
      attempted = true;
      const result = await runTranscription(providers, { audio, mime, signal: controller.signal },
        { timeoutMs: config.sttTimeoutMs });
      if (getSession(id) !== session || session.ended) { send(409, { error: "session ended" }); return true; }
      send(200, result);
    } catch (error) {
      if (error instanceof VoiceError && error.code === "audio_too_large") send(413, { error: "audio_too_large" });
      else if (error instanceof VoiceError && error.code === "stt_empty") send(422, { error: "stt_empty" });
      else { if (attempted && !controller.signal.aborted) health?.unavailable(); send(503, { error: "stt_unavailable" }); }
    } finally {
      res.off("close", abort);
      controller.abort();
      limiter.release(id);
    }
    return true;
  };
}
