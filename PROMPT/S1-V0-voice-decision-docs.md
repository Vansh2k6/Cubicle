# S1-V0 — Voice decision record and doc updates (no code)

> **Head document: `AGENT.md`.** Read `S1-V00-voice-start-here.md` first. Follow AGENT.md §6 handoff even for documentation (R-64: doc-only changes need a consistency report, not fabricated runtime evidence).

**Why first:** D-19 is `Proposed`; D-29 says no STT/TTS provider selection is authorised; R-71 requires a dated decision **before** code merges. Nothing in V1–V4 may start until this is accepted.

## Tasks

1. **DECISIONS.md — add D-35 (status: Proposed until the human confirms in chat; then flip to Accepted with date).** Content:
   - Supersedes D-19's provider uncertainty and D-29's "no provider selection" for **voice only**, English only.
   - Interface: `SpeechProvider` (`transcribe`, `synthesize`); chain config `VOICE_STT_CHAIN`, `VOICE_TTS_CHAIN`.
   - Primary provider for the demo is chosen by measurement (V4): local sidecar (faster-whisper `small.en` STT; Piper default TTS, Kokoro optional) is primary if added voice latency on the demo laptop is under about 1.5 s per turn and the 3D scene does not stutter; otherwise a cloud adapter becomes primary in a later decision and local is shown as offline mode. Cloud is **not** implemented by this decision.
   - Delivery model: STT via `POST /sessions/{id}/voice/stt`; TTS only for committed guarded NPC turns and stored guarded debrief replies, addressed by id; no route accepts client text for synthesis.
   - Privacy: audio in memory only, never persisted/logged (R-54, R-66); opaque session IDs only (R-53); scoring on confirmed text only (R-23).
   - Voice default off behind flags; typed input permanent.
   - Records that browser `SpeechRecognition` is rejected as "local" STT (vendor-cloud) and that static pre-rendered audio of fallback/reveal lines is forbidden.
2. **ARCHITECTURE.md §13** — replace the voice contract with the above delivery model (sequence: PTT → MediaRecorder → server STT → editable transcript → normal turn → committed guarded reply → speech descriptor → prefetch → client fetch → play). Add the one new public-state field: `speech: { available: boolean, turn_id: string, mode: "server" | "browser" | "none" }` on the turn response; state explicitly that it carries no text, labels or fact data. Update the latency section: voice adds STT + TTS time to the text-turn budget (D-23) and is reported **separately**, never merged into the text p50/p95.
3. **RULES.md** — do not edit rule wording. Only add a pointer under R-42/R-54 to D-35 if the existing style does this for other decisions.
4. **PHASES.md** — annotate P6.3–P6.5 with the V1–V4 slice names; keep unchecked. **AGENT.md** — add the new commands only when they exist (do not pre-document `voice:*` scripts); note D-35 in the decision list.
5. **VOICE_HANDOFF.md** — add a top banner: "Superseded where it conflicts with S1-V00 §2" (do not delete content).

## Gate / exit

Consistency report: grep proves D-35 referenced from ARCHITECTURE §13, PHASES P6.3–6.5; no document claims voice is implemented; no rule weakened. Human confirms D-35 → status Accepted. Then V1 may start.

This V0 session ends at its handoff even after D-35 approval. Start V1 only in a fresh `feat/voice-v1` session from the accepted V0 tip, in its own isolated checkout.
