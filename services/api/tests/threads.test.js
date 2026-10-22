// services/api/tests/threads.test.js — P3a offline tests (node:test).
// Threads, goal checklist/next-step mapping, and knowledge silos across the
// three NPCs. Fake (stub) providers only; no network beyond localhost, no keys.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.js";
import { nextHintFor, projectGoals } from "../../../llm/pipeline.js";
import * as engine from "../../../engine/engine.js";

const dir = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(dir, "..", "..", "..", "scenarios", "missed_deadline.json"), "utf8"));

const F1_KEYS = ["friday", "cutoff", "holding off", "3 days", "three days"];
const F2_KEYS = ["reusable", "module", "afternoon"];
const F3_KEYS = ["heads-up", "headsup", "same-day", "same day"];

const HINT = {
  maya: "Talk to Maya about the missed deadline.",
  jordan: "Check in with Jordan about what's left.",
  plan: "Go back to Maya and agree a plan.",
  done: "Nice work — wrap up and reflect on the conversation.",
};

let base;
let plain;
let dbg;
let debugBase;

async function post(baseUrl, path, body) {
  const res = await fetch(baseUrl + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function newSession(baseUrl, sid = "missed_deadline") {
  const c = await post(baseUrl, "/sessions", { scenario_id: sid });
  assert.equal(c.status, 200);
  return c.data.session_id;
}

async function turn(baseUrl, sid, npcId, text, key) {
  return post(baseUrl, `/sessions/${encodeURIComponent(sid)}/turn`, {
    npc_id: npcId,
    text,
    idempotencyKey: key,
  });
}

function goalsById(goals) {
  return Object.fromEntries(goals.map((g) => [g.id, g]));
}

test.before(async () => {
  const a = createServer({ debug: false });
  await new Promise((r) => a.server.listen(0, r));
  plain = a;
  base = `http://localhost:${a.server.address().port}`;
  const b = createServer({ debug: true });
  await new Promise((r) => b.server.listen(0, r));
  dbg = b;
  debugBase = `http://localhost:${b.server.address().port}`;
});

test.after(async () => {
  await new Promise((r) => plain.server.close(r));
  await new Promise((r) => dbg.server.close(r));
});

// --- P3.2 mapping table: every G1/G2/G3 combination. ---

test("next-step mapping covers every goal combination", () => {
  const cases = [
    [{}, HINT.maya],
    [{ G1: "pending" }, HINT.maya],
    [{ G1: "done" }, HINT.jordan],
    [{ G2: "done" }, HINT.maya],
    [{ G1: "done", G2: "done" }, HINT.plan],
    [{ G1: "done", G2: "done", G3: "pending" }, HINT.plan],
    [{ G1: "done", G2: "done", G3: "done" }, HINT.done],
    [{ G1: "done", G3: "done" }, HINT.done],
  ];
  for (const [statuses, want] of cases) {
    const goals = { G1: { status: "pending" }, G2: { status: "pending" }, G3: { status: "pending" } };
    for (const [id, st] of Object.entries(statuses)) goals[id] = { status: st };
    assert.equal(nextHintFor(goals), want, JSON.stringify(statuses));
  }
});

test("G3 locked until G1 and G2 are done", () => {
  const session = { goals: { G1: { status: "pending" }, G2: { status: "pending" }, G3: { status: "pending" } } };
  let projected = projectGoals(scenario, session);
  assert.equal(goalsById(projected).G3.locked, true);
  assert.equal(goalsById(projected).G1.locked, false);
  assert.equal(goalsById(projected).G2.locked, false);
  session.goals.G1.status = "done";
  projected = projectGoals(scenario, session);
  assert.equal(goalsById(projected).G3.locked, true);
  session.goals.G2.status = "done";
  projected = projectGoals(scenario, session);
  assert.equal(goalsById(projected).G3.locked, false);
});

// --- P3.2 live checklist: G1 -> G2 -> G3 drives hint + lock. ---

test("checklist and next step follow G1/G2/G3 through the API", async () => {
  const sid = await newSession(base);
  let r = await turn(base, sid, "maya", "Hello.", "p32-0");
  assert.equal(r.status, 200);
  assert.equal(goalsById(r.data.public_state.goals).G3.locked, true);
  assert.equal(r.data.public_state.next_hint, HINT.maya);

  r = await turn(base, sid, "maya", "I underestimated the final review. I should have flagged the delay sooner. I own this and I am being honest about the status.", "p32-1");
  assert.equal(r.status, 200);
  assert.equal(goalsById(r.data.public_state.goals).G1.status, "done");
  assert.equal(r.data.public_state.next_hint, HINT.jordan);
  assert.equal(goalsById(r.data.public_state.goals).G3.locked, true);

  r = await turn(base, sid, "jordan", "What is left on the project? Walk me through the remaining work and requirement details.", "p32-2");
  assert.equal(r.status, 200);
  assert.equal(goalsById(r.data.public_state.goals).G2.status, "done");
  assert.equal(goalsById(r.data.public_state.goals).G3.locked, false);
  assert.equal(r.data.public_state.next_hint, HINT.plan);

  r = await turn(base, sid, "maya", "I can deliver the full draft by Friday, I promise.", "p32-3");
  assert.equal(r.status, 200);
  r = await turn(base, sid, "maya", "Let me summarize what we agreed so far.", "p32-4");
  assert.equal(r.status, 200);
  assert.equal(goalsById(r.data.public_state.goals).G3.status, "done");
  assert.equal(r.data.public_state.next_hint, HINT.done);
});

// --- P3.1 threads: per-NPC history, mood, told_by_user; resume on reopen. ---

test("thread isolation: jordan turns leave maya on first contact", async () => {
  const sid = await newSession(debugBase);
  await turn(debugBase, sid, "jordan", "Hey, can you help me? I am stuck.", "ti-1");
  await turn(debugBase, sid, "jordan", "Can you help me pair on this?", "ti-2");
  const r = await turn(debugBase, sid, "maya", "Hello.", "ti-3");
  assert.equal(r.status, 200);
  assert.equal(r.data._debug.act, "greet");
  assert.equal(goalsById(r.data.public_state.goals).G1.status, "pending");
});

test("told_by_user is tracked per npc (engine level)", () => {
  const session = engine.createSession(scenario, { seed: 7, locale: "en" });
  engine.applyTurn(session, "jordan", [{ type: "greeted" }], {});
  engine.applyTurn(session, "jordan", [{ type: "asked_for_help" }], {});
  engine.applyTurn(session, "maya", [{ type: "greeted" }], {});
  assert.deepEqual(session.npcs.jordan.told_by_user, [1, 2]);
  assert.deepEqual(session.npcs.maya.told_by_user, [3]);
});

test("in-flight turn is not duplicated: concurrent same-key posts apply once", async () => {
  const sid = await newSession(base);
  const body = { npc_id: "maya", text: "Hello.", idempotencyKey: "conc-1" };
  const url = `${base}/sessions/${encodeURIComponent(sid)}/turn`;
  const req = () =>
    fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      .then(async (res) => ({ status: res.status, data: await res.json() }));
  const [a, b] = await Promise.all([req(), req()]);
  assert.equal(a.status, 200);
  assert.equal(b.status, 200);
  assert.deepEqual(a.data, b.data);
  assert.equal(a.data.turn_id, 1);
  const next = await turn(base, sid, "maya", "Hi again.", "conc-2");
  assert.equal(next.data.turn_id, 2);
});

// --- P3.3 silos: prompts carry only the owner's facts. ---

test("F3 reveals through sam after advice-seeking; never volunteered elsewhere", async () => {
  const sid = await newSession(debugBase);
  let r = await turn(debugBase, sid, "sam", "What should I do here? I need some advice on handling this.", "f3-1");
  assert.equal(r.status, 200);
  assert.notEqual(r.data._debug.act, "reveal_fact:F3");
  r = await turn(debugBase, sid, "sam", "I am worried about telling Maya late. What would you do?", "f3-2");
  assert.equal(r.status, 200);
  assert.equal(r.data._debug.act, "reveal_fact:F3");
});

test("silo scan: F1 stays with maya; F2 stays with jordan", async () => {
  const sid = await newSession(base);
  // Reveal F1 with maya (two flexibility probes open the gate).
  await turn(base, sid, "maya", "Hello.", "silo-0");
  await turn(base, sid, "maya", "Is there any flexibility on the deadline?", "silo-1");
  const f1 = await turn(base, sid, "maya", "What happens if this slips past the deadline?", "silo-2");
  assert.equal(f1.status, 200);
  // Jordan and sam must never state F1 unprompted (and sam must not
  // volunteer F3 either: it is still sealed for him at this point).
  for (const [npc, text, key] of [
    ["jordan", "Is there any flexibility on the deadline?", "silo-3"],
    ["sam", "Why is everyone in such a hurry?", "silo-4"],
  ]) {
    const r = await turn(base, sid, npc, text, key);
    assert.equal(r.status, 200);
    const lower = String(r.data.npc_reply).toLowerCase();
    for (const kw of F1_KEYS) assert.ok(!lower.includes(kw), `${npc} stated F1 (${kw}): ${r.data.npc_reply}`);
    if (npc === "sam") {
      for (const kw of F3_KEYS) assert.ok(!lower.includes(kw), `sam volunteered F3 (${kw}): ${r.data.npc_reply}`);
    }
  }
  // Reveal F2 with jordan; maya and sam must never state it.
  await turn(base, sid, "jordan", "Can you help me? I am stuck.", "silo-5");
  await turn(base, sid, "jordan", "Can you help me pair on this?", "silo-6");
  for (const [npc, text, key] of [
    ["maya", "Can you help me with the leftover work?", "silo-7"],
    ["sam", "Can you help me figure out the plan?", "silo-8"],
  ]) {
    const r = await turn(base, sid, npc, text, key);
    assert.equal(r.status, 200);
    const lower = String(r.data.npc_reply).toLowerCase();
    for (const kw of F2_KEYS) assert.ok(!lower.includes(kw), `${npc} stated F2 (${kw}): ${r.data.npc_reply}`);
  }
});

// --- R-03 allowlist holds across all three NPCs. ---

test("public-state allowlist holds for every npc", async () => {
  const sid = await newSession(base);
  const banned = ["F1", "F2", "F3", "commitment_model", "leak_keywords", "triggers",
    "CURRENT MOVE", "Authorised disclosure", "pending_delivery", "forthcomingness", "cutoff", "Friday"];
  const lines = [
    ["maya", "Hello.", "al-1"],
    ["jordan", "Hey, what is left on the project?", "al-2"],
    ["sam", "Hi, I could use some advice.", "al-3"],
  ];
  for (const [npc, text, key] of lines) {
    const r = await turn(base, sid, npc, text, key);
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.data).sort(), ["end_reason", "ended", "npc_reply", "public_state", "turn_id", "speech"].sort());
    assert.deepEqual(
      Object.keys(r.data.public_state).sort(),
      ["ended", "goals", "mood_label", "next_hint", "npc_availability"].sort(),
    );
    const blob = JSON.stringify(r.data);
    for (const s of banned) assert.ok(!blob.includes(s), `sealed in ${npc} turn: ${s}`);
  }
});
