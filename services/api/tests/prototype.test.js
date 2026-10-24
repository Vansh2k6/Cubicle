import test from "node:test";
import assert from "node:assert/strict";
import {Readable} from "node:stream";
import { createServer, providerAvailableForMode } from "../server.js";
import { prototypeRegistry } from "../scenarioRegistry.js";

function request(app, method, path, body, remoteAddress = "127.0.0.1") {
  const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  req.method = method; req.url = path; req.headers = body === undefined ? {} : {"content-type":"application/json"};
  req.socket = {remoteAddress};
  const handler = app.server.listeners("request")[0];
  return new Promise((resolve, reject) => {
    const res = {writeHead(status, headers) { this.status = status; this.headers = headers; return this; }, setHeader() {},
      end(text = "") { let data = {}; try { data = JSON.parse(text); } catch {} resolve({status:this.status, json:async()=>data}); }};
    Promise.resolve(handler(req,res)).catch(reject);
  });
}

test("authorization-incomplete Anthropic status selects the offline provider path", () => {
  assert.equal(providerAvailableForMode("anthropic","offline"),false);
  assert.equal(providerAvailableForMode("anthropic","offline (Claude authorization is incomplete)"),false);
  assert.equal(providerAvailableForMode("anthropic","offline (Claude budget ledger is unavailable)"),false);
  assert.equal(providerAvailableForMode("anthropic","offline (Claude task budget exhausted)"),false);
  assert.equal(providerAvailableForMode("anthropic","live (Claude Haiku · task budget active)"),true);
  assert.equal(providerAvailableForMode("groq","live"),true);
});

test("prototype preview, composition and session creation are loopback-only while baseline catalogue stays public", async () => {
  const app=createServer();
  try {
    assert.equal((await request(app,"GET","/scenarios/prototype_manager",undefined,"192.0.2.40")).status,404);
    assert.equal((await request(app,"POST","/prototype/compose",{text:"The feature was omitted"},"192.0.2.40")).status,404);
    assert.equal((await request(app,"POST","/sessions",{scenario_id:"prototype_manager"},"192.0.2.40")).status,404);
    assert.equal((await request(app,"GET","/scenarios",undefined,"192.0.2.40")).status,200);
    const local=await (await request(app,"POST","/sessions",{scenario_id:"prototype_manager"})).json();
    assert.equal((await request(app,"POST",`/sessions/${encodeURIComponent(local.session_id)}/turn`,{npc_id:"maya",text:"Hello."},"192.0.2.40")).status,404);
    assert.equal((await request(app,"POST",`/sessions/${encodeURIComponent(local.session_id)}/end`,{},"127.0.0.1")).status,200);
    assert.equal((await request(app,"GET",`/sessions/${encodeURIComponent(local.session_id)}/debrief`,undefined,"192.0.2.40")).status,404);
  } finally { app.server.emit("close"); }
});

test("prototype choices and keyword compositions are bounded, public previews", async () => {
  const app = createServer();
  try {
    const catalog = await (await request(app,"GET","/scenarios")).json();
    assert.deepEqual(catalog.map((item) => item.id), ["missed_deadline"]);
    const ids = ["missed_deadline", "prototype_manager", "prototype_hr", "prototype_client", "prototype_coworker"];
    for (const id of ids) {
      const response = await request(app,"GET",`/scenarios/${id}`);
      assert.equal(response.status, 200);
      const preview = await response.json();
      assert.equal(preview.id, id);
      assert.ok(preview.briefing && preview.goals.length === (id === "missed_deadline" ? 3 : 6));
      const serialized = JSON.stringify(preview).toLowerCase();
      for (const hidden of ["facts", "triggers", "leak_keywords", "commitment_model", "contenthash", "prototypesources", "scoringprofile", "private"]) assert.equal(serialized.includes(`\"${hidden}\"`), false);
      if (id !== "missed_deadline") {
        const pkg = prototypeRegistry.getScenario(id);
        for (const fact of pkg.spec.facts) assert.equal(serialized.includes(fact.content.en.toLowerCase()),false);
      }
    }
    for (const [text, id] of [["The feature was omitted from the signed product scope", "prototype_omitted_feature"], ["The client asks us to deliver sooner", "prototype_earlier_delivery"]]) {
      const response = await request(app,"POST","/prototype/compose",{text});
      assert.equal(response.status, 200);
      assert.equal((await response.json()).scenario_id, id);
    }
    for (const text of ["Build me a new onboarding simulation", "The client wants an earlier date and also says a feature was omitted"]) {
      const response = await request(app,"POST","/prototype/compose",{text});
      assert.equal(response.status, 422);
      assert.ok((await response.json()).reason);
    }
    for (const text of ["The client omitted a feature for Mars", "A missing product feature requires a new cast", "Move delivery earlier and add a new character"]) {
      const response = await request(app,"POST","/prototype/compose",{text});
      assert.equal(response.status,422);
      assert.equal((await response.json()).reason,"unsupported_requirements");
    }
  } finally { app.server.emit("close"); }
});

test("API exposes a safe fallback marker, ignores client-supplied events and returns the actual reply field", async () => {
  let calls=0;
  const provider = async () => { calls++; throw Object.assign(new Error("private provider detail"),{code:"PROVIDER_UNAVAILABLE"}); };
  const app = createServer({npcProvider:provider});
  try {
    const opened = await request(app,"POST","/sessions",{scenario_id:"prototype_manager"});
    const session = await opened.json();
    const result = await request(app,"POST",`/sessions/${encodeURIComponent(session.session_id)}/turn`,{
      npc_id:"maya",text:"Hello.",events:[{type:"took_ownership",params:{}}],idempotencyKey:"fallback-safe-source"});
    const body = await result.json();
    assert.equal(result.status,200);
    assert.equal(typeof body.npc_reply,"string");
    assert.equal(body.reply_source,"fallback");
    assert.equal(JSON.stringify(body).includes("private provider detail"),false);
    assert.equal(JSON.stringify(body).includes("took_ownership"),false);
    const afterFirst=calls;
    const replay=await request(app,"POST",`/sessions/${encodeURIComponent(session.session_id)}/turn`,{
      npc_id:"maya",text:"Hello.",events:[{type:"took_ownership",params:{}}],idempotencyKey:"fallback-safe-source"});
    assert.deepEqual(await replay.json(),body);
    assert.equal(calls,afterFirst,"same idempotency key replays the bounded result without a second dispatch");
  } finally { app.server.emit("close"); }
});

test("a selected composed package stays pinned through turn and debrief", async () => {
  let captured;
  const app = createServer({debriefAssembler: async ({record, runtime}) => {
    captured = {record, runtime};
    return {status: "complete", summary: "Reviewed.", score: {total: 0}, deterministic: {points: 0}, judged: {points: 0}, moments: [], breakdown: []};
  }});
  try {
    const composed = await (await request(app,"POST","/prototype/compose",{text:"The client requested that we move delivery earlier"})).json();
    const opened = await request(app,"POST","/sessions",{scenario_id: composed.scenario_id});
    const session = await opened.json();
    assert.equal(opened.status, 200);
    const publicSession = JSON.stringify(session).toLowerCase();
    for (const fact of pkgFacts(composed.scenario_id)) assert.equal(publicSession.includes(fact.toLowerCase()),false);
    for (const hidden of ["contenthash","prototypesources","commitment_model","scoringprofile"]) assert.equal(publicSession.includes(hidden),false);
    const pkg = prototypeRegistry.getScenario(composed.scenario_id);
    const context = app.resolveSessionContext(session.session_id);
    assert.equal(context.pkg, pkg);
    assert.equal(context.runtime.identity.contentHash, pkg.identity.contentHash);
    const turn = await request(app,"POST",`/sessions/${encodeURIComponent(session.session_id)}/turn`,{npc_id: "client", text: "Hello.", idempotencyKey: "prototype-first-turn"});
    assert.equal(turn.status, 200, JSON.stringify(await turn.json()));
    assert.equal(app.resolveSessionContext(session.session_id).pkg, pkg);
    await request(app,"POST",`/sessions/${encodeURIComponent(session.session_id)}/end`,{});
    for (let i = 0; i < 50 && !captured; i++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.ok(captured);
    assert.equal(captured.record.session.identity.contentHash, pkg.identity.contentHash);
    assert.equal(captured.runtime.identity.contentHash, pkg.identity.contentHash);
    assert.equal(captured.runtime.spec, pkg.spec);
  } finally { app.server.emit("close"); }
});

function pkgFacts(id) { return prototypeRegistry.getScenario(id).spec.facts.map((fact) => fact.content.en); }
