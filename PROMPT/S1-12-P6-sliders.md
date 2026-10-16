# S1-12 — P6.2 Core sliders (HUMAN STOP on two items)

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P6.2 only (core in Round 2; D-23). P6.1, P6.3–P6.5 are in S1-13 and may slip. **Entry:** S1-11 accepted (P0–P5 exits passed).
**Goal:** four sliders set on a pre-session screen that change **both** engine parameters and NPC tone, are fixed for the attempt, and are recorded and shown in the debrief.
**Read first:** ARCHITECTURE §6.3; PRD FR-50–FR-53; RULES R-31, R-32; DECISIONS D-15, D-23; S1-02's provisional constants.

## Ask the human first (HUMAN STOP)

1. **Which NPCs do the sliders apply to?** Stage 1 options: (a) one set applied to all three NPCs, (b) Maya only, (c) per-NPC (FR-53 is Stage 2). Recommend with reasons (Maya owns B2/B3 pressure; forthcomingness matters for every fact owner). Default if unanswered: (a), listed as provisional.
2. **Difficulty label formula** (Easy/Medium/Hard) is not defined in the docs. Propose one, for example the mean of assertiveness, (100 − patience), (100 − warmth), (100 − forthcomingness) with provisional cutoffs, and ask to confirm. The label is **display only**; **no score multiplier** (Stage 2).

## Contract

- **Setup screen:** scenario card + briefing + visible goals + four sliders (0–100, default 50) + a short preview line (e.g. "Maya: impatient and guarded") + derived difficulty label + Start. It wires into the P5 "Try again with new settings" path.
- **Session creation:** `POST /sessions` accepts the four values; validate integers 0–100 (reject or clamp per documented policy). **Fixed at session start:** no endpoint changes them mid-attempt (R-32).
- **Engine effects** (already parameterised in S1-02, now fed real values): assertiveness (B2 earlier, harsher B3), patience (mood drop and walkout threshold), warmth (start mood and gains), forthcomingness (asks needed).
- **Tone text:** a versioned prompt-text file mapping slider ranges to phrases ("calm, lets you finish" ↔ "clipped, sighs, short sentences", "friendly, uses first name" ↔ "cold, transactional", "shares context easily" ↔ "guarded, minimal answers", "tentative" ↔ "direct, firm"). Tone text carries **no** scenario secrets and must not override the act or guards.
- **Record and show:** settings stored in the session record and displayed in the debrief ("You played against: low patience, guarded"). Scoring rules are unchanged by sliders except through the mood they cause.

## Test plan

**Offline (mandatory):**
1. **Parameter table:** for sliders at 0/50/100, assert each engine parameter against ARCHITECTURE §6.3 anchors (patience drops 15/8/3; walkout thresholds 25/…/5; warmth start mood 35 + 0.3×w; forthcomingness asks needed per band; B2 at turn 4 vs 3).
2. **Same-script comparison:** one scripted event list run at patience 10 and patience 90 → different mood trajectories and different walkout timing; assert the numbers differ in the expected direction.
3. **Tone text:** extremes produce distinct, non-empty tone strings; prompt-leak scan from S1-03/S1-06 still passes with tone text included; tone text never contains fact content or private canon.
4. **Immutability:** an attempt to change sliders mid-session is rejected; the stored session record equals the creation input.
5. **Validation:** out-of-range, non-numeric and missing values behave per policy; defaults are 50.
6. **Debrief:** settings and difficulty label present and correct; no score multiplier applied (total unchanged by label).
7. Full offline suite green; bundle scan clean.

**Manual with screenshots saved:** setup screen with each slider moved; preview line updates; Start; difficulty label; debrief shows settings; Try again with new settings.

**Live (provider; else `NOT RUN`):** play the **same** typed script at (patience 10, warmth 10, forthcomingness 10) versus (patience 90, warmth 90, forthcomingness 90); save both transcripts side by side. Verify visibly different tone and mood trajectories, that the guards still hold (no leaks), and that facts reveal later at low forthcomingness.

## Review focus
Engine consumes values from config, not from the prompt; prompts only describe tone; no hidden-fact leakage via tone text; sliders cannot change after start.

## Stop and ask
Any multiplier, any new slider, any per-NPC UI (Stage 2).

## Gate / exit (PHASES.md S1-P6.2 and Stage 1 criterion 9)
Settings change engine parameters and NPC tone, stay fixed, and appear in the debrief. Report provisional constants and the human's two answers.
