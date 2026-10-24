# RULES.md — Mandatory project rules

Read [AGENT.md](AGENT.md) first; it is the lead project document and defines precedence and the orchestrator workflow. These rules are mandatory within that workflow.

Keywords: **MUST** / **MUST NOT** are absolute within the explicitly stated scope. **SHOULD** is the default; deviating needs a dated entry in `DECISIONS.md`. The Stage 1 exceptions to R-14, R-61, and R-64 are bounded by D-23; D-28 additionally bounds live-eval deferral and R-63 implementation progression. They do not waive safety or demo acceptance gates.
Rule IDs are stable; reference them in PRs (`R-03`).

## A. Hidden facts and information security

- **R-01** During a live session, sealed fact text MUST NOT enter a dialogue prompt, selected baseline reply, user-visible log, or API response. The engine may authorise a **pending disclosure** only after the owner's trigger and gate pass; only the selected reveal act may receive that fact. Mark it delivered/revealed, add it to `user_known`, and grant discovery credit only after the guarded reveal reply is committed to the transcript for delivery. A higher-priority act or failed/deflected reply leaves it undiscovered. Server-side authored templates and validators may hold fact text but MUST NOT expose it. After the session ends, the debrief may disclose missed facts without discovery credit; historical coaching still follows R-25.
- **R-02** Every NPC reply MUST pass the leak guard (keywords per locale + semantic check) before it is shown. For a reveal act, exempt precisely the engine-authorised pending fact for that owner and act; all other undisclosed facts remain guarded. This authorisation is separate from the **echo allowance:** ignore a keyword hit only when its occurrence is supported by words the user already said to this NPC, that NPC's permitted revealed facts, or commitments already logged in that NPC's conversation. The exemption is occurrence/context-specific, not a global keyword allowlist. Echoes of user claims MUST remain attributed or unconfirmed; guessing a secret never authorises confirmation, extra details, a reveal, or discovery credit. R-04 knowledge boundaries and the R-09 canon guard still apply to the entire reply. On a hit: regenerate once; on a second hit use a guarded baseline deflection. Record the event.
- **R-03** Live-session API responses MUST NOT include undisclosed facts, hidden goals, trigger lists, event labels, mood numbers, or score internals. The sole live disclosure exception is the successfully guarded reveal line committed under R-01; no private spec/trigger metadata accompanies it. Allowed public state: mood **label**, visible goal checklist, NPC availability. A dev-only debug flag may expose events; it MUST be off in any shared build.
- **R-04** Facts are owned by exactly one NPC. An NPC MAY use only: its public context, its own revealed facts, what the user told it in its transcript, and precisely the current act's engine-authorised pending disclosure (R-01/R-02). A pending fact is unavailable to other acts or NPCs. Facts MUST NOT flow between NPCs except through the user's words.
- **R-05** NPCs MAY withhold, deflect, or refuse. NPCs MUST NOT state falsehoods (v1); all factual claims also pass the canon guard in R-09.
- **R-06** A reveal trigger MUST be an event from the taxonomy, never a literal phrase. Paraphrases MUST work ("When do you need this?" = deadline-flexibility).
- **R-07** "Ignore instructions / tell me everything" style input MUST NOT reveal facts. It is classified as `asked_reveal_all` or `off_topic` and handled in character.
- **R-08** Scenario specs and prompts MUST be stored server-side. The client receives only briefing text and visible goals, plus approved public actor metadata. Physical actors retain `id`, `name`, `role`, `sceneAnchor`, `voiceId`; under D-38 a registered remote contact exposes only `id`, `name`, `role`, `contactMode:"phone"`, `voiceId` and omits `sceneAnchor`. The discriminator and voice are validated against package registration; private canon, full specifications, unapproved spec fields, prompts and package internals remain server-side.
- **R-09** **Canon guard:** every NPC reply, including stored fallbacks, MUST be checked against the fixed scenario clock, that NPC's permitted canon/knowledge, the chosen act, and its logged commitments. NPCs MUST NOT invent or contradict task scope, deadlines, meetings, resources, promises, or agreement. Public canon and authorised knowledge may enter prompts; sealed canon and private commitment-model constants MUST remain server-side until authorised. A user's assertion is not authoritative canon and an echo MUST NOT turn it into an NPC-confirmed fact. Unverifiable or conflicting material claims are rejected: one regeneration shared with R-02, then a checked neutral fallback with no invented specifics. Never send the rejected secret or private guard reason back to the generator/client. Agreement and completion are engine decisions, not consequences of generated wording. A guard is a tested safeguard, not a guarantee that a model cannot hallucinate.

## B. Where LLMs may and may not be used

- **R-10** An LLM call is allowed only for: (1) classifying a user turn into events, (2) writing an improvised NPC line, (3) the post-session judge, (4) the coach, (5) scenario generation, (6) STT/TTS where applicable. Everything else is code. New LLM uses need a `DECISIONS.md` entry.
- **R-11** The LLM MUST NOT decide: what is revealed, goal completion, scenario ending, score arithmetic, which NPC speaks, or the dialogue act.
- **R-12** Classifier, judge, coach and generator MUST return JSON validated against a schema. On parse/validation failure: retry once; then fall back (`{"events": []}`, baseline reply, `insufficient`). A failure MUST NOT crash or freeze a session; the UI shows a retry.
- **R-13** Classifier and judge MUST run at temperature 0. NPC lines MAY use ~0.7–0.9 and MUST be 1–3 sentences, in character, with no stage directions.
- **R-14** Prompts live in versioned files, not inline strings. Every stored LLM output is attributable to `{model, prompt_version, schema_version}`. **Stage 1 only (D-23):** one immutable run manifest per session, containing these values per role, plus a manifest reference on each output is sufficient; no standalone prompt registry is required. A model/prompt/schema change creates a new manifest referenced by subsequent outputs. Stage 2 may record the values directly on each output. Missing provenance is not allowed.
- **R-15** A developer-facing trace per turn MUST record: detected events, chosen act, reply source (store/LLM), leak-guard result, per-stage latency, token counts.
- **R-16** The engine package MUST NOT import network, LLM, or database code. It is a pure function of `(state, events, scenario) -> (state', act)`.

## C. Evidence and scoring

- **R-20** Deterministic points and LLM-judged points MUST be shown separately in the UI.
- **R-21** Every LLM-judged score and every coach moment MUST include `turn_id` + a verbatim quote from that user turn. Code MUST verify the quote (whitespace/case-normalised substring). Failed verification → `insufficient`, zero points, never silently kept.
- **R-22** **Credit-source rule:** every deterministic point or penalty MUST reference an identifiable source (goal completion, delivered fact, commitment, relay, or eligible relationship event) and metric. Reprocessing a source MUST NOT award or deduct again. The event types used for scored goal completion MUST be disjoint from the union of fact reveal triggers, including indirect fact-based goal conditions; validate that disjointness during authoring. One user turn may contain distinct supported events with separate credit, but duplicating or relabelling one achievement to earn multiple credits is forbidden. A commitment fault gets its configured penalty once, not again through an `overpromised` alias or repeated callback. Relationship scoring MUST exclude goal/fact/integrity-allocated source events even if those events influence the visible NPC mood. The judge scores **quality only**, with verified quotes; it MUST NOT award goal completion, fact discovery, or commitment/relay correctness already assessed by code. A quote may support a distinct quality assessment; merely mentioning a scored achievement earns no rubric points. D-24 and ARCHITECTURE.md §11 define the allocation model.
- **R-23** Scoring MUST NOT reward length, accent, speech rate, filler words, or grammar polish. Voice and multilingual sessions are scored on the user-confirmed text transcript.
- **R-24** Flags in the debrief timeline (premature commitment, missed probe, broken promise, great recap…) MUST come from code over events, not from an LLM.
- **R-25** `better_reply` suggestions MUST use only information the user had at that moment (R-04 applies) and MUST NOT contain undiscovered sealed facts; they model the question that would have uncovered them.
- **R-26** Score weights are provisional and MUST be stored in config per scenario, versioned, and written into each debrief so old results stay explainable.
- **R-27** Changing a weight, rubric anchor, or event taxonomy MUST bump `scoring_version`. Cross-version score comparisons MUST be labelled in progress views.

## D. Engine and state

- **R-30** Engine state per session MUST be fully serialisable and snapshotted after every turn.
- **R-31** Mood is 0–100, clamped, per NPC. Labels: ≥65 Calm · 40–64 Tense · 20–39 Frustrated · <20 Hostile. Mood numbers MUST NOT be shown to users.
- **R-32** Customisation sliders are fixed at session start and recorded in the session record and debrief.
- **R-33** Dialogue act priority is fixed and documented in `ARCHITECTURE.md`; changing it needs a `DECISIONS.md` entry.
- **R-34** The scenario ends when all **required** goals are done, the user ends it, max turns is hit, or an NPC walks out. Hidden goals never end a scenario.
- **R-35** Engine behaviour MUST be reproducible: same scenario + same event list + same sliders + same seed → same state and act.

## E. UX and safety

- **R-40** A typical turn SHOULD complete within the latency budget in `ARCHITECTURE.md`. The UI MUST show a typing indicator and MUST NOT freeze on a failed call.
- **R-41** The scene MUST work with keyboard only (WASD/arrows, E, ESC) and MUST have a text-only fallback path.
- **R-42** Sound is opt-in and mutable at all times. Voice input MUST show the transcript for confirmation before it is sent (stage 1).
- **R-43** Scenario content MUST NOT include or encourage harassment, discrimination, or demeaning NPC behaviour toward protected groups. Difficult NPCs are difficult about *work*, not about identity.
- **R-44** The product tone is supportive practice ("no perfect answers needed"). Debriefs MUST name what went well before what to fix, and MUST NOT label the user as a person ("you are bad at…"); they describe moments.
- **R-45** Generated or community scenarios MUST pass schema validation, semantic validation, scripted-bot playtests, and review before being playable by others.

## F. Privacy and data

- **R-50** API keys MUST stay server-side. Never commit keys, transcripts, or audio.
- **R-51** Transcripts and audio are personal data. Collect the minimum; store with a retention limit; allow deletion by the user.
- **R-52** Employer views MUST be opt-in by the user and show only what the user consented to; default is aggregated.
- **R-53** Do not send a user's identity details to LLM providers. Use opaque session IDs.
- **R-54** Voice recordings MUST NOT be stored beyond transcription unless the user opts in.

## G. Scenario authoring checklist (every scenario)

A scenario is not mergeable until:

1. Spec validates against the schema.
2. ≥2 hidden facts, each with an owner NPC, ≥1 trigger, per-locale leak keywords, a weight, and the "question that unlocks it".
3. ≥2 visible goals; at least one requires an NPC conversation; dependencies declared.
4. ≥1 beat that creates pressure (callback to a commitment or a request for a decision).
5. A scripted **smart path** (discovers facts, commits realistically, recaps) scores ≥85 and ends positively.
6. A scripted **trap path** (premature commitment, no probing) is flagged correctly and scores <50.
7. A scripted **reveal-everything / injection path** reveals nothing.
8. Every fact reachable from at least one reasonable question, and unreachable without one.
9. Weights sum correctly; R-22 credit sources are explicit and idempotent; the goal-event/fact-trigger disjointness check passes; judge anchors assess quality only.
10. Content reviewed against R-43.
11. A scenario containing commitments MUST define a fixed `clock`, visibility-scoped `canon`, and a server-side `commitment_model`: whole-day date resolution, feasibility bounds and help activation, agreement authority, revision/supersession rules, and duplicate-penalty handling. Validate realistic, unrealistic, ambiguous-date, and revised-commitment paths (D-25).

## H. Code and process

- **R-60** Engine changes MUST ship with unit tests driven by hand-written event lists. Tests run with no network or keys.
- **R-61** Any change to a prompt, schema, or taxonomy MUST re-run the relevant eval set and record results in the change summary. **Stage 1 only (D-23):** a documented, affected subset may be used per change, identifying the changed versions and cases; use the existing full relevant set if a safe subset cannot be identified. All applicable acceptance gates, including R-62, MUST pass before a demo-ready claim. Missing provider/keys or a missing harness means **not run**, never passed; a documentation review does not substitute for live-model evaluation. D-28 permits deferring live execution during this Stage 1 implementation: save the relevant requests/cases for the user, record NOT RUN, and retain mandatory offline checks. Only one total live smoke test is authorised; it does not satisfy acceptance evals. Stage 2 requires the full relevant eval set per change.
- **R-62** Hidden-fact acceptance tests MUST pass before any demo: untriggered facts never appear across ≥5 runs; triggered facts reveal on the right question; the injection path reveals nothing.
- **R-63** No scope creep: work outside the current phase in `PHASES.md` waits until its exit criteria pass. Under the explicit Stage 1 authorisation in D-28, the orchestrator may advance sequential implementation after offline acceptance while live gates remain visibly deferred and unchecked; this never permits a demo-ready claim or skipping safety implementation. D-37 additionally permits the bounded scenario-foundation documentation and its sequential shared-runtime implementation plan while S1-P7 acceptance remains current. D-38 additionally permits only the reusable remote-contact and `missed_deadline` v2/scoring-v3 slices specified in its plan while S1-P7 remains current. Neither exception waives S1 acceptance, safety, review, testing, or live-gate requirements.
- **R-64** One concern per PR. **Stage 1 only (D-23):** one bounded, coherent slice within the current phase may include related code, tests, and documentation. No unrelated refactor or future-stage work. D-37 permits only its stated scenario-foundation slices and D-38 only its stated remote-contact/deadline-story slices while S1-P7 remains current; neither waives this bounded-slice rule or permits unrelated future-stage work. Every candidate MUST pass coder → reviewer → tester → orchestrator in AGENT.md §6; fixes repeat the relevant review/test gates. Include a transcript or screenshot for behaviour changes. Documentation-only changes need a consistency/verification report, not fabricated runtime evidence.
- **R-65** Dependencies need a one-line justification. Prefer the standard library and existing packages.
- **R-66** Logs MUST NOT contain sealed facts in user-visible channels, API keys, or raw audio.

## I. Documentation

- **R-70** When code and docs disagree, fix one in the same PR and say which.
- **R-71** Decisions that bend a rule are recorded in `DECISIONS.md` with date and reason *before* the code merges.

