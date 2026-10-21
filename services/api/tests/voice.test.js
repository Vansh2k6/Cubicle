import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
import { createFakeVoiceProvider } from "../../../voice/providers/fake.js";
import { SessionStore } from "../../../engine/store.js";

let captured; const original = SessionStore.prototype.create;
SessionStore.prototype.create = function (...args) { captured = original.apply(this, args); return captured; };
let server, base;
test.before(async () => { ({ server } = createServer({ voiceConfig: { enabled: true, sttChain: ["local"], localUrl: "http://127.0.0.1:9", localToken: "x", sttTimeoutMs: 30 }, voiceProviders: [createFakeVoiceProvider()] })); await new Promise((r) => server.listen(0, "127.0.0.1", r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { SessionStore.prototype.create = original; server.closeAllConnections(); await new Promise((r) => server.close(r)); });
async function create() { return encodeURIComponent((await (await fetch(`${base}/sessions`, { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({scenario_id:"deadline"}) })).json()).session_id); }
test("voice is disabled by default", async () => { const x=createServer(); await new Promise(r=>x.server.listen(0,"127.0.0.1",r)); const r=await fetch(`http://127.0.0.1:${x.server.address().port}/sessions/no/voice/stt`,{method:"POST"}); assert.equal(r.status,404); await new Promise(r=>x.server.close(r)); });
test("STT is isolated and rejects unsafe uploads", async () => { const id=await create(), before=JSON.stringify(captured); const ok=await fetch(`${base}/sessions/${id}/voice/stt`,{method:"POST",headers:{"content-type":"audio/wav"},body:Buffer.from("wav")}); assert.equal(ok.status,200); assert.equal(JSON.stringify(captured),before); for (const [headers,body,status] of [[{"content-type":"text/plain"},"x",415],[{"content-type":"audio/wav"},Buffer.alloc(2*1024*1024+1),413],[{"content-type":"audio/wav",origin:"https://evil.test"},"x",403]]) { const r=await fetch(`${base}/sessions/${id}/voice/stt`,{method:"POST",headers,body}); assert.equal(r.status,status); } });
test("STT rate limits and unknown sessions", async () => { const id=await create(); assert.equal((await fetch(`${base}/sessions/no/voice/stt`,{method:"POST",headers:{"content-type":"audio/wav"},body:"x"})).status,404); for(let i=0;i<12;i++) assert.equal((await fetch(`${base}/sessions/${id}/voice/stt`,{method:"POST",headers:{"content-type":"audio/wav"},body:"x"})).status,200); assert.equal((await fetch(`${base}/sessions/${id}/voice/stt`,{method:"POST",headers:{"content-type":"audio/wav"},body:"x"})).status,429); });

import { request as httpRequest } from "node:http";

async function fixture(options = {}) {
  const app = createServer({ voiceConfig: { enabled: true, sttChain: ["local"],
    sttTimeoutMs: 30, localUrl: "http://127.0.0.1:9", localToken: "test" },
    voiceProviders: [createFakeVoiceProvider()], ...options });
  await new Promise((resolve) => app.server.listen(0, "127.0.0.1", resolve));
  const address = "http://127.0.0.1:" + app.server.address().port;
  const id = (await (await fetch(address + "/sessions", { method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scenario_id: "deadline" }) })).json()).session_id;
  return { address, id: encodeURIComponent(id), close: () => new Promise((resolve) => {
    app.server.closeAllConnections(); app.server.close(resolve);
  }) };
}
const upload = (address, id, body = "wav") => fetch(address + "/sessions/" + id + "/voice/stt",
  { method: "POST", headers: { "content-type": "audio/wav" }, body });

test("provider failure, timeout and empty speech leave typed turns usable without logging private data", async () => {
  for (const provider of [
    { transcribe: async () => { throw new Error("do-not-print-audio-or-token"); } },
    { transcribe: () => new Promise(() => {}) },
    { transcribe: async () => { throw Object.assign(new Error(), { code: "stt_empty" }); } },
  ]) {
    const f = await fixture({ voiceProviders: [provider] });
    try {
      const result = await upload(f.address, f.id);
      assert.equal(result.status, 503);
      assert.deepEqual(await result.json(), { error: "stt_unavailable" });
      const typed = await fetch(f.address + "/sessions/" + f.id + "/turn", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ npc_id: "maya", text: "Hello", idempotencyKey: "after-stt-failure" }),
      });
      assert.equal(typed.status, 200);
    } finally { await f.close(); }
  }
});

test("single-flight starts during upload; ending during upload prevents dispatch", async () => {
  let calls = 0;
  const f = await fixture({ voiceProviders: [{ name: "fake", transcribe: async () => {
    calls++; return { text: "safe draft", duration_ms: 800 };
  } }] });
  const path = f.address + "/sessions/" + f.id;
  const response = new Promise((resolve, reject) => {
    const req = httpRequest(path + "/voice/stt", { method: "POST",
      headers: { "content-type": "audio/wav", "content-length": "4" } }, (res) => {
      res.resume(); res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
    req.write("a");
    f.pending = req;
  });
  try {
    // The streamed body is still incomplete when the competing request reaches the server.
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal((await upload(f.address, f.id)).status, 409);
    assert.equal((await fetch(path + "/end", { method: "POST" })).status, 200);
    f.pending.end("bcd");
    assert.equal(await response, 409);
    assert.equal(calls, 0);
  } finally { f.pending?.destroy(); await f.close(); }
});

test("ending while provider is active discards its draft", async () => {
  let started;
  const active = new Promise((resolve) => { started = resolve; });
  let release;
  const f = await fixture({ voiceConfig: { enabled: true, sttChain: ["local"], sttTimeoutMs: 1000 },
    voiceProviders: [{ name: "fake", transcribe: () => { started(); return new Promise((resolve) => { release = resolve; }); } }] });
  try {
    const pending = upload(f.address, f.id);
    await Promise.race([active, new Promise((_, reject) => setTimeout(() => reject(new Error("provider was not called")), 2000).unref())]);
    await fetch(f.address + "/sessions/" + f.id + "/end", { method: "POST" });
    release({ text: "late draft", duration_ms: 800 });
    assert.equal((await pending).status, 409);
    assert.equal((await upload(f.address, f.id)).status, 409);
  } finally { await f.close(); }
});

test("voice CORS works for local UI and rejects nonlocal preflight", async () => {
  const f = await fixture();
  try {
    const path = f.address + "/sessions/" + f.id + "/voice/stt";
    const good = await fetch(path, { method: "OPTIONS", headers: { origin: "http://localhost:5173" } });
    assert.equal(good.status, 204);
    assert.equal(good.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const valid = await fetch(path, { method: "POST", headers: {
      origin: "http://localhost:5173", "content-type": "audio/wav;codecs=pcm" }, body: "wav" });
    assert.equal(valid.status, 200);
    assert.equal(valid.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const bad = await fetch(path, { method: "OPTIONS", headers: { origin: "https://evil.test" } });
    assert.equal(bad.status, 403);
    assert.equal(bad.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(f.address + "/sessions/" + f.id + "/voice/tts", {
      method: "POST", body: '{"text":"arbitrary"}' })).status, 404);
  } finally { await f.close(); }
});

test("stalled uploads expire and release their voice lease", async () => {
  const f = await fixture({ voiceUploadTimeoutMs: 60 });
  try {
    const status = await new Promise((resolve, reject) => {
      const req = httpRequest(f.address + "/sessions/" + f.id + "/voice/stt", {
        method: "POST", headers: { "content-type": "audio/wav", "content-length": "4" },
      }, (res) => { res.resume(); res.on("end", () => { req.destroy(); resolve(res.statusCode); }); });
      req.on("error", reject);
      req.write("a");
    });
    assert.equal(status, 503);
    assert.equal((await upload(f.address, f.id)).status, 200);
  } finally { await f.close(); }
});


import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { VoiceError } from "../../../voice/provider.js";

test("STT success, empty speech and failure do not write audio or log private inputs", async () => {
  const marker = "private-test-audio-token";
  for (const [provider, expectedStatus] of [
    [{ name: "fake", transcribe: async () => ({ text: marker, duration_ms: 1000 }) }, 200],
    [{ transcribe: async () => { throw new VoiceError("stt_empty"); } }, 422],
    [{ transcribe: async () => { throw new Error(marker); } }, 503],
  ]) {
    const f = await fixture({ voiceProviders: [provider] });
    const originalWrites = new Map(), originalLogs = new Map(), logs = [];
    let writes = 0;
    const names = ["writeFile", "writeFileSync", "appendFile", "appendFileSync",
      "write", "writeSync", "createWriteStream"];
    const promiseWrite = fs.promises.writeFile;
    try {
      for (const name of names) {
        originalWrites.set(name, fs[name]);
        fs[name] = () => { writes++; throw new Error("unexpected write"); };
      }
      fs.promises.writeFile = async () => { writes++; throw new Error("unexpected write"); };
      syncBuiltinESMExports();
      for (const name of ["log", "warn", "error", "info", "debug"]) {
        originalLogs.set(name, console[name]);
        console[name] = (...args) => logs.push(args.map(String).join(" "));
      }
      const result = await upload(f.address, f.id, marker);
      assert.equal(result.status, expectedStatus);
      await result.json();
      assert.equal(writes, 0);
      assert.ok(!logs.join("\n").includes(marker));
    } finally {
      for (const [name, fn] of originalWrites) fs[name] = fn;
      fs.promises.writeFile = promiseWrite;
      syncBuiltinESMExports();
      for (const [name, fn] of originalLogs) console[name] = fn;
      await f.close();
    }
  }
});




test("chunked oversized audio receives a typed rejection and never reaches the provider", async () => {
  let calls = 0;
  const f = await fixture({ voiceProviders: [{ transcribe: async () => { calls++; } }] });
  try {
    const response = await new Promise((resolve, reject) => {
      const req = httpRequest(f.address + "/sessions/" + f.id + "/voice/stt", {
        method: "POST", headers: { "content-type": "audio/wav" },
      }, (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => resolve({ status: res.statusCode, data: JSON.parse(Buffer.concat(chunks)) }));
      });
      req.on("error", reject);
      req.write(Buffer.alloc(2 * 1024 * 1024));
      req.end(Buffer.from("x"));
    });
    assert.deepEqual(response, { status: 413, data: { error: "audio_too_large" } });
    assert.equal(calls, 0);
  } finally { await f.close(); }
});
