// Local server-only copies of the reviewed authored reference components and
// source mechanics frames. They are never browser payloads.
import managerFrame from "./prototype-content/manager.frame.json" with {type: "json"};
import hrFrame from "./prototype-content/hr.frame.json" with {type: "json"};
import clientFrame from "./prototype-content/client.frame.json" with {type: "json"};
import coworkerFrame from "./prototype-content/coworker.frame.json" with {type: "json"};
import managerReference from "./prototype-content/manager.reference.json" with {type: "json"};
import hrReference from "./prototype-content/hr.reference.json" with {type: "json"};
import clientReference from "./prototype-content/client.reference.json" with {type: "json"};
import coworkerReference from "./prototype-content/coworker.reference.json" with {type: "json"};
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
const frameFiles = {manager: managerFrame, hr: hrFrame, client: clientFrame, coworker: coworkerFrame};
const referenceFiles = {manager: managerReference, hr: hrReference, client: clientReference, coworker: coworkerReference};
const fileHash = (filename) => createHash("sha256").update(readFileSync(new URL(`./prototype-content/${filename}`, import.meta.url))).digest("hex");
const deepFreeze = (value) => {
  if (value && typeof value === "object") {
    if (!Object.isFrozen(value)) Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
};
export const PROTOTYPE_CORPUS_VERSION = "generation-frames-v1";
export function validatePrototypeSource(family, frame, reference) {
  const fail = (reason) => ({ok: false, reason});
  if (!Object.hasOwn(frameFiles, family) || !frame || !reference) return fail("unsupported_family");
  if (frame.schema_version !== 1 || reference.schema_version !== 1 || frame.family !== family ||
      frame.frame_id !== `frame-${family}-v1` || reference.frame_id !== frame.frame_id) return fail("version_or_frame_mismatch");
  const components = reference.components;
  if (!Array.isArray(components) || !components.length) return fail("components_missing");
  const ids = new Set(), slots = new Set();
  for (const component of components) {
    if (!component?.id || !component.slot || ids.has(component.id) || slots.has(component.slot) ||
        component.frame !== frame.frame_id || component.status !== "reference" || !component.body || typeof component.body !== "object" ||
        Object.keys(component).sort().join(",") !== "body,frame,id,slot,status") return fail("duplicate_or_invalid_component");
    const allowedBodyKeys = component.slot === "situation" ? ["briefing", "title"]
      : component.slot === "goals" ? ["labels"]
        : component.slot.startsWith("fact:") ? ["content", "leak_keywords", "unlock_question"]
        : component.slot.startsWith("cast:") ? ["persona", "public_context", "role", "motivation"] : [];
    if (!allowedBodyKeys.length || Object.keys(component.body).some((key) => !allowedBodyKeys.includes(key))) return fail("unsupported_component_fields");
    ids.add(component.id); slots.add(component.slot);
  }
  const spec = frame.mechanics?.spec, frameSlots = frame.slots;
  if (!spec || !frameSlots || !slots.has("situation") || !slots.has("goals") ||
      !["maya", "jordan", "sam"].every((id) => slots.has(`cast:${id}`))) return fail("mandatory_slots_missing");
  const facts = spec.facts?.map((fact) => fact.id) || [], goals = spec.goals?.map((goal) => goal.id) || [];
  const expectedSlots = ["situation", "goals", "cast:maya", "cast:jordan", "cast:sam", ...facts.map((id) => `fact:${id}`)].sort();
  if (facts.length !== 4 || goals.length !== 6 || slots.size !== expectedSlots.length ||
      JSON.stringify([...slots].sort()) !== JSON.stringify(expectedSlots)) return fail("unexpected_component_slots");
  if (new Set(facts).size !== facts.length || new Set(goals).size !== goals.length ||
      JSON.stringify([...facts].sort()) !== JSON.stringify([...(frameSlots.facts?.ids || [])].sort()) ||
      JSON.stringify([...goals].sort()) !== JSON.stringify([...(frameSlots.goals?.ids || [])].sort()) ||
      facts.some((id) => !slots.has(`fact:${id}`) || !frameSlots.facts.owners?.[id] || spec.facts.find((f) => f.id === id).owner !== frameSlots.facts.owners[id])) return fail("frame_reference_mismatch");
  return {ok: true};
}
export const PROTOTYPE_CORPUS = deepFreeze(Object.fromEntries(Object.keys(frameFiles).map((family) => {
  const frame = frameFiles[family], reference = referenceFiles[family];
  const integrity = validatePrototypeSource(family, frame, reference);
  if (!integrity.ok) throw new Error(`invalid reviewed prototype corpus: ${integrity.reason}`);
  const components = Object.fromEntries(reference.components.map((component) => [component.slot, component.body]));
  const facts = frame.mechanics.spec.facts.map((fact) => {
    const authored = components[`fact:${fact.id}`];
    return {id: fact.id, owner: fact.owner, weight: fact.weight, triggers: [...fact.triggers],
      content: authored.content, keywords: authored.leak_keywords, question: authored.unlock_question};
  });
  return [family, Object.freeze({
    frame, reference, spec: frame.mechanics.spec, source: `generation/frames/${family}.frame.json`,
    specSha256: frame.source.spec_sha256, frameFileSha256: fileHash(`${family}.frame.json`),
    referenceFileSha256: fileHash(`${family}.reference.json`),
    title: components.situation.title, briefing: components.situation.briefing,
    goals: frame.mechanics.spec.goals.map((goal) => ({...goal, label: components.goals.labels[goal.id]})),
    facts: Object.freeze(facts), cast: Object.fromEntries(["maya", "jordan", "sam"].map((id) => [id, components[`cast:${id}`]])),
  })];
})));
