// Only existing physical anchors and approved voice identities may cross this boundary.
export const FIXED_CAST = Object.freeze({
  maya: Object.freeze({sceneAnchor: "maya", voiceId: "en_US-lessac-medium"}),
  jordan: Object.freeze({sceneAnchor: "jordan", voiceId: "en_US-ryan-medium"}),
  sam: Object.freeze({sceneAnchor: "sam", voiceId: "en_US-amy-medium"}),
});
export function publicCast(npcs, bindings = FIXED_CAST) {
  if (!Array.isArray(npcs) || npcs.length < 1 || npcs.length > 3) throw new Error("unsupported scene cast");
  const anchors = new Set();
  const result = npcs.map(({id, name, role}) => {
    const binding = bindings[id];
    if (!binding || !FIXED_CAST[binding.sceneAnchor] || FIXED_CAST[binding.sceneAnchor].voiceId !== binding.voiceId || anchors.has(binding.sceneAnchor)) throw new Error("unsupported scene binding");
    anchors.add(binding.sceneAnchor);
    return {id, name, role, sceneAnchor: binding.sceneAnchor, voiceId: binding.voiceId};
  });
  return result;
}
