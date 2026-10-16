# S1-10 — P4c Debrief assembly, screen, and P4 exit

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P4.6 and the **S1-P4 exit**. **Entry:** S1-09 accepted.
**Goal:** the user ends (or completes) a scenario and sees an explainable debrief. Then validate the trap and smart-path targets with evidence.
**Read first:** PRD §8 (debrief content), FR-30–FR-35; ARCHITECTURE §11, §18; RULES R-03, R-20, R-21, R-24, R-26, R-44; DECISIONS D-07, D-24.

## Contract

- **Debrief record** (server-side, generated asynchronously after `POST /sessions/{id}/end`; client polls): total /100, band (suggested: 85+ Excellent, 70–84 Strong, 50–69 Developing, <50 Needs work), metric breakdown with **deterministic and judged points shown separately** (R-20), timeline with code-derived flags, top-2 improvement priorities, per-moment cards (your line → what happened → why it matters → better reply), **what you missed** (undiscovered facts now shown, with the unlocking question), the weights and `scoring_version` used, and the session's slider settings (placeholder until P6.2).
- **API:** `GET /sessions/{id}/debrief` returns the record only **after** the session has ended; before that, a not-ready/forbidden response with no missed-fact data (R-03). Missed-fact disclosure is **debrief-only** and changes no credit.
- **Failure handling:** judge or coach failure never blanks the screen; show deterministic results and mark the rest "unavailable, retry".
- **Screen:** supportive tone (R-44): "what went well" before fixes; moments, not labels. Replace the P3 placeholder end view. Clean and fast; no animation work.

## Test plan

**Offline (mandatory):**
1. API: debrief unavailable before end; available after; the live-session allowlist test still passes; no sealed data before end.
2. **Quote integrity (automated):** for each debrief produced from the smart, trap and vague fixtures, extract every displayed quote and assert it is a normalised substring of the stated user turn. Zero exceptions.
3. Debrief record contains weights, `scoring_version`, flags with `turn_id`, and separate deterministic/judged subtotals; totals reconcile with the S1-08/S1-09 fixtures.
4. Failure injection: judge down → deterministic part + "unavailable" marker; coach down → fallback `unlock_question`/improved reply still present.
5. Trap fixture: `premature_commitment` flag with the **right quote** and turn; "what you missed" lists F1 and F2 (after end only).
6. Full offline suite green; bundle scan clean.

**Offline score-target check with fixture-injected rubric scores:** compute smart and trap totals with a documented plausible rubric vector (state the vector and why). This shows arithmetic feasibility only; label it as such.

**UI verification:** manual checklist with screenshots saved (header, breakdown, timeline, priorities, moment cards, missed facts, failure state). An automated browser smoke test only if the human approves a dev dependency (R-65); otherwise say it was not automated.

**Live (provider; else `NOT RUN`):** play one real smart run and one real trap run through the whole pipeline to the debrief. Record: totals, subtotals, flags, every displayed quote verified. Report whether **smart ≥ 85** and **trap < 50** actually held. If not, do **not** tune silently: report numbers, propose a change, ask the human; any weight/anchor change bumps `scoring_version` (R-27).

## Review focus
Nothing about missed facts is reachable before end; every quote path goes through the validator; deterministic vs judged separation visible in the UI; supportive tone; no new scoring logic in the client.

## Stop and ask
Weight, band or anchor changes; any dev dependency for UI tests.

## Gate / exit (PHASES.md S1-P4)
Every displayed quote verified (automated); trap flags *premature commitment* with the right quote; smart ≥85 and trap <50 **measured** live or explicitly `NOT RUN`/missed with numbers. Do not tick P4 complete on offline-only evidence for the score targets.
