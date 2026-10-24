import {legacyRegistry} from "../scenarioRegistry.js";
import test from "node:test";
import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createServer } from "../server.js";
import { smart, trap } from "../../../evals/scriptedPaths.mjs";
const exec = promisify(execFile);
let server, base;
test.before(async () => { ({ server } = createServer({registry: legacyRegistry})); await new Promise((r) => server.listen(0, "127.0.0.1", r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { await new Promise((r) => server.close(r)); });
const post = async (path, body) => { const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }); return { status: res.status, body: await res.json() }; };
test("End is idempotent and rejects subsequent turns without exposing internals", async () => {
  const { body } = await post("/sessions", { scenario_id: "deadline" });
  const path = `/sessions/${encodeURIComponent(body.session_id)}`;
  const ended = await post(path + "/end", {});
  assert.equal(ended.body.end_reason, "user_ended");
  assert.deepEqual((await post(path + "/end", {})).body, ended.body);
  assert.equal((await post(path + "/turn", { npc_id: "maya", text: "Hello" })).status, 409);
  assert.deepEqual(Object.keys(ended.body).sort(), ["ended", "end_reason", "public_state"].sort());
});
test("terminal harness smart and trap run against the same offline API", async () => {
  for (const [steps, expected] of [[smart, "goals_complete"], [trap, "user_ended"]]) {
    const script = steps.flatMap(([npc, text]) => [`/npc ${npc}`, text]).concat("/end").join(";");
    const result = await exec(process.execPath, ["services/api/client.mjs", "--api", base, "--script", script], { cwd: process.cwd(), env: { ...process.env, LLM_PROVIDER: "offline", GROQ_API_KEY: "" } });
    assert.ok(result.stdout.includes(`session ended: ${expected}`), result.stdout);
  }
});


test("final-turn cached and in-flight keys replay even after session ending", async () => {
  const { body } = await post("/sessions", { scenario_id: "deadline" });
  const path = `/sessions/${encodeURIComponent(body.session_id)}/turn`;
  for (let i = 0; i < 19; i++) await post(path, { npc_id: "jordan", text: "Hello.", idempotencyKey: `hello-${i}` });
  const payload = { npc_id: "jordan", text: "Hello.", idempotencyKey: "last" };
  const [a, b] = await Promise.all([post(path, payload), post(path, payload)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(a.body.end_reason, "max_turns");
  assert.deepEqual(a.body, b.body);
  assert.deepEqual((await post(path, payload)).body, a.body);
});
test("End during a partial request body prevents later turn execution", async () => {
  const { request } = await import("node:http");
  const { body } = await post("/sessions", { scenario_id: "deadline" });
  const path = `/sessions/${encodeURIComponent(body.session_id)}`;
  let req;
  const response = new Promise((resolve, reject) => {
    req = request(base + path + "/turn", { method: "POST", headers: { "content-type": "application/json" } }, (res) => {
      let text = ""; res.on("data", (c) => { text += c; }); res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(text) }));
    });
    req.on("error", reject);
    req.write('{"npc_id":"maya",');
  });
  assert.equal((await post(path + "/end", {})).body.end_reason, "user_ended");
  req.end('"text":"Hello.","idempotencyKey":"late"}');
  const result = await response;
  assert.equal(result.status, 409);
  assert.equal(result.body.error, "session ended");
});
