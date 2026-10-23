import test from "node:test";
import assert from "node:assert/strict";
import { CONFIG, normalizeScoringProfile } from "../config.js";
import { createScoreRecord, scoreSession } from "../score.js";
import { scenario, runBot } from "../../evals/scriptedBot.mjs";
import { smart, trap } from "../../evals/scriptedPaths.mjs";

test("one authored profile preserves all SC01 v2 constants and pins an independent historical copy", async () => {
  assert.deepEqual(normalizeScoringProfile(scenario), CONFIG.missed_deadline);
  const profile = CONFIG.missed_deadline;
  assert.equal(profile.scoring_version, 2);
  assert.deepEqual(profile.weights, { goals: 30, hidden_facts: 20, integrity: 15, relationship: 10, rubric: 25 });
  assert.deepEqual(profile.goals, { G1: 10, G2: 10, G3: 10 });
  assert.deepEqual(profile.facts, { F1: 8, F2: 7, F3: 5 });
  assert.deepEqual(profile.penalties, { unrealistic_commitment: 8, contradicted_commitment: 4, inaccurate_relay: 3 });
  assert.equal(profile.relationship_population, "all_scenario_npcs");
  for (const [steps, expected] of [[smart, 60], [trap, 7]]) {
    const { session, convo } = await runBot(steps);
    const authored = structuredClone(scenario), supplied = structuredClone(profile);
    const record = createScoreRecord(session, convo, authored, supplied);
    authored.scoring.weights.goals = 0; supplied.penalties.unrealistic_commitment = 0;
    assert.equal(scoreSession(record).deterministic, expected);
    assert.deepEqual(record.scoringProfile, profile);
    assert.equal(record.scoringProfile === profile, false);
  }
});

test("modern records cannot synthesize missing or tampered goal proof through legacy compatibility", async () => {
  const { session, convo } = await runBot(smart);
  const original = createScoreRecord(session, convo, scenario, CONFIG.missed_deadline);
  for (const change of [
    (r) => { delete r.session.goals.G1.proof; },
    (r) => { r.session.goals.G1.proof.source_ids = ["missing"]; },
    (r) => { r.session.goals.G1.proof.source_ids = [r.session.goals.G1.proof.source_ids[0], r.session.goals.G1.proof.source_ids[0]]; },
    (r) => { r.session.goals.G1.proof.actor_id = "jordan"; },
    (r) => { r.session.goals.G3.proof.commitment_id = "C999"; },
    (r) => { r.session.goals.G3.proof.requires_delivery = false; },
    (r) => { r.session.goals.G3.proof.source_ids = r.session.goals.G1.proof.source_ids; },
  ]) {
    const record = structuredClone(original); change(record);
    assert.ok(scoreSession(record).metrics.goals.points < 30);
  }
  const stripped = structuredClone(original); delete stripped.session.engine_policy;
  assert.throws(() => scoreSession(stripped), /legacy/);
});

test("unknown package, profile changes and identity mismatch fail closed", async () => {
  const { session, convo } = await runBot(trap);
  const record = createScoreRecord(session, convo, scenario, CONFIG.missed_deadline);
  for (const change of [
    (r) => { r.scenario.id = "unknown"; },
    (r) => { r.session.scenario_id = "unknown"; },
    (r) => { r.scoringProfile.penalties.unrealistic_commitment = 0; },
    (r) => { r.scoringProfile.bands[0].minimum = 1; },
    (r) => { r.identity.contentVersion = 2; },
    (r) => { r.session.identity.scoringVersion = 3; },
    (r) => { r.session.engine_policy.version = 2; },
    (r) => { delete r.scoringProfile; },
    (r) => { delete r.identity; },
    (r) => { delete r.session.identity; },
  ]) {
    const changed = structuredClone(record); change(changed);
    assert.throws(() => scoreSession(changed), /version or weights/);
  }
});

test("modern scoring accepts an explicit pinned identity and profile without an SC01 fallback", async () => {
  const original = await runBot(trap), record = structuredClone(original);
  record.scenario.id = record.session.scenario_id = "private-policy-test";
  record.scenario.version = record.session.scenario_version = 7;
  record.session.engine_policy.id = "private-policy-test";
  record.scoringProfile.penalties.unrealistic_commitment = record.scenario.scoring.penalties.unrealistic_commitment = 6;
  record.identity = record.session.identity = { ...record.identity, scenarioId: record.scenario.id, contentVersion: 7,
    policyId: record.session.engine_policy.id, contentHash: "b".repeat(64) };
  assert.equal(scoreSession(record).deterministic, 9);
  delete record.scoringProfile;
  assert.throws(() => scoreSession(record), /version or weights/);
  assert.equal(scoreSession(original).deterministic, 7);
});

test("goal dependency proof validation ignores authored display order and preserves 60/7", async () => {
  for (const [steps, expected] of [[smart, 60], [trap, 7]]) {
    const record = structuredClone(await runBot(steps));
    record.scenario.goals = [record.scenario.goals[2], record.scenario.goals[0], record.scenario.goals[1]];
    const result = scoreSession(record);
    assert.equal(result.deterministic, expected);
    assert.deepEqual(result.metrics.goals.evidence.map((g) => g.source_id), ["goal:G3", "goal:G1", "goal:G2"]);
  }
});
