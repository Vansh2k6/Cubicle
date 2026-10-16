import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateScenario, publicScenario } from "../scenarioValidator.js";

const root = dirname(fileURLToPath(import.meta.url));
const specPath = join(root, "..", "..", "scenarios", "missed_deadline.json");

function load() {
  return JSON.parse(readFileSync(specPath, "utf8"));
}

function hasCode(result, code) {
  return result.errors.some((e) => e.code === code);
}

test("valid scenario passes", () => {
  const r = validateScenario(load());
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.errors, []);
});

test("NO_OWNER when fact owner is unknown", () => {
  const s = load();
  s.facts[0].owner = "nobody";
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "NO_OWNER"), JSON.stringify(r.errors));
});

test("NO_TRIGGERS when fact has no triggers", () => {
  const s = load();
  s.facts[0].triggers = [];
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "NO_TRIGGERS"), JSON.stringify(r.errors));
});

test("UNKNOWN_EVENT for trigger outside taxonomy", () => {
  const s = load();
  s.facts[0].triggers = ["bogus_event_xyz"];
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "UNKNOWN_EVENT"), JSON.stringify(r.errors));
});

test("GOAL_FACT_OVERLAP when goal event doubles as fact trigger", () => {
  const s = load();
  const g2 = s.goals.find((g) => g.id === "G2");
  g2.done_when.push("event:asked_for_help");
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "GOAL_FACT_OVERLAP"), JSON.stringify(r.errors));
});

test("REQUIRES_CYCLE on cyclic goal requires", () => {
  const s = load();
  s.goals.find((g) => g.id === "G1").requires = ["G3"];
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "REQUIRES_CYCLE"), JSON.stringify(r.errors));
});

test("WEIGHT_SUM when goal weights do not sum to 30", () => {
  const s = load();
  s.goals[0].weight = 5;
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "WEIGHT_SUM"), JSON.stringify(r.errors));
});

test("MISSING_CLOCK_MODEL when clock is missing", () => {
  const s = load();
  delete s.clock;
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "MISSING_CLOCK_MODEL"), JSON.stringify(r.errors));
});

test("CALENDAR_DATE when clock carries calendar date/timezone", () => {
  const s = load();
  s.clock.date = "2026-10-13";
  s.clock.timezone = "Asia/Kolkata";
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "CALENDAR_DATE"), JSON.stringify(r.errors));
});

test("PRIVATE_UNDER_PUBLIC when private canon leaks into public", () => {
  const s = load();
  s.canon.public.client_cutoff = JSON.parse(JSON.stringify(s.canon.private.client_cutoff));
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "PRIVATE_UNDER_PUBLIC"), JSON.stringify(r.errors));
});

test("DUPLICATE_ID on repeated fact id", () => {
  const s = load();
  s.facts.push(JSON.parse(JSON.stringify(s.facts[0])));
  const r = validateScenario(s);
  assert.equal(r.ok, false);
  assert.ok(hasCode(r, "DUPLICATE_ID"), JSON.stringify(r.errors));
});

test("publicScenario leaks nothing private", () => {
  const s = load();
  const pub = publicScenario(s);
  const text = JSON.stringify(pub);
  const secrets = [];
  for (const f of s.facts) {
    secrets.push(f.content.en, f.unlock_question.en, ...f.leak_keywords.en, ...f.triggers);
  }
  secrets.push(
    "Friday",
    "holding them off",
    "reusable module",
    "same-day heads-up",
    "client_cutoff",
    "F2_delivered",
    "help_accepted_with_jordan",
    "press_for_date",
    "callback_commitment",
    "canon.private.client_cutoff.day",
  );
  for (const secret of secrets) {
    assert.ok(!text.includes(secret), `public view leaks: ${secret}`);
  }
  // Shape: briefing + visible goal labels + npc names only.
  assert.deepEqual(
    Object.keys(pub).sort(),
    ["briefing", "end", "goals", "id", "locales", "npcs", "player", "title", "version"],
  );
  for (const n of pub.npcs) assert.deepEqual(Object.keys(n).sort(), ["id", "name", "role"]);
  for (const g of pub.goals) assert.deepEqual(Object.keys(g).sort(), ["id", "label", "requires"]);
});

test("validator imports nothing network-related", () => {
  const src = readFileSync(join(root, "..", "scenarioValidator.js"), "utf8");
  assert.ok(!/^\s*import\s/m.test(src), "validator must have zero imports");
  assert.ok(!/\brequire\s*\(/.test(src), "validator must not use require");
  const low = src.toLowerCase();
  for (const banned of ["openai", "node:net", "node:http", "from \"net\"", "from \"http\""]) {
    assert.ok(!low.includes(banned), `validator references banned module: ${banned}`);
  }
});
