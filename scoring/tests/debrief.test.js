import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assembleDebrief } from "../debrief.js";
import { DIMENSIONS } from "../judge.js";
import { validateQuote } from "../quotes.js";
import { scenario, runBot } from "../../evals/scriptedBot.mjs";
import { endSession } from "../../engine/engine.js";
import { renderDebrief, pollDebrief } from "../../src/debrief.js";
const fixtures = JSON.parse(readFileSync(new URL("../../evals/fixtures/s1-07-synthetic-sessions.json", import.meta.url), "utf8")).paths;
const manifest = { id: "synthetic-s1-10" };
const finish = (record) => { endSession(record.session); return record; };
const assertQuotes = (debrief, record) => {
  for (const r of [...debrief.timeline, ...debrief.priorities]) if (r.quote) assert.equal(validateQuote(record.convo.turns, r.user_turn_id, r.quote), true);
  for (const r of [...debrief.judged.dimensions, ...debrief.moments]) if (r.quote) assert.equal(validateQuote(record.convo.turns, r.turn_id, r.quote), true);
};
test("ended smart/trap/vague debriefs verify every quote and preserve immutable source", async () => {
  const vague = await runBot([["maya", "Hello.", []]]);
  for (const record of [structuredClone(fixtures.smart), structuredClone(fixtures.trap), vague]) {
    finish(record); const before = JSON.stringify(record);
    const result = await assembleDebrief({ record, scenario, manifest });
    assertQuotes(result, record); assert.equal(JSON.stringify(record), before);
    assert.equal(result.status, "partial"); assert.equal(result.judged.status, "unavailable");
    assert.equal(result.judged.points, 0); assert.ok(result.moments[0].better_reply);
    assert.equal(result.scoring_version, 2); assert.deepEqual(result.weights, scenario.scoring.weights);
    assert.deepEqual(result.settings, record.session.customisation);
  }
});
test("trap has correctly quoted premature commitment and post-session-only missed facts", async () => {
  const record = finish(structuredClone(fixtures.trap));
  const d = await assembleDebrief({ record, scenario, manifest });
  const flag = d.timeline.find((f) => f.type === "premature_commitment");
  assert.equal(flag.turn_id, 1); assert.equal(flag.quote, record.convo.turns[0].text);
  assert.ok(d.missed_facts.some((f) => f.id === "F1")); assert.ok(d.missed_facts.some((f) => f.id === "F2"));
  const active = structuredClone(record); active.session.ended = false;
  await assert.rejects(assembleDebrief({ record: active, scenario, manifest }), { code: "NOT_ENDED" });
});
test("injected maximum smart rubric proves 85 arithmetic only; trap zero gives7", async () => {
  for (const [name, score, expected] of [["smart", 5, 85], ["trap", 0, 7]]) {
    const record = finish(structuredClone(fixtures[name]));
    const provider = async () => ({ text: JSON.stringify({ dimensions: DIMENSIONS.map((id) => ({ id, score, turn_id: 1, quote: record.convo.turns[0].text, explanation: "Synthetic arithmetic feasibility only; not a calibrated judgment." })) }) });
    const d = await assembleDebrief({ record, scenario, providers: { judge: provider }, manifest });
    assert.equal(d.total, expected); assert.equal(d.deterministic.points, name === "smart" ? 60 : 7);
    assert.equal(d.band, name === "smart" ? "Excellent" : "Needs work"); assertQuotes(d, record);
  }
});
test("renderer escapes feedback, keeps learning first, and labels unavailable AI assessment without an overall band", async () => {
  const d = await assembleDebrief({ record: finish(structuredClone(fixtures.trap)), scenario, manifest });
  d.what_went_well[0] = '<img src=x onerror="bad()">'; d.missed_facts[0].content = "<script>bad()</script>"; d.missed_facts[0].owner = '<Maya>';
  d.moments = [{ general: false, turn_id: "turn<1>", quote: "I will follow up.", what_went_well: "You named a next step.", what_happened: "A verified moment.", why_it_matters: "It gives a clear next step.", better_reply: "What should I confirm?", source: "fallback" }];
  const html = renderDebrief({ status: "partial", debrief: d, retry_allowed: true });
  assert.ok(!html.includes("<script>")); assert.ok(!html.includes("<img src")); assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("Context from &lt;Maya&gt;")); assert.ok(html.indexOf("What worked") < html.indexOf("Practice next"));
  assert.match(html, /Scenario outcomes/); assert.match(html, /Communication/); assert.match(html, /Not assessed \/ 25/);
  assert.match(html, /Communication assessment unavailable/); assert.ok(!html.includes(d.band)); assert.ok(!html.includes(`${d.total} \/ ${d.total_cap}`));
  assert.ok(html.includes("I will follow up.")); assert.ok(html.includes("Turn turn&lt;1&gt;")); assert.ok(html.includes("A verified moment.")); assert.ok(html.includes("It gives a clear next step.")); assert.ok(!html.includes("General practice tip"));
  assert.ok(html.includes("data-debrief-actions"));
  assert.match(html, /<summary>Scores & evidence<\/summary>/); assert.match(html, /<summary>Missed opportunities<\/summary>/); assert.match(html, /<summary>Session details<\/summary>/);
});

test("renderer rounds displayed numbers without mutating the debrief", () => {
  const d = { total_status: "assessed", total: 80.456, total_cap: 100, band: "Strong", status: "ready", deterministic: { points: 60.555, cap: 75 }, judged: { points: 19.901, cap: 25, status: "available", dimensions: [] }, what_went_well: [], priorities: [], timeline: [], moments: [], missed_facts: [], breakdown: [{ label: "Goals", points: 30.444, cap: 30, source: "deterministic" }, { label: "Communication quality", points: 19.901, cap: 25, source: "judged" }], weights: {}, settings: {}, difficulty: "Medium", scoring_version: 2 };
  const before = JSON.stringify(d); const html = renderDebrief({ status: "ready", debrief: d });
  assert.match(html, /80\.5 \/ 100/); assert.match(html, /60\.6 \/ 75/); assert.match(html, /19\.9 \/ 25/); assert.equal(JSON.stringify(d), before);
});
test("renderer labels deterministic evidence with its transcript user turn while judge evidence uses its turn id", async () => {
  const record = finish(structuredClone(fixtures.smart));
  const d = await assembleDebrief({ record, scenario, manifest });
  const secondUserTurn = record.convo.turns.find((turn) => turn.id === 3);
  d.timeline = [{ type: "asked_deadline_flexibility", user_turn_id: secondUserTurn.id, turn_id: 2, quote: secondUserTurn.text }];
  d.moments = [{ general: false, turn_id: 99, quote: secondUserTurn.text, what_went_well: "You asked directly.", what_happened: "The moment is verified.", why_it_matters: "It moves the conversation forward.", better_reply: "What flexibility is available?", source: "fallback" }];
  const html = renderDebrief({ status: "partial", debrief: d });
  assert.match(html, /Turn 3/); assert.match(html, /Turn 99/); assert.ok(!html.includes("Turn 2"));
});
test("polling is bounded and ignores stale runs after delayed responses", async () => {
  const rendered = []; let resolve, active = true;
  const request = new Promise((r) => { resolve = r; });
  const polling = pollDebrief({ load: () => request, current: () => active, render: (x) => rendered.push(x) });
  active = false; resolve({ status: "ready", debrief: {} }); await polling;
  assert.deepEqual(rendered, []);
  await pollDebrief({ load: async () => ({ status: "pending" }), current: () => true, render: (x) => rendered.push(x), wait: async () => {}, maxPolls: 2 });
  assert.equal(rendered.at(-1).status, "paused");
});

test("unobserved priorities name the missing achievement without blaming the last user line", async () => {
  const record = finish(structuredClone(fixtures.trap));
  const d = await assembleDebrief({ record, scenario, manifest });
  for (const priority of d.priorities) {
    assert.equal(priority.kind, "not_observed"); assert.equal(priority.quote, null);
    assert.equal(priority.user_turn_id, null); assert.equal(priority.turn_id, null);
    assert.ok(priority.description.includes("by session end"));
    assert.ok(scenario.goals.some((g) => g.label === priority.label));
  }
  assert.notEqual(d.priorities[0].label, d.priorities[1].label);
});
test("retry preserves successful judge assessment and runs only unavailable coaching", async () => {
  const record = finish(structuredClone(fixtures.smart));
  let judgeCalls = 0, coachCalls = 0;
  const judgeProvider = async () => { judgeCalls++; return { text: JSON.stringify({ dimensions: DIMENSIONS.map((id) => ({ id, score: 5, turn_id: 1, quote: record.convo.turns[0].text, explanation: "Synthetic verified evidence." })) }) }; };
  const previous = await assembleDebrief({ record, scenario, providers: { judge: judgeProvider }, manifest });
  assert.equal(previous.judged.points, 25); assert.equal(previous.coach_status, "unavailable");
  const result = await assembleDebrief({ record, scenario, previous, manifest, providers: {
    judge: async () => { judgeCalls++; throw new Error("judge should not rerun"); },
    coach: async () => { coachCalls++; throw { code: "PROVIDER_ERROR" }; },
  } });
  assert.equal(judgeCalls, 1); assert.equal(coachCalls, 2);
  assert.equal(result.judged.points, 25); assert.equal(result.total, 85);
});
test("uncertain feedback retry errors recover through GET polling and stale runs do not refresh", async () => {
  const { recoverFeedbackRetry } = await import("../../src/debrief.js");
  let posts = 0, gets = 0;
  await recoverFeedbackRetry({ request: async () => { posts++; throw new Error("connection lost"); }, current: () => true, refresh: async () => { gets++; } });
  assert.equal(posts, 1); assert.equal(gets, 1);
  await recoverFeedbackRetry({ request: async () => { throw new Error("connection lost"); }, current: () => false, refresh: async () => { gets++; } });
  assert.equal(gets, 1);
});

test("retry preserves successful coaching when only the judge is unavailable", async () => {
  const record = finish(structuredClone(fixtures.trap)); let coachCalls = 0;
  const previous = await assembleDebrief({ record, scenario, manifest, providers: { coach: async (args) => {
    coachCalls++; const user = JSON.parse(args.messages[0].content).original_user_turn;
    return { text: JSON.stringify({ turn_id: user.id, quote: user.text, what_went_well: "You stated your intention.", what_happened: "A question could clarify this moment.", why_it_matters: "More context can help.", better_reply: "What should I clarify before choosing a next step?" }) };
  } } });
  assert.equal(previous.coach_status, "available");
  const result = await assembleDebrief({ record, scenario, previous, manifest, providers: { coach: async () => { coachCalls++; throw new Error("unexpected rerun"); } } });
  assert.equal(coachCalls, 1); assert.deepEqual(result.moments, previous.moments);
});
test("bands use unchanged scenario-scoped thresholds and are recorded with the result", async () => {
  const { bandFor } = await import("../debrief.js");
  for (const [points, label] of [[85, "Excellent"], [84, "Strong"], [70, "Strong"], [69, "Developing"], [50, "Developing"], [49, "Needs work"]]) assert.equal(bandFor(points), label);
  const d = await assembleDebrief({ record: finish(structuredClone(fixtures.trap)), scenario, manifest });
  assert.deepEqual(d.bands.map((b) => b.minimum), [85, 70, 50, 0]); assert.equal(d.scoring_version, 2);
});
