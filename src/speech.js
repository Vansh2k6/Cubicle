export function createSpeechPlayback({ fetchAudio, windowRef = typeof window === "undefined" ? {} : window, onSpeaking = () => {}, onUnavailable = () => {} } = {}) {
  let token = 0, controller = null, source = null, context = null, utterance = null, activeNpc = null, interacted = false;
  const stop = () => { token += 1; controller?.abort(); controller = null; try { source?.stop(); } catch {} try { source?.disconnect(); } catch {} source = null; if (utterance && windowRef.speechSynthesis) { try { windowRef.speechSynthesis.cancel(); } catch {} } utterance = null; if (activeNpc) onSpeaking(false, activeNpc); activeNpc = null; };
  const unlock = async () => { interacted = true; if (!windowRef.AudioContext) return null; context = context || new windowRef.AudioContext(); await context.resume(); return context; };
  const play = async ({ sessionId, speech, text, current, muted, explicit = false, unlocked = false, npcId }) => {
    stop(); if (!speech?.available || muted || !current() || !(explicit || unlocked || interacted)) return;
    const own = token; controller = new AbortController();
    const fail = () => { if (own === token) { stop(); onUnavailable(); } };
    const browser = () => { try { const voice = windowRef.speechSynthesis?.getVoices?.().find((item) => item.localService && /^en/i.test(item.lang || "")); if (!voice || !windowRef.SpeechSynthesisUtterance || !current() || muted || own !== token) return; utterance = new windowRef.SpeechSynthesisUtterance(text); utterance.voice = voice; utterance.onend = utterance.onerror = () => { if (own === token) { onSpeaking(false, npcId); activeNpc = null; } }; activeNpc = npcId; onSpeaking(true, npcId); windowRef.speechSynthesis.speak(utterance); } catch { fail(); } };
    if (speech.mode === "browser") { if (unlocked || explicit || interacted) browser(); return; }
    const ready = unlocked || explicit || interacted ? unlock().catch(() => null) : Promise.resolve(null);
    try {
      const result = await fetchAudio(sessionId, speech.turn_id, { signal: controller.signal });
      if (!current() || muted || own !== token) return;
      if (result.speech) { if (result.speech.mode === "browser" && (unlocked || explicit || interacted)) browser(); return; }
      const ac = await ready; if (!ac || !current() || muted || own !== token) return;
      const buffer = await ac.decodeAudioData(result.audio.slice(0)); if (!current() || muted || own !== token) return;
      const ownSource = ac.createBufferSource(); source = ownSource; source.buffer = buffer; source.connect(ac.destination); source.onended = () => { if (own === token) { ownSource.disconnect(); source = null; onSpeaking(false, npcId); activeNpc = null; } }; activeNpc = npcId; onSpeaking(true, npcId); source.start();
    } catch { fail(); }
  };
  return { play, stop, unlock, isUnlocked: () => interacted };
}
