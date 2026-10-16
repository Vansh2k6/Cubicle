// services/api/tests/api.test.js — P2c offline API contract tests (node:test).
// Fake (stub) providers only; no network beyond localhost, no keys.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.js";

const dir = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(dir, "..", "..", "..", "scenarios", "missed_deadline.json"), "utf8"));

const BANNED = [];
for (const f of scenario.facts || []) {
  BANNED.push(f.content.en);
  for (const kw of (f.leak_keywords && f.leak_keywords.en) || []) BANNED.push(kw);
  for (const tr of f.triggers || []) BANNED.push(tr);
}
// Sealed private-canon values (distinctive strings only; npc ids like "maya"
// and fact ids are public metadata shapes handled separately below).
BANNED.push("Friday");
BANNED.push("commitment_model", "leak_keywords", "triggers", "CURRENT MOVE", "Authorised disclosure");
BANNED.push("pending_delivery", "forthcomingness", "cutoff");
// Fact ids must never appear in non-debug public responses (debug guard codes
// under the dev flag are the sole exception, covered by a separate assertion).
const BANNED_PUBLIC = BANNED.concat(["F1", "F2", "F3"]);
// "canon" as a bare word collides with legitimate prose; ban the keyed form.
BANNED.push('"canon"');

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

async function postTurn(baseUrl, sid, body) {
  return post(baseUrl, `/sessions/${encodeURIComponent(sid)}/turn`, body);
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

test("POST /sessions returns session_id, briefing, public_state", async () => {
  const { status, data } = await post(base, "/sessions", { scenario_id: "missed_deadline" });
  assert.equal(status, 200);
  assert.ok(typeof data.session_id === "string");
  assert.equal(data.briefing, scenario.briefing.en);
  assert.ok(Array.isArray(data.public_state.goals));
  assert.deepEqual(
    data.public_state.goals.map((g) => g.id).sort(),
    scenario.goals.filter((g) => g.visible).map((g) => g.id).sort(),
  );
  const blob = JSON.stringify(data);
  for (const s of BANNED_PUBLIC) assert.ok(!blob.includes(s), "sealed in create: " + s);
  assert.ok(!("_debug" in data));
});

test("POST /sessions rejects unknown scenario_id", async () => {
  const { status } = await post(base, "/sessions", { scenario_id: "nope" });
  assert.equal(status, 400);
});

test("GET /scenarios/{id} exposes briefing + visible goals only", async () => {
  const res = await fetch(base + "/scenarios/missed_deadline");
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.briefing, scenario.briefing.en);
  assert.ok(!("facts" in data) && !("canon" in data) && !("commitment_model" in data));
  const blob = JSON.stringify(data);
  for (const s of BANNED_PUBLIC) assert.ok(!blob.includes(s), "sealed in scenario: " + s);
  const missing = await fetch(base + "/scenarios/nope");
  assert.equal(missing.status, 404);
});

test("turn allowlist: public keys only, no debug without flag, no sealed text", async () => {
  const c = await post(base, "/sessions", { scenario_id: "deadline" });
  const { status, data } = await postTurn(base, c.data.session_id, {
    npc_id: "maya",
    text: "Hello.",
    idempotencyKey: "k-allow-1",
  });
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(data).sort(), ["end_reason", "ended", "npc_reply", "public_state", "turn_id"].sort());
  assert.deepEqual(
    Object.keys(data.public_state).sort(),
    ["ended", "goals", "mood_label", "next_hint", "npc_availability"].sort(),
  );
  assert.ok(!("_debug" in data));
  assert.equal(typeof data.npc_reply, "string");
  const blob = JSON.stringify(data);
  for (const s of BANNED_PUBLIC) assert.ok(!blob.includes(s), "sealed in turn: " + s);
});

test("retry/idempotency: same key replays without re-applying; user turn not duplicated", async () => {
  const c = await post(base, "/sessions", { scenario_id: "missed_deadline" });
  const sid = c.data.session_id;
  const body = { npc_id: "maya", text: "Hello.", idempotencyKey: "k-idem-1" };
  const first = await postTurn(base, sid, body);
  assert.equal(first.status, 200);
  const dup = await postTurn(base, sid, body);
  assert.equal(dup.status, 200);
  assert.deepEqual(dup.data, first.data);
  assert.equal(first.data.turn_id, 1);
  const next = await postTurn(base, sid, { npc_id: "maya", text: "Hi again.", idempotencyKey: "k-idem-2" });
  assert.equal(next.status, 200);
  assert.equal(next.data.turn_id, 2);
});

test("turn validation: unknown npc/session/text rejected, no state change", async () => {
  const c = await post(base, "/sessions", { scenario_id: "missed_deadline" });
  const sid = c.data.session_id;
  assert.equal((await postTurn(base, sid, { npc_id: "ghost", text: "Hi.", idempotencyKey: "kv1" })).status, 400);
  assert.equal((await postTurn(base, sid, { npc_id: "maya", text: "   ", idempotencyKey: "kv2" })).status, 400);
  assert.equal((await post(base, "/sessions/NOPE/turn", { npc_id: "maya", text: "Hi.", idempotencyKey: "kv3" })).status, 404);
  const ok = await postTurn(base, sid, { npc_id: "maya", text: "Hello.", idempotencyKey: "kv4" });
  assert.equal(ok.data.turn_id, 1);
});

test("debug flag: _debug present with events/act/source/guard/stages, no sealed text", async () => {
  const c = await post(debugBase, "/sessions", { scenario_id: "missed_deadline" });
  const { status, data } = await postTurn(debugBase, c.data.session_id, {
    npc_id: "maya",
    text: "Is there any flexibility on the deadline?",
    idempotencyKey: "k-dbg-1",
  });
  assert.equal(status, 200);
  assert.ok(data._debug, "expected _debug with flag on");
  for (const k of ["events", "act", "source", "guard", "latencyMs", "stages"]) {
    assert.ok(k in data._debug, "missing debug key: " + k);
  }
  assert.ok(data._debug.stages && typeof data._debug.stages.classifyMs === "number");
  assert.ok(Array.isArray(data._debug.events) && data._debug.events.includes("asked_deadline_flexibility"));
  const blob = JSON.stringify(data._debug);
  for (const f of scenario.facts || []) {
    assert.ok(!blob.includes(f.content.en), "fact text in debug: " + f.id);
  }
});
