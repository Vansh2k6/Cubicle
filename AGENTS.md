# Cubicle project instructions

Read [CONTEXT/AGENT.md](CONTEXT/AGENT.md) first. It is the lead project instruction document and defines the document precedence, current-phase workflow, and mandatory coder → reviewer → tester → orchestrator handoff.

Read all six CONTEXT documents before writing application code. Always follow [CONTEXT/RULES.md](CONTEXT/RULES.md). Use the Ponytail skill for the smallest complete change; do not skip safeguards or verification.

Voice V0–V4 entry point: [PROMPT/S1-V00-voice-start-here.md](PROMPT/S1-V00-voice-start-here.md).

For voice work, never read the repository-root `.env`; ignore `transcripts/`, `graphify-out/`, `dist/`, `node_modules/`, `evals/reports/`, and old `PROMPT` files except for their titles. The active prompt and its exact required source, gate, or report may be read; do not broadly scan `evals/reports`.
