import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { HR_BINDING, publicCast } from "../../shared/presentation.js";
import { parseScenarioMetadata } from "../../src/scenarioMetadata.js";
import {readProgress, saveProgress, summaryFromDebrief} from "../../src/progress.js";

const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
const office = readFileSync(new URL("../../src/office.js", import.meta.url), "utf8");

const hrActor = { id: "hr", name: "Vedant Shitole", role: "HR" };

test("workplace intimidation admits the registered HR scene actor only through public metadata", () => {
  const actors = [
    { id: "maya", name: "Snehal Mane", role: "Manager" },
    { id: "jordan", name: "Vansh Singh", role: "Teammate" },
    { id: "sam", name: "Prathamesh Surwase", role: "People & culture" },
    hrActor,
  ];
  assert.throws(() => publicCast(actors));
  const cast = publicCast(actors, { maya: {sceneAnchor: "maya", voiceId: "en_US-lessac-medium"}, jordan: {sceneAnchor: "jordan", voiceId: "en_US-ryan-medium"}, sam: {sceneAnchor: "sam", voiceId: "en_US-amy-medium"}, hr: HR_BINDING });
  assert.deepEqual(cast.at(-1), {
    ...hrActor,
    sceneAnchor: "hr",
    voiceId: "en_US-ryan-medium",
  });
  const metadata = parseScenarioMetadata({
    id: "workplace_intimidation",
    title: "Reporting Workplace Intimidation",
    briefing: "Seek a safer way to work.",
    goals: [
      { id: "G1", label: "Discuss observable events Vansh", requires: [] },
      { id: "G2", label: "Explore support Prathamesh", requires: [] },
      { id: "G3", label: "Agree response plan Vedant", requires: [] },
    ],
    npcs: cast,
  });
  assert.equal(metadata.npcs.at(-1).sceneAnchor, "hr");
});

test("email selector opens the typed workplace package and keeps call scripted", () => {
  assert.match(source, /email:\s*\{[\s\S]*?title: "Reporting Workplace Intimidation"/);
  assert.match(source, /email: "workplace_intimidation"/);
  assert.match(source, /if \(state\.scenario === "deadline" \|\| state\.scenario === "email"\) \{/);
  assert.match(source, /createSession\(state\.scenario === "email" \? "workplace_intimidation" : "deadline"/);
  assert.match(source, /getScenario\(state\.scenario === "email" \? "workplace_intimidation" : "deadline"/);
  assert.match(source, /physicalActorId\(anchor\)[\s\S]*?sceneAnchor === anchor/);
});

test("the HR model and label are hidden until its metadata anchor is present", () => {
  assert.match(office, /hr:\s*\{[\s\S]*?name: "Vedant Shitole"/);
  assert.match(office, /npcs\.hr\.root\.visible = false/);
  assert.match(office, /if \(anchor === "hr"\) \{[\s\S]*?p\.root\.visible = !!actor/);
  assert.match(office, /if \(!n\.root\.visible\) continue/);
});

test("deadline and HR feedback retain their scenario IDs through save, reload and list filtering", () => {
  const routing = source.match(/const API_SCENARIOS[^;]+;/)[0] + source.match(/const apiScenarioId[^;]+;/)[0] + source.match(/const selectorScenarioId[^;]+;/)[0];
  const {apiScenarioId, selectorScenarioId} = Function(routing + ";return {apiScenarioId,selectorScenarioId}")();
  assert.match(source, /summaryFromDebrief\(sessionId, apiScenarioId\(attemptScenario\), latest\)/);
  const ids = ["deadline", "email", "call", "workplace_intimidation"];
  let stored;
  const storage = {getItem: () => stored, setItem: (_, value) => {stored = value;}};
  const packet = {total: 30, band: "Developing", scoring_version: 2, breakdown: ["goals", "hidden_facts", "integrity", "relationship", "rubric"].map((id) => ({id, points: id === "goals" ? 30 : 0}))};
  const attempts = ["missed_deadline", "workplace_intimidation"].map((id, index) => summaryFromDebrief("session" + index, apiScenarioId(selectorScenarioId(id)), packet));
  assert.equal(saveProgress(storage, {complete: {}, attempts}, ids), true);
  const loaded = readProgress(storage, ids);
  assert.equal(loaded.attempts.length, 2);
  assert.equal(loaded.attempts.filter((a) => a.scenario === apiScenarioId("deadline")).length, 1);
  assert.equal(loaded.attempts.filter((a) => a.scenario === apiScenarioId("email")).length, 1);
});
