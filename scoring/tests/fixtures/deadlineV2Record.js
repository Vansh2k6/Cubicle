import * as engine from "../../../engine/engine.js";
import {createConversation, runTurn} from "../../../llm/pipeline.js";
import {createScenarioRegistry} from "../../../services/api/scenarioRegistry.js";
import {deadlineV2PackageInput} from "../../../services/api/deadlineV2Package.js";
import {createOfflineProviders} from "../../../services/api/offlineProviders.js";
import {createScoreRecord} from "../../score.js";
export const pkg = createScenarioRegistry([deadlineV2PackageInput()]).getScenario("missed_deadline");
export const runtime = Object.freeze({scenarioId: pkg.spec.id, schemaVersion: 2, spec: pkg.spec, identity: pkg.identity,
  policyId: pkg.policy.id, policyVersion: pkg.policy.version, language: pkg.policy.language, engine: pkg.policy.engine, rules: pkg.policy.rules});
export const words = {
  full: "Let's deliver submission, reliable confirmation, routing and dashboard Friday. Vansh will reserve a pair before launch. Prathamesh will await save acknowledgement and test save success, failure and retry.",
  phased: "Let's ship submission and reliable confirmation Friday. Routing and dashboard will follow Monday. Client operations will manually route; I will provide instructions Friday. Vansh will reserve capacity for Monday. Prathamesh will await save acknowledgement and test save success, failure and retry.",
};
export function setup() {
  const session = engine.createSession(pkg.spec, {runtime}), convo = createConversation(), offline = createOfflineProviders(pkg);
  const turn = (npcId, text, overrides = {}) => runTurn({session, scenario: pkg.spec, convo, npcId, text, engine, runtime, store: offline.store,
    providers: {classify: offline.classifyProviderFor(text), npc: offline.npcProvider, ...overrides}});
  return {session, convo, turn, record: () => createScoreRecord(session, convo, pkg.spec, pkg.scoringProfile)};
}
export async function technical(f, route) {
  await f.turn("jordan", route === "full" ? "Can you reserve the pair for Friday?" : "Can you reserve capacity for Monday?");
  await f.turn("sam", "Please await the save acknowledgement and verify save success, failure and retry.");
}
export async function complete(f, route) {
  await f.turn("client", "Routing was unapproved.");
  await f.turn("client", "Can you accept this plan? " + words[route]);
  const manager = await f.turn("maya", "Please approve the current revision. " + words[route]);
  if (manager.act === "callback_commitment") await f.turn("maya", "Please approve the current revision. " + words[route]);
  await f.turn("client", "To recap: " + words[route]);
  await f.turn("maya", "In summary: " + words[route]);
}
export async function recordFor(route = "full", {facts = true, revision = false} = {}) {
  const f = setup();
  await f.turn("maya", "I own the delay; the portal is overdue.");
  if (facts) for (const [actor, question] of [["maya", "What did we agree about routing?"], ["jordan", "What can we reuse?"],
    ["sam", "What could go wrong?"], ["client", "What do you actually need Friday?"]]) {
    await f.turn(actor, question); await f.turn(actor, question);
  }
  await f.turn("maya", words[revision ? "full" : route]);
  await technical(f, revision ? "full" : route);
  if (revision) {await f.turn("maya", words[route]); await f.turn("maya", words[route]); await technical(f, route);}
  await complete(f, route);
  return f.record();
}
