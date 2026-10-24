// Private CN01 contact evidence only; the production registry does not import it.
import { privateProofInput, privateProofPolicy } from "./privateProof.js";
import { FIXED_CAST, PHONE_BINDING } from "../../../../shared/presentation.js";
import { createScenarioRegistry, legacyRegistry } from "../../scenarioRegistry.js";

export function remoteProofInput() {
  const input = privateProofInput();
  input.spec.id = "private_remote_proof";
  const base = input.spec.npcs[0];
  input.spec.npcs.push(
    { ...structuredClone(base), id: "proof_qa", name: "Fixture QA", role: "qa" },
    { ...structuredClone(base), id: "client", name: "Rohan Mehta", role: "Client Operations Lead", public_context: "Rohan is the remote contact for this private exercise." },
  );
  input.spec.facts[0].owner = "client";
  input.spec.canon.private.dispatch.owner = "client";
  input.presentation.proof_qa = FIXED_CAST.sam;
  input.presentation.client = PHONE_BINDING;
  for (const id of ["proof_qa", "client"]) input.replies.entries.push(...input.replies.entries.filter((entry) => entry.npc === base.id && !entry.act.startsWith("reveal_fact:")).map((entry) => ({ ...structuredClone(entry), id: `${id}-${entry.act}`, npc: id })));
  input.replies.entries = input.replies.entries.filter((entry) => entry.act !== "reveal_fact:PX");
  input.replies.entries.push({ id: "remote-proof-owned-reveal", npc: "client", act: "reveal_fact:PX", variants: [{ id: "one", text: input.spec.facts[0].content.en }, { id: "two", text: input.spec.facts[0].content.en }] });
  return input;
}

export function remoteProofRegistry(input = remoteProofInput()) {
  return createScenarioRegistry([...legacyRegistry.allPackages(), input], { privatePolicies: { [privateProofPolicy.id]: privateProofPolicy } });
}
