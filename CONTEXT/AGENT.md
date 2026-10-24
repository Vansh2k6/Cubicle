# AGENT.md — Lead project instructions and orchestrator contract

Project: **Cubicle — AI Job Simulator** (CODE APEX 3.0, iMocha track IM-04, team Fathom).
Last updated: 2026-10-18. If this file disagrees with the code, fix whichever is wrong and say which in the PR.

## 1. What you are building (read this first)

A practice space where a person walks around a 3D isometric office, talks (typing now, speaking later) to AI colleagues, and gets a fair, **evidence-backed** debrief afterwards. NPCs hold **hidden facts** that only come out when the user asks the right questions. The conversation is **improvised**, but the *decisions* (what is revealed, what is scored, what ends the scenario) are made by **plain code**, not by an LLM.

Existing build (called "cubicle"): isometric office scene, player **Shubhankar Parsewar**, move with WASD, **E** to talk, ESC to close. NPCs: **Snehal Mane** (manager), **Vansh Singh** (teammate), **Prathamesh Surwase** (People & culture). Scenarios: *Missed a project deadline*, *Forgot to reply to an email*, *Missed an important call*. SC-01 now uses typed API conversations with per-NPC threads and guarded responses; SC-02/03 retain scripted buttons. The scene is presentation; the planned engine must not depend on it.

## 2. Source-of-truth order

This file is the head project document. When project documents conflict, the higher one wins:

1. [AGENT.md](AGENT.md) — project workflow, precedence, and orchestrator responsibilities
2. [RULES.md](RULES.md) — mandatory constraints; always apply them
3. [DECISIONS.md](DECISIONS.md) — accepted decisions and explicitly bounded exceptions
4. [ARCHITECTURE.md](ARCHITECTURE.md) — design and contracts
5. [PRD.md](PRD.md) — product scope and requirements
6. [PHASES.md](PHASES.md) — current work and exit criteria

Do not treat this precedence as a general waiver of RULES.md. Exceptions must be explicit, dated, and reflected in the affected rule. Later accepted decisions supersede earlier decisions only in their stated scope; proposed decisions are not approvals.

The original hackathon PDF and older PPT are **context, not law**. An AI-generated plan is a draft until the user adopts it. Explicit user directions, including the 2026-10-16 change list, authorise the stated revisions; record them in these documents rather than asking for the same approval again.

## 3. Before you write code

1. Read all six CONTEXT documents before writing application code. Open `PHASES.md`, find the first unchecked item in the **current phase**, and check the **Round 2 demo = Stage 1** priority note and `DECISIONS.md` D-23. Work within that phase; priorities do not waive its exit criteria.
2. Check `RULES.md` for every rule touching the change, especially R-01 to R-09 and R-22.
3. Read the affected code, callers, tests, fixtures, configuration, and exports. Identify existing implementations before adding new ones. Follow the Ponytail skill: smallest complete change, no speculative infrastructure.
4. If a request needs something listed under *Out of scope for the current stage* in `PHASES.md`, check whether the user already authorised that exact exception. Otherwise ask before implementing it.
5. If you are about to add an LLM call, justify it against `RULES.md` R-10 in the change summary. Do not claim provider latency or safety checks passed without measurement.

## 4. Repo layout

**Scenario-foundation continuation, 2026-10-24:** D-37's SF-00–SF-04 slices are accepted offline; the handoff and exact evidence are in `plans/SCENARIO_FOUNDATION_STATUS.md`. SF-04's full offline suite initially failed only on public reply-label scanner false positives; its unit/API suites passed, and the approved scanner correction passed affected tests plus default/voice scans. This is not a rerun full-suite pass, a production-story approval, or a Stage 1 acceptance result. Live, browser, physical microphone/speaker and performance verification remain pending; follow the existing coder → reviewer → tester → orchestrator workflow unchanged.

**Client/deadline continuation, 2026-10-24:** D-38 accepts only the plan and bounded R-63/R-64 exception in `plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md`; progress is recorded in `plans/CLIENT_AND_DEADLINE_STATUS.md`. CP-00 documentation and CN-01’s ordinary remote-NPC metadata/audio backend are accepted offline; CN-02 phone UI and the deadline-story slices are not started. Follow CP-00 → CN-01 → CN-02 → DS-01 → DS-02 → DS-03 → DS-04 with coder → Sol reviewer → Luna tester → root orchestrator. No slice closes S1-P7, Stage 1 acceptance, or a live/browser/device gate.

**Current continuation, 2026-10-18:** S1-12 shared sliders and S1-13 optional presets are accepted offline. S1-14 built-only demo serving, malformed-path recovery, offline verification command and operator/exit documentation are implemented; final serving verification is recorded in its gate. Fresh full checks: 217 offline tests, 35 API tests, build and corrected bundle scan (5 artifacts/81 needles/zero hits). Root verified the actual built same-origin loop, provisional debrief, Restart preserving progress and fresh empty retry state with no browser errors. Presets require VITE_PRESETS=1; voice remains absent. Current work stops at Stage 1 live acceptance, not Stage 2: every live exit remains NOT RUN under D-28, and no demo-ready claim is made. D-33 corrects historical vacuous content scans; D-34 protects the user's ignored/untracked local credential file. New narrow-screen verification remains unverified. Full historical feedback lasts only while its API process lives. Push/PR is postponed.

**Voice V0 accepted, 2026-10-21:** D-35 accepts the English-only local sidecar contract without implementing voice. V1 adds the default-off local STT server boundary; client voice remains absent. See `voice-sidecar/README.md` and `plans/VOICE_V1_STATUS.md`; V1 verification/acceptance is recorded separately.

**Voice V2 implementation, verified offline 2026-10-22:** The isolated `feat/voice-v2` branch adds opt-in client recording and editable draft confirmation, plus a minimal capability endpoint. D-36 now prefers a warmed available GPU with CPU portability fallback and permits private `.env` loading; live calls still require the user's specific request. Source review, 258 unit tests, 47 API tests, 10 Python tests and default/voice-enabled bundle scans passed; desktop/narrow controls and typed Send/Escape/Help were checked. See `plans/VOICE_V2_STATUS.md` and the V2 gate for handoff and limits. The human confirmed microphone input works; full real-device playthrough remains pending. Historical V1 CPU-default results above remain historical. Playback/Listen and complete voice acceptance remain later V3/V4 work.

**Voice V3 implementation, verified offline/browser 2026-10-22:** Opt-in NPC playback now prefetches only committed guarded NPC rows, with a session-scoped memory cache, ID-only audio route, captions, replay, mute and lifecycle cancellation. Sol review and the same-source offline gate passed: 282 unit tests, 58 API tests, default and voice-enabled bundle scans (5/6 artifacts, 81 needles, zero hits). Root checked one local CUDA Maya TTS sample plus desktop/narrow controls and replay/mute/Escape/End/Restart; this does not establish physical-speaker or complete real-device acceptance. See `plans/VOICE_V3_STATUS.md` and `evals/reports/S1-V3-gate.md`. P6.4 remains unchecked; V4 Listen/recovery/measurement and scene-performance verification remain pending. No Groq/cloud calls or new dependencies; voice defaults off and no demo-ready claim is made.

**Voice V4 offline checkpoint accepted for root, 2026-10-22:** Adds ended-only stored coaching Listen, modal Voice/Sounds controls, shared bounded health/backoff and explicit retry recovery. Sol independently approved the 25-file source manifest (fingerprint `ad2c6e781a671ecb7b36446aff10bfa8cb59d89e057338fdd038b7cd0209e6bd`) with no blockers; Luna's offline gate passed (294/294 unit, 63/63 API, default 5-artifact/81-needle and `VITE_VOICE=1` 6-artifact/81-needle scans with zero hits). That source manifest was unchanged across review/testing; this documentation handoff follows it. The existing >500 kB chunk warning remains. Root measured 20 warmed local CUDA sidecar runs (`small.en` float16 STT + Piper): STT 351/394 ms, text 3/5 ms, TTS first byte 190/207 ms and speech-end-to-first-audio 546/590 ms p50/p95. These are offline/API measurements, not browser or perceived-speech acceptance. Root also checked sidecar loss/recovery and new NPC/Listen WAV responses over local HTTP. See `plans/VOICE_V4_STATUS.md` and `evals/reports/S1-V4-gate.md`. P6.3–P6.5 remain unchecked; browser, narrow/full smart-path, microphone, speakers/unlock perception and scene-performance gates remain pending. No local-primary/cloud decision or demo-ready claim is made.

**Subsequent movement correction, 2026-10-17:** the player-position scope fix passed two added regressions, bringing the fresh offline total to 199; 27 API tests, build and bundle scan also passed. Root verified keyboard/click walking and Help pause/resume with zero fresh browser errors. Historical milestone counts below remain unchanged. The existing bundle-size warning remains; live acceptance is NOT RUN and work stops before S1-11.

**Implementation snapshot, 2026-10-17:** plain JavaScript ES modules, Vite 8, Three.js, Lucide and CSS. Pure engine, guarded LLM pipeline, typed multi-NPC API conversations and opt-in Groq adapter exist. S1-07 conservative relay validation, delivered agreement/ending, explicit server End and debrief placeholder are accepted for implementation/offline progression. A limited typed-goal/End browser check passed; full scene smart/trap and live acceptance remain NOT RUN. S1-08 deterministic scoring and code flags are accepted offline (165 tests; smart/trap deterministic 60/7). S1-09 judge, quote validator and historical coach are accepted offline (187 cumulative tests); S1-10 ended-session debrief integration is accepted offline (197 tests, 27 API tests), including desktop/narrow screenshots and retry/focus checks. Work stopped after prompt 10 at the user's request; live acceptance remains NOT RUN. The two-call Groq connectivity smoke is recorded separately.

```text
/index.html          # page shell and existing sidebar/game controls
/src/main.js         # scripted scenarios, chat UI, local progress and completion
/src/office.js       # Three.js scene, movement, proximity; E calls hooks.onTalk()
/src/style.css       # ivory interface; office viewport styling is separate
/public/favicon.svg # Cubicle branding
/package.json        # existing install/build/dev commands
/CONTEXT             # the six project documents
/PROMPT              # ordered Stage 1 implementation prompts S1-00 through S1-14
/AGENTS.md           # discoverable pointer to this lead document
```

`src/main.js` contains the three baseline scripts in `scenarios` and the Jordan/Sam lines in `renderDialogue()`. `createOffice()` updates `onNear`; E or the talk button calls `openConversation()`, which checks proximity and renders choices. `choose()` advances the expected choice; `completeScenario()` saves completion to `cubicle-progress` in localStorage, with a read fallback for `workplay-progress`. This is not the planned weighted scorer or session store. The missed-call script is present, including apology, a 2 PM reconnection plan, and a manager response.

**Existing modules, 2026-10-16:** these files must be audited and reused in their respective prompts. Test runner is Node + node:test; no new dependencies.

```text
/engine              # engine.js, config.js, store.js and scenarioValidator.js
/engine/tests        # engine and scenario validation node:test suites
/scenarios           # missed_deadline.json and versioned JSON schema
/llm                 # gateway, classifier, NPC generation, prompt builder, manifests,
                     # role model config and Groq provider, fake provider, versioned prompts/tests
/replies             # SC-01 authored fallback lines and fallbackStore.js
/evals               # labelled events.jsonl and generic-endpoint classifier runner
```

**Remaining additions:** retain the current frontend. Node built-in HTTP API, safety guards and default-offline provider wiring exist; D-30 supersedes D-28 model defaults. Deterministic scoring now exists in /scoring; feedback modules now exist; S1-10 ended-session debrief integration is accepted offline (197 tests, 27 API tests), including desktop/narrow screenshots and retry/focus checks. Work stopped after prompt 10 at the user's request; live acceptance remains NOT RUN. Do not scaffold unused directories merely to match this map.

```
/src + /index.html   # retain the current frontend
/services/api        # Node built-in HTTP server API
/scoring             # deterministic metrics, judge client, quote validator
/CONTEXT             # these markdown files
```

## 5. Commands

**Verified from package.json.** Commands without an implementation remain unavailable; do not invent a passing test command.

```
install:      npm ci
dev (web):    npm run dev
build (web):  npm run build
preview:      npm run preview
demo (built): npm run demo (build first; loopback frontend + API, default offline)
dev (api):    npm run api (offline default; Groq requires explicit configuration)
test engine:  npm run test:engine (node --test "engine/tests/*.test.js"; currently engine-only, must run without network or API keys)
test all:     npm test (engine + llm + scoring offline suites; live evals deferred under D-28)
offline gate: npm run verify:offline (clears provider/key/debug child env; all tests + API + bundle build/scan)
voice local:  npm run voice:sidecar (existing installed runtime/models; private local token in environment)
voice smoke:  npm run voice:smoke (local synthetic STT/TTS, memory-only)
voice bench:  npm run voice:bench (existing local sidecar-only timing)
voice latency:npm run voice:latency (20 runs default, VOICE_LATENCY_RUNS=20..50; guaranteed offline LLM, local speech; metadata-only report)
lint/format:  unavailable; no configured script yet
evals:        node evals/runClassifier.mjs (generic LLM_PROVIDER endpoint required;
              legacy endpoint runner; full live acceptance deferred under D-28)
```

## 6. Working agreements

**Mandatory handoff for every change, including documentation and test code:**

1. **Orchestrator (root):** gathers context, checks the phase and rules, assigns bounded work, and resolves decisions. Every change returns here for final acceptance.
2. **Coder:** prepares the smallest complete change and its checks; reports touched files and limitations. Does not self-approve.
3. **Reviewer:** reviews the exact candidate against AGENT.md, RULES.md, and the accepted scope. Findings return to the coder; the revised candidate is reviewed again.
4. **Tester:** only after reviewer approval, verifies the approved candidate with relevant offline tests, build checks, document checks, and applicable authorised evals. Reports commands, results, and unverified behaviour. A build pass is not an engine/eval pass.
5. **Orchestrator:** inspects both reports, confirms the tested candidate is still current, and accepts or sends it back. Any code fix after approval repeats review → testing; no direct-to-complete bypass.

Do not merge, deploy, claim completion, or check off a phase solely on the coder's report. Agents share files: assign separate ownership and never overwrite unrelated changes. For a documentation-only task, validate contracts and consistency; do not claim the described features are implemented.

**Cost-conscious assignment:** use Terra medium for new coder/worker agents handling bounded changes and routine GSD documentation; use Luna medium for tester/explorer agents executing prescribed checks or read-only mapping, including routine GSD mapping/classification. Keep reviewer/root and high-risk scoring, security, concurrency, architecture and corresponding GSD roles on Sol; never automatically lower critical roles. Root owns semantic acceptance and escalates unclear cheaper-agent results. Pass targeted context and diffs, then run one tester full sweep after the candidate is frozen and approved. These defaults belong to personal Codex configuration outside this repository: they apply to new agents/chats after reload, not existing agents.

**Voice reviewer tiers:** Terra may review V0/documentation, V2 UI, and V4 measurement/documentation. Sol reviews high-risk V1/V3 route or security changes; any scope shift into a high-risk area remains with Sol.

- **Engine first, UI second.** Anything that decides a score, reveal, goal, or ending lives in `/engine` and is unit-tested without an LLM.
- **Sealed facts never enter a dialogue prompt** until the engine authorises disclosure (R-01). Pending disclosure is not user knowledge or score credit until the guarded reply is delivered. Post-session missed-fact disclosure is separate. If unsure, treat a fact as sealed.
- **LLMs return JSON** for classifier, judge, coach, generator. Validate against a schema. Retry once, then fall back (R-12).
- **Never expose** sealed facts, hidden goals, or scoring internals through the API during a live session (R-03).
- **Small PRs**, one concern each, with the bounded Stage 1 slice exception in R-64/D-23. Include before/after transcript or screenshot for any behaviour change.
- **Every new scenario** goes through the checklist in `RULES.md` §Scenario authoring and passes the scripted-bot playthroughs.
- Prefer boring code. No new dependency without a one-line reason in the PR.
- Do not rewrite or reformat files you were not asked to touch.

## 7. Playbooks

**Add an event type:** add to taxonomy in `ARCHITECTURE.md` §Events and `/engine/events` → add classifier examples (≥5 per language) → add to eval set → update any scenario that should use it. Never add free-text events.

**Add a hidden fact:** give it an owner NPC, ≥1 trigger (events), keywords per locale for the leak guard, a weight, and the question that unlocks it (shown in debrief). Add one test that the fact does **not** appear when untriggered, and one that it appears when triggered.

**Add a metric:** register in `/scoring` with id, weight, and pure function `(session_record) -> points + evidence`. Show deterministic and LLM points separately in the UI (R-20).

**Add a baseline reply:** add to `/replies` keyed by `(npc, dialogue_act, state predicates, locale)` with ≥2 variants. Replies for `reveal_fact:*` acts may contain that fact only. No reply may contain a different sealed fact.

**Add a language:** see `ARCHITECTURE.md` §Localisation. Events stay language-neutral; add classifier examples, locale text, leak keywords, eval set.

## 8. Definition of done

- Engine tests pass with no network.
- For demo readiness: all ten acceptance criteria in `PHASES.md` §Stage 1 exit criteria pass. D-28 permits implementation progression with live gates explicitly deferred; this is not demo readiness.
- Reviewer approval, tester verification, and final orchestrator acceptance apply to the same candidate.
- No rule in `RULES.md` is violated; any explicitly authorised exception must be dated in `DECISIONS.md` and reflected in the rule before implementation.
- Latency on a typical turn is within budget (`ARCHITECTURE.md` §Latency budget) or the regression is called out.
- Docs updated if behaviour, schema, or API changed.

## 9. Ask the human when

Ask only for choices not already authorised by the user or settled by an accepted decision. D-27 confirms SC-01 constants; D-28 records Groq/model selection, runtime discretion, sequential prompt execution and the live-test budget. New numeric scenario constants still need confirmation.

- A change would alter scoring weights, rubric anchors, or what counts as "revealed".
- You need to pick a model/provider, change the data schema, or add a stage-2 feature during stage 1.
- Scenario content could be sensitive (harassment, discrimination, health, legal).
- Two documents conflict and the order in §2 does not resolve it.

## 10. Known unknowns (as of 2026-10-16)

- Groq free-plan account limits and server-side credential setup remain to be verified; models are selected in D-28. Never request keys in chat.
- Node+node:test and built-in HTTP API selected (D-28); engine/schema/LLM modules, API and guards exist; full live guard acceptance remains unverified.
- SC-01 relative-day constants confirmed (P0.3, D-27); D-12/D-22 accepted.
- Real-model guard accuracy, scoring calibration, and end-to-end latency. All are unmeasured in this baseline.
- Human team ownership for coding, AI direction, and art/demo (O-09); this chat's agent roles are assigned by §6.
