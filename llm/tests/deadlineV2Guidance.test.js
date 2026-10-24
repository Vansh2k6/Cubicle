import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {projectGuidance} from "../../src/guidance.js";
import {nextHintFor} from "../pipeline.js";
import {publicScenario} from "../../services/api/scenarioRegistry.js";
import {pkg, setup} from "../../scoring/tests/fixtures/deadlineV2Record.js";
const metadata = publicScenario(pkg);
const goals = (ids) => metadata.goals.map((g) => ({...g, status: ids.includes(g.id) ? "done" : "pending"}));
test("public v2 guidance directs technical readiness to engineering/QA and external alignment to client/manager", () => {
  const initial = projectGuidance({...metadata, scenarioId: metadata.id, goals: goals([])});
  assert.match(initial.description, /Snehal/);
  const technical = projectGuidance({scenarioId: metadata.id, npcs: metadata.npcs, goals: goals(["G1"])});
  assert.match(technical.description, /Vansh/); assert.match(technical.description, /Prathamesh/);
  const external = projectGuidance({scenarioId: metadata.id, npcs: metadata.npcs, goals: goals(["G1", "G2"]), currentNpc: "client"});
  assert.match(external.description, /Rohan/); assert.match(external.description, /Snehal/);
  assert.match(external.question, /what the client needs/);
  const serverHint = nextHintFor({G1: {status: "done"}}, {...metadata, goals: goals(["G1"])});
  assert.equal(serverHint, technical.hint);
  const serialized = JSON.stringify([initial, technical, external, serverHint]);
  for (const secret of [...pkg.spec.facts.map((f) => f.content.en), "Monday", "reserved pair", "save acknowledgement", "plan_model", "day 2", "half", "HR"]) assert.ok(!serialized.includes(secret), secret);
  assert.equal(projectGuidance({scenarioId: metadata.id, npcs: metadata.npcs, ended: true}).question, "");
  // Legacy remains the unchanged original path.
  assert.equal(projectGuidance({goals: goals(["G1"])}).heading, "Check in with Vansh");
});
test("v2 explicit/max-turn endings no longer suggest another live task", async () => {
  const f = setup(); let result;
  for (let i = 0; i < 20; i++) result = await f.turn("jordan", "Hello.");
  assert.equal(result.endReason, "max_turns"); assert.equal(result.publicState.next_hint, "The conversation has ended.");
});
test("office public cast updates physical labels safely and restores legacy labels without a remote avatar", () => {
  const source = readFileSync(new URL("../../src/office.js", import.meta.url), "utf8");
  const method = source.slice(source.indexOf("    setPublicCast(cast) {"), source.indexOf("    reset() {", source.indexOf("    setPublicCast(cast) {"))).trim().replace(/,$/, "");
  const baselineLabels = {maya: {name: "Snehal", role: "Your manager"}, jordan: {name: "Vansh", role: "Your teammate"}, sam: {name: "Prathamesh", role: "People & culture"}};
  const nodes = Object.fromEntries(Object.keys(baselineLabels).map((id) => [id, {strong: {textContent: "", append() {}}, small: {textContent: ""}}]));
  const npcs = Object.fromEntries(Object.entries(nodes).map(([id, node]) => [id, {label: {querySelector: (selector) => selector === "strong" ? node.strong : node.small}}]));
  const update = runInNewContext(`({${method}}).setPublicCast`, {npcs, baselineLabels, document: {createElement: () => ({className: "", textContent: ""})}});
  update(metadata.npcs);
  assert.equal(nodes.sam.strong.textContent, "Prathamesh Surwase"); assert.equal(nodes.sam.small.textContent, "QA/release engineer");
  update([{sceneAnchor: "sam", name: "<img src=x>", role: "<script>bad()</script>"}, metadata.npcs.find((n) => n.id === "client")]);
  assert.equal(nodes.sam.strong.textContent, "<img src=x>"); assert.equal(nodes.sam.small.textContent, "<script>bad()</script>");
  assert.deepEqual(Object.keys(npcs), ["maya", "jordan", "sam"]);
  update(null); assert.equal(nodes.sam.small.textContent, "People & culture");
  const main = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  assert.match(main, /office = instance;\s+office\.setPublicCast\?\.\(state\.scenarioMetadata\?\.npcs\)/);
  assert.match(main, /function syncPeople\(\) \{\s+office\?\.setPublicCast\?\.\(state\.scenarioMetadata\?\.npcs\)/);
});
