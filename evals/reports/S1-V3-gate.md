# S1-V3 gate — 2026-10-22

V3 adds guarded, committed-turn NPC TTS prefetch, an ID-only audio route, captions/replay/mute controls, and in-memory lifecycle cleanup. It does not alter engine, scoring, text-turn semantics, or voice recording confirmation.

Sol source review approved the final candidate; the tester verified the same 25-file source fingerprint. `npm run verify:offline` passed with 282 unit and 58 API tests while LLM use was forced offline. The default scan passed with 5 text artifacts/81 needles/zero hits; the sanitized `VITE_VOICE=1` scan passed with 6/81/zero hits. The existing >500 kB warning remains.

Root checked the warmed CUDA local sidecar (four voices) in the in-app browser. A typed offline Maya reply generated 151,596 bytes in 244 ms. Replay showed the speaking highlight; immediate mute, Escape and End cleared it. Muting disabled replay, captions remained intact, End opened the debrief, and Restart began fresh. Desktop (1280×900) and phone (390×844) controls fit after normal panel scrolling, as recorded in `plans/VOICE_V3_STATUS.md`; browser console had no errors or warnings. Logs: `out/voice-v3-verify-offline.log`, `out/voice-v3-bundle-voice.log`. Screenshots: `out/voice-v3-desktop.png`, `out/voice-v3-narrow.png`.

This is offline implementation acceptance subject to root's final consistency review. No cloud provider, Groq, or `.env` read occurred. It is not microphone or physical-speaker acceptance, a latency percentile result, V4 recovery/Listen acceptance, a scene-performance result, or demo readiness. P6.4 stays unchecked.
