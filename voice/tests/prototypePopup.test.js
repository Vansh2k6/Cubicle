import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const source = readFileSync(new URL("../../src/prototypeEntry.js", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "").replace("export function renderPrototypeEntry", "function renderPrototypeEntry");

function fixture({rejectCompose = false} = {}) {
  const nodes = new Map(), requests = [], starts = [];
  class Node {
    value = ""; disabled = false;
    set innerHTML(value) {
      this.html = value;
      for (const match of value.matchAll(/id="([^"]+)"/g)) nodes.set(`#${match[1]}`, new Node());
      if (value.includes('id="prototype-start"')) nodes.get("#prototype-start").disabled = true;
    }
    get innerHTML() { return this.html || ""; }
    querySelector(selector) { return nodes.get(selector); }
  }
  const host = new Node();
  nodes.set("[data-prototype-error]", new Node());
  const scenario = {id:"missed_deadline", title:"A missed deadline", briefing:"Discuss the overdue work.", goals:[{label:"Agree a next step"}]};
  const custom = {id:"prototype_omitted_feature", title:"Omitted <feature>", briefing:"Explain <scope> safely.", goals:[{label:"Own the <omission>"}]};
  const context = {
    DEFAULT_SLIDERS:{}, getScenario:async () => scenario,
    composePrototypeScenario:async (text) => {
      requests.push(text);
      if (rejectCompose) throw Object.assign(new Error("unsupported"), {status:422});
      return {scenario_id:custom.id, scenario:custom};
    },
    createSession:async (id) => { starts.push(id); return {session_id:"local", briefing:custom.briefing, scenario:{npcs:[{id:"maya",name:"Snehal",role:"Manager"}]}, provider_mode:"offline"}; },
    endSession:async () => {}, getDebrief:async () => {}, sendTurn:async () => {throw new Error("turns not expected");}, newKey:() => "key",
  };
  runInNewContext(`${source}\nthis.renderPopup = renderPrototypeEntry;`, context);
  context.renderPopup(host);
  return {host,nodes,requests,starts};
}
const settle = () => new Promise(resolve => setImmediate(resolve));

test("popup focuses on the description, keeps optional details and explicit local review", async () => {
  const {host,nodes,starts} = fixture(); await settle();
  assert.doesNotMatch(host.innerHTML,/Choose one of five|Check the briefing/);
  assert.match(host.innerHTML,/<details class="prototype-compose"><summary>Create a custom scenario/);
  assert.match(host.innerHTML,/prototype_manager/);
  assert.match(host.innerHTML,/prototype_hr/);
  assert.match(host.innerHTML,/prototype_client/);
  assert.match(host.innerHTML,/prototype_coworker/);
  const preview = nodes.get("#prototype-preview").innerHTML;
  assert.equal(preview.split("Discuss the overdue work.").length - 1,1);
  assert.match(preview,/<details class="prototype-goals"><summary>Practice goals/);
  assert.match(preview,/Agree a next step/);
  assert.equal(nodes.get("#prototype-start").disabled,true);
  assert.deepEqual(starts,[]);
  nodes.get("#prototype-checked").onchange({target:{checked:true}});
  assert.equal(nodes.get("#prototype-start").disabled,false);
});

test("custom generation escapes public wording and starts the exact selected scenario", async () => {
  const {nodes,requests,starts} = fixture(); await settle();
  nodes.get("#prototype-request").value = "I forgot to implement a feature in the product.";
  await nodes.get("#prototype-compose").onclick();
  const preview = nodes.get("#prototype-preview").innerHTML;
  assert.match(preview,/Explain &lt;scope&gt; safely\./);
  assert.doesNotMatch(preview,/<scope>|<feature>|<omission>/);
  assert.equal(nodes.get("#prototype-start").disabled,true);
  nodes.get("#prototype-checked").onchange({target:{checked:true}});
  await nodes.get("#prototype-start").onclick();
  assert.deepEqual(requests,["I forgot to implement a feature in the product."]);
  assert.deepEqual(starts,["prototype_omitted_feature"]);
});

test("unsupported requests retain an actionable error without launching a session", async () => {
  const {nodes,starts} = fixture({rejectCompose:true}); await settle();
  nodes.get("#prototype-request").value = "Build a space battle";
  await nodes.get("#prototype-compose").onclick();
  assert.match(nodes.get("[data-prototype-error]").textContent,/outside the two supported client changes/);
  assert.deepEqual(starts,[]);
});
