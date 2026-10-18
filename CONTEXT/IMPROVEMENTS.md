# Improvements backlog — 2026-10-18

**Purpose.** Advisory pickup list for the next working session. It records observations from one explicitly authorised live Groq trial and existing project contracts; it does **not** approve a specification, score/taxonomy/weight change, new live calls, a stage completion, or a push/PR. Current phase remains S1-P7 acceptance pending. Round 2 remains internal Stage 1, not a demo-ready claim.

## Morning order

1. Freeze and review a small, sanitized trial record: request count, HTTP status, role/model, retry/fallback state, guard/delivery outcome, latency and debrief readiness. Do not retain raw transcripts or secrets (R-50/R-66).
2. Reproduce provider/JSON failure handling offline first, then review the existing gateway, API response mapping, and UI retry/degraded state together. Keep the existing bounded retry/fallback contract.
3. Inspect classifier examples, event mapping, engine goals, and guard/act priority for the observed semantic mismatches before proposing a change. Write fair paraphrase regressions before adjusting any prompt or threshold.
4. Run an offline harness review: existing runners marked NOT RUN are stubs, so make the acceptance harness capable of recording bounded authorized runs before spending any new provider allowance.
5. Only after an accepted decision and a separately bounded authorization, run the relevant live matrix and assess the full Stage 1 gates. Push/PR remains on hold.

## P0 — resilience and safe observability

**Evidence.** The trial used 20 outbound requests (18 browser, two isolated classifier): 16 HTTP 200 and four HTTP 400. A 200 establishes neither schema-valid JSON, guard success, nor delivered reply success. One isolated 400 was `json_validate_failed`; there is no evidence that this explains the other three. D-30's process ceiling is 40 dispatched requests / 60,000 estimated tokens. The local server on port 4186 was stopped and later verified unreachable.

**Recommendations.** Trace each attempt with developer-sanitized fields: role/model, transport status, response/schema category, retry/fallback selected, guard result, delivery commit result, elapsed time, and estimate/counter state. Keep raw provider bodies, sealed facts, user text, and credentials out of logs. Make a provider/JSON failure reach a user-friendly degraded reply plus visible Retry/Check feedback path, never raw errors or sealed guard reasons. Preserve one parse/schema retry and safe fallback; investigate whether HTTP-400 validation errors are classified distinctly enough to avoid misleading retries.

**Likely paths.** `llm/gateway.js`, `llm/providers/groq.js`, `services/api/`, `src/main.js`, `evals/`, and existing reports under `evals/reports/`.

**Acceptance checks.** Offline fixtures cover malformed JSON, schema-invalid 400, timeout/network error, exhausted retry, guard rejection, and delivery interruption. Each produces bounded calls, a safe fallback/degraded UI, and a sanitized trace. No fixture or browser state exposes secret/error body/private fact text.

## P0 — classification, goals, and conversation direction

**Evidence.** In five typed browser turns, G2 completed but G1 did not; the session ended ready for debrief. G1 remained incomplete after ownership plus unfinished-status wording. An isolated classifier did return `took_ownership` and `asked_requirement_details`, but omitted `gave_honest_status`; G1 requires both. F2 was delivered only after follow-up (7/20 discovery). The user asked deadline flexibility and an impact question, yet F1 was not revealed. Maya first redirected to Sam while public hints/checklist indicated Maya; Jordan initially deflected/redirected from a help request, though G2 completed. These are observations, not proof of a single defect.

**Recommendations.** Compare intended natural paraphrases against classifier labels, goal predicates, move priority, NPC ownership, and the delivery/guard path. Add balanced positive and near-miss paraphrases for: ownership + unfinished status; deadline flexibility; impact/scope question; request for help; and redirects. Do not make F1 easier merely because the debrief proposes a similar question; inspect classification and guard evidence first. Derive the next objective and optional hints from public state/known information, state which NPC to approach, and make Sam's optional role clear. Separate leaving a conversation from the explicit **End practice** action.

**Likely paths.** `llm/prompts/`, `llm/classifier*`, `engine/`, `scenarios/missed_deadline.json`, `replies/`, `services/api/`, and `src/main.js`.

**Acceptance checks.** Offline parser/mapping/engine regressions cover the selected paraphrases without revealing sealed facts, injection still reveals nothing, owner-directed hints remain public, and F1/F2 delivery credit occurs only after a guarded displayed reply. These fixtures do not establish actual Groq paraphrase recognition; that needs a separately authorized bounded live evaluation. A user who leaves a chat cannot accidentally end practice.

## P1 — withholding and feedback clarity

**Inference from the trial and contracts.** Deflection can feel like a repeated ask or a password puzzle even while preserving engine authority. The debrief produced 46.93333333333333/100: 32.93333333333333 deterministic/75 and 14 judged/25. Coach feedback praised accountability in the same debrief where G1 was incomplete. This may be a contract-level distinction between event/goal recognition and quality judging; it needs calibration, not an unreviewed score change.

**Recommendations.** Make withholding intelligible in character: acknowledge the question, state the public limit, and give a feasible public next question or owner direction without leaking sealed facts. Keep existing gates and engine authority unless an accepted decision changes them. Render debriefs in this order: positives, one verified quoted moment, next action/retry, then an expandable breakdown. Preserve separate deterministic and judged subtotals and quote validation. Round display values only; retain source values for calculations. Show unavailable feedback as N/A or provisional, never as an authoritative performance band. After end, label missed facts with their owner and keep them separate from discovery credit.

**Likely paths.** `replies/`, `llm/prompts/npc/`, `scoring/judge.js`, `scoring/coach.js`, `scoring/debrief.js`, `scoring/quotes.js`, `src/debrief.js`, and `src/main.js`.

**Acceptance checks.** Synthetic debrief cases verify quote ownership, unavailable/partial states, rounded presentation, ordering, owner-labelled missed facts, and no score mutation. Calibration cases distinguish honest-status quality from G1 completion without changing weights, taxonomy, gates, or score rules unless separately approved.

## P1 — start flow, demo, and acceptance evidence

**Evidence.** The observed flow is Maya → setup → Start → Maya again. Narrow-viewport layout verification remains unverified for the new setup. A separate proposed usability test would observe three to five fresh uninstructed users. Historical offline evidence (217 tests), API evidence (35 tests), build and bundle scan passed before this trial; they were not re-run during it. No full successful scenario and no >=85 score were established. Existing live runners marked NOT RUN are stubs.

**Recommendations.** Streamline the repeated-Maya start path, retain keyboard and text-only fallback, and verify narrow-viewport layout for the new setup. Separately, conduct the proposed usability observation with three to five fresh uninstructed users. Use one flagship interactive scenario; present the other two as clearly scripted. Prepare a truthful three-minute demo and a recording fallback. Consider hosting only if judges need a link; keep the loopback demo as the base plan, not a public launch.

Build the acceptance harness before additional calls: sealed untriggered facts across >=5 runs, fair paraphrases, injection, smart/trap, quote integrity, latency, retry/fallback, and slider checks. Record samples, provider/model, delivered outcome, fallback rate, and authorisation scope. New difficulty defaults/assist modes, scoring weights, scoring gates, and taxonomy changes need accepted decisions. Voice, job-description features, more scenarios, and accounts are useful future work, not morning-critical.

**Likely paths.** `src/main.js`, `src/style.css`, `src/office.js`, `index.html`, `evals/`, `evals/cases/`, `evals/reports/`, and `CONTEXT/PHASES.md` (reference only unless separately assigned).

**Acceptance checks.** Fresh-user observations are recorded without personal transcripts; the keyboard/text path works; demo narration accurately names scripted versus interactive content; every Stage 1 exit gate is evidenced or remains NOT RUN. A new live authorization is required; this document carries none.

## Future only — meaningful complexity

After the acceptance work, prefer scenarios with multiple valid recoveries and genuine tradeoffs: limited capacity, scope versus deadline, and quality versus speed. Do not substitute arbitrary hidden gates for meaningful choices. This is not morning-critical and does not approve new constants, scoring changes, or additional scenarios.

## Limits

This file is advisory and intentionally does not alter contracts. It does not claim root cause, provider safety, guard accuracy, calibration, latency compliance, a full smart path, or demo readiness. Touched file: `CONTEXT/IMPROVEMENTS.md` only.
