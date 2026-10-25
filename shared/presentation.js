// Only existing physical anchors and approved voice identities may cross this boundary.
export const FIXED_CAST = Object.freeze({
  maya: Object.freeze({sceneAnchor: "maya", voiceId: "en_US-lessac-medium"}),
  jordan: Object.freeze({sceneAnchor: "jordan", voiceId: "en_US-ryan-medium"}),
  sam: Object.freeze({sceneAnchor: "sam", voiceId: "en_US-amy-medium"}),
});
export const HR_BINDING = Object.freeze({sceneAnchor: "hr", voiceId: "en_US-ryan-medium"});
export const PHONE_BINDING = Object.freeze({contactMode: "phone", voiceId: "en_GB-alan-medium"});
export function publicCast(npcs, bindings = FIXED_CAST) {
  if (!Array.isArray(npcs) || npcs.length < 1 || npcs.length > 4) throw new Error("unsupported scene cast");
  const anchors = new Set(), ids = new Set();
  let remote = false;
  const result = npcs.map(({id, name, role}) => {
    const binding = Object.hasOwn(bindings, id) ? bindings[id] : null;
    if (!id || ids.has(id)) throw new Error("unsupported actor identity");
    ids.add(id);
    if (binding?.contactMode !== undefined) {
      if (remote || binding.contactMode !== PHONE_BINDING.contactMode || binding.voiceId !== PHONE_BINDING.voiceId || Object.keys(binding).some((key) => !["contactMode", "voiceId"].includes(key))) throw new Error("unsupported contact binding");
      remote = true;
      return {id, name, role, contactMode: binding.contactMode, voiceId: binding.voiceId};
    }
    const allowed = binding?.sceneAnchor === "hr" ? HR_BINDING : Object.hasOwn(FIXED_CAST, binding?.sceneAnchor) ? FIXED_CAST[binding.sceneAnchor] : null;
    if (!binding || !allowed || allowed.voiceId !== binding.voiceId || anchors.has(binding.sceneAnchor)) throw new Error("unsupported scene binding");
    anchors.add(binding.sceneAnchor);
    return {id, name, role, sceneAnchor: binding.sceneAnchor, voiceId: binding.voiceId};
  });
  return result;
}
