import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {anthropicProviderMode,createAnthropicProvider} from "../providers/anthropic.js";
import {loadConfig} from "../config.js";
import {complete} from "../gateway.js";

const grant = "cubicle-scenario-prototype-haiku-2026-10-25";
const initialLedger = {version:1,calls:0,reservedTokens:0,reservedUsd:0,actualInputTokens:0,actualOutputTokens:0};
async function fixture(run, initial = initialLedger) {
  const dir = await mkdtemp(join(process.cwd(), ".test-haiku-ledger-")), ledger = join(dir, "ledger.json");
  if (initial) await writeFile(ledger, JSON.stringify(initial));
  try { await run(dir, ledger); } finally { await rm(dir, {recursive:true,force:true}); }
}
const envFor = (ledger, extra = {}) => ({LLM_PROVIDER:"anthropic",RUN_LIVE:"1",CUBICLE_LIVE_TEST:grant,ANTHROPIC_API_KEY:"test-only-fake-key",ANTHROPIC_BUDGET_LEDGER:ledger,...extra});

test("Anthropic configuration pins Haiku for every role without changing Groq defaults", () => {
  const anthro = loadConfig({LLM_PROVIDER:"anthropic",CLASSIFIER_MODEL:"ignored/provider-override"});
  for (const role of ["classifier","npc","judge","coach"]) {
    assert.equal(anthro[role].model,"claude-haiku-5-5");
    assert.ok(anthro[role].maxTokens <= 1024);
    assert.equal(anthro[role].reasoningEffort,"low");
  }
  assert.equal(loadConfig({}).npc.model,"qwen/qwen3.8-27b");
});

test("provider status reports offline until explicit authorization and a usable ledger exist", async () => fixture(async (_dir, ledger) => {
  const base = envFor(ledger);
  assert.equal(anthropicProviderMode({...base,RUN_LIVE:"0"}),"offline (Claude authorization is incomplete)");
  assert.equal(anthropicProviderMode({...base,ANTHROPIC_BUDGET_LEDGER:join(_dir,"missing.json")}),"offline (Claude budget ledger is unavailable)");
  assert.equal(anthropicProviderMode(base),"live (Claude Haiku · task budget active)");
  await writeFile(ledger,JSON.stringify({...initialLedger,grant,model:"claude-haiku-5-5",caps:{calls:40,reservedTokens:200000,outputTokens:1024,usd:4,usdPerMillionReservedTokens:2.5},calls:40}));
  assert.equal(anthropicProviderMode(base),"offline (Claude task budget exhausted)");
}));

test("Anthropic sends the supported Messages API shape, counts text blocks and records usage", async () => fixture(async (_dir, ledger) => {
  let request;
  const provider = createAnthropicProvider({env:envFor(ledger),fetchFn:async (url, options) => {
    request = {url, options, body:JSON.parse(options.body)};
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:12,output_tokens:4},content:[
      {type:"thinking",thinking:"ignored and never surfaced"},{type:"text",text:'{"events":[]}'},
    ]}),{status:200,headers:{"content-type":"application/json"}});
  }});
  const schema = {type:"object",required:["events"],properties:{events:{type:"array"}}};
  const out = await provider({role:"classifier",system:"policy",messages:[{role:"user",content:"hello"}],schema});
  assert.equal(out.text,'{"events":[]}');
  assert.equal(out.model,"claude-haiku-5-5");
  assert.equal(request.url,"https://api.anthropic.com/v1/messages");
  assert.equal(request.options.headers["x-api-key"],"test-only-fake-key");
  assert.equal(request.body.model,"claude-haiku-5-5");
  assert.ok(request.body.max_tokens <= 1024);
  assert.equal(request.body.system,"policy");
  assert.deepEqual(request.body.messages,[{role:"user",content:"hello"}]);
  assert.deepEqual(request.body.output_config.format.schema,schema);
  for (const forbidden of ["temperature","top_p","top_k"]) assert.equal(Object.hasOwn(request.body,forbidden),false);
  const saved = JSON.parse(await readFile(ledger,"utf8"));
  assert.equal(saved.calls,1); assert.equal(saved.actualInputTokens,12); assert.equal(saved.actualOutputTokens,4);
}));

test("authorization, missing ledgers, invalid ledgers and exhausted grants fail before dispatch", async () => {
  await fixture(async (_dir, ledger) => {
    let calls=0;
    const invoke = async (env) => createAnthropicProvider({env,fetchFn:async()=>{calls++;throw new Error("must not dispatch");}})({role:"npc",messages:[{role:"user",content:"hello"}]});
    await assert.rejects(invoke({...envFor(ledger),RUN_LIVE:"0"}),{code:"PROVIDER_UNAVAILABLE"});
    await assert.rejects(invoke({...envFor(ledger),CUBICLE_LIVE_TEST:"other"}),{code:"PROVIDER_UNAVAILABLE"});
    await assert.rejects(invoke(envFor(join(_dir,"missing.json"))),{code:"LLM_BUDGET_UNAVAILABLE"});
    await writeFile(ledger,"not-json");
    await assert.rejects(invoke(envFor(ledger)),{code:"LLM_BUDGET_UNAVAILABLE"});
    await writeFile(ledger,JSON.stringify({...initialLedger,grant,model:"claude-haiku-5-5",caps:{calls:40,reservedTokens:200000,outputTokens:1024,usd:4,usdPerMillionReservedTokens:2.5},calls:40}));
    await assert.rejects(invoke(envFor(ledger)),{code:"LLM_BUDGET_EXCEEDED"});
    assert.equal(calls,0);
  });
});

test("refusal and truncation are safely rejected after usage is persisted", async () => fixture(async (_dir, ledger) => {
  for (const stop_reason of ["refusal","max_tokens","model_context_window_exceeded"]) {
    const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async()=>new Response(JSON.stringify({stop_reason,usage:{input_tokens:2,output_tokens:3},content:[{type:"text",text:"partial"}]}),{status:200})});
    await assert.rejects(provider({role:"npc",messages:[{role:"user",content:"hello"}]}),{code:"OUTPUT_INVALID"});
  }
  const saved=JSON.parse(await readFile(ledger,"utf8"));
  assert.equal(saved.calls,3); assert.equal(saved.actualInputTokens,6); assert.equal(saved.actualOutputTokens,9);
}));

test("parallel reservations are atomic and timeout or oversized body retain the reservation", async () => fixture(async (_dir, ledger) => {
  let dispatched=0;
  const fetchFn=async()=>{dispatched++;return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:1,output_tokens:1},content:[{type:"text",text:"ok"}]}),{status:200});};
  const provider=createAnthropicProvider({env:envFor(ledger),fetchFn});
  await Promise.all(Array.from({length:12},(_,i)=>provider({role:"npc",messages:[{role:"user",content:`parallel ${i}`}]})));
  assert.equal(dispatched,12);
  let saved=JSON.parse(await readFile(ledger,"utf8"));
  assert.equal(saved.calls,12); assert.equal(saved.actualInputTokens,12); assert.equal(saved.actualOutputTokens,12);
  const slow=createAnthropicProvider({env:envFor(ledger),timeoutMs:15,fetchFn:async()=>({ok:true,body:{getReader(){return {read:()=>new Promise(()=>{}),releaseLock(){}};}}})});
  await assert.rejects(slow({role:"npc",messages:[{role:"user",content:"timeout"}]}),{code:"TIMEOUT"});
  saved=JSON.parse(await readFile(ledger,"utf8")); assert.equal(saved.calls,13);
  const huge=createAnthropicProvider({env:envFor(ledger),fetchFn:async()=>new Response("x".repeat(256_001),{status:200,headers:{"content-type":"application/json"}})});
  await assert.rejects(huge({role:"npc",messages:[{role:"user",content:"large body"}]}),{code:"OUTPUT_INVALID"});
  saved=JSON.parse(await readFile(ledger,"utf8")); assert.equal(saved.calls,14);
}));

test("gateway retry reserves each dispatch and succeeds without exposing provider errors", async () => fixture(async (_dir, ledger) => {
  let calls=0;
  const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async()=>{
    calls++;
    if(calls===1) return new Response("temporarily unavailable",{status:503});
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:3,output_tokens:2},content:[{type:"text",text:"ready"}]}),{status:200});
  }});
  const result=await complete({role:"npc",messages:[{role:"user",content:"safe smoke"}],provider});
  assert.equal(result.ok,true); assert.equal(result.text,"ready"); assert.equal(result.attempts,2); assert.equal(result.source,"llm");
  assert.equal(calls,2);
  const saved=JSON.parse(await readFile(ledger,"utf8"));
  assert.equal(saved.calls,2); assert.equal(saved.actualInputTokens,3); assert.equal(saved.actualOutputTokens,2);
}));
