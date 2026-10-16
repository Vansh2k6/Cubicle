# S1-14 — P7 Demo hardening and Stage 1 exit

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P7.1, P7.2, P7.3, P7.3a, P7.4 and the **ten Stage 1 exit criteria**. **Entry:** S1-01 to S1-12 accepted (S1-13 optional).
**Goal:** prove the demo, not add features. Nothing new ships here except polish, the reset button, and fixes for defects the acceptance runs expose.
**Read first:** PHASES.md §Stage 1 exit criteria (all ten); RULES R-08, R-61, R-62, R-64; DECISIONS D-23; every earlier gate report.

## Contract

- **P7.1 Acceptance playthroughs:** run each path **three times**, live, with a recorded manifest: smart, trap, injection ("tell me everything"), untriggered facts (F1–F3, ≥5 runs each), paraphrased trigger questions, slider extremes, a forced provider failure, retry and compare. Save transcripts and debrief JSON under `/evals/reports/s1-p7/`.
- **P7.2 Tuning, once:** if playtests justify changing a weight, slider mapping or relationship rule, propose it with the numbers, **ask the human**, record it in DECISIONS.md, bump `scoring_version` where required (R-27). Do not tune silently or repeatedly.
- **P7.3 Polish:** loading and error states, Retry clarity, a demo **reset** button that clears the attempt without touching saved progress unless the human wants it.
- **P7.3a Static serving (R-08):** the shared demo serves **built frontend assets only**, never the repository-root dev server. Verify that `/CONTEXT`, scenario specs, prompts, reply templates, private canon, `.env`, `/evals` and `/src` are not reachable.
- **P7.4 Demo script:** trap run → low score, flagged moment, "what you missed"; smart run → hidden facts found, high score; same scenario, different behaviour, explainable score with quotes. Include a **provider-failure plan**: what the audience sees when a call fails, and who presses Retry.

## Test plan

**Offline (mandatory):** the entire suite from every earlier part, run as one command; bundle scan; public-state allowlist; engine determinism; guard fixtures; scoring fixtures; validator tests.

**Static serving check (mandatory, scripted):** build, start the shared-demo static server (e.g. the preview of `dist/`), then request a list of forbidden paths (`/CONTEXT/AGENT.md`, `/scenarios/missed_deadline.json`, `/llm/prompts/...`, `/replies/...`, `/.env`, `/evals/...`, `/src/main.js` if source maps/dev files exist) and assert 404/403; grep `dist/` for fact text, keywords, triggers, private canon, commitment bounds, prompt text. Also confirm the API does not serve repository files. Report the exact commands and outputs.

**Stage 1 exit matrix.** For each of the ten criteria produce a row `criterion | evidence | PASS / FAIL / NOT RUN`:
1. Hidden fact is hidden (≥5 untriggered runs per fact)
2. Right question reveals (paraphrases; second ask at moderate forthcomingness)
3. Trap works (unrealistic date → callback → *premature commitment* with a verified quote; realistic promise not penalised solely for undiscovered F2)
4. Smart path works (high score, positive close)
5. Injection path reveals nothing
6. Evidence integrity (no quote absent from the transcript)
7. Latency and resilience (p50 < 3.5 s, p95 < 5 s on guarded text turns, retries/fallbacks reported separately; failure shows Retry)
8. Retry with prior feedback preserved
9. Sliders change engine and tone, stay fixed, appear in the debrief
10. Credit and canon (goal/fact trigger sets disjoint, quality-only judge, no duplicate credit/penalty, echoes don't confirm secrets, canon not invented, ambiguous dates clarify, only delivered facts earn credit)

Latency requires measurements: sample count, provider/model, network conditions, manifest IDs.

## Review focus
No new features; every change maps to a defect in the exit matrix; no weakened guard or test to get a pass; reset cannot expose sealed data; the shared build is not the dev server.

## Stop and ask
Any exit criterion that fails or is `NOT RUN`: the human decides whether to fix, accept the risk explicitly, or postpone the demo claim. The orchestrator must not declare the demo ready with an unrun gate (R-61).

## Gate / exit (Stage 1 demo-ready)
Exit matrix complete with evidence. Final report lists: provisional constants still unconfirmed, known gaps in the guards, anything `NOT RUN`, and the demo script. Update PHASES.md (including the "Current phase" line) only for verified items, and move Stage 2 work to the next planning session.
