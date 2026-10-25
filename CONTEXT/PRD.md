# PRD.md — Product Requirements: Cubicle (AI Job Simulator)

Version 0.1 · 2026-10-16 · Scope: **whole project** (stage tags show where each requirement lands: **S1** = demo, **S2** = total implementation; see `PHASES.md`).

## 1. Summary

Cubicle lets people practise real workplace conversations — owning a missed deadline, reporting a workplace concern, recovering from a missed call, negotiating with a client — by walking around a 3D office and talking to AI colleagues who react to what the user actually says. Colleagues hold **hidden facts** that surface only when the user asks good questions. Afterwards the user gets a **fair, evidence-backed debrief** that quotes their own words, shows what they missed, and lets them hear or redo a better version.

## 2. Problem

- Interviews and tests rarely show how someone handles real work: incidents, unclear requirements, awkward conversations.
- Students and first-time employees rarely get to practise these before the job.
- Existing practice is scripted or generic; feedback is vague and not tied to what the person said.
- Employers want realistic evaluation that is consistent and explainable.

## 3. Users

| User | Need | Stage |
|---|---|---|
| **Student / fresh graduate** (primary) | Safe place to practise, specific feedback, retry | S1 |
| **Career changer / early professional** | Practise specific situations (JD-based) | S2 |
| **Educator / placement cell** | Assign scenarios, see cohort progress | S2 |
| **Recruiter / employer** | Realistic, consistent evaluation | S2 (opt-in) |
| **Scenario author** (any user) | Create and share good scenarios | S2 |

Primary audience is an open decision (O-01); default is students.

## 4. Goals and non-goals

**Goals**
1. Conversations that are reactive and improvised, yet whose outcomes (reveals, goals, scores) are deterministic and explainable.
2. Hidden-fact discovery as the core skill: ask good questions, get information.
3. Debriefs where every point cites the user's own words.
4. Low latency by using models only where needed.
5. Practice that feels safe: supportive tone, retry without penalty.

**Non-goals**
- Not a general chatbot or an interview-answer coach.
- Not a hiring decision engine (no pass/fail on a person).
- No NPCs that lie or demean (v1).
- No real-time multiplayer.

## 5. Core user journey

1. Open Cubicle → choose a scenario (card shows briefing, difficulty, duration, objective).
2. Optionally set NPC behaviour (presets or sliders) → Start.
3. Walk to an NPC (WASD), press **E** to talk. Type a reply (later: speak).
4. Colleague reacts, may reveal information, may hold the user to what they said.
5. Visible checklist updates as goals complete; walk to the next NPC.
6. Scenario ends when required goals are done (or user ends it).
7. Debrief: score, evidence, what you missed, better replies, listen/redo.
8. Retry (same or new settings); compare attempts in **My progress**.

## 6. Scenario catalogue

| ID | Title | Cast | Status |
|---|---|---|---|
| SC-01 | **Missed a project deadline** — "The project was due yesterday. Your manager is waiting for an update." Objective: *Own the delay and agree on a realistic next step.* | Maya (manager), Jordan (teammate), Sam (People & culture) | Exists as baseline; full spec below (S1) |
| SC-02 | **Report repeated workplace mistreatment** — the employee reports dismissed concerns, exclusion from planning, and criticism; the package practises observable reporting, support options, and an HR response plan. | Snehal, Vansh, Prathamesh, Vedant (HR) | Authored; implementation pending under D-40 |
| SC-03 | **Missed an important call** | Maya, Jordan, Sam | Exists as baseline; content TBD (S2) |
| SC-04 | **The Two-Day Promise** — client Rohan Mehta (product owner) pushes a 2-day deadline; real leeway is 4 days; needs PDF *and* CSV; earlier vendor burned him | Rohan (external client) | Designed in the original PDF; needs a "client call" mode (S2) |
| SC-05+ | Production incident, code review, unclear client requirement, difficult teammate conversation, JD-generated scenarios | varies | S2 |


### SC-01 specification (**confirmed server-side fixture; not yet integrated into the UI**)

**Goals (visible, checklist)**

| ID | Goal | Done when | Requires |
|---|---|---|---|
| G1 | Talk to Maya and own the delay | `took_ownership` and `gave_honest_status` with Maya | — |
| G2 | Find out what is left with Jordan | `asked_requirement_details` (or equivalent) with Jordan | — |
| G3 | Agree and confirm a realistic next step with Maya | date mutually agreed **and** `recapped_agreement` | G1, G2 |

Goals are *conversation outcomes*; facts are *information*. They must not share the same trigger (R-22).

**Hidden facts**

| ID | Owner | Fact | Triggers (events) | Weight |
|---|---|---|---|---|
| F1 | Maya | The client's real hard cutoff is Friday, 3 days away; Maya has been holding them off. | `asked_deadline_flexibility`, `asked_why_urgent`, `asked_impact` | 8 |
| F2 | Jordan | Jordan already built a reusable module covering about half of the remaining work and can pair for an afternoon. | `asked_for_help` | 7 |
| F3 | Sam | Team norm: a same-day heads-up on a delay is expected and isn't counted against anyone's review. | `asked_advice`, `acknowledged_concern` (user expresses worry) | 5 |

**Clock and commitment model (confirmed relative-day fixture, D-27)**

- Fixed scenario clock: `{day: 0}`. Friday is a day-3 label only; no calendar date or timezone coupling. Conversation turns do not advance the clock.
- Public canon: the project was due yesterday, it is unfinished, Alex is responsible for the update, and Maya manages the project. Private canon: F1's day-3 cutoff belongs to Maya; F2's module/help belongs to Jordan; F3's team norm belongs to Sam. Prompts receive only the relevant public/known subset.
- Minimum delivery is day 3 unassisted, or day 2 after F2 has been delivered to the user **and** the user explicitly accepts Jordan's help with Jordan. A date before the applicable minimum or after the day-3 cutoff is unrealistic. Scope changes do not reduce these bounds without authored support.
- Classify whole-day dates relative to this fixed clock; ask for clarification on ambiguous/intraday dates. The engine evaluates realism using server-only bounds, not the model's assessment or whether F2 was merely discovered.
- `date_mutually_agreed` means the engine accepted the active realistic commitment with Maya. G3 additionally requires a recap of that same commitment ID after G1/G2; revising the date invalidates previous acceptance/recap. No repeated penalty for the same commitment. A guessed cutoff does not count as discovery.

**Beats**
- **B1** Maya opens: waiting for an update; mild pressure.
- **B2** If no date proposed by turn 4 (3 if Maya's assertiveness is high), Maya asks for a firm date.
- **B3** Callback: 3 user turns after a commitment, Maya checks in on the next Maya exchange. She challenges it if it is unrealistic under the commitment model; otherwise she acknowledges it. The engine supplies an allowed act without exposing sealed bounds. Discovering F2 alone does not make an unrealistic date acceptable; changes in resources/date are recorded before reevaluation, and a callback never adds a duplicate penalty.
- **B4** If the user relays Jordan's/Sam's information to Maya, Maya reacts to what the user *said*; inaccurate relays are noticed.

**Trap path:** commits quickly to "tomorrow" without asking → day-1 deadline is unrealistic, B3 challenge, flagged *premature commitment*, F1/F2 listed under "what you missed" only after ending.
**Smart path:** owns the delay and gives honest status with Maya (G1), asks about impact/flexibility (F1), asks Jordan what remains (G2) and separately asks for help (F2), accepts help, relays accurately, agrees day 2 or 3 with Maya and recaps (G3). Optional Sam conversation discovers F3. Distinct quality evidence and relationship-credit events support the ≥85 target; this remains an acceptance target to test, not an assured score.

## 7. Functional requirements

Priority: **P0** must, **P1** should, **P2** could. Stage: S1 / S2.

### 7.1 Conversation
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-01 | User sends free-text replies; NPC response reflects the conversation so far | P0 | S1 |
| FR-02 | NPC replies are 1–3 sentences, in character, no stage directions | P0 | S1 |
| FR-03 | NPC choose their move by rules (reveal, deflect, press for date, callback, close, redirect, walkout, react freely) | P0 | S1 |
| FR-04 | Stage 1: the LLM writes every dialogue act; the guarded baseline store is the failure fallback. Stage 2: store-first for predictable acts (D-23, D-10) | P0 | S1/S2 |
| FR-05 | Graceful handling of vague, off-topic, repeated, or "reveal everything" input | P0 | S1 |
| FR-06 | Typing indicator; retry on failure; session never crashes | P0 | S1 |
| FR-07 | Optional **Beginner assist** quick-reply chips (flagged in debrief) | P2 | S1/S2 |
| FR-08 | Streaming NPC text | P2 | S2 |

### 7.2 Hidden facts
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-10 | Each fact has an owner NPC, event triggers, weight, locale keywords, unlock question | P0 | S1 |
| FR-11 | Facts reveal only when a trigger event fires **and** the NPC's forthcomingness gate passes | P0 | S1 |
| FR-12 | Sealed facts never reach prompts or client (R-01–R-03) | P0 | S1 |
| FR-13 | Leak guard + regenerate-once + baseline fallback | P0 | S1 |
| FR-14 | NPC can hold the user to commitments ("you said 2 days") via a commitment ledger | P0 | S1 |
| FR-15 | Per-NPC knowledge silos; relay accuracy detected when the user tells one NPC what another said | P0 | S1 |

### 7.3 Goals and multi-NPC flow
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-20 | Visible goal checklist updates live | P0 | S1 |
| FR-21 | Goals support dependencies and ordering | P0 | S1 |
| FR-22 | Hidden goals contribute to scoring only | P1 | S2 |
| FR-23 | Scenario ends when required goals done / user ends / max turns / walkout | P0 | S1 |
| FR-24 | NPC may redirect: "talk to Jordan about the details" | P1 | S1 |
| FR-25 | "Next small step" guidance (existing UI) driven by goal state | P1 | S1 |

### 7.4 Scoring and debrief
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-30 | 100-point weighted score: Goals 30 · Hidden facts 20 · Integrity 15 · Relationship 10 · Rubric 25 (provisional, per-scenario config) | P0 | S1 |
| FR-31 | Deterministic and LLM points shown separately | P0 | S1 |
| FR-32 | LLM judge scores quality only across 5 dimensions (honest status, ownership, recovery planning, communication, collaboration under pushback), with verified quotes; no points for goal completion or fact discovery (R-22) | P0 | S1 |
| FR-33 | Debrief shows: score + band, breakdown, timeline with code-derived flags, top 2 improvement priorities, per-moment *your line → what happened → better reply*, **what you missed** with the unlocking question | P0 | S1 |
| FR-34 | At least one improved response in S1 debrief | P0 | S1 |
| FR-35 | Bands: 85+ Excellent · 70–84 Strong · 50–69 Developing · <50 Needs work (suggested) | P1 | S1 |
| FR-36 | Score multiplier from difficulty settings | P2 | S2 |
| FR-37 | Fairness evaluation across languages/voice | P0 | S2 |

### 7.5 Retry, replay, rewind
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-40 | Retry the scenario; previous debrief stays viewable | P0 | S1 |
| FR-41 | Retry with new customisation | P1 | S1 |
| FR-42 | *Redo from this moment*: branch from the stored snapshot, NPC stays adaptive | P1 | S2 |
| FR-43 | *Listen*: corrected line + NPC response performed by two voices with captions | P1 | S2 |
| FR-44 | Timeline navigation across turns | P1 | S2 |
| FR-45 | Compare two attempts side by side | P1 | S2 |

### 7.6 NPC customisation
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-50 | Presets: Supportive, Direct, Impatient | P1 | S1 (stretch) |
| FR-51 | Four sliders (assertiveness, patience, warmth, forthcomingness) change engine parameters **and** tone; fixed and recorded at session start | P0 | S1 |
| FR-52 | Preview line ("Maya: impatient and guarded"), derived difficulty label | P1 | S1/S2 |
| FR-53 | Applied settings recorded and shown in debrief (S1); a separate per-NPC settings editor across scenarios (S2) | P0 / P1 | S1 / S2 |

### 7.7 Voice
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-60 | Push-to-talk, editable transcript before send | P1 | S1 (stretch) |
| FR-61 | Spoken NPC replies (optional, mutable) | P1 | S1 (stretch) |
| FR-62 | Distinct NPC voices, language-matched | P1 | S2 |
| FR-63 | Streaming STT, barge-in, low-latency TTS | P2 | S2 |
| FR-64 | Audio not stored unless user opts in | P0 | S2 |

### 7.8 Languages
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-70 | Externalised UI strings and scenario text | P0 | S2 |
| FR-71 | English + Hindi conversation, classification, leak guard, debrief | P0 | S2 |
| FR-72 | Hinglish (code-mixed) input handled in text; voice later | P1 | S2 |
| FR-73 | Per-language eval sets and quality gate | P0 | S2 |

### 7.9 3D movable space
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-80 | Isometric office, WASD/arrows to move, **E** to talk, ESC to close, office map, name tags with roles | P0 | S1 (exists) |
| FR-81 | Walking up to an NPC opens their conversation; conversation panel overlays the scene | P0 | S1 |
| FR-82 | Mute and fullscreen controls (exist) | P1 | S1 |
| FR-83 | NPC idle/walk behaviours, additional rooms/floors, ambient presence | P2 | S2 |
| FR-84 | Scene layout driven by the scenario spec | P1 | S2 |
| FR-85 | Basic text-only fallback path (S1, R-41); full dedicated text-only experience (S2) | P0 / P1 | S1 / S2 |
| FR-86 | Interactive objects (screens, emails) — open decision O-05 | P2 | S2 |

### 7.10 Scenario creation and sharing
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-90 | Create a scenario from user input / job description → validated JSON spec | P1 | S2 |
| FR-91 | Semantic validation + scripted-bot playtest before play | P0 | S2 |
| FR-92 | Author review/edit UI for generated specs | P1 | S2 |
| FR-93 | Publish to a shared library: promotion requires validation, review, and quality signals (plays, ratings) | P1 | S2 |
| FR-94 | Fork, version, and attribute scenarios | P2 | S2 |
| FR-95 | Moderation and report flow | P0 | S2 |

### 7.11 Progress and organisations
| ID | Requirement | Pri | Stage |
|---|---|---|---|
| FR-100 | **My progress**: attempts per scenario, per-metric and per-dimension trends | P1 | S1 (basic) / S2 |
| FR-101 | Accounts and sign-in | P0 | S2 |
| FR-102 | Educator/employer dashboards (opt-in, aggregated by default) | P1 | S2 |
| FR-103 | Assign scenarios to cohorts | P2 | S2 |
| FR-104 | Export results | P2 | S2 |

## 8. Debrief content (detail)

1. **Header**: total /100, band, difficulty played ("You played against: low patience, guarded").
2. **Breakdown**: five metrics, deterministic vs judged split visible.
3. **Timeline**: turns with code-derived flags — premature commitment, missed probe, constructive pushback, broken promise, great recap.
4. **Top 2 priorities**: the two moments with the largest point loss.
5. **Moments**: your original line → what happened → why it matters → better reply (using only what you knew then).
6. **What you missed**: undiscovered facts disclosed only in the ended-session debrief, with unlocking questions; this grants no discovery points and does not alter the original snapshots.
7. **Actions**: Try again · Try again with new settings · (S2) Redo from this moment · Listen.

Tone: name what went well first; describe moments, not the person (R-44).

## 9. Non-functional requirements

| Area | Requirement |
|---|---|
| Latency | S1: full guarded text turn p50 < 3.5 s, p95 < 5 s (D-23), including retry/fallback turns. S2: fixed-line p50 < 0.5 s; improvised p50 < 2 s, p95 < 3 s; voice to first audio < 2.5 s. Targets require measurement; none verified yet. |
| Reliability | LLM failure degrades to baseline reply + retry; no session loss |
| Reproducibility | Same events + sliders + seed → same engine outcome |
| Cost | Per-session LLM cost tracked; reply-store hit rate tracked |
| Accessibility | Keyboard-only play, captions for any audio, readable contrast, reduced-motion option |
| Security/privacy | See `RULES.md` §F |
| Fairness | Scoring ignores length/accent/grammar; cross-language evaluation |
| Observability | Per-turn trace (events, act, source, leak result, latency) |
| Platform | Desktop web first; mobile layout S2 |

## 10. Success metrics

- **Hidden-fact integrity**: 0 leaks across ≥5 untriggered runs per scenario.
- **Reveal reliability**: ≥95% of reasonable paraphrases of a trigger question reveal the fact (measured on labelled set).
- **Evidence integrity**: 100% of displayed judge quotes verified.
- **Latency**: p95 turn within budget.
- **Reply-store hit rate** on predictable acts ≥70% (S2 target).
- **Usefulness**: users retry; second-attempt scores improve on average; qualitative "feedback helped" rating.
- **Judge consistency**: score variance across repeated judging of the same session within ±1 point per dimension.

## 11. Risks

| Risk | Mitigation |
|---|---|
| NPC leaks hidden fact | Sealed prompts, leak guard, injection tests |
| Classifier misses a trigger | Generous triggers, debug panel, labelled eval, S2 trained classifier |
| Judge variance | Temp 0, anchored rubric, separate deterministic metrics |
| Slow turns | Fast classifier tier, store replies, short outputs, streaming |
| Scoring perceived as unfair | Evidence quotes, transparent weights, fairness rules |
| Scope creep | Phase gates in `PHASES.md` |
| Generated scenarios low quality or unsafe | Schema + semantic validation, bot playtests, review |
| Multilingual leak/quote checks weaker | Semantic checks, normalisation, per-language evals |

## 12. Out of scope (whole product, for now)

Real-time multiplayer; NPCs that lie; automated hiring decisions; video avatars with lip-sync; native mobile apps.

## 13. Open questions

See `DECISIONS.md` O-01 to O-09.
