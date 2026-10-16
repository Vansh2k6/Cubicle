# S1-09 — P4b Judge, quote validator, coach

> **Head document: `AGENT.md`.** You are the Orchestrator (root). Follow AGENT.md §2 (precedence), §3 (before code), §6 (coder → reviewer → tester → orchestrator), §8 (done), §9 (ask). Also read `/CONTEXT/prompts/S1-00-start-here.md` for the gate protocol, test vocabulary and report format. This prompt never overrides a project document.

**PHASES.md items:** P4.2, P4.3, P4.5. **Entry:** S1-08 accepted.
**Goal:** the LLM-judged 25 points and the coaching text, with every claim tied to a verified quote, and nothing re-awarding what code already scored.
**Read first:** ARCHITECTURE §11.2; RULES R-12, R-13, R-14, R-21–R-23, R-25, R-44; DECISIONS D-09, D-14, D-20, D-24.

## Contract

- **Judge:** one call after the session; temperature 0; JSON schema. Dimensions (0–5 each): `honest_status`, `ownership`, `recovery_planning`, `communication`, `collaboration_under_pushback`. Per dimension: `{score | null, turn_id, quote, explanation}` where the quote is **verbatim** from that **user** turn.
- **Quality only (R-22):** anchors (0 absent/harmful, 3 adequate, 5 exemplary, one observable example per dimension) describe *how well* something was said, never *whether* a goal/fact/commitment was achieved. The judge input lists the code-assessed achievements as "already scored elsewhere, do not reward". A quote may support a quality assessment; mentioning a scored achievement earns nothing by itself. Write anchors so "ownership" is about specificity and accountability of the wording, not about triggering `took_ownership`.
- **Fairness (R-23, D-20):** no reward for length, accent, speed, filler, or grammar polish. The prompt says so; the tests probe it.
- **Quote validator (code):** `turn_id` must exist and be a **user** turn; quote non-empty and a whitespace/case-normalised substring of that turn (normalise curly quotes/dashes). Failure → that dimension becomes `insufficient`, **0 points**, never silently kept. `null` → 0.
- **Failure behaviour (R-12):** invalid JSON → retry once → all dimensions `insufficient`; deterministic results still shown.
- **Coach:** input = flagged moments **from code** and the transcript **up to each moment**, plus `user_known` at that moment (from the per-turn snapshot). Output per moment `{what_happened, why_it_matters, better_reply}`. `better_reply` may use only what the user knew then (R-25), must not contain any undiscovered sealed fact (run the leak scan with facts not in `user_known` at that moment), and models the **question** that would have uncovered a fact. If it fails the scan: regenerate once, else fall back to the fact's authored `unlock_question`. At least one improved response is mandatory. Tone (R-44): name what went well first; describe moments, never label the person.

## Test plan

**Offline (fake provider; mandatory):**
1. Validator table: valid quote passes; quote not in turn → `insufficient`; quote from an NPC turn → rejected; wrong `turn_id` → rejected; unknown `turn_id` → rejected; empty quote → rejected; case/whitespace/curly-quote variants pass; partial-word substrings handled as documented.
2. Judge failure paths: malformed JSON → one retry → all `insufficient`; schema-invalid → same; temperature 0 asserted; manifest referenced.
3. Points: sum of verified dimensions only; `null`/`insufficient` = 0; total never exceeds 25.
4. **No re-award test:** a transcript where the user only achieved goals but spoke vaguely, with a fake judge that tries to give 5s citing the goal turns — the pipeline's prompt/inputs mark those as excluded; assert the prompt contains the exclusion list and that the debrief shows rubric points separately (R-20). (Offline can only verify the instructions and plumbing; live eval checks behaviour.)
5. Coach: prompt contains the transcript only up to the moment and only `user_known` facts of that moment; a `better_reply` that contains an undiscovered fact is regenerated, then replaced by `unlock_question`; original-line quote verified; at least one improved reply present even when the LLM fails (fallback).
6. Tone check (manual list in the report): "what went well" first; no personal labels.
7. Full offline suite green.

**Live (provider; else `NOT RUN`; record manifests):**
- **Consistency:** judge the **same** recorded smart transcript and trap transcript **5×** each; report per-dimension variance (PRD target ±1; a target until measured).
- **Fairness probes:** (a) concise vs padded versions of the same content, (b) casual vs polished grammar with the same content → scores should not differ by more than the observed noise; report the numbers.
- **Quote integrity:** 100% of returned quotes pass the validator across all live runs, or list failures.

## Review focus
Validator is code, not a prompt; judge cannot see sealed facts for scoring purposes beyond what the user said; coach input comes from snapshots, not a re-derivation; fallbacks exist for every LLM failure.

## Stop and ask
Rubric anchor wording changes after calibration (R-27 bump + human approval); any extra judge dimension.

## Gate / exit
All offline tests pass; live consistency and fairness runs reported or `NOT RUN`. Do not claim calibration. The ≥85 / <50 targets are validated in S1-10 with the full debrief.
