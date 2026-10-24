# S1-V3 — NPC speech: turn-scoped audio, voices, captions, mute

> **Head document: `AGENT.md`.** Read `S1-V00-voice-start-here.md` (especially §2 items 2–4) first. Follow §6 handoff. **Entry:** V2 accepted. UI: D-28 (DESIGN.md + Impeccable).
**PHASES.md item:** P6.4. **Read first:** RULES R-01–R-04, R-09, R-42, R-54, R-66; ARCHITECTURE §5/§13; `llm/pipeline.js` (where the guarded reply is committed), `services/api/server.js` turn handler and public-state allowlist, `replies/fallbackStore.js`, existing mute control.

## Contract

- **Where TTS lives:** a `speech` module invoked by the turn handler **after** the guarded NPC turn is committed to the transcript and deliveries are committed. It never runs on a pending, rejected, regenerated-away or suppressed reply, and never on text that has not passed both guards (fallbacks included, since they are guarded). No change to pipeline decisions, engine, scoring.
- **Turn response gains one field:** `speech: {available: boolean, turn_id: string, mode: "server"|"browser"|"none"}`. No text, voice name, fact data, act or guard info. Update the public-state allowlist test.
- **Prefetch:** on commit, the server starts synthesis in the background (promise stored in a per-session in-memory map keyed by `turn_id`), using the chain `VOICE_TTS_CHAIN`. If the first provider fails/times out → next; if only `browser` remains or all fail → `mode:"browser"` (client speaks the already-displayed caption text with `speechSynthesis`) or `"none"`.
- **Route:** `GET /sessions/{id}/turns/{turn_id}/audio` → audio bytes from the prefetch (await in-flight, ≤ timeout). The server looks up the **committed NPC turn text itself**; it accepts no text parameter. Unknown/foreign/uncommitted turn → 404. A user turn id → 404. Cache per session with a small LRU; wiped on session end/delete. Responses `Cache-Control: no-store`.
- **Per-NPC voice map** from server config (Maya, Jordan, Sam distinct; map validated at startup against the sidecar's voice list when reachable). Voice chosen by the turn's `npc_id` server-side, never by a client parameter.
- **Pre-rendering (optional optimisation):** only authored, non-sealed lines (openers/greeting/deflect/walkout variants) may be pre-synthesized at server start into the in-memory/server-private cache; **never** `reveal_fact:*` fallback lines in any static or client-reachable location. If unsure, do not pre-render. The audio route still serves only after the line is committed.
- **Client (`src/voice.js`):** an audio queue (one NPC line at a time; new line stops the previous), plays via `AudioContext`/`HTMLAudioElement` after the opt-in unlock; **captions always shown** (the chat bubble is the caption); speaker icon on NPC bubbles replays the same `turn_id`; **mute** is the existing mute control and a per-voice toggle, immediate and persistent; speaking NPC gets a speaker highlight/pulse in the scene overlay or name tag (presentation only, `hooks` not engine); playback stops on mic press, panel close/ESC, session end, or mute.
- Audio fetch failure is silent beyond a small "audio unavailable" affordance; text conversation is unaffected; retry never duplicates a turn (audio is separate from `sendTurn`).
- Logs record `{session_hash, turn_id, provider, bytes, latency_ms, outcome}`; never text of undisclosed facts, never audio (R-66, R-54). The debug trace (R-15) gains `tts_provider` and `tts_latency_ms` only when the debug flag is on.

## Test plan (offline, fake provider)

1. **Leak/credit invariants:** a reveal that is pending-but-not-committed produces no audio request; a rejected/regenerated reply is never synthesized (assert the fake provider's call log contains only committed final text); a leak-guard fallback line is what gets voiced.
2. **No arbitrary TTS:** no route accepts text; audio route with another session's id, a user turn id, a future id → 404; grep test over the route table.
3. Public-state allowlist includes `speech` and nothing else new; no mood numbers/act/trace in responses.
4. Chain: local fails → browser mode flagged; all fail → `none`; text response unaffected and timing of text response not increased by synthesis (response returns before audio completes — assert with a deliberately slow fake).
5. Per-NPC mapping: Maya/Jordan/Sam map to different voice ids; unknown npc → no audio.
6. Cache wiped on end/delete; no fs writes; no audio in logs/snapshots/dumps.
7. Client unit tests: queue ordering, stop-on-mic, mute, replay, captions present with audio off; flag off → no audio code runs; bundle scan zero hits (especially: no fallback line audio or text newly shipped in `dist`).
8. Existing suites green; engine tests untouched.

**Manual with screenshots:** hear distinct voices per NPC; captions match audio; mute works mid-line; ESC stops; typed-only with voice off unchanged. **Live:** none.

## Review focus
TTS strictly downstream of guards; response not blocked by synthesis; no client-controlled text or voice; nothing sealed reachable statically.

## Stop and ask
Pre-rendering anything that might contain fact text; adding any text or voice parameter to a route; scene animation beyond a highlight.

## Gate / exit
NPCs speak their committed guarded lines with captions and mute; invariants tested; offline suite/build/bundle scan green. Live acceptance still NOT RUN; no demo-ready claim.
