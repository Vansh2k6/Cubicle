# S1-06 — P3a Scene threads, goal checklist, knowledge silos

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P3.1, P3.2, P3.3. **Entry:** S1-05 accepted (or its live checks explicitly recorded as `NOT RUN` and acknowledged by the human).
**Goal:** the player walks between Maya, Jordan and Sam; each is a separate conversation with its own history, mood and knowledge; the checklist and next-step hint follow goal state.
**Read first:** ARCHITECTURE §5, §6.5, §16, §18; PRD §7.3 (FR-20–FR-25); RULES R-03, R-04, R-31, R-41; DECISIONS D-05, D-11.

## Contract

- **Scene → API (P3.1):** pressing E near an NPC calls `interact{npc_id}` (existing `onNear`/`hooks.onTalk()` carry the nearby NPC). ESC, the close button, or walking out of range closes the panel. The scene holds **no** scoring or sealed data (D-11).
- **Threads:** per-NPC conversation history, mood and `told_by_user`. Re-opening an NPC resumes their thread. An in-flight turn is not lost when the panel closes (resolve it, show it on reopen).
- **Goal checklist and next step (P3.2):** the UI shows G1/G2/G3 pending/done from **public state**. "Next small step" is driven by goal state: before G1 → talk to Maya about the missed deadline; after G1 before G2 → check in with Jordan about what's left; after G1+G2 before G3 → go back to Maya and agree a plan. G3 shows as locked until G1 and G2 are done (it `requires` them).
- **Public NPC availability:** the API returns who is available; Maya's callback deferral (S1-07) must not require exposing her state.
- **Silos (P3.3):** Jordan owns F2 (trigger `asked_for_help`), Sam owns F3 (`asked_advice`, `acknowledged_concern`), Maya owns F1. Each NPC's prompt contains only its public context, its own revealed facts, what the user told it, and the current act's authorised pending disclosure.

## Test plan

**Offline (fake provider):**
1. **Silo prompt scan** across all three NPCs and states: Jordan's and Sam's prompts never contain F1; Maya's and Sam's never contain F2; Maya's and Jordan's never contain F3; a fact appears in another NPC's prompt **only** as the user's own words in that NPC's transcript.
2. Thread isolation: turns with Jordan don't change Maya's history or mood; `told_by_user` per NPC.
3. Goal state → checklist/next-step mapping table for every state combination (G1/G2/G3 pending/done; G3 locked until both).
4. Public-state allowlist still holds with multiple NPCs; no mood numbers, no hidden goals, no triggers.
5. Close/reopen: in-flight turn resolution; resumed history; no duplicate NPC turn.
6. Bundle scan (as in S1-05) still zero hits; existing SC-02/03 scripts still complete.
7. Full offline suite green.

**Manual, screenshots/transcripts saved:** walk to each NPC; E opens the right thread; ESC and walking away close; checklist ticks live; next-step text changes; keyboard-only; text-only harness reaches the same states.

**Live (provider; else `NOT RUN`):** one real conversation with each NPC; verify Jordan never states F1 and Sam never states F2 unprompted; record transcripts.

## Review focus
Silos enforced by what enters prompts (not by instructions); no engine logic in the scene; thread state lives server-side; no new dependencies.

## Stop and ask
Any change to NPC `topics` or fact ownership; any proposal to share information between NPCs.

## Gate / exit
Per-NPC threads, checklist and silos work in the scene and in the text-only harness; offline suite green; manual evidence saved; live checks run or `NOT RUN`. P3.4–P3.6 remain for S1-07.
