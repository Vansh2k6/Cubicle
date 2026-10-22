import { cpus, platform, totalmem } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { loadVoiceConfig } from "../voice/config.js";
import { readBounded } from "../voice/providers/local.js";
import { MAX_AUDIO_BYTES } from "../voice/limits.js";

export function forceOffline(env) {
  for (const name of Object.keys(env)) if (/^(LLM_|GROQ_|OPENAI_|ANTHROPIC_)/i.test(name) || /^(RUN_LIVE|CUBICLE_DEBUG)$/i.test(name)) delete env[name];
  env.LLM_PROVIDER = "offline";
}
export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: Math.round(sorted[Math.ceil(sorted.length * .5) - 1]), p95: Math.round(sorted[Math.ceil(sorted.length * .95) - 1]) };
}
export async function measureAudio(response, startedAt, now = () => performance.now()) {
  if (!response.ok || response.headers.get("content-type") !== "audio/wav") { await response.body?.cancel(); throw new Error("audio unavailable"); }
  const reader = response.body.getReader(); let bytes = 0, first = null;
  try {
    for (;;) {
      const chunk = await reader.read(); if (chunk.done) break;
      if (first === null) first = now() - startedAt;
      bytes += chunk.value.byteLength; if (bytes > MAX_AUDIO_BYTES) throw new Error("audio too large");
    }
    if (!bytes) throw new Error("empty audio");
    return { firstMs: first, totalMs: now() - startedAt, bytes };
  } finally { await reader.cancel().catch(() => {}); }
}
export async function runLatency() {
  // This must precede importing the server: its provider is selected at module load.
  forceOffline(process.env);
  const runs = Number(process.env.VOICE_LATENCY_RUNS || 20);
  if (!Number.isSafeInteger(runs) || runs < 20 || runs > 50) throw new Error("invalid run count");
  const config = loadVoiceConfig({ ...process.env, VOICE_ENABLED: "1", VOICE_TTS_CHAIN: "local" });
  const { health, makeClip } = await import("./voice-smoke.mjs");
  const model = await health(); const clip = await makeClip();
  const { createServer } = await import("../services/api/server.js");
  const { server } = createServer({ voiceConfig: config });
  try {
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    const base = `http://127.0.0.1:${server.address().port}`;
    const json = async (path, body, mime = "application/json") => {
      const response = await fetch(base + path, { method: body === undefined ? "GET" : "POST", signal: AbortSignal.timeout(20000),
        headers: body === undefined ? {} : { "content-type": mime }, body: body === undefined ? undefined : mime === "application/json" ? JSON.stringify(body) : body });
      if (!response.ok) { await response.body?.cancel(); throw new Error("local API unavailable"); }
      return JSON.parse((await readBounded(response, 1 << 20)).toString("utf8"));
    };
    const samples = { stt_ms: [], text_ms: [], tts_first_byte_ms: [], tts_total_ms: [], speech_end_to_first_audio_ms: [], added_voice_ms: [] };
    for (let i = 0; i < runs; i++) {
      const { session_id: id } = await json("/sessions", { scenario_id: "deadline" });
      const path = `/sessions/${encodeURIComponent(id)}`;
      const start = performance.now();
      const draft = await json(path + "/voice/stt", clip.audio, "audio/wav");
      const sttMs = performance.now() - start;
      // Synthetic confirmation boundary: only validated/confirmed draft text enters the turn.
      if (typeof draft.text !== "string" || !draft.text.trim()) throw new Error("empty draft");
      const textStart = performance.now();
      const turn = await json(path + "/turn", { npc_id: "maya", text: draft.text.trim(), idempotencyKey: `latency-${i}` });
      const textMs = performance.now() - textStart;
      if (turn.speech?.mode !== "server") throw new Error("local TTS unavailable");
      const audioStart = performance.now();
      const response = await fetch(base + path + `/turns/${encodeURIComponent(turn.speech.turn_id)}/audio`, { signal: AbortSignal.timeout(35000) });
      const audio = await measureAudio(response, audioStart);
      samples.stt_ms.push(sttMs); samples.text_ms.push(textMs); samples.tts_first_byte_ms.push(audio.firstMs); samples.tts_total_ms.push(audio.totalMs);
      samples.speech_end_to_first_audio_ms.push(performance.now() - start - audio.totalMs + audio.firstMs);
      samples.added_voice_ms.push(sttMs + audio.firstMs);
      await json(path + "/end", {});
    }
    const report = { date: new Date().toISOString(), status: "measured", runs, llm: "offline-only",
      fixture: "one fixed synthetic English WAV, memory-only; synthetic editable-text confirmation", ...model,
      hardware: { platform: platform(), cpu: cpus()[0]?.model || "unknown", logical_cpus: cpus().length, memory_mb: Math.round(totalmem() / 1048576), gpu_model: "NOT SAMPLED; device above is sidecar-reported" },
      ...Object.fromEntries(Object.entries(samples).map(([key, values]) => [key, summarize(values)])),
      tts_measurement: "guarded API audio endpoint: request to first body byte and complete body; prefetch overlaps text response",
      scene_stutter: "NOT RUN: no scene frame-time sampler attached", limitations: "No microphone, physical playback, live LLM, or scene-load acceptance; cloud-primary decision remains pending D-35 gate." };
    const directory = join(dirname(fileURLToPath(import.meta.url)), "..", "evals", "reports");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, `voice-latency-${report.date.slice(0, 10)}.json`), JSON.stringify(report, null, 2));
    return report;
  } finally { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runLatency())); }
  catch { console.error("NOT RUN / incomplete: check local sidecar, private token and run count (20..50); no successful report saved."); process.exitCode = 1; }
}
