import test from "node:test";
import assert from "node:assert/strict";
import {prototypeRegistry, defaultRegistry, publicScenario} from "../../services/api/scenarioRegistry.js";
import {registeredPrivateNeedles} from "../../scripts/registered-private-sources.mjs";
import {buildNpcPrompt} from "../promptBuilder.js";
import {classifyTurn, buildClassifierInput} from "../classifier.js";

test("prototype facts are included in private bundle needles without banning public selector IDs", () => {
  const needles = registeredPrivateNeedles({allPackages:prototypeRegistry.allPackages,
    publishedPackages:prototypeRegistry.allPackages,
    listScenarios:()=>prototypeRegistry.allPackages().map(publicScenario)});
  for(const pkg of prototypeRegistry.allPackages().filter(pkg=>pkg.prototypeSources)) {
    for(const fact of pkg.spec.facts) assert.ok(needles.has(fact.content.en.toLowerCase()),`${pkg.spec.id}/${fact.id}`);
    assert.equal(needles.has(pkg.spec.id),false);
  }
  assert.deepEqual(prototypeRegistry.listScenarios(),defaultRegistry.listScenarios());
  for(const id of ["missed_deadline","workplace_intimidation"]) assert.equal(prototypeRegistry.getScenario(id),defaultRegistry.getScenario(id));
});

test("prototype prompt binding is used by the real classifier and excludes sealed content", async () => {
  const pkg=prototypeRegistry.getScenario("prototype_manager"), runtime={scenarioId:pkg.spec.id,schemaVersion:pkg.identity.schemaVersion,
    policyId:pkg.policy.id,policyVersion:pkg.policy.version,engine:pkg.policy.engine,rules:pkg.policy.rules,language:pkg.policy.language,identity:pkg.identity,spec:pkg.spec};
  const output=await classifyTurn({scenario:pkg.spec,runtime,provider:async({system,messages})=>{
    assert.match(system,/Classifier prompt prototype-v1/);
    const payload=system+JSON.stringify(messages);
    for(const fact of pkg.spec.facts) assert.equal(payload.includes(fact.content.en),false);
    return {text:'{"events":[{"type":"asked_why_urgent","params":{}}],"clarify":[]}'};
  }},buildClassifierInput({text:"Why is this urgent?"}));
  assert.equal(output.events[0].type,"asked_why_urgent");
  for(const npc of pkg.spec.npcs) {
    const prompt=buildNpcPrompt({scenario:pkg.spec,runtime,npcId:npc.id,act:"greet"});
    assert.match(prompt.system,/NPC prompt prototype-v1/);
    for(const fact of pkg.spec.facts) assert.equal(prompt.system.includes(fact.content.en),false);
  }
  const fact=pkg.spec.facts[0], pendingReveal={factId:fact.id,content:fact.content.en};
  const reveal=buildNpcPrompt({scenario:pkg.spec,runtime,npcId:fact.owner,act:`reveal_fact:${fact.id}`,pendingReveal});
  assert.match(reveal.system,/Quote the authorised disclosure exactly/);
  assert.throws(()=>buildNpcPrompt({scenario:pkg.spec,runtime,npcId:pkg.spec.npcs.find(npc=>npc.id!==fact.owner).id,act:`reveal_fact:${fact.id}`,pendingReveal}),/not owned/);
});
