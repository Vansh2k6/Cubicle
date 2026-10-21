import { pathToFileURL } from "node:url";
import { loadVoiceConfig } from "../voice/config.js";
import { readBounded } from "../voice/providers/local.js";
import { validateTranscript } from "../voice/provider.js";

const config = loadVoiceConfig({ ...process.env, VOICE_ENABLED: "0" });
export const headers = config.localToken ? { "x-voice-token": config.localToken } : null;
const line = "Please let me explain the delay and agree on a practical plan for today.";
export async function request(path, options = {}) {
  if (!headers) throw new Error("local setup unavailable");
  const start = performance.now();
  const response = await fetch(config.localUrl + path, {
    ...options, redirect: "error", signal: AbortSignal.timeout(8000),
    headers: { ...headers, ...options.headers },
  });
  if (!response.ok) {
    response.body?.cancel().catch(() => {});
    throw new Error("local request failed");
  }
  return { response, ttfbMs: performance.now() - start, startedAt: start };
}
export async function health() {
  const { response } = await request("/health");
  const info = JSON.parse((await readBounded(response, 4096)).toString("utf8"));
  if (info.ok !== true || info.warm !== true || !info.voices?.includes("en_US-lessac-medium")) {
    throw new Error("local setup unavailable");
  }
  if (info.stt_model !== "small.en" || info.tts_engine !== "piper" ||
      !["cpu", "cuda"].includes(info.device) || !["int8", "float16"].includes(info.compute_type)) {
    throw new Error("invalid local model metadata");
  }
  return { stt_model: info.stt_model, tts_engine: info.tts_engine, device: info.device,
    compute_type: info.compute_type, warm: true };
}
export async function makeClip() {
  const out = await request("/tts", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text: line, voice: "en_US-lessac-medium" }),
  });
  if (out.response.headers.get("content-type") !== "audio/wav") throw new Error("invalid audio");
  const audio = await readBounded(out.response, 2 * 1024 * 1024);
  if (audio.toString("ascii", 0, 4) !== "RIFF") throw new Error("invalid audio");
  return { audio, ttfbMs: out.ttfbMs, totalMs: performance.now() - out.startedAt };
}
export async function stt(audio) {
  const out = await request("/stt", { method: "POST",
    headers: { "content-type": "audio/wav" }, body: audio });
  const result = validateTranscript(JSON.parse((await readBounded(out.response, 16384)).toString("utf8")));
  return { durationMs: result.duration_ms, totalMs: performance.now() - out.startedAt };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let ready = false;
  try {
    const model = await health(); ready = true;
    const clip = await makeClip();
    const result = await stt(clip.audio);
    console.log(JSON.stringify({ status: "PASS", test: "local-synthetic-smoke", ...model,
      clip_ms: result.durationMs, stt_ms: Math.round(result.totalMs),
      tts_ttfb_ms: Math.round(clip.ttfbMs), tts_total_ms: Math.round(clip.totalMs) }));
  } catch {
    console.log(ready ? "FAIL: local speech request failed" : "NOT RUN: local sidecar/token/models unavailable");
    process.exitCode = 1;
  }
}
