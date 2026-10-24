import { defaultRegistry, createScenarioRegistry } from "../services/api/scenarioRegistry.js";
import { privateProofInput, privateProofPolicy } from "../services/api/tests/fixtures/privateProof.js";
import { remoteProofInput } from "../services/api/tests/fixtures/remoteProof.js";
import {deadlineV2PackageInput} from "../services/api/deadlineV2Package.js";

// Tooling-only registration: production server never imports this module.
const fixtures = createScenarioRegistry([...defaultRegistry.allPackages(), privateProofInput(), remoteProofInput()], {
  privatePolicies: { [privateProofPolicy.id]: privateProofPolicy },
});
const unpublished = createScenarioRegistry([deadlineV2PackageInput()]);
export const scanRegistry = Object.freeze({
  allPackages: () => [...fixtures.allPackages(), ...unpublished.allPackages()],
  getScenario: (id) => fixtures.getScenario(id),
  listScenarios: () => defaultRegistry.listScenarios(),
  publishedPackages: () => defaultRegistry.allPackages(),
});

export function registeredPrivateNeedles(registry) {
  const needles = new Map();
  const publishedIds = new Set(registry.listScenarios().map((pkg) => pkg.id));
  const published = registry.publishedPackages ? registry.publishedPackages() : registry.allPackages().filter((pkg) => publishedIds.has(pkg.spec.id));
  const publicHashes = new Set(published.map((pkg) => pkg.identity.contentHash));
  const publicAtoms = new Set(published.flatMap((pkg) => [...pkg.spec.npcs, pkg.spec.player].flatMap(({ id, name, role }) => [id, name, role])).map((value) => value.toLowerCase()));
  const add = (value, reason) => {
    if (typeof value === "string") {
      if (!publicAtoms.has(value.toLowerCase()) && (value.length >= 6 || /[\s-]/.test(value))) needles.set(value.toLowerCase(), reason);
    } else if (Array.isArray(value)) value.forEach((v) => add(v, reason));
    else if (value && typeof value === "object") Object.values(value).forEach((v) => add(v, reason));
  };
  for (const pkg of registry.allPackages()) {
    for (const fact of pkg.spec.facts) {
      add(fact.content, `fact ${pkg.spec.id}/${fact.id}`);
      add(fact.leak_keywords, `keywords ${pkg.spec.id}/${fact.id}`);
      add(fact.triggers, `triggers ${pkg.spec.id}/${fact.id}`);
      add(fact.unlock_question, `unlock ${pkg.spec.id}/${fact.id}`);
    }
    add(pkg.spec.canon.private, `private canon ${pkg.spec.id}`);
    add(pkg.spec.plan_model, `private plan model ${pkg.spec.id}`);
    add(pkg.privateSources, `private source data ${pkg.spec.id}`);
    // Scenario/locale and tone tags are public lookup metadata, not templates.
    for (const entry of pkg.replies.entries || []) {
      const reason = `replies ${pkg.spec.id}/${entry.id}`;
      add(entry.id, reason);
      add(entry.act, reason);
      add(entry.predicates, reason);
      add(JSON.stringify(entry.predicates || {}), reason);
      for (const variant of entry.variants || []) {
        add(variant.id, reason);
        add(variant.text, reason);
      }
    }
    // Values that bind private rule behaviour; generic property names and short
    // numeric constants are deliberately not needles (vendor-code collisions).
    add(pkg.policy.rules, `policy rules ${pkg.spec.id}`);
    add(pkg.policy.id, `policy identity ${pkg.spec.id}`);
    // Source literals survive minification; whole function source does not.
    // Keep distinctive private identifiers/phrases rather than bare JS words.
    for (const area of [pkg.policy.engine, pkg.policy.language, pkg.policy.offline]) {
      for (const fn of Object.values(area || {})) if (typeof fn === "function") {
        for (const match of fn.toString().matchAll(/(["'])((?:\\.|(?!\1)[^\\])*)\1/g)) {
          if (match[2].length >= 12 && /[_\s-]/.test(match[2])) add(match[2], `policy source ${pkg.spec.id}`);
        }
      }
    }
    if (!publicHashes.has(pkg.identity.contentHash)) {
      if (!publishedIds.has(pkg.spec.id)) add(pkg.spec.id, `private fixture identity ${pkg.spec.id}`);
      add(JSON.stringify(pkg.spec), `private fixture source ${pkg.spec.id}`);
      add(pkg.spec.briefing, `private fixture briefing ${pkg.spec.id}`);
      add(pkg.spec.canon.public, `private fixture public canon ${pkg.spec.id}`);
      add(pkg.spec.npcs.map(({ id, name }) => ({ id, name })), `private fixture cast ${pkg.spec.id}`);
    }
  }
  return needles;
}
