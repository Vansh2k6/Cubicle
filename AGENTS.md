# Cubicle project instructions

Read [CONTEXT/AGENT.md](CONTEXT/AGENT.md) first. It is the lead project instruction document and defines the document precedence, current-phase workflow, and mandatory coder → reviewer → tester → orchestrator handoff.

Read all six CONTEXT documents before writing application code. Always follow [CONTEXT/RULES.md](CONTEXT/RULES.md). Use the Ponytail skill for the smallest complete change; do not skip safeguards or verification.

Voice V0–V4 entry point: [PROMPT/S1-V00-voice-start-here.md](PROMPT/S1-V00-voice-start-here.md).

Supplied voice prompts guide implementation. Tested obvious improvements within approved scope are authorised; the latest human instruction and project rules govern, so routine changes do not need fresh permission. The default fresh-session-per-prompt workflow saves tokens, but prompt text does not override a later human instruction.

The user explicitly permits private loading/inspection of the ignored repository-root `.env` (2026-10-21). Never display its contents or credentials, and never make live provider calls unless the user specifically requests them. Ignore `transcripts/`, `graphify-out/`, `dist/`, `node_modules/`, `evals/reports/`, and old `PROMPT` files except for their titles. The active prompt and its exact required source, gate, or report may be read; do not broadly scan `evals/reports`.
