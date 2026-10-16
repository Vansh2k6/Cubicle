# Graph Report - Cubicle  (2026-10-16)

## Corpus Check
- Corpus is ~49,773 words - fits in a single context window. You may not need a graph.

## Summary
- 767 nodes · 923 edges · 55 communities (54 shown, 1 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Conversation Engine & Turns
- Scenario State & Canon Clock
- Architecture & Design Decisions
- Event Classifier & Safety
- Scoring, Debrief & Guardrails
- Implementation Phases & Roadmap
- PRD & Requirements
- Classifier Evaluation Runner
- Dependencies & Packages
- Scenario Content Model
- Scenario Type Schemas
- Localization & Schema Constraints
- UI Controller & Interactions
- 3D Office Scene Rendering
- Scenario Validation & Integrity
- Fallback Reply Test Suite
- NPC Prompt Construction
- Assistance & Agreement Logic
- Engine Dynamics & Calibration
- Item List Schemas
- Character Behavior Sliders
- Array Validation Constraints
- Developer Rules & Guidelines
- Turn Advancement Configuration
- Public & Private Knowledge Silos
- Schema Constant Properties
- Turn Limits & Constraints
- Schema Tuple Rules
- Classifier Prompt Specification
- Prompt Engineering Execution Guide
- Phase P0 Baseline Freeze
- Phase P4a Deterministic Scoring
- Phase P6 Core Sliders
- Phase P6x Presets and Voice
- Phase P1 Engine Core
- Phase P2a Gateway & Classifier
- Phase P2b Guardrails Pipeline
- Phase P2c Text UI & Exit
- Phase P3a Threads & Checklist
- Phase P3b Relay & Scenario Ending
- Phase P4b Judge & Coach
- Phase P4c Debrief Screen
- Phase P5 Retry & Progress
- Phase P7 Hardening & Exit
- Judge Prompt Specification
- Secrets Scanner Tests
- Coach Prompt Specification
- Quickstart & Play Documentation
- Event Trigger Definitions
- NPC Line Prompt Specification
- Goal State Tracking
- Public Context Definitions

## God Nodes (most connected - your core abstractions)
1. `DECISIONS.md — Decision log` - 29 edges
2. `required` - 25 edges
3. `ARCHITECTURE.md — System architecture` - 24 edges
4. `applyTurn()` - 18 edges
5. `createOffice()` - 18 edges
6. `required` - 16 edges
7. `PRD.md — Product Requirements: Cubicle (AI Job Simulator)` - 14 edges
8. `STAGE 2 — TOTAL IMPLEMENTATION` - 13 edges
9. `7. Functional requirements` - 12 edges
10. `SessionStore` - 11 edges

## Surprising Connections (you probably didn't know these)
- `commitDay()` --calls--> `createSession()`  [EXTRACTED]
  engine/tests/engine.test.js → engine/engine.js
- `runSmart()` --calls--> `createSession()`  [EXTRACTED]
  engine/tests/engine.test.js → engine/engine.js
- `script()` --calls--> `createSession()`  [EXTRACTED]
  engine/tests/engine.test.js → engine/engine.js
- `turnsToWalkout()` --calls--> `createSession()`  [EXTRACTED]
  engine/tests/engine.test.js → engine/engine.js
- `commitDay()` --calls--> `applyTurn()`  [EXTRACTED]
  engine/tests/engine.test.js → engine/engine.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Core Conversation Orchestration Flow** — engine_engine, llm_gateway, llm_classifier, llm_npc [INFERRED 0.95]
- **3D Office Web Client Stack** — src_main, src_office [EXTRACTED 1.00]

## Communities (55 total, 1 thin omitted)

### Community 0 - "Conversation Engine & Turns"
Cohesion: 0.08
Nodes (36): Principle: Engine decides, LLM speaks (R-11), Principle: Everything snapshotted (D-13), applyTurn(), assistanceActive(), b2TurnFor(), b3ExtraDrop(), boundsFor(), canonicalState() (+28 more)

### Community 1 - "Scenario State & Canon Clock"
Cohesion: 0.04
Nodes (46): beats, briefing, canon, clock, commitment_model, end, facts, goals (+38 more)

### Community 2 - "Architecture & Design Decisions"
Cohesion: 0.04
Nodes (40): Cubicle project instructions, D-01 · Accepted · 2026-10-16 — Hybrid pipeline: LLM only where language understanding or generation is needed, D-02 · Accepted · 2026-10-16 — Hidden facts are sealed in code, not in prompts, D-03 · Accepted · 2026-10-16 — Reveal is trigger-based and intent-based, not keyword-based, D-04 · Accepted · 2026-10-16 — NPCs withhold; they do not lie (v1), D-05 · Accepted · 2026-10-16 — Each NPC has its own knowledge; information moves only through the user, D-06 · Accepted · 2026-10-16 — Scenario ends on goals, not turn count, D-07 · Accepted · 2026-10-16 — Scoring is a weighted, transparent registry; deterministic and LLM points shown separately (+32 more)

### Community 3 - "Event Classifier & Safety"
Cohesion: 0.08
Nodes (33): Principle: Fail soft (R-12), Principle: Sealed means absent (R-01), AMBIGUOUS_MARKERS, buildClassifierInput(), CLASSIFIER_SCHEMA, classifyTurn(), coerceDay(), EXPLICIT_DAY (+25 more)

### Community 4 - "Scoring, Debrief & Guardrails"
Cohesion: 0.06
Nodes (32): 10. Leak guard, 11.1 Metrics (plugin registry), 11.2 Flow, 11.3 Flags (code, from events), 11. Scoring and debrief, 12. Replay, rewind, corrected performance **[S2]**, 13. Voice **[S1 stretch → S2]**, 14. Localisation **[S2]** (+24 more)

### Community 5 - "Implementation Phases & Roadmap"
Cohesion: 0.08
Nodes (25): Dependency notes, PHASES.md — Implementation phases, S1-P0 — Baseline audit and freeze, S1-P1 — Engine core (no LLM), S1-P2 — Free-text conversation and hidden facts, S1-P3 — Goals and multi-NPC flow in the scene, S1-P4 — Scoring and debrief (core), S1-P5 — Retry and basic progress (+17 more)

### Community 6 - "PRD & Requirements"
Cohesion: 0.08
Nodes (26): 10. Success metrics, 11. Risks, 12. Out of scope (whole product, for now), 13. Open questions, 1. Summary, 2. Problem, 3. Users, 4. Goals and non-goals (+18 more)

### Community 7 - "Classifier Evaluation Runner"
Cohesion: 0.10
Nodes (17): config, date, fn, fp, lines, manifest, report, root (+9 more)

### Community 8 - "Dependencies & Packages"
Cohesion: 0.09
Nodes (22): lucide, author, dependencies, lucide, three, description, devDependencies, vite (+14 more)

### Community 9 - "Scenario Content Model"
Cohesion: 0.09
Nodes (23): act, content, default_sliders, done_when, id, label, leak_keywords, name (+15 more)

### Community 10 - "Scenario Type Schemas"
Cohesion: 0.09
Nodes (22): type, properties, minLength, type, type, type, minLength, type (+14 more)

### Community 11 - "Localization & Schema Constraints"
Cohesion: 0.12
Nodes (20): en, properties, required, type, properties, required, type, minLength (+12 more)

### Community 12 - "UI Controller & Interactions"
Cohesion: 0.22
Nodes (19): chime(), choose(), closeConversation(), closeModal(), completeScenario(), icon(), icons, office (+11 more)

### Community 13 - "3D Office Scene Rendering"
Cohesion: 0.20
Nodes (15): Principle: Scene is a skin (D-11), createOffice(), allowed(), box(), chair(), character(), cyl(), desk() (+7 more)

### Community 14 - "Scenario Validation & Integrity"
Cohesion: 0.15
Nodes (14): collectPrivateNodes(), deepEqual(), err(), extractEvents(), hasCycle(), KNOWN_FLAGS, PRESSURE_ACTS, publicContains() (+6 more)

### Community 15 - "Fallback Reply Test Suite"
Cohesion: 0.15
Nodes (17): ACTS, allKw, data, kwByFact, NPCS, OWNER, REVEAL, root (+9 more)

### Community 16 - "NPC Prompt Construction"
Cohesion: 0.14
Nodes (13): ACT_INSTRUCTIONS, badInput(), buildNpcPrompt(), canonLines(), factById(), ACTS, contents, keywordsByFact (+5 more)

### Community 17 - "Assistance & Agreement Logic"
Cohesion: 0.11
Nodes (18): agreement_npc, assistance_requires, assisted_min_day, latest_day_from, unassisted_min_day, type, type, additionalProperties (+10 more)

### Community 18 - "Engine Dynamics & Calibration"
Cohesion: 0.12
Nodes (9): ACT_ORDER, ASSERTIVENESS_B2_CUTOFF, B2_ASSERTIVE_TURN, B2_BASE_TURN, B3_GAP_TURNS, DEFAULT_SLIDERS, GAIN_EVENTS, MAX_TURNS_DEFAULT (+1 more)

### Community 19 - "Item List Schemas"
Cohesion: 0.14
Nodes (14): items, type, items, minItems, type, type, assistance_requires, done_when (+6 more)

### Community 20 - "Character Behavior Sliders"
Cohesion: 0.15
Nodes (13): assertiveness, forthcomingness, patience, warmth, additionalProperties, properties, required, type (+5 more)

### Community 21 - "Array Validation Constraints"
Cohesion: 0.17
Nodes (12): items, minItems, type, items, minItems, type, properties, locales (+4 more)

### Community 22 - "Developer Rules & Guidelines"
Cohesion: 0.18
Nodes (11): 10. Known unknowns (as of 2026-10-16), 1. What you are building (read this first), 2. Source-of-truth order, 3. Before you write code, 4. Repo layout, 5. Commands, 6. Working agreements, 7. Playbooks (+3 more)

### Community 23 - "Turn Advancement Configuration"
Cohesion: 0.18
Nodes (11): advance_on_turn, day, const, additionalProperties, properties, required, type, const (+3 more)

### Community 24 - "Public & Private Knowledge Silos"
Cohesion: 0.18
Nodes (11): private, public, additionalProperties, properties, required, type, type, canon (+3 more)

### Community 25 - "Schema Constant Properties"
Cohesion: 0.18
Nodes (11): const, type, type, additionalProperties, properties, type, id, name (+3 more)

### Community 26 - "Turn Limits & Constraints"
Cohesion: 0.22
Nodes (9): max_turns, additionalProperties, properties, required, type, minimum, type, end (+1 more)

### Community 27 - "Schema Tuple Rules"
Cohesion: 0.22
Nodes (9): items, minItems, type, items, minItems, type, additionalProperties, beats (+1 more)

### Community 28 - "Classifier Prompt Specification"
Cohesion: 0.25
Nodes (7): Classifier prompt v1 — missed_deadline event classifier, Date table (day-0 anchored, whole days only), Event taxonomy (27 types — the ONLY allowed event types), Help acceptance, Input fields (single JSON object), Other rules, Output shape

### Community 29 - "Prompt Engineering Execution Guide"
Cohesion: 0.25
Nodes (7): 1. How to run, 2. Order and dependencies, 3. Test vocabulary (use these words exactly), 4. Gate report format (every part ends with this), 5. Doc tensions found while preparing these prompts (resolve before relying on them), 6. Standing do-nots (every part), S1-00 — Start here: how to run the Stage 1 prompt set

### Community 30 - "Phase P0 Baseline Freeze"
Cohesion: 0.25
Nodes (7): Gate / exit (PHASES.md S1-P0), Review focus, S1-01 — P0 Baseline freeze (HUMAN STOP part), Step 1 — Decision packet (no code yet), Step 2 — Assignments (after answers), Stop and ask, Test plan (all offline)

### Community 31 - "Phase P4a Deterministic Scoring"
Cohesion: 0.25
Nodes (7): Ask the human first (HUMAN STOP), Contract, Gate / exit, Review focus, S1-08 — P4a Deterministic scoring and timeline flags (HUMAN STOP on one item), Stop and ask, Test plan (offline, fixtures from the scripted-bot runner)

### Community 32 - "Phase P6 Core Sliders"
Cohesion: 0.25
Nodes (7): Ask the human first (HUMAN STOP), Contract, Gate / exit (PHASES.md S1-P6.2 and Stage 1 criterion 9), Review focus, S1-12 — P6.2 Core sliders (HUMAN STOP on two items), Stop and ask, Test plan

### Community 33 - "Phase P6x Presets and Voice"
Cohesion: 0.25
Nodes (7): Ask the human first (HUMAN STOP), Contract, Gate / exit, Review focus, S1-13 — P6.1 / P6.3–P6.5 Presets and voice (OPTIONAL, may slip), Stop and ask, Test plan

### Community 34 - "Phase P1 Engine Core"
Cohesion: 0.29
Nodes (6): Contract the coder must implement, Gate / exit (PHASES.md S1-P1), Review focus, S1-02 — P1 Engine core (no LLM), Stop and ask, Test plan — offline, hand-written event lists (R-60)

### Community 35 - "Phase P2a Gateway & Classifier"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit, Review focus, S1-03 — P2a Gateway, classifier, prompt builder, generation, fallback store, Stop and ask, Test plan

### Community 36 - "Phase P2b Guardrails Pipeline"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit, Review focus, S1-04 — P2b Leak guard, canon guard, guarded turn pipeline, Stop and ask, Test plan

### Community 37 - "Phase P2c Text UI & Exit"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit (PHASES.md S1-P2), Review focus, S1-05 — P2c Text input UI, resilience, debug panel, P2 exit measurements, Stop and ask, Test plan

### Community 38 - "Phase P3a Threads & Checklist"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit, Review focus, S1-06 — P3a Scene threads, goal checklist, knowledge silos, Stop and ask, Test plan

### Community 39 - "Phase P3b Relay & Scenario Ending"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit (PHASES.md S1-P3), Review focus, S1-07 — P3b Relay detection, beats and callback, scenario ending, Stop and ask, Test plan

### Community 40 - "Phase P4b Judge & Coach"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit, Review focus, S1-09 — P4b Judge, quote validator, coach, Stop and ask, Test plan

### Community 41 - "Phase P4c Debrief Screen"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit (PHASES.md S1-P4), Review focus, S1-10 — P4c Debrief assembly, screen, and P4 exit, Stop and ask, Test plan

### Community 42 - "Phase P5 Retry & Progress"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit (PHASES.md S1-P5), Review focus, S1-11 — P5 Retry and basic progress, Stop and ask, Test plan

### Community 43 - "Phase P7 Hardening & Exit"
Cohesion: 0.29
Nodes (6): Contract, Gate / exit (Stage 1 demo-ready), Review focus, S1-14 — P7 Demo hardening and Stage 1 exit, Stop and ask, Test plan

### Community 44 - "Judge Prompt Specification"
Cohesion: 0.33
Nodes (5): Dimensions (0–5 each; 0 harmful/absent, 3 adequate, 5 exemplary), Evidence, Judge prompt v1 — post-session communication quality only, Output shape, Scope (hard boundary)

### Community 45 - "Secrets Scanner Tests"
Cohesion: 0.33
Nodes (4): PATTERNS, root, SKIP_DIRS, SKIP_FILES

### Community 46 - "Coach Prompt Specification"
Cohesion: 0.50
Nodes (3): Coach prompt v1 — flagged-moment feedback with a corrected reply, Output shape, Rules

### Community 47 - "Quickstart & Play Documentation"
Cohesion: 0.50
Nodes (3): Cubicle, Play, Run

### Community 48 - "Event Trigger Definitions"
Cohesion: 0.50
Nodes (4): triggers, items, minItems, type

### Community 50 - "Goal State Tracking"
Cohesion: 0.67
Nodes (3): items, type, goals

### Community 51 - "Public Context Definitions"
Cohesion: 0.67
Nodes (3): public_context, minLength, type

## Knowledge Gaps
- **432 isolated node(s):** `MAX_TURNS_DEFAULT`, `B2_BASE_TURN`, `B2_ASSERTIVE_TURN`, `ASSERTIVENESS_B2_CUTOFF`, `VAGUE_EVENTS` (+427 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **1 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `properties` connect `Array Validation Constraints` to `Scenario State & Canon Clock`, `Localization & Schema Constraints`, `Assistance & Agreement Logic`, `Goal State Tracking`, `Turn Advancement Configuration`, `Public & Private Knowledge Silos`, `Schema Constant Properties`, `Turn Limits & Constraints`, `Schema Tuple Rules`?**
  _High betweenness centrality (0.048) - this node is a cross-community bridge._
- **Why does `properties` connect `Scenario Type Schemas` to `Localization & Schema Constraints`, `Event Trigger Definitions`, `Goal State Tracking`, `Item List Schemas`, `Character Behavior Sliders`, `Public Context Definitions`, `Array Validation Constraints`, `Schema Constant Properties`, `Schema Tuple Rules`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `required` connect `Scenario Content Model` to `Goal State Tracking`, `Schema Tuple Rules`, `Array Validation Constraints`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **What connects `MAX_TURNS_DEFAULT`, `B2_BASE_TURN`, `B2_ASSERTIVE_TURN` to the rest of the system?**
  _432 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Conversation Engine & Turns` be split into smaller, more focused modules?**
  _Cohesion score 0.08418367346938775 - nodes in this community are weakly interconnected._
- **Should `Scenario State & Canon Clock` be split into smaller, more focused modules?**
  _Cohesion score 0.043478260869565216 - nodes in this community are weakly interconnected._
- **Should `Architecture & Design Decisions` be split into smaller, more focused modules?**
  _Cohesion score 0.044444444444444446 - nodes in this community are weakly interconnected._