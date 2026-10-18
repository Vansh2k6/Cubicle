// services/api/client.mjs — Text-only terminal harness (P2c, R-41 fallback).
// Plays the same endpoints as the web UI: create session, send turns, print
// guarded replies + public state. No scene, no browser.
// Usage:
//   node services/api/client.mjs [--api http://localhost:8787] [--npc maya]
//   node services/api/client.mjs --script "Hello.;Is there any flexibility?;..."
// Commands inside the REPL: /goals /hint /quit. Each turn uses a fresh
// idempotency key; on failure the same key is retried once.
import { createInterface } from "node:readline";

const args = process.argv.slice(2);
function opt(name, fallback) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}
const BASE = (process.env.CUBICLE_API || opt("--api", "http://localhost:8787")).replace(/\/+$/, "");
let npc = opt("--npc", "maya");
const script = opt("--script", null);

function key() {
  return `harness-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

async function req(path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(BASE + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

function showGoals(ps) {
  for (const g of ps.goals || []) {
    const mark = g.status === "done" ? "x" : g.locked ? "-" : " ";
    const lock = g.status === "done" || !g.locked ? "" : " (locked)";
    console.log(`  [${mark}] ${g.label}${lock}`);
  }
}

const created = await req("/sessions", { scenario_id: "missed_deadline" });
if (created.status !== 200) {
  console.error(`create failed (${created.status}): ${created.data && created.data.error}`);
  process.exit(1);
}
const sid = created.data.session_id;
console.log(`session ${sid}`);
console.log(`briefing: ${created.data.briefing}`);
console.log("goals:");
showGoals(created.data.public_state);
console.log(`(talking to ${npc}; /goals /hint /npc <id> /quit)`);

let hint = created.data.public_state.next_hint;
let lastGoals = created.data.public_state.goals;

async function turn(text) {
  if (text.startsWith("/npc ")) { npc = text.slice(5).trim() || npc; return true; }
  if (text === "/end") {
    const result = await req(`/sessions/${encodeURIComponent(sid)}/end`, {});
    if (result.status !== 200) { console.log("Could not end session; try again."); return false; }
    console.log(`(session ended: ${result.data.end_reason}; debrief coming soon)`);
    return "ended";
  }
  const k = key();
  let attempt = await req(`/sessions/${encodeURIComponent(sid)}/turn`, { npc_id: npc, text, idempotencyKey: k });
  if ((attempt.status === 503 || attempt.status === 504) && attempt.data.retryable) {
    console.log(`... ${attempt.data.error} — retrying same key`);
    attempt = await req(`/sessions/${encodeURIComponent(sid)}/turn`, { npc_id: npc, text, idempotencyKey: k });
  }
  if (attempt.status !== 200) {
    console.log(`turn failed (${attempt.status}): ${attempt.data && attempt.data.error}`);
    return false;
  }
  const d = attempt.data;
  console.log(`${npc} [${d.public_state.mood_label}]: ${d.npc_reply}`);
  lastGoals = d.public_state.goals;
  hint = d.public_state.next_hint;
  if (d.ended) {
    console.log(`(session ended: ${d.end_reason})`);
    return "ended";
  }
  return true;
}

if (script !== null) {
  for (const line of script.split(";").map((s) => s.trim()).filter(Boolean)) {
    console.log(`you> ${line}`);
    const r = await turn(line);
    if (r === "ended") break;
    if (!r) process.exit(1);
  }
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "you> " });
rl.prompt();
rl.on("line", async (raw) => {
  const line = raw.trim();
  if (line === "/quit") {
    rl.close();
    return;
  }
  if (line === "/goals") {
    showGoals({ goals: lastGoals });
    rl.prompt();
    return;
  }
  if (line === "/hint") {
    console.log(hint);
    rl.prompt();
    return;
  }
  if (line.startsWith("/npc ")) {
    npc = line.slice(5).trim() || npc;
    console.log(`(talking to ${npc})`);
    rl.prompt();
    return;
  }
  if (!line) {
    rl.prompt();
    return;
  }
  const r = await turn(line);
  if (r === "ended") rl.close();
  else rl.prompt();
});
rl.on("close", () => process.exit(0));
