// src/debug.js — Dev-only turn trace panel (P2.8). Loaded ONLY via dynamic
// import() when window.__CUBICLE_DEBUG is set, so shared-demo/production
// bundles never execute this path without the flag. The API likewise omits
// _debug unless the server runs with CUBICLE_DEBUG=1 (R-03). Renders R-15
// fields: events, act, source, guard result, per-stage latency.

// The server omits the debug field without its own flag (R-03); capture
// returns null then, and nothing is ever rendered.
const KEY = "_debug";
export function capture(data) {
  const d = data && data[KEY];
  return d && typeof d === "object" ? data : null;
}

export function renderDebug(container, data) {
  const d = data && data[KEY];
  if (!container || !d) return;
  const stages = d.stages || {};
  const stageText = ["classifyMs", "engineMs", "generateMs", "regenMs", "guardMs"]
    .map((k) => `${k.replace("Ms", "")}: ${typeof stages[k] === "number" ? stages[k] + "ms" : "—"}`)
    .join(" · ");
  const guardText = (d.guard || [])
    .map((g) => `${g.stage}: ${g.ok ? "pass" : "FAIL"}${g.codes && g.codes.length ? ` (${g.codes.join(", ")})` : ""}`)
    .join("\n");
  const el = document.createElement("details");
  el.className = "turn-debug";
  const summary = document.createElement("summary");
  summary.textContent = `trace · ${d.act} · ${d.source} · ${d.latencyMs}ms`;
  const pre = document.createElement("pre");
  pre.textContent =
    `events: ${(d.events || []).join(", ") || "(none)"}\n` +
    `act: ${d.act}\n` +
    `source: ${d.source} (${d.provider || "n/a"})\n` +
    `guard:\n${guardText || "(none)"}\n` +
    `latency: total ${d.latencyMs}ms · ${stageText}\n` +
    `regen: ${d.regen ? "yes" : "no"} · fallback: ${d.fallback || "none"} · delivered: ${d.delivered ? "yes" : "no"}\n` +
    `manifest: ${d.manifest || "n/a"} · turn: ${d.turn}`;
  el.append(summary, pre);
  container.append(el);
}
