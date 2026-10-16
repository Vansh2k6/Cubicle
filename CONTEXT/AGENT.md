# AGENT.md — Lead project instructions and orchestrator contract

Project: **Cubicle — AI Job Simulator** (CODE APEX 3.0, iMocha track IM-04, team Fathom).
Last updated: 2026-10-16. If this file disagrees with the code, fix whichever is wrong and say which in the PR.

## 1. What you are building (read this first)

A practice space where a person walks around a 3D isometric office, talks (typing now, speaking later) to AI colleagues, and gets a fair, **evidence-backed** debrief afterwards. NPCs hold **hidden facts** that only come out when the user asks the right questions. The conversation is **improvised**, but the *decisions* (what is revealed, what is scored, what ends the scenario) are made by **plain code**, not by an LLM.

Existing build (called "cubicle"): isometric office scene, player **Alex**, move with WASD, **E** to talk, ESC to close. NPCs: **Maya Chen** (manager), **Jordan Lee** (teammate), **Sam Taylor** (People & culture). Scenarios: *Missed a project deadline*, *Forgot to reply to an email*, *Missed an important call*. Conversations currently use scripted buttons, not user-entered free text or an LLM. The scene is presentation; the planned engine must not depend on it.

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

**Verified baseline, 2026-10-16:** plain JavaScript ES modules, Vite 8, Three.js, Lucide, and CSS. No React, backend, standalone engine, scenario schema, test harness, or LLM integration exists yet.

```text
/index.html          # page shell and existing sidebar/game controls
/src/main.js         # scripted scenarios, chat UI, local progress and completion
/src/office.js       # Three.js scene, movement, proximity; E calls hooks.onTalk()
/src/style.css       # ivory interface; office viewport styling is separate
/public/favicon.svg # Cubicle branding
/package.json        # existing install/build/dev commands
/CONTEXT             # the six project documents
/AGENTS.md           # discoverable pointer to this lead document
```

`src/main.js` contains the three baseline scripts in `scenarios` and the Jordan/Sam lines in `renderDialogue()`. `createOffice()` updates `onNear`; E or the talk button calls `openConversation()`, which checks proximity and renders choices. `choose()` advances the expected choice; `completeScenario()` saves completion to `cubicle-progress` in localStorage, with a read fallback for `workplay-progress`. This is not the planned weighted scorer or session store. The missed-call script is present, including apology, a 2 PM reconnection plan, and a manager response.

**P0.4 update, 2026-10-16:** `/engine`, `/engine/tests`, `/scenarios` now hold real contents: `/engine/scenarioValidator.js` (P0.5), `/engine/tests` node:test suites (P0.4), `/scenarios/missed_deadline.json` + schema (P0.3/P0.5); `/evals` remains empty. Test runner is Node + node:test; no new dependencies.

```text
/engine              # P0.4 placeholder; scenarioValidator.js owned separately (P0.5)
/engine/tests        # node:test unit tests (P0.4)
/scenarios           # P0.4 placeholder; missed_deadline.json + schema owned separately (P0.3/P0.5)
/evals               # P0.4 placeholder; no real-model harness yet
```

**Planned additions, remaining not-existing folders:** retain the current frontend unless a phase requires moving it. Provider remains deferred to O-06 (P0.2, provider-agnostic); engine runtime is Node + node:test (P0.4). Do not scaffold unused directories merely to match this map.

```
/src + /index.html   # retain the current frontend
/services/api        # server API; implementation stack not yet selected
/llm                 # gateway, prompts, schemas, retry/fallback, leak guard
/replies             # baseline reply store (authored lines, tags, locale)
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
dev (api):    unavailable; no backend yet
test engine:  npm run test:engine (node --test "engine/tests/*.test.js"; currently engine-only, must run without network or API keys)
test all:     npm test (engine + llm offline suites; live evals stay NOT RUN until a provider is configured)
lint/format:  unavailable; no configured script yet
evals:        unavailable; no real-model eval harness yet
```

## 6. Working agreements

**Mandatory handoff for every change, including documentation and test code:**

1. **Orchestrator (root):** gathers context, checks the phase and rules, assigns bounded work, and resolves decisions. Every change returns here for final acceptance.
2. **Coder:** prepares the smallest complete change and its checks; reports touched files and limitations. Does not self-approve.
3. **Reviewer:** reviews the exact candidate against AGENT.md, RULES.md, and the accepted scope. Findings return to the coder; the revised candidate is reviewed again.
4. **Tester:** only after reviewer approval, verifies the approved candidate with relevant offline tests, build checks, document checks, and applicable authorised evals. Reports commands, results, and unverified behaviour. A build pass is not an engine/eval pass.
5. **Orchestrator:** inspects both reports, confirms the tested candidate is still current, and accepts or sends it back. Any code fix after approval repeats review → testing; no direct-to-complete bypass.

Do not merge, deploy, claim completion, or check off a phase solely on the coder's report. Agents share files: assign separate ownership and never overwrite unrelated changes. For a documentation-only task, validate contracts and consistency; do not claim the described features are implemented.

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
- For conversation changes: the five acceptance playthroughs in `PHASES.md` §Demo exit criteria still pass.
- Reviewer approval, tester verification, and final orchestrator acceptance apply to the same candidate.
- No rule in `RULES.md` is violated; any explicitly authorised exception must be dated in `DECISIONS.md` and reflected in the rule before implementation.
- Latency on a typical turn is within budget (`ARCHITECTURE.md` §Latency budget) or the regression is called out.
- Docs updated if behaviour, schema, or API changed.

## 9. Ask the human when

Ask only for choices not already authorised by the user or settled by an accepted decision. The requested D-23–D-26 contract updates are authorised; an unspecified provider or newly proposed numeric scenario constant is not thereby chosen.

- A change would alter scoring weights, rubric anchors, or what counts as "revealed".
- You need to pick a model/provider, change the data schema, or add a stage-2 feature during stage 1.
- Scenario content could be sensitive (harassment, discrimination, health, legal).
- Two documents conflict and the order in §2 does not resolve it.

## 10. Known unknowns (as of 2026-10-16)

- LLM provider, approved models per role, budget, and server-side credential setup (O-06). Never request keys in chat.
- Engine runtime Node+node:test decided (P0.4); executable schema validator implemented (P0.5); /services/api stack still open.
- SC-01 relative-day constants confirmed (P0.3, D-27); D-12/D-22 accepted.
- Real-model guard accuracy, scoring calibration, and end-to-end latency. All are unmeasured in this baseline.
- Human team ownership for coding, AI direction, and art/demo (O-09); this chat's agent roles are assigned by §6.

