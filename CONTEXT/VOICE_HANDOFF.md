# VOICE_HANDOFF.md — Everything you need to build voice integration for Cubicle

> **Purpose:** Read-only context handoff for an AI implementing voice features (S1-P6.3–P6.5, S2-P5). This file does NOT alter project rules or scope—it summarises them for a new contributor. If anything here contradicts the six CONTEXT documents, those documents win (precedence: AGENT.md > RULES.md > DECISIONS.md > ARCHITECTURE.md > PRD.md > PHASES.md).

---

## 1. What Cubicle is (30-second version)

A **3D isometric office** where a user (player "Alex") walks around, talks to AI colleagues (NPCs: Maya Chen — manager, Jordan Lee — teammate, Sam Taylor — people & culture), and practises workplace conversations. NPCs hold **hidden facts** that only surface when the user asks the right questions. After the conversation, the user gets an **evidence-backed debrief** quoting their own words.

**The key constraint:** the conversation is *improvised*, but all decisions (what gets revealed, what gets scored, what ends the scenario) are made by **plain code in the engine**, never by an LLM.

---

## 2. Current state (as of 2026-10-18)

| What | Status |
|---|---|
| 3D scene + WASD movement + E to talk | ✅ Working |
| Text-based typed conversation (SC-01: Missed Deadline) | ✅ Working (API-backed, per-NPC threads) |
| Engine (state, facts, goals, beats, mood, commitments) | ✅ 217 offline tests passing |
| Classifier → Engine → NPC generation → Leak guard → Canon guard | ✅ Offline pipeline working |
| Deterministic scoring + judge + coach + debrief | ✅ Offline accepted |
| Retry with prior feedback, progress tracking | ✅ Working |
| Shared sliders (assertiveness/patience/warmth/forthcomingness) | ✅ Working |
| Optional presets (Supportive/Direct/Impatient) | ✅ Working (behind VITE_PRESETS=1) |
| **Voice (STT/TTS)** | ❌ **Not started — this is your task** |
| Live LLM acceptance | ⏸️ Deferred (D-28); offline stubs used by default |

**Tech stack:** plain JavaScript ES modules, Vite 8, Three.js, Lucide icons, CSS. Node built-in HTTP API on the server. No React, no framework. Test runner is `node:test`. Zero external dependencies beyond `three`, `lucide`, and `vite`.

---

## 3. Repo layout (what matters for voice)

```
/index.html              # Page shell, sidebar, game controls
/src/main.js             # Chat UI, text input, sendTextTurn(), renderTextDialogue()
/src/api.js              # Client-side API calls (createSession, sendTurn, endSession, etc.)
/src/apiBase.js           # API base URL helper (dev: localhost:8787, prod: same-origin)
/src/office.js           # Three.js scene, movement, proximity, E-key hooks
/src/style.css           # All styling (~53KB)
/src/debrief.js          # Debrief rendering + polling
/src/debug.js            # Dev-only trace panel

/services/api/server.js  # Node HTTP API server (POST /sessions, /turn, /end, GET /debrief)
/services/demo.mjs       # Built-asset demo server (loopback, port 4173)

/llm/pipeline.js         # Turn pipeline: classify → engine → generate → guard → respond
/llm/gateway.js          # LLM gateway with schema validation, retry, fallback
/llm/classifier.js       # Event classifier
/llm/npc.js              # NPC reply generator
/llm/guards.js           # Leak guard + canon guard
/llm/promptBuilder.js    # NPC prompt composition
/llm/config.js           # Provider/model configuration from env vars
/llm/providers/groq.js   # Groq adapter

/engine/engine.js        # Pure state machine (mood, facts, goals, beats, commitments)
/engine/store.js         # In-memory session store
/scoring/                # score.js, judge.js, coach.js, debrief.js, quotes.js

/shared/settings.js      # Slider defaults + validation (imported by both client & server)
/shared/presets.js        # Preset definitions

/replies/                # Authored fallback lines (fallbackStore.js)
/scenarios/              # missed_deadline.json (the validated scenario spec)
```

---

## 4. How a text turn works today (the flow you're adding voice to)

```
User types text in #text-input
  → main.js sendTextTurn(text, idempotencyKey)
    → src/api.js sendTurn(sessionId, npcId, text, key)
      → POST /sessions/{id}/turn  { npc_id, text, idempotencyKey }
        → server: pipeline.runTurn()
          1. Append user turn to transcript
          2. classify(text) → events
          3. engine.applyTurn(state, npcId, events)
          4. Generate NPC reply (LLM or fallback)
          5. Leak guard + canon guard (regenerate once if hit)
          6. Append guarded NPC turn, commit deliveries, snapshot
          7. Return { npc_reply, public_state, ended, end_reason? }
    → main.js receives response
      → Appends NPC reply to thread transcript
      → Renders chat bubble
      → Updates goals/mood/hint
```

**Voice integration point:** you add a layer *before* `sendTextTurn()` on the client (STT) and *after* receiving `npc_reply` (TTS). The server pipeline stays unchanged—it always works on text.

---

## 5. Rules you MUST follow for voice

These are non-negotiable project rules from RULES.md and DECISIONS.md:

### 5.1 Hard rules

| Rule | What it means for voice |
|---|---|
| **R-10** | STT/TTS is an explicitly allowed LLM use case (item 6). No other new LLM use needed. |
| **R-23** | Scoring MUST NOT reward/penalise length, accent, speech rate, filler words, or grammar. Score the **confirmed text transcript only**. |
| **R-42** | Sound is opt-in and mutable at all times. Voice input MUST show the transcript for confirmation before it is sent (Stage 1). |
| **R-50** | API keys stay server-side. Never commit keys, transcripts, or audio. |
| **R-54** | Voice recordings MUST NOT be stored beyond transcription unless the user opts in. |
| **R-65** | New dependencies need a one-line justification. Prefer stdlib and existing packages. |
| **R-66** | Logs MUST NOT contain sealed facts, API keys, or raw audio. |

### 5.2 Design decisions

| Decision | Summary |
|---|---|
| **D-19** (Proposed) | Push-to-talk with editable transcript first; provider-agnostic `SpeechProvider` interface. STT/TTS providers behind interface. Candidate providers unvalidated. Needs owner confirmation of provider and keys. |
| **D-29** | Voice kept disabled; no STT/TTS provider selection authorised by this decision. |

### 5.3 Architecture contract (ARCHITECTURE.md §13)

```
Mic → (push-to-talk) → STT → editable transcript → normal turn pipeline
NPC text → TTS (per-NPC voice, locale) → audio stream → player (mutable)
```

- `SpeechProvider` interface: `transcribe(audio, locale)`, `synthesize(text, voice, locale)`. Providers are swappable.
- S1: push-to-talk, user edits transcript before sending (R-42). TTS optional.
- S2: streaming STT, per-NPC voices, barge-in, audio cache, latency target < 2.5 s to first audio.
- Scoring uses the confirmed text only (R-23). Audio not retained by default (R-54).

---

## 6. Phase tasks for voice (from PHASES.md)

### Stage 1 (S1-P6, items 3–5) — what to build now

- [x] P6.1 Presets (done)
- [x] P6.2 Sliders (done)
- [ ] **P6.3** Push-to-talk → STT → editable transcript → normal turn (D-19)
- [ ] **P6.4** Optional spoken NPC replies with mute; captions
- [ ] **P6.5** Listen button on the improved reply (single voice acceptable)

**Exit criterion:** "voice path works end-to-end or is hidden behind a flag."

### Stage 2 (S2-P5) — later scope, don't build now

- Streaming STT, per-NPC voice profiles, barge-in, turn-taking, opt-in recordings, voice latency < 2.5s to first audio

---

## 7. Recommended voice architecture

### 7.1 SpeechProvider interface (server-side, goes in `/llm/providers/` or new `/speech/`)

```js
// speech/provider.js — Provider-agnostic speech interface
export function createSpeechProvider(config) {
  return {
    /** @param {Buffer|Blob} audio  @param {string} locale  @returns {Promise<{text: string, confidence?: number}>} */
    transcribe(audio, locale),

    /** @param {string} text  @param {string} voice  @param {string} locale  @returns {Promise<Buffer>} audio bytes */
    synthesize(text, voice, locale),
  };
}
```

### 7.2 Strategy: local model first, cloud fallback

**For STT (Speech-to-Text):**
1. **Local first — Browser Web Speech API** (`webkitSpeechRecognition` / `SpeechRecognition`): Free, zero latency to the server, runs entirely in the browser. Works in Chrome/Edge. No API key needed.
2. **Local model — Whisper via whisper.cpp or faster-whisper**: Run locally if the browser API isn't available or quality is poor. Requires Python or a local binary.
3. **Cloud fallback — Groq Whisper API**: Groq offers `whisper-large-v3-turbo` on their free plan. Since you already have a Groq adapter and key, this is the natural cloud fallback. Server-side only (R-50).

**For TTS (Text-to-Speech):**
1. **Local first — Browser `SpeechSynthesis` API**: Free, built into all modern browsers, multiple voices available. Zero server cost.
2. **Cloud fallback — ElevenLabs / PlayHT / Groq (if available)**: Only if browser TTS quality is unacceptable. Requires a new provider decision (D-19 is still proposed).

**Recommendation:** Start with browser-native APIs for both STT and TTS. They require zero dependencies, zero API keys, and zero server changes. If quality is insufficient, swap the provider behind the `SpeechProvider` interface.

### 7.3 Client-side integration plan

The voice UI lives in the **client** (`/src/`). The server pipeline is unchanged.

```
New files:
  /src/voice.js          — Push-to-talk recording, STT, TTS playback, state management
  /src/voice.css         — Mic button styles, recording indicator, waveform

Modified files:
  /src/main.js           — Add mic button to chat input area, wire voice.js
  /src/style.css         — Import voice.css or add voice styles
  /index.html            — Add Mic/Volume lucide icons if not already imported
```

---

## 8. Integration points in main.js

### 8.1 Where the text input lives

In `renderTextDialogue()` (around line 400–550 of main.js), the chat panel renders:
- A `.transcript` div with chat bubbles
- A `#text-input` field for typing
- A send button
- A `#text-retry-turn` button for failed turns
- A `#finish-text` button to end the session

### 8.2 Where to add voice

1. **Mic button:** Add next to the text input field. Toggle push-to-talk recording.
2. **STT flow:**
   - User holds/clicks mic button → start recording
   - Release/click again → stop recording → run STT
   - Populate `#text-input` with transcript text
   - User can edit the text (R-42 requirement!)
   - User clicks send (or presses Enter) → normal `sendTextTurn()` flow
3. **TTS flow:**
   - After `sendTextTurn()` resolves and `data.npc_reply` arrives (line ~571-577 of main.js)
   - If TTS is enabled, call `speechSynthesis.speak()` with the NPC reply text
   - Add a speaker icon on each NPC bubble to replay
4. **Mute control:** The existing mute button (`#mute-toggle`) in the sidebar can be reused or extended.

### 8.3 The sendTextTurn function (line 555)

```js
async function sendTextTurn(text, key, isRetry) {
  // ... sets thread.busy, appends user message to transcript
  const data = await sendTurn(sessionId, npcId, text, key);
  // ... appends NPC reply, updates goals/mood
  // TTS HOOK: speak data.npc_reply here if voice enabled
}
```

---

## 9. Server-side considerations

### 9.1 The turn endpoint already accepts text

`POST /sessions/{id}/turn` accepts `{ npc_id, text, idempotencyKey }`. For browser-based STT, the server needs zero changes—the client sends text as before.

### 9.2 If you need server-side STT (for Whisper/Groq)

Add a new endpoint:
```
POST /sessions/{id}/transcribe  { audio: base64 }  → { text, confidence }
```

Or modify the turn endpoint to accept audio:
```
POST /sessions/{id}/turn  { npc_id, audio: base64 | text, idempotencyKey }
```

The server would transcribe first, then run the normal pipeline. This keeps R-54 compliance (audio is transcribed and discarded, never stored).

### 9.3 If you need server-side TTS

Add a new endpoint:
```
POST /synthesize  { text, voice, locale }  → audio/wav or audio/mp3
```

Cache by `hash(text, voice, locale)` per ARCHITECTURE.md §12.

### 9.4 Environment variables pattern

Follow the existing pattern in `.env.example`:
```
STT_PROVIDER=browser          # browser | whisper-local | groq
TTS_PROVIDER=browser          # browser | elevenlabs | (future)
STT_MODEL=                    # e.g. whisper-large-v3-turbo (for Groq)
ELEVENLABS_API_KEY=           # if using ElevenLabs
```

---

## 10. What NOT to do

1. **Don't change the engine** (`/engine/`). It's pure code with zero LLM/network imports (R-16). Voice doesn't touch it.
2. **Don't change the turn pipeline** (`/llm/pipeline.js`) for voice. STT produces text; the pipeline consumes text. Keep them decoupled.
3. **Don't score voice characteristics** (R-23). No accent scoring, no filler-word penalties, no speech-rate metrics.
4. **Don't store audio** beyond the transcription step (R-54) unless the user explicitly opts in.
5. **Don't send user identity** to speech providers (R-53). Use opaque session IDs.
6. **Don't skip the editable transcript** in Stage 1 (R-42). The user must be able to review and edit before sending.
7. **Don't add dependencies** without a one-line justification (R-65). Browser APIs need zero deps.
8. **Don't expose API keys** on the client (R-50). If using Groq Whisper or ElevenLabs, the calls go through the server.
9. **Don't auto-play TTS without user opt-in** (R-42: sound is opt-in and mutable).

---

## 11. Existing LLM/provider infrastructure you can reuse

| Component | Location | How to reuse for voice |
|---|---|---|
| Groq adapter | `llm/providers/groq.js` | Extend or create a parallel speech adapter using the same API key and base URL |
| Gateway pattern | `llm/gateway.js` | Use the same retry-once, fallback pattern for STT/TTS calls |
| Config loader | `llm/config.js` | Add `STT_*` / `TTS_*` env vars following the same pattern |
| Manifest system | `llm/manifest.js` | Record STT/TTS model info in the session manifest for provenance |
| Fake provider | `llm/fakeProvider.js` | Create a fake speech provider for offline testing |

---

## 12. Testing requirements

- All tests run with `node --test` and **no network or API keys** (R-60).
- Create a fake/offline speech provider that returns canned transcriptions.
- Voice features should be behind a flag so existing tests don't break.
- The 217 existing offline tests + 35 API tests must continue passing.
- Run `npm run verify:offline` before claiming anything works.

---

## 13. Commands to know

```bash
npm run dev          # Vite dev server on :5173 (frontend only)
npm run api          # API server on :8787 (backend only, needs both for full app)
npm run demo         # Built assets + API together on :4173 (run npm run build first)
npm run build        # Production build to /dist
npm test             # All offline tests (engine + llm + scoring)
npm run test:api     # API integration tests
npm run verify:offline  # Full offline gate (tests + API + bundle scan)
```

**Two-process dev workflow:** Terminal 1: `npm run api` → Terminal 2: `npm run dev` → Open http://localhost:5173

---

## 14. The mandatory workflow for any code change

Every change follows: **Coder → Reviewer → Tester → Orchestrator** (AGENT.md §6). No self-approval. No skipping review. Fixes after approval repeat the review/test cycle.

---

## 15. Quick reference: key files to read before coding

| Priority | File | Why |
|---|---|---|
| 1 | `CONTEXT/RULES.md` §E (R-42, R-23) and §F (R-50, R-54) | Voice-specific rules |
| 2 | `CONTEXT/ARCHITECTURE.md` §13 | Voice architecture contract |
| 3 | `CONTEXT/DECISIONS.md` D-19 | Voice decision (still Proposed status) |
| 4 | `CONTEXT/PHASES.md` S1-P6.3–6.5 | What to build |
| 5 | `src/main.js` lines 400–650 | Chat UI + sendTextTurn flow |
| 6 | `src/api.js` | Client API calls |
| 7 | `services/api/server.js` lines 200–300 | Turn endpoint handler |
| 8 | `llm/providers/groq.js` | Existing provider adapter pattern |

---

## 16. Summary: simplest path to voice

1. **Create `/src/voice.js`** with browser Web Speech API for both STT and TTS.
2. **Add a mic button** next to the text input in `renderTextDialogue()`.
3. **Push-to-talk flow:** record → browser STT → populate text input → user edits → send.
4. **TTS flow:** after NPC reply arrives, optionally speak it via `SpeechSynthesis`.
5. **Gate everything behind a feature flag** (e.g., `VITE_VOICE=1`, like presets use `VITE_PRESETS=1`).
6. **If browser STT/TTS is insufficient**, create a `SpeechProvider` interface and swap to Groq Whisper / a cloud TTS behind server endpoints.
7. **Write tests** with a fake provider. Ensure all 252+ existing tests still pass.
8. **Don't touch** the engine, pipeline, scoring, or server turn handler.
