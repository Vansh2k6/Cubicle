# S1-13 — P6.1 / P6.3–P6.5 Presets and voice (OPTIONAL, may slip)

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P6.1, P6.3, P6.4, P6.5. **Entry:** S1-12 accepted **and** the human says go. Under D-23 these may slip; skipping this part does not block S1-14.
**Goal:** three presets over the sliders, and a push-to-talk path that feeds the normal text turn.
**Read first:** ARCHITECTURE §13; PRD FR-50, FR-60, FR-61; RULES R-23, R-42, R-54; DECISIONS D-15, D-19 (voice is **Proposed**).

## Ask the human first (HUMAN STOP)

- Go / no-go for presets, voice input, spoken replies, Listen button (each can be cut independently).
- **Speech provider** for STT/TTS (D-19, O-06). Options to compare: browser speech APIs (no new dependency, but audio may go to the browser vendor and support varies) versus a server-side provider behind a `SpeechProvider` interface. Note R-54: recordings must not be stored beyond transcription without opt-in. Keys stay server-side.
- Preset vectors: propose Supportive / Direct / Impatient values over the four sliders and ask for confirmation; they are provisional.

## Contract

- **Presets (P6.1):** each maps to a slider vector; selecting one fills the sliders, which remain editable and are still fixed at session start. Difficulty label derives from the vector as in S1-12.
- **Voice input (P6.3):** push-to-talk → STT → **editable transcript the user must confirm** → normal turn pipeline (R-42). Scoring uses the confirmed text only (R-23). Denied microphone or STT failure falls back to text with a clear message; typing is never blocked.
- **Spoken replies (P6.4):** optional TTS of the guarded NPC line **after** it passes the guards; mute is always available; captions always shown; sound is opt-in (R-42).
- **Listen (P6.5):** a button on the improved reply in the debrief; a single voice is acceptable.
- **Feature flags:** everything here is behind flags and hidden when off or when the provider is absent.

## Test plan

**Offline (mandatory):**
1. Preset table → slider vectors → the S1-12 parameter table results; label derived correctly.
2. Voice flow with a fake `SpeechProvider`: nothing is sent to the turn endpoint until the transcript is confirmed; editing the transcript changes what is sent; cancel sends nothing.
3. STT failure/timeout/denied permission → text input still works; no duplicate or phantom turn.
4. TTS is requested only for guard-approved text (fake provider asserts it never receives a rejected reply or sealed text); mute prevents any playback request; captions match the text.
5. **R-54:** no audio persisted in the session dump, logs or server storage by default; test the dump and log output.
6. Flags off → no voice UI, no provider calls.
7. Full offline suite green; bundle scan clean; the debug panel rules unchanged.

**Manual with screenshots/recordings saved:** each preset; push-to-talk edit-and-send; deny the microphone; mute; Listen button.

**Live (provider; else `NOT RUN`):** end-to-end voice turn on a real provider; report the added latency separately from the text-turn p50/p95 (the 3.5 s/5 s targets apply to guarded **text** turns; voice has its own number, recorded not assumed).

## Review focus
Transcript confirmation cannot be bypassed; TTS sits after guards; no audio storage; flags default off; no Stage 2 voice features (streaming STT, barge-in, per-NPC voices).

## Stop and ask
Provider choice, any dependency, any storage of audio.

## Gate / exit
Each shipped feature is verified and flagged, or hidden behind a flag and recorded as not shipped. Report plainly what was cut.
