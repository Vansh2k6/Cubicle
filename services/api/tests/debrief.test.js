import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
const servers = [];
const launch = async (options) => { const { server } = createServer(options); servers.push(server); await new Promise((r) => server.listen(0, "127.0.0.1", r)); return `http://127.0.0.1:${server.address().port}`; };
test.after(async () => { await Promise.all(servers.map((s) => new Promise((r) => s.close(r)))); });
const request = async (base, path, body) => { const res = await fetch(base + path, { method: body === undefined ? "GET" : "POST", headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
const create = async (base) => { const r = await request(base, "/sessions", { scenario_id: "deadline" }); return `/sessions/${encodeURIComponent(r.body.session_id)}`; };
const ready = async (base, path) => { for (let n = 0; n < 100; n++) { const r = await request(base, path + "/debrief"); if (r.body.status !== "pending") return r; await new Promise((resolve) => setTimeout(resolve, 2)); } throw new Error("debrief stayed pending"); };
test("debrief and retry disclose nothing before end; offline after-end is partial with real deterministic points", async () => {
  const base = await launch(); const path = await create(base);
  for (const suffix of ["/debrief", "/debrief/retry"]) {
    const r = await request(base, path + suffix, suffix.endsWith("retry") ? {} : undefined);
    assert.equal(r.status, 409); assert.ok(!JSON.stringify(r.body).includes("missed_facts")); assert.ok(!JSON.stringify(r.body).includes("Friday"));
  }
  await request(base, path + "/turn", { npc_id: "maya", text: "I will deliver tomorrow.", idempotencyKey: "trap" });
  await request(base, path + "/end", {});
  const r = await ready(base, path);
  assert.equal(r.status, 200); assert.equal(r.body.status, "partial");
  assert.equal(r.body.debrief.deterministic.points, 7); assert.equal(r.body.debrief.judged.points, 0);
  assert.equal(r.body.debrief.judged.status, "unavailable"); assert.equal(r.body.retry_allowed, true);
  assert.ok(r.body.debrief.missed_facts.some((f) => f.id === "F1"));
  assert.equal(r.body.debrief.manifest.roles.judge.promptVersion, "v2");
  assert.match(r.body.debrief.manifest.roles.judge.model, /offline-unavailable/);
});
test("End and polling share one asynchronous job; snapshot mutations cannot change live source", async () => {
  let resolve, calls = 0;
  const gate = new Promise((r) => { resolve = r; });
  const base = await launch({ debriefAssembler: async ({ record }) => { calls++; record.session.goals.G1.status = "done"; await gate; return { status: "partial", snapshotOnly: true }; } });
  const path = await create(base);
  const ended = await request(base, path + "/end", {});
  await request(base, path + "/end", {});
  const pending = await request(base, path + "/debrief");
  assert.equal(pending.status, 202); assert.equal(calls, 1);
  const repeated = await request(base, path + "/end", {});
  assert.deepEqual(repeated.body.public_state, ended.body.public_state);
  resolve(); await ready(base, path); assert.equal(calls, 1);
});
test("one explicit unavailable-feedback retry is bounded and pending retries share work", async () => {
  let calls = 0;
  const base = await launch({ debriefAssembler: async () => { calls++; return { status: "partial" }; } });
  const path = await create(base); await request(base, path + "/end", {}); await ready(base, path);
  await Promise.all([request(base, path + "/debrief/retry", {}), request(base, path + "/debrief/retry", {})]);
  const latest = await ready(base, path);
  assert.equal(calls, 2); assert.equal(latest.body.retry_allowed, false);
  assert.equal((await request(base, path + "/debrief/retry", {})).status, 409);
});
test("unexpected job failure still returns deterministic and authored fallback", async () => {
  const base = await launch({ debriefAssembler: async () => { throw new Error("synthetic outage"); } });
  const path = await create(base); await request(base, path + "/end", {});
  const r = await ready(base, path);
  assert.equal(r.body.status, "partial"); assert.ok(r.body.debrief.breakdown.length === 5);
  assert.ok(r.body.debrief.moments[0].better_reply); assert.ok(!JSON.stringify(r.body).includes("synthetic outage"));
});
test("automatic max-turn ending starts one debrief without changing the turn allowlist", async () => {
  let calls = 0;
  const base = await launch({ debriefAssembler: async () => { calls++; return { status: "partial" }; } });
  const path = await create(base); let response;
  for (let i = 0; i < 20; i++) response = await request(base, path + "/turn", { npc_id: "jordan", text: "Hello.", idempotencyKey: `greet-${i}` });
  assert.equal(response.body.ended, true);
  assert.deepEqual(Object.keys(response.body).sort(), ["npc_reply", "public_state", "ended", "end_reason", "turn_id"].sort());
  await ready(base, path); await request(base, path + "/end", {});
  assert.equal(calls, 1);
});

test("an in-flight final NPC line defers debrief snapshot and disclosure until all40 transcript entries commit", async () => {
  const { npcFn } = await import("../offlineProviders.js");
  let release, entered, npcCalls = 0, assembled = 0, transcriptLength = 0;
  const held = new Promise((r) => { release = r; });
  const started = new Promise((r) => { entered = r; });
  const base = await launch({ npcProvider: async (args) => { npcCalls++; if (npcCalls === 20) { entered(); await held; } return npcFn(args); },
    debriefAssembler: async ({ record }) => { assembled++; transcriptLength = record.convo.turns.length; return { status: "partial" }; } });
  const path = await create(base);
  for (let i = 0; i < 19; i++) await request(base, path + "/turn", { npc_id: "jordan", text: "Hello.", idempotencyKey: `held-${i}` });
  const final = request(base, path + "/turn", { npc_id: "jordan", text: "Hello.", idempotencyKey: "held-final" });
  await started;
  const pending = await request(base, path + "/debrief");
  assert.equal(pending.status, 202); assert.equal(pending.body.debrief, null); assert.equal(assembled, 0);
  assert.ok(!JSON.stringify(pending.body).includes("missed_facts"));
  release(); assert.equal((await final).body.ended, true);
  await ready(base, path); assert.equal(assembled, 1); assert.equal(transcriptLength, 40);
});
test("HTTP feedback retry preserves the previous successful judge and retries only failed coach", async () => {
  const { smart } = await import("../../../evals/scriptedPaths.mjs");
  const { DIMENSIONS } = await import("../../../scoring/judge.js");
  let judgeCalls = 0, coachCalls = 0;
  const base = await launch({ feedbackProviders: {
    judge: async (args) => { judgeCalls++; if (judgeCalls > 1) throw new Error("unexpected rerun"); const input = JSON.parse(args.messages[0].content); const user = input.transcript.find((t) => t.speaker === "user"); return { text: JSON.stringify({ dimensions: DIMENSIONS.map((id) => ({ id, score: 5, turn_id: user.id, quote: user.text, explanation: "Synthetic arithmetic only." })) }) }; },
    coach: async (args) => { coachCalls++; if (coachCalls <= 2) return { text: "invalid" }; const user = JSON.parse(args.messages[0].content).original_user_turn; return { text: JSON.stringify({ turn_id: user.id, quote: user.text, what_went_well: "You put your perspective into words.", what_happened: "This is a chance to clarify the next step.", why_it_matters: "A clear question can help.", better_reply: "What should I clarify before the next step?" }) }; },
  } });
  const path = await create(base);
  for (let i = 0; i < smart.length; i++) await request(base, path + "/turn", { npc_id: smart[i][0], text: smart[i][1], idempotencyKey: `smart-${i}` });
  const previous = await ready(base, path);
  assert.equal(previous.body.debrief.judged.points, 25); assert.equal(previous.body.status, "partial");
  await request(base, path + "/debrief/retry", {});
  const result = await ready(base, path);
  assert.equal(judgeCalls, 1); assert.equal(coachCalls, 3);
  assert.equal(result.body.debrief.judged.points, 25); assert.equal(result.body.debrief.total, 85); assert.equal(result.body.status, "ready");
});

test("a new session starts fresh and leaves the prior ended debrief immutable in either order", async () => {
  const base = await launch();
  const first = await create(base);
  await request(base, first + "/turn", { npc_id: "maya", text: "I own the delay and the status is incomplete.", idempotencyKey: "isolation-a" });
  await request(base, first + "/end", {});
  const before = await ready(base, first);
  const second = await create(base);
  const fresh = await create(base);
  const secondInitial = await request(base, second + "/turn", { npc_id: "maya", text: "Hello.", idempotencyKey: "isolation-b" });
  const freshInitial = await request(base, fresh + "/turn", { npc_id: "maya", text: "Hello.", idempotencyKey: "isolation-c" });
  assert.deepEqual(secondInitial.body.public_state, freshInitial.body.public_state);
  await request(base, second + "/end", {});
  await ready(base, second);
  const after = await ready(base, first);
  assert.deepEqual(after.body.debrief, before.body.debrief);

  const reverse = await create(base);
  const clean = await create(base);
  const reverseInitial = await request(base, reverse + "/turn", { npc_id: "jordan", text: "Hello.", idempotencyKey: "isolation-d" });
  const cleanInitial = await request(base, clean + "/turn", { npc_id: "jordan", text: "Hello.", idempotencyKey: "isolation-e" });
  assert.deepEqual(reverseInitial.body.public_state, cleanInitial.body.public_state);
});
