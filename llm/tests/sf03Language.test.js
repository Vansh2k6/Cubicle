import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {resolve, dirname} from "node:path";
import {fileURLToPath} from "node:url";
import {defaultRegistry, publicScenario} from "../../services/api/scenarioRegistry.js";
import {buildNpcPrompt} from "../promptBuilder.js";
import {checkReply, canonCheck} from "../guards.js";
import {classifyTurn, buildClassifierInput} from "../classifier.js";
import {runTurn, createConversation, nextHintFor} from "../pipeline.js";
import {safeHistoricalText, coachSession} from "../../scoring/coach.js";
import {assembleDebrief, bandFor} from "../../scoring/debrief.js";
import {publicCast, FIXED_CAST, PHONE_BINDING} from "../../shared/presentation.js";
import {projectGuidance} from "../../src/guidance.js";
import {scanArtifacts} from "../../scripts/bundle-scan-core.mjs";
import {privateLanguageNeedles} from "../../scripts/private-language-needles.mjs";
import {normalizeScoringProfile} from "../../scoring/config.js";
import * as engine from "../../engine/engine.js";
const pkg = defaultRegistry.getScenario("deadline");
const scenario = pkg.spec;
const runtime = {scenarioId: scenario.id, policyId: pkg.policy.id, policyVersion: pkg.policy.version, engine: pkg.policy.engine, rules: pkg.policy.rules, spec: scenario, identity: pkg.identity, language: pkg.policy.language};
const context = (extra = {}) => ({scenario, runtime, npcId: "maya", act: "react_freely", ...extra});
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("public hook sees only public projection, never root/private canon or other facts", () => {
  let seen;
  const spy = {...runtime, language: {...runtime.language, publicCanonLines: (input) => {seen = input; return runtime.language.publicCanonLines(input);}}};
  const prompt = buildNpcPrompt({...context({runtime: spy}), revealedFacts: ["F2"]});
  assert.deepEqual(Object.keys(seen).sort(), ["actorPublicContext", "publicCanon", "publicCast"]);
  for (const secret of ["commitment_model", "leak_keywords", "private", "client_cutoff", "triggers", "persona"]) assert.equal(JSON.stringify(seen).includes(secret), false, secret);
  for (const fact of scenario.facts) assert.equal(prompt.system.includes(fact.content.en), false);
  seen.publicCanon.project_status = "mutated";
  assert.equal(scenario.canon.public.project_status, "unfinished");
});

test("language cannot waive core leak ownership, forged pending permission, or unknown locale", () => {
  let seen;
  const permissive = {...runtime, language: {...runtime.language, canonCheck: (input) => {seen = input; return [];}}};
  const fact = scenario.facts.find((fact) => fact.id === "F2");
  const result = checkReply(fact.content.en, context({runtime: permissive, revealedIds: ["F2"], revealedTexts: [fact.content.en], authorised: {factId: "F2", owner: "maya", act: "react_freely"}}));
  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.factId === "F2"));
  assert.deepEqual(seen.permittedCanon.facts, []);
  assert.equal(seen.authorisedFact, null);
  for (const key of ["private", "commitment_model", "triggers", "leak_keywords"]) assert.equal(JSON.stringify(seen).includes(key), false);
  assert.equal(checkReply("I hear you.", context({locale: "hi"})).ok, false);
  assert.equal(checkReply("I hear you.", context({npcId: "unknown"})).ok, false);
  assert.ok(canonCheck("I hear you.", {scenario: {...scenario, id: "unknown"}}).length);
  assert.equal(checkReply("I hear you.", context({scenario: {...scenario, id: "unknown"}, runtime: undefined})).ok, false);
});

test("bound date normalization rejects conflicting dates and model-invented dates", async () => {
  const cases = [["Friday or Thursday", 3, null], ["Friday and three days", 8, 3], ["tomorrow", 3, 1], ["soon", 3, null], ["I will finish", 3, null], ["Monday", 3, null]];
  for (const [words, modelDay, expected] of cases) {
    const out = await classifyTurn({scenario, runtime, provider: async () => ({text: JSON.stringify({events: [{type: "committed_deadline", params: {day: modelDay}}]})})}, buildClassifierInput({text: `I will deliver ${words}`, clock: {day: 0}}));
    assert.equal(out.events[0]?.params.day ?? null, expected, words);
    if (expected === null) assert.ok(out.clarify.some((entry) => entry.reason === "ambiguous_date"));
  }
});

test("all date and material claims remain checked around permitted disclosure", () => {
  const authorised = {factId: "F1", owner: "maya", act: "reveal_fact:F1"};
  const opts = context({act: authorised.act, authorised});
  assert.equal(checkReply(scenario.facts[0].content.en, opts).ok, true);
  for (const text of ["The cutoff is Friday but delivery is Thursday.", "The cutoff is Friday. We have extra engineers.", "The cutoff is Friday. We scheduled a meeting.", "The cutoff is Friday. We agreed."]) assert.equal(checkReply(text, opts).ok, false, text);
});

test("authorized F2 permits its real disclosure without granting blanket progress claims", () => {
  const opts = context({npcId: "jordan", act: "reveal_fact:F2", authorised: {factId: "F2", owner: "jordan", act: "reveal_fact:F2"}});
  const real = scenario.facts.find((fact) => fact.id === "F2").content.en;
  assert.equal(checkReply(real, opts).ok, true);
  const failures = checkReply(`${real} The project is 99% complete.`, opts);
  assert.equal(failures.ok, false);
  assert.ok(failures.failures.some((failure) => failure.code === "canon_invented_progress"));
  assert.equal(checkReply(`${real} The project is 99% complete.`, context({npcId: "jordan", revealedIds: ["F2"]})).ok, false);
});

test("historical coaching accepts known fact only, checks surrounding claims and never treats guesses as knowledge", () => {
  assert.equal(safeHistoricalText("The cutoff is Friday.", scenario, [], {runtime, userSaid: ["The cutoff is Friday."]}), false);
  assert.equal(safeHistoricalText("The cutoff is Friday.", scenario, ["F1"], {runtime}), true);
  assert.equal(safeHistoricalText("The cutoff is Friday. Delivery is tomorrow.", scenario, ["F1"], {runtime}), false);
  assert.equal(safeHistoricalText("The cutoff is Friday.", scenario, ["F1"], {runtime: {...runtime, identity: {...runtime.identity, contentVersion: 99}}}), false);
});

test("unknown/missing/mismatched modern context fails before model work or mutation", async () => {
  let calls = 0;
  const provider = async () => {calls++; return {text: '{"events":[]}'};};
  const session = engine.createSession(scenario, {runtime}); session.identity = pkg.identity;
  const before = JSON.stringify(session);
  for (const candidate of [undefined, null, {...runtime, scenarioId: "unknown"}, {...runtime, identity: {...runtime.identity, contentHash: "0".repeat(64)}}]) {
    await assert.rejects(runTurn({session, scenario, runtime: candidate, convo: createConversation(), npcId: "maya", text: "Hi", engine, providers: {classify: provider, npc: provider}}));
    assert.equal(JSON.stringify(session), before);
  }
  const record = {session, scenario, convo: createConversation(), scoringProfile: pkg.scoringProfile, identity: pkg.identity};
  engine.endSession(session);
  await assert.rejects(coachSession({record, provider}));
  await assert.rejects(assembleDebrief({record, providers: {judge: provider, coach: provider}, manifest: {id: "test"}}));
  assert.equal(calls, 0);
});

test("public metadata preserves current cast, exactly three anchors and approved voice mapping", () => {
  const metadata = publicScenario(pkg);
  assert.deepEqual(metadata.npcs.map((actor) => actor.name), ["Snehal Mane", "Vansh Singh", "Prathamesh Surwase"]);
  assert.deepEqual(metadata.npcs.map((actor) => actor.sceneAnchor), ["maya", "jordan", "sam"]);
  for (const actor of metadata.npcs) assert.equal(actor.voiceId, FIXED_CAST[actor.sceneAnchor].voiceId);
  assert.throws(() => publicCast([...metadata.npcs, metadata.npcs[0]]));
  assert.throws(() => publicCast(metadata.npcs, {...FIXED_CAST, maya: {sceneAnchor: "new", voiceId: "new"}}));
  assert.throws(() => publicCast(metadata.npcs, {...FIXED_CAST, maya: FIXED_CAST.jordan}));
  assert.equal(projectGuidance({npcs: metadata.npcs}).heading, "Start with Snehal");
  assert.match(projectGuidance({goals: [{id: "G1", status: "done"}], npcs: metadata.npcs}).heading, /Vansh/);
  const serialized = JSON.stringify(metadata);
  for (const key of ["policy", "facts", "commitment_model", "contentHash", "triggers"]) assert.equal(serialized.includes(key), false);
});

test("private language resources have real scanner needles and are absent from frontend import graph", () => {
  const resources = ["llm/sc01Language.js", "llm/languageContext.js", "llm/prompts/classifier/v3.md", "llm/prompts/npc/v4-boundary.md", "llm/prompts/coach/v3.md"];
  const all = resources.map((path) => readFileSync(resolve(root, path), "utf8")).join("\n").toLowerCase();
  for (const [needle, reason] of privateLanguageNeedles) {
    assert.ok(all.includes(needle), needle);
    assert.equal(scanArtifacts([{file: "private.js", text: needle}], new Map([[needle, reason]])).length, 1);
  }
  const visited = new Set();
  const walk = (path) => {
    if (visited.has(path)) return;
    visited.add(path);
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.[^"']+)["']/g)) {
      const next = resolve(dirname(path), match[1]);
      if (next.endsWith(".js") && existsSync(next)) walk(next);
    }
  };
  walk(resolve(root, "src/main.js"));
  for (const path of resources) assert.equal(visited.has(resolve(root, path)), false, path);
  assert.ok(visited.has(resolve(root, "shared/presentation.js")));
});

test("normalized commitment day removes conflicting provider aliases before the engine reads it", async () => {
  const classified = await classifyTurn({scenario, runtime, provider: async () => ({text: JSON.stringify({events: [{type: "committed_deadline", params: {day: 3, days: 1, target_day: 2}}]})})}, buildClassifierInput({text: "I will deliver Friday", clock: {day: 0}}));
  assert.deepEqual(classified.events[0].params, {day: 3});
  const session = engine.createSession(scenario, {runtime});
  engine.applyTurn(session, "maya", classified.events, {runtime, text: "I will deliver Friday"});
  assert.equal(session.commitments.at(-1).target_day, 3);
});

test("other bound packages use their public checklist without inheriting SC-01 actors or deadline copy", () => {
  const goals = [{id: "inspect", label: "Inspect the public checklist", status: "done"}, {id: "confirm", label: "Confirm the public handoff", status: "pending"}];
  const guidance = projectGuidance({scenarioId: "private-proof", goals, npcs: [{id: "colleague", name: "Colleague"}]});
  assert.equal(guidance.description, "Confirm the public handoff");
  assert.equal(nextHintFor({inspect: {status: "done"}}, {id: "private-proof", goals, npcs: []}), "Confirm the public handoff");
  assert.doesNotMatch(JSON.stringify(guidance), /Snehal|Vansh|Prathamesh|deadline/);
  assert.doesNotMatch(nextHintFor({}, {id: "unknown"}), /Snehal|Vansh|deadline/);
  assert.equal(projectGuidance({scenarioId: "missed_deadline", goals: [], npcs: publicScenario(pkg).npcs}).heading, "Start with Snehal");
});

test("one or two public actors map uniquely to existing anchors and reject empty, duplicate or unknown casts", () => {
  for (const count of [1, 2, 3]) assert.equal(publicCast(scenario.npcs.slice(0, count)).length, count);
  assert.throws(() => publicCast([]));
  assert.throws(() => publicCast([scenario.npcs[0], scenario.npcs[0]]));
  assert.throws(() => publicCast([{id: "unknown", name: "Unknown", role: "peer"}]));
  const bindings = {a: FIXED_CAST.maya, b: FIXED_CAST.sam};
  assert.deepEqual(publicCast([{id: "a", name: "A", role: "peer"}, {id: "b", name: "B", role: "peer"}], bindings).map((actor) => actor.sceneAnchor), ["maya", "sam"]);
});

test("one phone contact joins three unchanged physical actors through strict public bindings", () => {
  const contact = {id: "client", name: "Rohan Mehta", role: "Client Operations Lead", private_context: "private fixture marker"};
  const actors = [...scenario.npcs, contact], bindings = {...FIXED_CAST, client: PHONE_BINDING};
  const result = publicCast(actors, bindings);
  assert.deepEqual(result.slice(0, 3), publicCast(scenario.npcs));
  assert.deepEqual(result[3], {id: contact.id, name: contact.name, role: contact.role, contactMode: "phone", voiceId: "en_GB-alan-medium"});
  assert.equal(Object.hasOwn(result[3], "sceneAnchor"), false);
  for (const binding of [
    {contactMode: "email", voiceId: PHONE_BINDING.voiceId},
    {contactMode: "phone", voiceId: "unknown"},
    {...PHONE_BINDING, sceneAnchor: "maya"},
    {...PHONE_BINDING, sceneAnchor: undefined},
    {sceneAnchor: "sam", voiceId: FIXED_CAST.sam.voiceId},
    {sceneAnchor: "__proto__"},
  ]) assert.throws(() => publicCast(actors, {...bindings, client: binding}));
  assert.throws(() => publicCast(actors, {...bindings, sam: PHONE_BINDING}));
  assert.throws(() => publicCast([...actors, {...contact, id: "other"}], {...bindings, other: PHONE_BINDING}));
});

test("modern debrief uses captured bands and first-actor settings for an unregistered private record", async () => {
  const spec = structuredClone(scenario);
  spec.id = "private-record";
  spec.npcs[0].id = "first_actor";
  spec.facts.filter((fact) => fact.owner === "maya").forEach((fact) => {fact.owner = "first_actor";});
  spec.scoring.bands = [{minimum: 0, label: "Captured band"}];
  const scoringProfile = normalizeScoringProfile(spec);
  const identity = {...pkg.identity, scenarioId: spec.id, contentHash: "a".repeat(64)};
  const session = engine.createSession(scenario, {runtime});
  session.scenario_id = spec.id; session.identity = identity;
  session.npcs.first_actor = session.npcs.maya; delete session.npcs.maya;
  session.customisation = {first_actor: {assertiveness: 100, patience: 0, warmth: 0, forthcomingness: 0}};
  engine.endSession(session);
  const record = {session, scenario: spec, scoringProfile, identity, convo: createConversation()};
  const result = await assembleDebrief({record, runtime: {...runtime, scenarioId: spec.id, spec, identity}, manifest: {id: "offline-captured-bands"}});
  assert.equal(result.band, "Captured band");
  assert.deepEqual(result.bands, spec.scoring.bands);
  assert.equal(result.difficulty, "Hard");
  assert.equal(bandFor(60, [{minimum: 0, label: "Captured"}]), "Captured");
});

test("reset and scenario transitions clear metadata before a new run can reuse public guidance", () => {
  const source = readFileSync(resolve(root, "src/main.js"), "utf8");
  const start = source.indexOf("function resetTextRun(");
  const end = source.indexOf("function startRetrySession", start);
  const reset = source.slice(start, end);
  const state = {scenario: "deadline", scenarioMetadata: {id: "old-package"}};
  const run = Function("state", "closeConversation", "$", "office", "updateScenario", `${reset}; return resetTextRun;`)(state, () => {}, () => ({}), null, () => {});
  run("email");
  assert.equal(state.scenarioMetadata, null);
  assert.equal(state.scenario, "email");
  assert.match(source, /state\.scenarioMetadata = null;\s+state\.scenario = id;/);
  assert.match(source, /state\.scenarioMetadata = null;\s+state\.scenario = keys\[/);
});
