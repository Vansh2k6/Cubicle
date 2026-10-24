import { cpus, platform, totalmem } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { health, makeClip, stt } from "./voice-smoke.mjs";

const count = Number(process.env.VOICE_BENCH_RUNS || 5);
const percentile = (xs, p) => [...xs].sort((a, b) => a - b)[Math.ceil(xs.length * p) - 1];
const summary = (xs) => ({ p50: Math.round(percentile(xs, .5)), p95: Math.round(percentile(xs, .95)) });
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
let ready = false;
try {
  if (!Number.isSafeInteger(count) || count < 1 || count > 20) throw new Error("invalid count");
  const model = await health(); ready = true;
  const sttMs = [], ttsTtfbMs = [], ttsTotalMs = [], addedMs = [];
  let clipMs;
  for (let i = 0; i < count; i++) {
    const clip = await makeClip();
    const result = await stt(clip.audio);
    clipMs = result.durationMs;
    sttMs.push(result.totalMs); ttsTtfbMs.push(clip.ttfbMs); ttsTotalMs.push(clip.totalMs);
    addedMs.push(result.totalMs + clip.ttfbMs);
  }
  const report = { date: new Date().toISOString(), status: "measured", runs: count,
    fixture: "Piper-generated fixed English line, memory-only", clip_ms: clipMs,
    ...model, scene_stutter: "NOT RUN", stt_ms: summary(sttMs),
    tts_ttfb_ms: summary(ttsTtfbMs), tts_total_ms: summary(ttsTotalMs), added_ms: summary(addedMs),
    hardware: { platform: platform(), cpu: cpus()[0]?.model || "unknown", logical_cpus: cpus().length,
      memory_mb: Math.round(totalmem() / 1048576) },
    limitations: "Synthetic local speech only; no microphone, browser, human accuracy or scene-load acceptance.",
  };
  const directory = join(root, "evals", "reports");
  mkdirSync(directory, { recursive: true });
  const suffix = model.device === "cuda" ? "-cuda" : "";
  writeFileSync(join(directory, "voice-bench-" + report.date.slice(0, 10) + suffix + ".json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch {
  console.log(ready ? "FAIL: benchmark incomplete; no successful report saved" : "NOT RUN: verify local setup and run count (1..20)");
  process.exitCode = 1;
}
