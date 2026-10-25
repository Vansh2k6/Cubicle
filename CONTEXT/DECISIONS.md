# DECISIONS.md — Decision log

Format: **ID · Status · Date**. Context → Decision → Alternatives rejected → Consequences → Revisit when.
Status: `Accepted` · `Proposed` (needs owner confirmation) · `Open` (undecided) · `Superseded`.
Add new decisions at the bottom; never delete, supersede.

---

## D-01 · Accepted · 2026-10-16 — Hybrid pipeline: LLM only where language understanding or generation is needed
**Context.** Latency and cost matter ("use an LLM only where needed"), but the product's value is improvised, reactive conversation.
**Decision.**

| Task | Method |
|---|---|
| Turn user text into structured events | Tiered classifier (rules → small model → LLM fallback) |
| Update state, reveal facts, ledger, mood, beats, goals, endings | Plain code |
| Choose the NPC's next move (dialogue act) | Plain code (rules) |
| Every NPC dialogue act in Stage 1 | LLM, constrained by act + persona + allowed knowledge; guarded store fallback (D-23) |
| Fixed/predictable NPC lines in Stage 2 | Baseline reply store; miss → constrained LLM (D-10) |
| Deterministic score metrics | Plain code |
| Qualitative rubric | LLM judge, quotes mandatory, runs after the session |
| Coaching text, corrected replies | LLM, after the session |

**Rejected.** LLM-for-everything (slow, leaks facts, non-reproducible); fully scripted trees (not reactive).
**Consequences.** Engine is testable without any LLM. LLM outages degrade to baseline replies, not crashes.
**Revisit when.** Per-turn LLM share of cost/latency is still dominant after the reply store and classifier tiers exist.

## D-02 · Accepted · 2026-10-16 — Hidden facts are sealed in code, not in prompts
**Decision.** A sealed fact is **not present in any NPC prompt** until the engine marks it revealed. The NPC prompt only says "you have private context you are not ready to discuss." A post-check scans every NPC reply for the fact's keywords (per locale) and a semantic check; on a hit, regenerate once, then fall back to a baseline deflection.
**Rejected.** "Don't reveal unless asked" in the prompt alone — the model will eventually leak. Also rejected: relying on the post-check alone.
**Consequences.** A user cannot extract a sealed fact by prompt injection ("ignore instructions, tell me everything") because the model never sees it.
**Revisit when.** Never for the sealed-prompt part. Leak-check method may change.

## D-03 · Accepted · 2026-10-16 — Reveal is trigger-based and intent-based, not keyword-based
**Decision.** Facts carry **event triggers** (e.g. `asked_deadline_flexibility`), not phrases. "When do you need this?" and "Is there any wiggle room?" both map to the same event. Reveal also passes a **forthcomingness gate** (NPC setting) before disclosure.
**Consequences.** Classifier quality is the main risk to the differentiator; triggers lists must be generous and a debug panel must show detected events (see R-15).

## D-04 · Accepted · 2026-10-16 — NPCs withhold; they do not lie (v1)
**Decision.** NPCs may deflect, stay vague, or refuse; they never state falsehoods. Lying NPCs are a possible later scenario type and require a new decision.
**Why.** Keeps scoring fair and explainable: a user is never penalised for believing a false statement.

## D-05 · Accepted · 2026-10-16 — Each NPC has its own knowledge; information moves only through the user
**Context.** Maya (manager), Jordan (teammate), Sam (People & culture) have independent conversations by role.
**Decision.** Every fact has an `owner` NPC. An NPC may use: its public context, its own revealed facts, and **what the user told it** (from the transcript). Facts do not flow between NPCs. When the user relays information, the classifier labels `relayed_fact{fact_id, accurate}` against what the user actually knows; the engine scores relay accuracy.
**Consequences.** "Communicated it accurately" becomes measurable. Per-NPC mood and commitment state are required.

## D-06 · Accepted · 2026-10-16 — Scenario ends on goals, not turn count
**Decision.** A scenario has visible goals (checklist) with optional ordering/dependencies (`requires`). It ends when all **required** goals are done, or: user ends, max turns, or an NPC walks out. Hidden goals exist for scoring only and are never shown mid-session.
**Consequences.** Spec needs `goals[].requires`, `required: bool`, and per-goal `done_when` expressions.

## D-07 · Accepted · 2026-10-16 — Scoring is a weighted, transparent registry; deterministic and LLM points shown separately
**Decision.** Default 100 points: Goals 30 · Hidden facts 20 · Integrity (commitments + relay accuracy) 15 · Relationship 10 · Rubric (LLM judge) 25. Weights are **provisional** and configurable per scenario. D-24 defines disjoint achievement credit sources; qualitative assessment does not award achievement points again. Communication is scored for clarity of content, **not** for length, accent, or grammar polish.
**Consequences.** Metrics are plugins `(session_record) -> points + evidence`.
**Revisit when.** After ≥30 human-reviewed sessions (see D-08).

## D-08 · Accepted · 2026-10-16 — Do NOT train a scoring model now; train the event classifier instead
**Context.** The idea was a separately trained scoring model for speed.
**Reasoning.**
- Scoring runs **once, after** the conversation, so it adds no turn latency. Speed gain is near zero.
- Most scoring (facts, goals, commitments, relationship) is arithmetic with no model.
- A trained scorer needs human-labelled sessions we do not have; without them it produces fast but meaningless numbers.
- The per-turn event classifier is high-volume, latency-critical, and labelable from logs — that is where a trained model pays off.
**Decision.** Stage 1: LLM classifier + LLM judge. Stage 2: train a small event/intent classifier (few-shot or fine-tuned) with LLM fallback on low confidence. Scorer training only if triggers below are met.
**Revisit scorer training when:** ≥500 human-reviewed sessions per scenario family, inter-rater agreement measured, and judge cost or inconsistency is a demonstrated problem.

## D-09 · Accepted · 2026-10-16 — Every qualitative score must quote the transcript, verified by code
**Decision.** The judge returns `{turn_id, verbatim quote, one-sentence explanation}` per score. Code verifies the quote is a (normalised) substring of that user turn. Failure → `insufficient`, points dropped. Same for coach output.
**Why.** The problem statement requires every debrief point to be backed by a moment from the session.

## D-10 · Accepted (Stage 2 only; superseded for Stage 1 by D-23) · 2026-10-16 — Baseline reply store is keyed by intent and state, not wording
**Context.** Goal is speed. "I can deliver Friday" vs "I can't deliver Friday" look alike but need different replies.
**Decision.** Store keyed by `(scenario, npc, dialogue_act, state predicates, tone tags, locale)` with ≥2 variants, no-repeat window, and slot filling (e.g. `{committed_date}`). Matching on **engine state + classified events**, not on text similarity of the user's message. Semantic similarity is used only inside the classifier. Miss → LLM. Good LLM lines may be reviewed and **promoted** into the store.
**Consequences.** Cache hit rate is a tracked metric. Replies for `reveal_fact:X` contain only fact X.

## D-11 · Accepted · 2026-10-16 — Scene is a presentation layer; engine is scene-agnostic
**Decision.** The 3D office emits `interact(npc_id)` / proximity events; the engine and API know nothing about rendering. Text-only clients, tests, and scripted bots must work with no scene.
**Consequences.** Scene can be rebuilt/expanded (stage 2) without touching scoring or conversation logic.

## D-12 · Accepted · 2026-10-16 — Free text is primary; baseline quick replies become an optional "assist" mode
**Context.** The existing build shows button replies (e.g. "Thanks, that helps").
**Decision.** In scored mode the user types (later speaks). Quick-reply chips are available only in an explicit **Beginner assist** mode and are flagged in the debrief; they do not hide the hidden-fact mechanic.
Confirmed in S1-01 P0.3.

## D-13 · Accepted · 2026-10-16 — Per-turn state snapshots from day one
**Decision.** Store a full engine-state snapshot after every turn.
**Why.** Enables rewind/branching and "corrected performance" playback later at near-zero extra cost.

## D-14 · Accepted · 2026-10-16 — Corrected suggestions may only use information the user had at that moment
**Decision.** `better_reply` is generated from the transcript up to that moment and the user's known facts. It must not include sealed or not-yet-discovered facts; instead it models the **question that would have uncovered them**.
**Playback modes (stage 2):** (a) *Performance* — corrected line + adaptive NPC response run through the engine from the snapshot, voiced by two distinct voices; (b) *Redo* — branch a new session from the snapshot and let the user try again.

## D-15 · Accepted · 2026-10-16 — NPC customisation = four sliders + three presets, fixed at session start
**Decision.** Sliders 0–100: assertiveness, patience, warmth, forthcomingness. Presets: Supportive, Direct, Impatient (map to slider vectors). Sliders change **engine parameters and prompt tone**. Fixed at session start; recorded in the session and shown in the debrief. Difficulty label derived (Easy/Medium/Hard). Score multiplier is stage 2.
**Details:** see `ARCHITECTURE.md` §Customisation.

## D-16 · Accepted · 2026-10-16 — Language-neutral events; localised text
**Decision.** Event labels, fact IDs, dialogue acts are language-neutral. Only scenario text, NPC lines, UI strings, and leak keywords are localised. Languages: English first, then Hindi, then Hinglish handling.
**Risk.** Substring leak checks and quote validation are weaker across scripts/transliteration; semantic checks and normalisation are required (see `ARCHITECTURE.md`).

## D-17 · Accepted · 2026-10-16 — Scenario spec is one validated JSON document
**Decision.** One JSON spec per scenario (NPCs, goals, facts, beats, scene layout hints, locales). JSON Schema validated at load. Scenario generation (stage 2) must output this schema and pass semantic validators and scripted-bot playtests before it can be played by others.

## D-18 · Accepted · 2026-10-16 — Demo storage: in-memory + JSON dump; production: PostgreSQL (+ Redis for live state, object storage for audio)
**Why.** One-user demo does not need infra. The repository interface (`SessionStore`) is defined from day one so the swap is mechanical.

## D-19 · Proposed · 2026-10-16 — Voice: push-to-talk with editable transcript first; provider-agnostic interface
**Decision.** Stage 1 stretch: push-to-talk → STT → editable transcript → normal text turn → optional TTS reply. Stage 2: streaming STT, per-NPC voices, barge-in. Speech providers sit behind a `SpeechProvider` interface (STT, TTS). Candidate providers from the original deck (VoiceStudio, ElevenLabs fallback) are unvalidated.
**Needs owner confirmation** of provider and keys.

## D-20 · Accepted · 2026-10-16 — Fairness constraints on scoring
**Decision.** Do not reward length, accent, speaking speed, or grammar polish. For voice and multi-language, scoring runs on the **confirmed text transcript**. Evaluate score differences across languages before launch.

## D-21 · Accepted · 2026-10-16 — Source-of-truth precedence
**Decision.** `AGENT.md` > `RULES.md` > `DECISIONS.md` > `ARCHITECTURE.md` > `PRD.md` > `PHASES.md` for project instructions, subject to higher-level platform instructions and explicit user direction. Original PDF/PPT and pasted AI drafts are context only. Where they differed: the real cast is **Maya / Jordan / Sam** (not Jack/Alan or Rohan) for the demo. Every implementation slice follows coder → reviewer → tester → orchestrator; the orchestrator owns final acceptance.

## D-22 · Accepted · 2026-10-16 — Demo scenario is *Missed a project deadline*, with hidden facts authored by us
Confirmed in S1-01 P0.3.
**Decision.** Make *Missed a project deadline* the fully-featured demo scenario using all three NPCs. Hidden facts, goals and beats for it are specified in `PRD.md` §Scenario SC-01 and confirmed by D-27 in the server-side scenario fixture; they are not yet integrated into the scripted frontend. The other two existing scenarios stay as baseline until SC-01 is complete.
**The PDF's *Two-Day Promise* (client Rohan)** is kept as a stage 2 external-client scenario.

---

## D-23 · Accepted · 2026-10-16 — Round 2 demo priorities and Stage 1 generation
**Context.** Round 2 is Stage 1, focused on one complete reactive practice loop, not the whole product.
**Decision.** Core: S1-P0–P5 plus P6.2's four sliders, which affect engine parameters and NPC tone and are fixed and recorded at session start. Presets, voice, optional assist and nonessential polish may slip. All safety, hidden-fact and evidence acceptance gates remain mandatory. Stage 1 calls the LLM for **every dialogue act**, including greetings and reveals; the store is a guarded failure fallback, not the normal first lookup. Stage 2 resumes D-10's store-first optimisation.
**Latency.** Stage 1 target is end-to-end text turn p50 < 3.5 s and p95 < 5 s, measured through guarded reply delivery. These are targets, not verified results. Retries and fallbacks are included and reported separately; provider choice and measurement remain open.
**Narrow Stage 1 process exceptions (R-71).** R-61 permits a recorded relevant eval subset per change, with the full applicable acceptance suite including R-62 before a demo. Missing provider access means unverified, never passed. R-14 keeps versioned prompt files; a per-session run manifest plus output reference can hold model/prompt/schema metadata, and a change starts a new manifest. R-64 permits multiple related concerns in one coherent current-phase slice, still following coder → reviewer → tester → orchestrator. These exceptions do not waive validation, guards, evidence, engine tests or phase gates.
**Consequences.** More generation calls than the Stage 2 design; small prompts and outputs matter. P6.2 is a core task within P6 after earlier phases pass. No feature completion is implied by accepting this decision.
**Revisit when.** Stage 1 measured latency or cost misses its target, or Stage 2 starts.

## D-24 · Accepted · 2026-10-16 — Credit sources and F2 trigger
**Decision.** R-22 assigns deterministic achievement credit by source event/commitment ID. The union of goal-completion event types must be disjoint from the union of fact-trigger event types. A user turn may contain distinct events earning distinct credits; the same source cannot earn achievement points twice. F2 now triggers only on `asked_for_help`, leaving G2's `asked_requirement_details` independent. The judge assesses communication **quality only**, never goal/fact achievement or commitment/relay correctness already assessed by code.
**Relationship.** Live mood may react to every eligible event; relationship scoring replays mood from the configured starting mood using only events not allocated to goal, fact or integrity credit. Normalise improvement from that starting mood into the configured 10-point range (no improvement → 0, reaching 100 → 10). This separates visible mood from awarded points and avoids an ownership event scoring as both G1 and relationship. No duplicate integrity penalty for the same commitment (e.g. −8 unrealistic and −3 `overpromised`).
**Consequences.** Validators check event-set disjointness; scoring records credit sources and excluded duplicates. Weights stay provisional. This is a scoring-contract change requiring a new scoring version when implemented (R-27).

## D-25 · Accepted · 2026-10-16 — Scenario clock, canon and commitment model
**Decision.** Every scenario with commitments declares a fixed scenario `clock`, server-side `canon` and `commitment_model`. Date classification uses that clock, never the machine's current date. Ambiguous or intraday dates require clarification; no silent rounding. Code evaluates realism and agreement; model prose cannot accept a date or change canon.
**Proposed SC-01 fixture (pending P0.3 content confirmation).** Tuesday 2026-10-13, Asia/Kolkata, day 0; Friday is day 3. Unassisted minimum is 3 whole days; assisted minimum is 2 only after F2 is revealed and help is explicitly accepted with Jordan. Maya's hard cutoff day 3 remains sealed as F1. Scope reductions have no effect until an authored model supports them. A deadline outside the active minimum/cutoff bounds is unrealistic.
**Commitment lifecycle.** Record normalized target day, original words, evidence turn and active ID. A revision supersedes the previous ID and invalidates prior acceptance/recap. `date_mutually_agreed` requires an active realistic commitment accepted by the engine in Maya's conversation; G3 also requires a recap of that same ID after G1/G2. Callbacks evaluate against recorded model inputs, not discovery timing alone; penalties apply once per commitment. Pending discovery, acceptance and callback delivery are distinguishable from delivered outcomes.
**Consequences.** Numeric fixtures are proposals, not facts established in the existing build. Internal model bounds never enter NPC prompts while sealed; the engine supplies a permitted act such as requesting a revised date without exposing why.

## D-26 · Accepted · 2026-10-16 — Echo allowance and canon guard
**Decision.** R-02's keyword scan can ignore matching spans already supplied by the user in this NPC's conversation, facts this NPC is permitted to know, or commitments logged with this NPC. This is attribution-only: a user guessing "Friday" may be quoted as a proposal, but must not receive confirmation of the sealed Friday deadline. Echo allowance neither reveals a fact nor bypasses semantic or canon validation.
**Canon guard (R-09).** Before display, use local/non-generative semantic and invariant checks on every generated or fallback reply against permitted scenario canon, the act, accessible facts and the active commitment. No additional generative validator role is authorised. Reject invented, uncertain or contradictory material claims about dates, scope, progress, resources or agreements; regenerate once, then use a guarded neutral fallback. Prompt composition includes only public/accessible canon and a selected authorised pending disclosure, never the complete sealed server-side model or private guard reasons. Guards reduce risk; acceptance tests must establish their actual coverage rather than claiming proof against leakage or invention.
**Consequences.** A reveal becomes discovery credit only after its guarded reveal line is delivered. An interrupted, overridden or rejected reveal stays pending/sealed. End-of-session missed-fact disclosure is debrief-only and awards no discovery credit.

---

## Open decisions (owner needed)

| ID | Question | Default until decided |
|---|---|---|
| O-01 | Primary audience for pitch/product: students, placement cells, or recruiters? | Students |
| O-02 | Chained scenarios with consequences carrying over, or single conversations? | Single conversations |
| O-03 | Rewind: adaptive NPC after the rewind point (preferred) vs fixed script? | Adaptive |
| O-04 | Hinglish: support code-mixing in voice and text? | Text only, stage 2 |
| O-05 | 3D space: walk-only, or interact with objects (screens, emails)? | Walk-only |
| O-06 | LLM settled by D-28: Groq free plan and selected models; STT/TTS still open | Provider-agnostic interfaces; voice remains optional |
| O-07 | Community scenario moderation model (human review vs automated + report) | Human review before public |
| O-08 | Data retention and consent for employer dashboards | Opt-in, aggregated only |
| O-09 | Team split: coding / AI direction / art & demo | Unassigned |

---

## D-27 · Accepted · 2026-10-16 — Relative-day clock (amends D-25 fixture scope)
**Context.** D-25 proposed a calendar fixture (Tuesday 2026-10-13, Asia/Kolkata) for SC-01. P0.3 confirms SC-01 uses day offsets only, with no calendar date/timezone coupling in the engine.
**Decision.** Scenario clock is `{day: 0}` with no calendar date or timezone. Friday is a day-3 label only. All offsets are whole days. Unassisted minimum is day 3; assisted minimum is day 2 only after F2 is delivered and help is explicitly accepted with Jordan. Hard cutoff day 3 is owned by Maya. P0 scope recorded alongside: P0.2 O-06 deferred (provider-agnostic interfaces, live evals NOT RUN); D-22 Accepted (SC-01 *Missed a project deadline* is the demo scenario); D-12 Accepted (typed input primary, Beginner assist optional and flagged); P0.4 Node + node:test with no new dependency; P0.5 schema additions accepted (topics, clarify sidecar, full canon/keywords).
**Consequences.** Date classification uses day offsets against canon bounds only; calendar ambiguity/timezone handling is out of scope. Validators and scoring record day-based commitments; D-25 calendar fixture is superseded in this scope only.

## D-28 · Accepted · 2026-10-16 — Groq free plan and bounded Stage 1 execution
**Authority.** The user selected Groq on the free plan, delegated model/technology choices, requested sequential implementation of the files in `/PROMPT` in this same task, and limited live LLM testing to one smoke test total. This supersedes the fresh-session advice in S1-00 and the earlier O-06 deferral. It does not authorise Stage 2 work or changes to scoring weights, schema beyond accepted additions, or safety contracts.

**Models.** Use `openai/gpt-oss-20b` for classifier, NPC generation and coach; `openai/gpt-oss-120b` for judge. Preserve the provider interface and role-specific temperatures/schema validation. Groq's [models](https://console.groq.com/docs/models) and [rate limits](https://console.groq.com/docs/rate-limits) documentation lists both models on the free plan with 30 RPM, 1,000 RPD, 8,000 TPM and 200,000 TPD as of this decision. Actual account limits can differ; these figures are planning limits, not measured throughput or a latency guarantee. Keep credentials server-side and out of documentation, source control and logs. Model selection is a decision; the current placeholder configuration still needs implementation in S1-03.

**Runtime.** Retain plain JavaScript ES modules and Node's built-in `node:test`; use Node's built-in HTTP server for the API when its prompt is reached. This follows delegated technology discretion and adds no dependency. The API does not exist at this baseline.

**Verification and progression.** Allow one total live smoke test, record its actual result and consumed request count, and save all remaining live eval requests/cases and run instructions for the user to execute together at the end. No automatic repeated live testing. Offline tests and coder → reviewer → tester → orchestrator acceptance remain mandatory for every prompt. Implementation may progress sequentially after offline acceptance while live eval gates remain explicitly **NOT RUN / deferred by user**; never check off an unrun live gate or describe a partially verified phase as demo-ready. R-61 and R-63 carry this narrow Stage 1 process exception. R-62 and all ten Stage 1 demo exit criteria still require evidence before any demo-ready claim. A smoke response is not evidence of guard accuracy, classifier quality, judge consistency or end-to-end latency.

**Reporting and UI.** After each accepted prompt report `Stage completed -`, `phase completed -`, and `what was implemented -`, with deferred gates stated explicitly. For UI work create `DESIGN.md` and apply the user's Impeccable skill. Graphify's existing index may guide discovery; verify the affected source because an index can be stale. Ask only for consequential choices not already authorised.


## D-29 · Accepted · 2026-10-16 — Scoring population and shared slider defaults
**Authority.** The user explicitly approved these defaults during the sequential Stage 1 task. Record them now; implement only when the corresponding prompt is reached.

**Relationship population (S1-08).** Average relationship scoring across all three scenario NPCs, including unvisited NPCs. Retain R-22 credit exclusions and the existing weights; an unvisited NPC contributes zero improvement.

**Sliders (S1-12).** One shared set of four sliders applies to all three NPCs, fixed and recorded at session start. Display difficulty from `mean(assertiveness, 100-patience, 100-warmth, 100-forthcomingness)`: Easy below 34, Medium below 67, Hard otherwise. This label does not multiply or alter scores. Engine parameter effects still follow the existing contract.

**Optional work (S1-13).** Implement the prescribed presets; keep voice disabled. No STT/TTS provider selection or live voice testing is authorised by this decision.

## D-30 · Accepted · 2026-10-17 — Bounded live Groq adapter
**Authority.** User explicitly requested Node-only Groq wiring behind the gateway, default offline, model defaults and nonsecret environment defaults. This supersedes D-28 model selection only: classifier `openai/gpt-oss-20b`, NPC `qwen/qwen3.8-27b`, judge and coach `openai/gpt-oss-120b`. No engine/frontend change or new dependency.

**Bounds.** Per-process default limits: 40 dispatched HTTP calls and 60,000 conservatively estimated tokens; per-model token bucket 6,000 TPM. Fetch and response body share an 8-second deadline. Retry-After waits at most 20 seconds then falls back, with no transport retry. The gateway's one parse/schema retry remains. A provider-specific bounded deadline supersedes legacy 1.5/3-second caller defaults; API turn safety ceiling is 180 seconds for the maximum validation/guard sequence. This is a resilience ceiling, not measured compliance with the latency acceptance target.

**Verification.** User's later instruction authorizes one bounded smoke after offline review/testing, at most three HTTP calls total. Full acceptance evals remain NOT RUN; the bounded smoke result is recorded separately. Smoke and P2c eval entry points require `RUN_LIVE=1`; server live opt-in requires provider selection and a server-side key. The credential shared in chat is never stored or echoed by implementation. `.env.example` now permits explicit allowlisted public defaults and empty secret values rather than requiring every value to be empty; this changes a test convention, not R-50. Calls are only R-10's existing classifier/dialogue/judge/coach uses and cannot decide engine outcomes (R-11).

**Bounded smoke result, 2026-10-17.** Root executed the single authorized smoke after independent review/testing: two HTTP calls total, classifier `openai/gpt-oss-20b` 813 ms and NPC `qwen/qwen3.8-27b` 197 ms; both JSON outputs validated. [Sanitized report](../evals/reports/groq-smoke-2026-10-17.json) contains no response text or credential. No further live calls are authorized by this smoke allowance. Full live acceptance remains NOT RUN; this result establishes connectivity and JSON validation only, not classifier quality, guard accuracy or end-to-end latency acceptance.

## D-31 · Implementation note · 2026-10-17 — Scoring contract version 2
Implementing already accepted D-24 and D-29 uses SC-01 scoring version 2, with unchanged weights 30/20/15/10/25, existing penalties 8/4/3, and relationship averaged over all three scenario NPCs. This is the required technical scoring-contract version increment, not tuning or a new population decision. Scenario content/taxonomy stay unchanged. The provisional missed_probe display flag (visited owner at least once, no trigger fired) has no penalty; it is recorded for confirmation during acceptance. Pure offline scoring is the S1-08 scope; rubric/judge/coach/debrief remain subsequent work.

## D-32 · Accepted · 2026-10-18 — Resume Stage 1 and confirm preset vectors
The user resumed sequential implementation after prompt 10, preserving D-28's offline progression and live-evaluation deferral. They explicitly approved the S1-13 shared preset values below, in assertiveness / patience / warmth / forthcomingness order:

- Supportive: 30 / 80 / 80 / 80 — Easy under D-29.
- Direct: 80 / 50 / 40 / 50 — Medium under D-29.
- Impatient: 80 / 20 / 30 / 30 — Hard under D-29.

Presets only fill the four editable setup sliders and are fixed at session start. They do not change score weights or add a multiplier. Voice remains disabled; no speech provider or live calls are authorized. Implement these vectors only when S1-13 is reached and S1-12 is accepted. The user postponed pushing and creating the requested pull request until repository access is ready.

## D-33 · Implementation note · 2026-10-18 — Repair bundle-content verification
Read-only hardening preparation found that the old scanner used `if (text.includes("")) continue`, so all file contents were skipped. Earlier zero-hit content-scan reports are not evidence that private material was absent; their separately executed build/debug-reachability checks and runtime/scoring tests remain distinct evidence. The S1-12 verification repair must scan every artifact, including JavaScript containing NUL, and have a regression proving a controlled private marker is detected by the actual shared scan loop.

The repaired search exposed public false positives: Three.js's complete `cutoffDistance` identifier, Vite's complete `modulepreload` identifier and quoted HTML `type=module`, the complete word `preview`, and two exact existing public scripted sentences containing `review`. Root and the Sol reviewer approved per-needle masking of only those exact public spans with equal-length spaces. The rest of the same artifact must still be scanned for the same needle, case-insensitively. Every other private fact, keyword, canon and prompt needle stays intact. Tests must append a private occurrence after each allowed context and still detect it; no whole-file or blanket common-word exemption is authorized.

The public slider name `forthcomingness` is allowed in the client under D-29/S1-12; removing its obsolete name-only ban does not authorize any surrounding private material or prompt text. This is a verification repair, not a scoring change, a runtime leak-guard change, a new rule exception or a demo-readiness claim. Corrected current-build results must be reported separately from historical reports.

## D-34 · Implementation note · 2026-10-18 — Local credential-file scan boundary
The mandatory secret scan found the user's existing ignored, untracked repository-root `.env`. Root and the Sol reviewer approved exempting exactly that local server configuration file from the content scan, while retaining the independent mandatory checks that it is ignored and untracked. A tracked `.env` must still fail. `.env.example`, nested `.env` files and all other existing scan targets remain covered, with regressions for the exact boundary. The credential file is not displayed, changed, removed or committed. This corrects a test convention for local server configuration; R-50 remains unchanged and no live call is authorized.

## D-35 · Accepted · 2026-10-21 — English-only voice contract and local-provider decision rule
**Authority.** The user explicitly confirmed “yes use local voice” on 2026-10-21. This supersedes D-19's provider uncertainty and D-29's no-provider-selection statement for voice only; it does not authorise a cloud implementation, change scoring, or close a phase gate.

**Decision.** Voice uses a `SpeechProvider` interface with `transcribe` and `synthesize`, configured by `VOICE_STT_CHAIN` and `VOICE_TTS_CHAIN`. The approved local sidecar uses faster-whisper `small.en` for English STT and Piper as the default TTS engine; Kokoro is deferred unless the human asks. Local becomes the demo primary only if V4 measurement shows added STT plus TTS-first-byte latency of about 1.5 s or less p50 on the demo laptop without measured 3D-scene stutter. Otherwise a cloud adapter may become primary only through a later decision; cloud is not implemented here and local remains the offline mode.

STT is delivered through `POST /sessions/{id}/voice/stt`. TTS is available only for an already committed, guarded NPC turn or stored guarded debrief reply, looked up by private session and turn/moment id; no route accepts client text for synthesis. Audio is memory-only and never persisted or logged (R-54/R-66); only opaque session IDs reach a provider (R-53). Scoring and quotes use user-confirmed text only (R-23).

Voice defaults off behind server and client flags, and typed input remains permanent. Browser `SpeechRecognition` is rejected as local STT because it uses a vendor service. Static pre-rendered audio of fallback or reveal lines is forbidden.

**Consequences.** This authorises implementation beginning with V1 under the approved contract. No installation, model verification, provider call, latency claim, or voice implementation occurred in V0, and no phase gate is closed by this decision.

**Revisit when.** V4 measurements indicate that local voice misses the decision rule.

## D-36 · Accepted · 2026-10-21 — Prefer available GPU; explicit live-call permission
**Authority.** After the measured CUDA comparison, the user asked to use the GPU and continue V2. `VOICE_STT_DEVICE=auto` now prefers CUDA/float16 when its startup inference succeeds, with CPU/int8 as the portability fallback. Explicit `cuda` must fail honestly rather than silently substitute CPU; explicit `cpu` remains available. This does not waive D-35's scene-load/latency gate or authorize cloud speech.

The user permits private inspection/loading of the ignored root `.env`, superseding the V0 agent note that prohibited reading it. Credentials must never be displayed, logged, committed or sent to the browser. Live calls still require a specific user request; routine tests stay offline. Their request to measure one Groq voice turn authorized exactly two HTTP calls (classifier and NPC), completed successfully with no fallback. The metadata-only report is `evals/reports/voice-groq-one-turn-2026-10-21.json`; this single synthetic sample is not an accuracy, percentile, microphone or browser-playback acceptance result. No continuing live-call allowance remains.

## D-37 · Accepted · 2026-10-23 — Bounded scenario-foundation exception

**Context.** S1-P7 acceptance remains the current phase, while the user has explicitly authorised a shared scenario-runtime foundation so later authored packages can use one sealed, deterministic contract.

**Decision.** Permit the ordered SF-00–SF-04 work defined in `plans/SCENARIO_FOUNDATION_IMPLEMENTATION.md`: documentation first, then a static server registry and exact package-bound sessions, bounded pure policy extraction, package-bound language/public metadata, and a private non-production proof package. SC-01 is the sole temporary explicit binding. The three selector cards remain; email and call stay scripted until an authored migration. No new story, phone/deeper-story content, voice-cast change, selector, database, editor, hot reload, dependency, plugin, DSL/arbitrary-code path, or additional model call is authorised.

**Contract.** The target package, identity, registry, hook contracts and central validation rules are defined only in `plans/SCENARIO_FOUNDATION_IMPLEMENTATION.md`. Sessions retain immutable exact package identity; functions never serialize. Unknown packages fail closed; no global/current-SPEC fallback is allowed. Existing SC-01 scoring version2 values, allocations, penalties and all-NPC relationship population remain unchanged, with no extraction-only scoring-version bump. Existing legacy SC-01 records use an explicit bounded compatibility path for their known profile only, never an unknown-package fallback.

**Consequences.** This is an R-63/R-64 exception for bounded work, not a phase exit, demo-ready claim, safety waiver, or exemption from coder → reviewer → tester → orchestrator. Historical test counts are not fresh evidence. Live evaluations remain NOT RUN until the user gives fresh permission.

## D-38 · Accepted · 2026-10-24 — Reusable remote contact and deadline-story replacement

**Authority and scope.** The user explicitly approved the bounded implementation plan in `plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md` while S1-P7 remains pending. This is a narrow R-63/R-64 exception for CP-00, CN-01, CN-02 and DS-01–DS-04 only. It does not close a phase, waive safety/review/test/live gates, authorise a provider call, or make a demo-ready claim.

**Decision.** Replace only the new `missed_deadline` package content with content version 2 and scoring version 3. Preserve old captured scoring-v2 records, profile/identity pins and their historical 60/7 smart/trap meaning; do not replay them. Keep existing weights 30/20/15/10/25, penalties 8/4/3, bands, 20-turn cap and current pressure/callback numbers unless targeted evidence identifies an incompatibility for root. The package retains ordinary actors `maya`, `jordan`, `sam` (Snehal Mane, Vansh Singh, Prathamesh Surwase); Prathamesh is QA/release engineer in the new story. Add ordinary package actor `client`, Rohan Mehta, Client Operations Lead. It has ordinary NPC state/mood/facts/events/provider/thread and no Client class, second entity model, phone service/session endpoint, telephony or WebRTC protocol.

**Presentation and privacy.** Physical public metadata remains unchanged. The registered remote public actor is exactly `{id,name,role,contactMode:"phone",voiceId:"en_GB-alan-medium"}`, has no `sceneAnchor` or avatar, and may reuse that voice only through registered package binding. At most three distinct physical anchors and one remote contact are allowed per package; unknown mode/voice and arbitrary target fail. Existing four-key VOICE_MAP overrides remain backward compatible. The phone affordance uses the shared work island and normal NPC pipeline; before a session it reads only existing public scenario metadata, creates no session/LLM/microphone work and imports no private fixture. People/text-only exposes the same contact. Hangup cancels capture/playback and closes UI while preserving thread; restart/end/scenario switch rejects late UI/audio.

**Story and agreements.** The approved story, four facts (F1–F4 weights 5/6/4/5), three visible goals (10 each), FULL/PHASED routes, language boundaries and mandatory tests are exact in the plan. A schema-v2 `plan_model` may attach primary day 3 and optional follow-up day 6 to the existing commitment revision with participant approvals/recaps. It must not create a global replacement deadline or new commitment type. Facts never directly or indirectly satisfy goals: distinct delivered proposal/confirmation/recap source IDs are required and a source is allocated once. An actor may acknowledge an attributed user claim without confirming undisclosed facts. Fallbacks cannot earn reveal, approval, agreement, recap or goal credit.

**Priority.** For this new policy only, `accept_plan` may stage a supported plan acknowledgement after higher-priority pressure/reveal acts and before generic replies; final closing priority remains unchanged. It is engine-selected from validated user-text-supported plan slots, not a taxonomy event or classifier approval. Legacy priority remains unchanged. This is the bounded R-33 extension for D-38 only.

**Consequences.** D-38 supersedes only new package story/model/scoring scope; it does not alter legacy packages, the historical D-24 F2 trigger, or generic rules outside this scope. Runtime remains unimplemented until the mandated handoffs accept each slice.

**Bounded implementation contract amendment, 2026-10-24.** Root resolved the permitted schema-v2 semantic operation and revision safety within the already approved scope; the exact contract is the master's [DS-01 implementation boundary](../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md#ds-01-implementation-boundary-approved-target-contract-2026-10-24). The explicitly supported `planEvidence` pure operation may inspect raw current user prose plus detached minimal event/public/current-plan projections; it only nominates evidence, while core validates authority, revision, source allocation and guarded delivery. A valid material proposal immediately activates an undelivered revision, clears current approvals/recaps and blocks old-plan finalization even after fallback. Same-current-slot retries reuse the revision; malformed/unsupported claims never mutate it. DS-01 supplies an unplayable validated engine-context seam, DS-02 completes strict production registration, DS-03 implements new-proof scoring and DS-04 alone activates the default. No legacy hook, taxonomy, scoring constant, new story scope, provider permission or acceptance gate is changed by this amendment.

## D-39 · Accepted · 2026-10-25 — Bounded cast setup before office entry

**Authority and scope.** The user approved cast setup and its required session contract while S1-P7 remains pending. This supersedes D-29 only for optional per-NPC overrides and selectable presets before entering the office. It permits `plans/CAST_SETUP_IMPLEMENTATION.md`, but does not close a phase, waive coder → reviewer → tester → orchestrator, authorise a provider call, or establish demo readiness.

**Contract.** `POST /sessions` retains shared `sliders` and accepts optional `npc_sliders`: a plain own-property map from registered captured-package NPC ID to a partial map of the existing four integer `0..100` sliders. Missing map means `{}`; missing actor/slider values inherit the resolved shared baseline; a valid `previous_session_id` package resolves before actor validation. Arrays, null, inherited/prototype-shaped values, unknown actors or traits, and non-integers fail closed. A create response retains `settings` and adds exact cloned effective registered-cast `npc_settings`; difficulty remains display-only and unchanged. Turn requests reject `npc_sliders`, shared sliders, and legacy client `customisation`. The ended record/debrief keeps effective per-NPC settings.

**Presentation bounds.** The first-conversation popup may be replaced with setup before office entry. Setup uses public cast metadata and UI portraits only; it must not alter physical 3D NPC avatars. Fixed scripted email/call conversations remain outside this API setup path. Retry and historical views use their captured package/cast settings. No scoring weights, rules, scoring version, engine mechanics, live-provider behaviour, dependency, or network call changes.

**Consequences.** D-29 continues to govern the shared vector, slider effects and difficulty formula outside this explicit scope. Per-NPC customisation is a bounded exception, not Stage 2 P7.4 completion.

## D-40 · Accepted · 2026-10-25 — Bounded HR reporting scenario

**Authority and scope.** The user explicitly authorised a replacement for the scripted email exercise: the `workplace_intimidation` HR-reporting package, its LLM-heavy classification/generation integration, and the related safety/code goals. This is a narrow R-43/R-63/R-64 exception while S1-P7 remains pending. It does not close a phase, authorise a provider call, waive review/testing/safety gates, or establish demo readiness.

**Contract.** The package has stable identity `workplace_intimidation`, content/schema version 1, English, policy ID `hr-reporting` version 1, and scoring version 2. It retains the existing weights 30/20/15/10/25, three 10-point goals, two optional 10-point facts, 20-turn cap, bands, penalties, and existing taxonomy; these are provisional existing allocations, not new constants by fiat. The fixed clock is day 0 with public next-working-day follow-up at day 1. Compatibility commitment fields remain inactive: there is no actual date-commitment classification.

**Safety and process.** The scenario permits a non-graphic player report of past workplace mistreatment, never NPC harassment or reenactment. HR records the concern, discusses interim support privately, and checks back in a private meeting on the next working day. The package asks permission before sharing where possible and uses need-to-know handling; it promises neither absolute confidentiality, a particular finding, nor a forced manager confrontation. No proof is required to seek HR support. Two optional contextual facts may be disclosed only through their owner triggers; they never become prerequisites for help, a report, or goal completion. The exact final HR completion line remains a private runtime constant.

**Consequences.** The authored package and `plans/HR_SCENARIO_IMPLEMENTATION.md` are implementation-pending until the ordinary coder → reviewer → tester → orchestrator handoff completes. Existing captured packages, policies, scoring profiles, and historical records remain unchanged.

**HR-only act ordering clarification.** A staged, evidence-supported `deliveredGoals` acknowledgement takes priority over an optional context reveal/deflection for that actor. The fact remains sealed unless its own reveal act is delivered on a later question. This bounded R-33 ordering exception prevents an employee's combined description and context question from making optional discovery a prerequisite for support. Deadline policies have no `deliveredGoals` and retain their existing priority order.

## D-41 · Accepted · 2026-10-25 — Haiku-only paid testing and phase budget

The user explicitly authorized Claude Haiku 5.5 testing and required an absolute prohibition on spending through Opus or other models. R-67 pins the only permitted paid model to `claude-haiku-5-5`. No unavailable-model fallback may charge another model. The existing gateway may be reused behind a separate Anthropic provider adapter; Groq remains disconnected.

Each explicitly authorized phase has one persistent budget of at most USD 0.50, including retries and failed/uncertain generation requests. Preflight must reserve a conservative maximum cost before sending a request. Restarting a server or adapter cannot grant a fresh allowance. A new phase must be explicitly authorized; the agent cannot repeatedly reset the budget to keep testing. Keys remain server-only and absent from logs, errors and commits. Offline checks precede paid calls.

## D-42 · Accepted · 2026-10-25 — Main-based bounded custom scenario port

The user requested adding the existing custom-generation baseline to latest GitHub main on a new branch, with a less cluttered description-first popup. The bounded contract is `plans/MAIN_GENERATION_PORT.md`. Preserve main's HR/cast/deadline/provider/scoring behavior; allow only the existing four authored component frames and two deterministic compositions, with closed server-created packages and schema/semantic checks before launch. No new mechanics, cast, scoring values, provider calls or spend grants.

The source prototype's already accepted private LOCAL PREVIEW exception remains narrow: loopback-only preview/play may proceed after offline real-engine certification and explicit local content review. Public goals remain inspectable before Start. `local_preview_ready` never means `shared_playable`, `live_certified`, demo or R-45 accepted. Judge /25 and full targets remain NOT RUN unless measured; deterministic /75 stays separate. Shared/publication gates are not waived. This entry does not supersede main's D-39 cast or D-40 HR decisions. Side-conversation instructions prohibit subagents, so no independent-agent review claim is made for this port.
