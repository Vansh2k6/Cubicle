import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { projectGuidance } from "../../src/guidance.js";

const goals = (done = []) => ["G1", "G2", "G3"].map((id) => ({ id, status: done.includes(id) ? "done" : "pending" }));

test("public goal states lead through Snehal, Vansh, Snehal, then reflection", () => {
  assert.match(projectGuidance({ goals: goals() }).description, /Snehal/);
  assert.match(projectGuidance({ goals: goals(["G1"]) }).description, /Vansh/);
  assert.match(projectGuidance({ goals: goals(["G1", "G2"]) }).description, /Snehal/);
  assert.match(projectGuidance({ goals: goals(["G1", "G2", "G3"]) }).heading, /reflect/i);
});

test("hints stay optional, useful, and limited to public state", () => {
  const sam = projectGuidance({ goals: goals(["G1"]), currentNpc: "sam", hint: "Ask for advice." });
  assert.match(sam.question, /Prathamesh/);
  assert.equal(sam.hint, "Ask for advice.");
  assert.match(projectGuidance({ goals: goals(["G1"]) }).question, /Vansh/);
});

test("completion and reset direction are explicit without interpreting goal labels", () => {
  const hostile = [{ id: "G1", status: "done", label: '<img src=x>' }, { id: "G2", status: "pending" }];
  assert.equal(projectGuidance({ goals: hostile }).heading, "Check in with Vansh");
  const ended = projectGuidance({ goals: [], ended: true, currentNpc: "sam" });
  assert.match(ended.description, /View your debrief|continue exploring/);
  assert.equal(ended.question, "");
  assert.match(projectGuidance({ goals: [] }).description, /Snehal/);
});

test("client escapes public guidance and keeps modal-safe goals and hints reachable", () => {
  const source = readFileSync(new URL("../../src/main.js", import.meta.url), "utf8");
  assert.match(source, /escapeHtml\(guidance\.objective\)/);
  assert.match(source, /escapeHtml\(guidance\.hint\)/);
  assert.match(source, /<details class="guidance-hint"><summary>Goals & hints<\/summary><section class="public-objective"/);
  assert.match(source, /\$\{goals \? `<ul class="goal-list"/);
  assert.match(source, /<small id="text-hint">Enter sends · Esc leaves this conversation\$\{voiceAvailable \? " · Ctrl\+Shift\+Space records" : ""\}<\/small>/);
  assert.doesNotMatch(source, /id="text-hint">\$\{state\.sharedHint/);
  assert.match(source, /button,input,textarea,select,summary,\[tabindex="0"\]/);
  assert.match(source, /el\.getClientRects\(\)\.length > 0/);
});
