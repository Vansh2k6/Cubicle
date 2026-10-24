import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp, readFile, rm, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {anthropicProviderMode,createAnthropicProvider,initializeAnthropicBudgetLedger} from "../providers/anthropic.js";
import {loadConfig} from "../config.js";
import {complete} from "../gateway.js";
import {classifyTurn} from "../classifier.js";
import * as engine from "../../engine/engine.js";
import {prototypeRegistry} from "../../services/api/scenarioRegistry.js";
import {createConversation,runTurn} from "../pipeline.js";

const grant = "cubicle-scenario-prototype-haiku-2026-10-25";
const gameplayGrant = "all-scenarios-live-gameplay";
const initialLedger = {version:1,calls:0,reservedTokens:0,reservedUsd:0,actualInputTokens:0,actualOutputTokens:0};
async function fixture(run, initial = initialLedger) {
  const dir = await mkdtemp(join(process.cwd(), ".test-haiku-ledger-")), ledger = join(dir, "ledger.json");
  if (initial) await writeFile(ledger, JSON.stringify(initial));
  try { await run(dir, ledger); } finally { await rm(dir, {recursive:true,force:true}); }
}
const envFor = (ledger, extra = {}) => ({LLM_PROVIDER:"anthropic",RUN_LIVE:"1",CUBICLE_LIVE_TEST:grant,ANTHROPIC_API_KEY:"test-only-fake-key",ANTHROPIC_BUDGET_LEDGER:ledger,...extra});

test("default ledger initialization remains exclusive-create and grant names are exact", async () => fixture(async (_dir) => {
  const prototypeLedger=join(_dir,"prototype-ledger.json");
  await initializeAnthropicBudgetLedger(undefined,prototypeLedger);
  const before=await readFile(prototypeLedger,"utf8");
  assert.deepEqual(JSON.parse(before),initialLedger);
  await assert.rejects(initializeAnthropicBudgetLedger(undefined,prototypeLedger));
  assert.equal(await readFile(prototypeLedger,"utf8"),before);
  let dispatches=0;
  const unknownEnv=envFor(prototypeLedger,{CUBICLE_LIVE_TEST:"__proto__"});
  assert.equal(anthropicProviderMode(unknownEnv),"offline (Claude authorization is incomplete)");
  await assert.rejects(createAnthropicProvider({env:unknownEnv,fetchFn:async()=>{dispatches++;}})({role:"npc",messages:[{role:"user",content:"hello"}]}),{code:"PROVIDER_UNAVAILABLE"});
  assert.equal(dispatches,0);
  await assert.rejects(initializeAnthropicBudgetLedger("__proto__",join(_dir,"bad.json")),{code:"PROVIDER_UNAVAILABLE"});
}));

test("the separate gameplay grant initializes only by explicit exact name and reserves at approved short-tier caps", async () => fixture(async (_dir, ledger) => {
  const gameplayLedger=join(_dir,"gameplay-ledger.json");
  await assert.rejects(initializeAnthropicBudgetLedger("unknown-grant",gameplayLedger),{code:"PROVIDER_UNAVAILABLE"});
  await initializeAnthropicBudgetLedger(gameplayGrant,gameplayLedger);
  const before=await readFile(gameplayLedger,"utf8");
  await assert.rejects(initializeAnthropicBudgetLedger(gameplayGrant,gameplayLedger));
  assert.equal(await readFile(gameplayLedger,"utf8"),before);
  const env=envFor(gameplayLedger,{CUBICLE_LIVE_TEST:gameplayGrant});
  assert.equal(anthropicProviderMode(env),"live (Claude Haiku · task budget active)");
  let dispatches=0, body;
  const provider=createAnthropicProvider({env,fetchFn:async(_url,options)=>{
    dispatches++; body=JSON.parse(options.body);
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:7,output_tokens:3},content:[{type:"text",text:"ready"}]}),{status:200});
  }});
  const result=await provider({role:"npc",system:"reply",messages:[{role:"user",content:"hello"}]});
  assert.equal(result.text,"ready"); assert.equal(dispatches,1);
  const saved=JSON.parse(await readFile(gameplayLedger,"utf8"));
  const inputBound=Buffer.byteLength(JSON.stringify(body),"utf8")+2048;
  assert.equal(saved.grant,gameplayGrant); assert.equal(saved.model,"claude-haiku-5-5");
  assert.deepEqual(saved.caps,{calls:350,reservedTokens:5_000_000,outputTokens:1024,usd:0.5,usdPerMillionInputTokens:0.1,usdPerMillionOutputTokens:0.5,maxInputBytes:100_000});
  assert.equal(saved.calls,1); assert.equal(saved.reservedTokens,inputBound+body.max_tokens);
  assert.equal(saved.reservedUsd,inputBound*0.1/1_000_000+body.max_tokens*0.5/1_000_000);
  assert.equal(saved.actualInputTokens,7); assert.equal(saved.actualOutputTokens,3);
  assert.ok(saved.reservedTokens<=5_000_000); assert.ok(saved.reservedUsd<=0.5);
  assert.equal(JSON.parse(await readFile(ledger,"utf8")).calls,0,"the earlier grant ledger must remain unchanged");
}));

test("gameplay grant rejects oversized inputs and grant/ledger mismatches before dispatch", async () => fixture(async (_dir, oldLedger) => {
  const gameplayLedger=join(_dir,"gameplay-ledger.json");
  await initializeAnthropicBudgetLedger(gameplayGrant,gameplayLedger);
  let dispatches=0;
  const env=envFor(gameplayLedger,{CUBICLE_LIVE_TEST:gameplayGrant});
  const provider=createAnthropicProvider({env,fetchFn:async()=>{dispatches++;throw new Error("unexpected dispatch");}});
  await assert.rejects(provider({role:"npc",messages:[{role:"user",content:"x".repeat(100_001)}]}),{code:"LLM_BUDGET_EXCEEDED"});
  assert.equal(dispatches,0); assert.equal(JSON.parse(await readFile(gameplayLedger,"utf8")).calls,0);
  const oldBefore=await readFile(oldLedger,"utf8");
  const mismatched=createAnthropicProvider({env:envFor(oldLedger,{CUBICLE_LIVE_TEST:gameplayGrant}),fetchFn:async()=>{dispatches++;}});
  await assert.rejects(mismatched({role:"npc",messages:[{role:"user",content:"hello"}]}),{code:"LLM_BUDGET_UNAVAILABLE"});
  assert.equal(await readFile(oldLedger,"utf8"),oldBefore);
  assert.equal(dispatches,0);
  const unknown=createAnthropicProvider({env:envFor(gameplayLedger,{CUBICLE_LIVE_TEST:"all-scenarios-live-gameplay-extra"}),fetchFn:async()=>{dispatches++;}});
  await assert.rejects(unknown({role:"npc",messages:[{role:"user",content:"hello"}]}),{code:"PROVIDER_UNAVAILABLE"});
  assert.equal(dispatches,0);
}));

test("gameplay grant permits its final dispatch and refuses the next one", async () => fixture(async (_dir) => {
  const gameplayLedger=join(_dir,"gameplay-ledger.json");
  await initializeAnthropicBudgetLedger(gameplayGrant,gameplayLedger);
  const nearCap=JSON.parse(await readFile(gameplayLedger,"utf8")); nearCap.calls=349;
  await writeFile(gameplayLedger,JSON.stringify(nearCap));
  let dispatches=0;
  const provider=createAnthropicProvider({env:envFor(gameplayLedger,{CUBICLE_LIVE_TEST:gameplayGrant}),fetchFn:async()=>{
    dispatches++;
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:1,output_tokens:1},content:[{type:"text",text:"ok"}]}),{status:200});
  }});
  await provider({role:"npc",messages:[{role:"user",content:"last allowed"}]});
  await assert.rejects(provider({role:"npc",messages:[{role:"user",content:"over cap"}]}),{code:"LLM_BUDGET_EXCEEDED"});
  const saved=JSON.parse(await readFile(gameplayLedger,"utf8"));
  assert.equal(saved.calls,350); assert.equal(dispatches,1); assert.equal(saved.actualInputTokens,1); assert.equal(saved.actualOutputTokens,1);
}));

test("Anthropic configuration pins Haiku for every role without changing Groq defaults", () => {
  const anthro = loadConfig({LLM_PROVIDER:"anthropic",CLASSIFIER_MODEL:"ignored/provider-override"});
  for (const role of ["classifier","npc","judge","coach"]) {
    assert.equal(anthro[role].model,"claude-haiku-5-5");
    assert.ok(anthro[role].maxTokens <= 1024);
    assert.equal(anthro[role].reasoningEffort,"low");
  }
  assert.equal(loadConfig({}).npc.model,"qwen/qwen3.8-27b");
  const provider=createAnthropicProvider({env:{},config:anthro,fetchFn:async()=>{throw new Error("not dispatched");}});
  assert.equal(provider.timeoutMs,29_000);
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
  const out = await provider({role:"classifier",system:"policy",messages:[{role:"user",content:"hello"}],schema:{type:"object"}});
  assert.equal(out.text,'{"events":[]}');
  assert.equal(out.model,"claude-haiku-5-5");
  assert.equal(request.url,"https://api.anthropic.com/v1/messages");
  assert.equal(request.options.headers["x-api-key"],"test-only-fake-key");
  assert.equal(request.body.model,"claude-haiku-5-5");
  assert.ok(request.body.max_tokens <= 1024);
  assert.equal(request.body.system,"policy");
  assert.deepEqual(request.body.messages,[{role:"user",content:"hello"}]);
  assert.deepEqual(request.body.output_config,{effort:"low"});
  for (const forbidden of ["temperature","top_p","top_k"]) assert.equal(Object.hasOwn(request.body,forbidden),false);
  const saved = JSON.parse(await readFile(ledger,"utf8"));
  assert.equal(saved.calls,1); assert.equal(saved.actualInputTokens,12); assert.equal(saved.actualOutputTokens,4);
}));

test("Anthropic classifier accepts the shared open-params schema through local validation", async () => fixture(async (_dir, ledger) => {
  let request;
  const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async (_url,options)=>{
    request=JSON.parse(options.body);
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:8,output_tokens:8},content:[
      {type:"text",text:JSON.stringify({events:[{type:"asked_for_help",params:{person:"Maya"}}],clarify:[]})},
    ]}),{status:200});
  }});
  const result=await classifyTurn({provider,system:"Return the requested JSON.",timeoutMs:1000},{
    text:"Could you help me?",lastTurns:[],userKnown:[],clock:{day:1},
  });
  assert.deepEqual(result.events,[{type:"asked_for_help",params:{person:"Maya"}}]);
  assert.equal(request.model,"claude-haiku-5-5");
  assert.deepEqual(request.output_config,{effort:"low"});
  assert.equal(JSON.parse((await readFile(ledger,"utf8"))).actualOutputTokens,8);
}));

test("schema-bearing Anthropic output accepts one exact JSON fence; NPC prose stays unchanged", async () => fixture(async (_dir, ledger) => {
  const fenced='```json\n{"events":[{"type":"asked_requirement_details","params":{}}],"clarify":[]}\n```';
  let calls=0;
  const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async(_url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:4,output_tokens:5},content:[{type:"text",text:body.system==="structured"?fenced:"```json\\nnot npc json\\n```"}]}),{status:200});
  }});
  const schema={type:"object",required:["events","clarify"],properties:{events:{type:"array"},clarify:{type:"array"}}};
  const structured=await provider({role:"classifier",system:"structured",messages:[{role:"user",content:"classify"}],schema});
  assert.equal(structured.text,'{"events":[{"type":"asked_requirement_details","params":{}}],"clarify":[]}');
  const prose=await provider({role:"npc",system:"npc",messages:[{role:"user",content:"reply"}]});
  assert.equal(prose.text,"```json\\nnot npc json\\n```");
  assert.equal(calls,2);
}));

test("prose-wrapped, multiple-fence, wrong-label and truncated structured output retain bounded fallback", async () => fixture(async (_dir, ledger) => {
  for(const malformed of [
    'Here is the JSON:\n```json\n{"events":[],"clarify":[]}\n```',
    '```json\n{"events":[],"clarify":[]}\n```\n```json\n{"events":[],"clarify":[]}\n```',
    '```javascript\n{"events":[],"clarify":[]}\n```',
    '```json\n{"events":[],"clarify":[]}\n',
    '{"events":[],"clarify":[]} {"events":[],"clarify":[]}',
  ]) {
    let calls=0;
    const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async()=>{
      calls++;
      return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:2,output_tokens:2},content:[{type:"text",text:malformed}]}),{status:200});
    }});
    const result=await classifyTurn({provider,system:"Return JSON.",timeoutMs:1000},{text:"What remains?",lastTurns:[],userKnown:[],clock:{day:0}});
    assert.deepEqual(result.events,[]);
    assert.equal(calls,2);
  }
}));

test("fenced classifier events flow through the real prototype pipeline without forced engine events", async () => fixture(async (_dir, ledger) => {
  const pkg=prototypeRegistry.getScenario("prototype_manager"), runtime={scenarioId:pkg.spec.id,schemaVersion:pkg.identity.schemaVersion,
    policyId:pkg.policy.id,policyVersion:pkg.policy.version,engine:pkg.policy.engine,rules:pkg.policy.rules,language:pkg.policy.language,identity:pkg.identity,spec:pkg.spec};
  const session=engine.createSession(pkg.spec,{seed:83,runtime}); session.identity=pkg.identity;
  const convo=createConversation(), classifierReplies=[];
  const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async(_url,options)=>{
    const body=JSON.parse(options.body);
    if(body.system.startsWith("# Classifier prompt v5")) {
      const input=JSON.parse(body.messages[0].content), message=input.message;
      let events=[];
      if(/work remains/i.test(message)) events=[{type:"gave_honest_status",params:{}},{type:"asked_requirement_details",params:{}}];
      else if(/protect the date/i.test(message)) events=[{type:"pushed_back_constructively",params:{}},{type:"proposed_scope_cut",params:{}}];
      else if(/deliver Friday/i.test(message)) events=[{type:"committed_deadline",params:{day:3}}];
      else if(/To recap:/i.test(message)) events=[{type:"recapped_agreement",params:{}}];
      const text=JSON.stringify({events,clarify:[]});
      classifierReplies.push({message,events});
      return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:10,output_tokens:6},content:[{type:"text",text:`\`\`\`json\n${text}\n\`\`\``}]}),{status:200});
    }
    const text=body.system.includes("engine authorizes acceptance")?"That plan works for me."
      :body.system.includes("engine authorizes closing")?"We have a plan."
        :"I hear you. What would help clarify the next step?";
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:10,output_tokens:6},content:[{type:"text",text}]}),{status:200});
  }});
  const turn=(text)=>runTurn({session,scenario:pkg.spec,convo,npcId:"maya",text,engine,runtime,providers:{classify:provider,npc:provider}});
  const g1=await turn("To be honest, what work remains and what is done?");
  assert.equal(g1.trace.events.includes("asked_requirement_details"),true); assert.equal(session.goals["MGR-G1"].status,"done");
  const g2=await turn("To protect the date, we can cut scope.");
  assert.equal(g2.trace.events.includes("proposed_scope_cut"),true); assert.equal(session.goals["MGR-G2"].status,"done");
  await turn("I will deliver Friday.");
  assert.equal(session.commitments.at(-1)?.accepted_with,"maya");
  const recap=await turn("To recap: the delivery work is owned by me, and the next step is to send the checklist.");
  assert.equal(recap.trace.events.includes("recapped_agreement"),true);
  assert.equal(session.goals["MGR-G3"].status,"done"); assert.equal(session.endReason,"goals_complete");
  assert.deepEqual(classifierReplies.map(({events})=>events.map((event)=>event.type)),[
    ["gave_honest_status","asked_requirement_details"],["pushed_back_constructively","proposed_scope_cut"],
    ["committed_deadline"],["recapped_agreement"],
  ]);
  assert.equal(JSON.parse(await readFile(ledger,"utf8")).calls,8,"four classifier and four NPC dispatches use the mock adapter");
}));

test("malformed Anthropic classifier JSON follows the bounded retry and empty fallback", async () => fixture(async (_dir, ledger) => {
  let calls=0;
  const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async (_url,options)=>{
    calls++;
    const body=JSON.parse(options.body);
    assert.deepEqual(body.output_config,{effort:"low"});
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:2,output_tokens:1},content:[{type:"text",text:"not json"}]}),{status:200});
  }});
  const result=await classifyTurn({provider,system:"Return the requested JSON.",timeoutMs:1000},{
    text:"Could you help me?",lastTurns:[],userKnown:[],clock:{day:1},
  });
  assert.deepEqual(result.events,[]);
  assert.equal(calls,2);
  assert.equal(JSON.parse(await readFile(ledger,"utf8")).calls,2);
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
  const outcomes=await Promise.allSettled(Array.from({length:24},(_,i)=>provider({role:"npc",messages:[{role:"user",content:`parallel ${i}`}]})));
  const fulfilled=outcomes.filter((r)=>r.status==="fulfilled").length;
  assert.ok(fulfilled>=1);
  assert.ok(outcomes.filter((r)=>r.status==="rejected").every((r)=>r.reason?.code==="LLM_BUDGET_UNAVAILABLE"));
  let saved=JSON.parse(await readFile(ledger,"utf8"));
  assert.equal(saved.calls,dispatched); assert.ok(saved.calls<=24);
  assert.equal(saved.actualInputTokens,fulfilled); assert.equal(saved.actualOutputTokens,fulfilled);
  assert.ok(saved.reservedTokens<=200_000); assert.ok(saved.reservedUsd<=4);
  const slow=createAnthropicProvider({env:envFor(ledger),timeoutMs:15,fetchFn:async()=>({ok:true,body:{getReader(){return {read:()=>new Promise(()=>{}),releaseLock(){}};}}})});
  const callsBeforeTimeout=saved.calls;
  await assert.rejects(slow({role:"npc",messages:[{role:"user",content:"timeout"}]}),{code:"TIMEOUT"});
  saved=JSON.parse(await readFile(ledger,"utf8")); assert.equal(saved.calls,callsBeforeTimeout+1);
  const huge=createAnthropicProvider({env:envFor(ledger),fetchFn:async()=>new Response("x".repeat(256_001),{status:200,headers:{"content-type":"application/json"}})});
  await assert.rejects(huge({role:"npc",messages:[{role:"user",content:"large body"}]}),{code:"OUTPUT_INVALID"});
  saved=JSON.parse(await readFile(ledger,"utf8")); assert.equal(saved.calls,callsBeforeTimeout+2);
}));

test("concurrent reservations near the call cap cannot overspend", async () => fixture(async (_dir, ledger) => {
  const capped={...initialLedger,grant,model:"claude-haiku-5-5",caps:{calls:40,reservedTokens:200000,outputTokens:1024,usd:4,usdPerMillionReservedTokens:2.5},calls:39};
  await writeFile(ledger,JSON.stringify(capped));
  let dispatched=0;
  const provider=createAnthropicProvider({env:envFor(ledger),fetchFn:async()=>{
    dispatched++;
    return new Response(JSON.stringify({stop_reason:"end_turn",usage:{input_tokens:1,output_tokens:1},content:[{type:"text",text:"ok"}]}),{status:200});
  }});
  const outcomes=await Promise.allSettled(Array.from({length:4},(_,i)=>provider({role:"npc",messages:[{role:"user",content:`near cap ${i}`}]})));
  assert.equal(outcomes.filter((r)=>r.status==="fulfilled").length,1);
  const rejected=outcomes.filter((r)=>r.status==="rejected");
  assert.equal(rejected.length,3);
  assert.ok(rejected.every((r)=>["LLM_BUDGET_EXCEEDED","LLM_BUDGET_UNAVAILABLE"].includes(r.reason?.code)));
  const saved=JSON.parse(await readFile(ledger,"utf8"));
  assert.equal(saved.calls,40); assert.equal(dispatched,1);
  assert.equal(saved.actualInputTokens,1); assert.equal(saved.actualOutputTokens,1);
  assert.ok(saved.reservedTokens<=200_000); assert.ok(saved.reservedUsd<=4);
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
