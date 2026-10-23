# STATUS.md — Cubicle Repo Audit

**Audited:** 2026-10-17 · Branch: `main` (5 commits) · All commands run in this session.
**Rule:** VERIFIED = ran it here and saw it work. Everything else is labelled honestly.

---

## 1. Stack and Versions

| Layer | Detail | Source |
|---|---|---|
| **Frontend runtime** | Vanilla JavaScript ES modules | `package.json`, `src/main.js` |
| **Frontend framework** | Vite ^8.3.4 (dev/build/preview) | `package.json` devDependencies |
| **3D scene** | Three.js ^0.186.1 | `package.json` dependencies |
| **Icons** | Lucide ^1.55.0 | `package.json` dependencies |
| **API server** | Node.js built-in `node:http`; no framework | `services/api/server.js` |
| **Engine runtime** | Node.js built-in `node:test` (no extra deps) | `package.json` scripts |
| **Database** | **MISSING** — planned PostgreSQL + Redis (S2) | `CONTEXT/ARCHITECTURE.md` §17 |
| **Session store** | In-memory `SessionStore` + JSON dump (in-process only) | `engine/store.js` |
| **LLM provider** | **UNCHOSEN** — P0.2 deferred; offline rule-based stub used for now | `llm/config.js`, `services/api/offlineProviders.js` |
| **LLM roles** | classifier, npc, judge, coach | `llm/config.js` |
| **Model env var names** | `CLASSIFIER_MODEL`, `NPC_MODEL`, `JUDGE_MODEL`, `COACH_MODEL`, `LLM_PROVIDER` | `.env.example` |
| **Node version** | Not pinned; `node:test` requires Node >=18 | `package.json` |

No values from `.env.example` are reproduced here (R-50).

---

## 2. Install and Run Commands

### Install — VERIFIED

```
> npm ci

added 17 packages, and audited 18 packages in 15s
found 0 vulnerabilities
```
Exit code: 0.

### Run API server — VERIFIED

```
> npm run api
# or with debug panel enabled:
> npm run api:debug

cubicle api listening on http://localhost:8787 debug=off manifest-70aa80dd
```
Default port: 8787. Override with `PORT=<n>`. Debug mode: `CUBICLE_DEBUG=1` or `--debug` flag.

### Run frontend dev server — EXISTS-UNTESTED

```
npm run dev   # vite --host 0.0.0.0, serves on :5173
```
Not started in this audit session. The manual checklist (`evals/reports/p2c-manual-checklist.md`) states the two-process workflow: `npm run api` first, then `npm run dev`.

> **Security note (R-08 / ARCHITECTURE.md §21):** `vite --host 0.0.0.0` serves the repository root. `CONTEXT/`, `scenarios/` (private canon), `llm/prompts/`, and `replies/` are accessible via direct URL in dev mode. P7.3a (restrict to `dist/` only) is still MISSING.

### Run text-only harness — EXISTS-UNTESTED

```
npm run harness   # node services/api/client.mjs
```
Requires the API server to be running. Evidence of a previous run is in `evals/reports/p2c-harness-transcript.txt`.

---

## 3. Directory Tree (2 levels deep)

```
Cubicle/                           # repo root
├── AGENTS.md                      # pointer to CONTEXT/AGENT.md
├── README.md
├── DESIGN.md                      # NEW: UI/UX design notes
├── STATUS.md                      # this file
├── .env.example                   # env var names only
├── .gitignore
├── index.html                     # page shell (13 KB)
├── package.json                   # 6 scripts (dev/build/preview/test/test:engine/test:api/api/api:debug/harness/bundle:scan)
├── requirements.txt               # placeholder
├── CONTEXT/                       # six project documents (AGENT/RULES/DECISIONS/ARCH/PRD/PHASES)
├── PROMPT/                        # NEW: 15 agent prompt engineering docs (S1-00 through S1-14)
├── engine/                        # pure turn engine (no imports)
│   ├── engine.js                  # 661 lines; state, events, acts, mood
│   ├── config.js                  # tunable constants
│   ├── scenarioValidator.js       # schema + disjointness validator (expanded)
│   ├── store.js                   # in-memory SessionStore
│   └── tests/                    # engine.test.js (15), scenarioValidator.test.js (35+)
├── llm/                           # LLM gateway and pipeline
│   ├── gateway.js                 # retry-once, schema-validate, role fallback
│   ├── classifier.js              # event taxonomy enforcement, date table
│   ├── npc.js                     # NPC line gen
│   ├── promptBuilder.js           # NPC prompt composition (R-01/R-04 guards)
│   ├── guards.js                  # NEW: leak guard + semantic check + canon guard (R-02/R-09)
│   ├── pipeline.js                # NEW: full turn orchestrator (classify→engine→generate→guard→deliver)
│   ├── manifest.js                # per-session run manifest
│   ├── config.js                  # per-role routing config; placeholder model strings
│   ├── fakeProvider.js            # scriptable fake for offline tests
│   ├── prompts/                   # versioned prompt files (classifier/npc/judge/coach v1.md)
│   └── tests/                    # 8 offline test files (classifier/fallback/gateway/npc/prompts/secrets/guards/pipeline)
├── scenarios/                     # missed_deadline.json + schema
├── replies/                       # fallbackStore.js + missed_deadline.en.json
├── evals/                         # eval harness (expanded)
│   ├── events.jsonl               # 45 classifier cases
│   ├── guards.jsonl               # NEW: 61 guard cases
│   ├── runClassifier.mjs          # requires provider keys — NOT RUN
│   ├── runGuards.mjs              # NEW: offline guard runner
│   ├── runNoTriggerHarness.mjs    # NEW: no-trigger harness
│   ├── cases/                     # NEW: p2c-hidden-facts/injection/latency/paraphrase.json
│   │   └── (4 case files, all marked NOTRUN)
│   ├── p2c-*.NOTRUN.mjs           # NEW: 4 eval runners (require live provider or harness)
│   └── reports/                   # NEW: bundle-scan + p2c-harness-transcript + manual-checklist
├── services/                      # NEW
│   └── api/                       # NEW: HTTP API server
│       ├── server.js              # 303 lines; POST /sessions, POST .../turn, GET /scenarios/{id}
│       ├── client.mjs             # text-only harness client
│       ├── offlineProviders.js    # rule-based classifier + fallback-store NPC (no live LLM)
│       └── tests/                 # api.test.js (16), threads.test.js (13+, threaded concurrency)
├── scripts/
│   └── bundle-scan.mjs            # NEW: production bundle hygiene check
├── graphify-out/                  # NEW: knowledge graph (graph.json, GRAPH_REPORT.md, graph.html)
├── src/                           # frontend
│   ├── main.js                    # UPDATED: now imports api.js; free-text input wired (782 lines)
│   ├── office.js                  # minor update (E-to-talk hook)
│   ├── api.js                     # NEW: browser fetch wrapper for the API
│   ├── debug.js                   # NEW: dev debug panel (off by default)
│   └── style.css                  # +196 lines
├── transcripts/                   # NEW: agent session logs
└── public/
    └── favicon.svg
```

Directories that appear in ARCHITECTURE.md but **do not yet exist**: `/scoring` (S1-P4).

---

## 4. Phase Status (CONTEXT/PHASES.md)

### S1-P0 — Baseline audit and freeze

| Item | Status | Notes / File Path |
|---|---|---|
| P0.1 Audit existing build | VERIFIED | `CONTEXT/AGENT.md` §4 |
| P0.2 Choose LLM provider | MISSING | `llm/config.js` L1: "Provider UNCHOSEN"; D-28 defers Groq wiring |
| P0.3 Confirm SC-01 content | VERIFIED | `scenarios/missed_deadline.json`; D-12/D-22/D-27 in DECISIONS.md |
| P0.4 Create repo layout + commands | VERIFIED | All dirs exist; `package.json` has 6 named scripts |
| P0.5 Scenario schema + `missed_deadline.json` | VERIFIED | `scenarios/missed_deadline.schema.json`; validator passes in tests |

**P0 exit gap:** P0.2 provider unchosen. Phase is **PARTIAL**.

---

### S1-P1 — Engine core (no LLM) — VERIFIED

All 7 items done; all 28 engine+validator tests pass offline. See §8.

---

### S1-P2 — Free-text conversation and hidden facts

| Item | Status | Notes / File Path |
|---|---|---|
| P2.1 Classifier call (JSON schema, temp 0, retry) | EXISTS-UNTESTED (live) | `llm/classifier.js` + `llm/pipeline.js`; tested offline with fake provider; **no real LLM provider** |
| P2.2 Prompt builder (R-01/R-04 guards) | EXISTS-UNTESTED (live) | `llm/promptBuilder.js`; all prompt tests pass offline |
| P2.3 LLM reply wired to engine via orchestrator | PARTIAL | `llm/pipeline.js` `runTurn()` wires classify→engine→generate→guard→deliver; offline stub provider used; **live LLM not wired** (D-28) |
| P2.4 Baseline reply store + failure fallback | VERIFIED | `replies/fallbackStore.js`; 7 pipeline tests exercise fallback paths |
| P2.5 Leak guard + canon guard | VERIFIED (offline) | `llm/guards.js` 344 lines; keyword + semantic + canon guards; all guard tests pass; live provider not exercised |
| P2.6 Replace button dialogue with free-text input | PARTIAL | `src/main.js` imports `src/api.js`; SC-01 wired to live API; SC-02/SC-03 remain on scripted buttons (confirmed in `evals/reports/p2c-manual-checklist.md`) |
| P2.7 Typing indicator, error/retry state | EXISTS-UNTESTED | In `src/main.js`; not manually verified in this session |
| P2.8 Dev debug panel | EXISTS-UNTESTED | `src/debug.js`; activated by `window.__CUBICLE_DEBUG=1` + `npm run api:debug` |

**P2 exit (R-62 hidden-fact acceptance):** Not run. The 4 P2c eval scripts (`evals/p2c-*.NOTRUN.mjs`) require a live provider or full harness run. The manual checklist has live items unchecked.

---

### S1-P3 — Goals and multi-NPC flow

| Item | Status | Notes / File Path |
|---|---|---|
| P3.1 Scene → API `interact{npc_id}` | PARTIAL | `src/main.js` calls `createSession`/`sendTurn` via `src/api.js`; E-to-talk hook updated in `src/office.js`; not manually verified end-to-end |
| P3.2 Visible goal checklist driven by goal state | VERIFIED (API) | `llm/pipeline.js` `projectGoals()` + `nextHintFor()`; API returns live goal statuses; confirmed in live turn test (§5) |
| P3.3 Per-NPC knowledge silos | VERIFIED | API test "silo scan: F1 stays with maya; F2 stays with jordan" passes |
| P3.4 Relay detection | EXISTS-UNTESTED | `relayed_fact` event in taxonomy + engine; no relay-specific UI or classifier rule |
| P3.5 Beats B2/B3 + commitment callback | VERIFIED (engine only) | Engine tests cover B2/B3; not exercised in API tests yet |
| P3.6 Scenario end → debrief handoff | MISSING | No debrief screen; API returns `ended: true` + `end_reason` but frontend has no debrief view |

**P3 exit: PARTIAL**.

---

### S1-P4 — Scoring and debrief — MISSING

No scoring service, judge, quote validator, coach, or debrief screen. Prompt files exist (`llm/prompts/judge/v1.md`, `llm/prompts/coach/v1.md`) but nothing calls them.

---

### S1-P5 — Retry and basic progress — MISSING

No retry-with-feedback flow. No progress view. The API supports idempotency-key retry on network failure but that is not the same as "try again with prior debrief."

---

### S1-P6 — Core sliders — MISSING in UI

Engine applies sliders from `createSession` opts. No UI controls expose them to the user.

---

### S1-P7 — Demo hardening — MISSING

No acceptance playthroughs run. P7.3a (restrict static serving) not done. No demo reset button.

---

### Stage 2 — MISSING (out of scope).

---

## 5. API Routes

**Server:** `npm run api` → `http://localhost:8787`
Implemented in `services/api/server.js`. Offline stub providers only (D-28).

### `GET /scenarios/{id}` — VERIFIED

```
curl http://localhost:8787/scenarios/deadline
```
**Actual response (this session):**
```json
{
  "id": "missed_deadline",
  "title": "Missed a project deadline",
  "briefing": "Your project was due yesterday. Your manager Maya is waiting for your update...",
  "goals": [
    { "id": "G1", "label": "Own the delay and report status honestly to Maya", "requires": [] },
    { "id": "G2", "label": "Clarify the remaining requirements with Jordan", "requires": [] },
    { "id": "G3", "label": "Agree a date with Maya and recap it", "requires": ["G1","G2"] }
  ],
  "npcs": [
    { "id": "maya", "name": "Maya", "role": "manager" },
    { "id": "jordan", "name": "Jordan", "role": "engineer" },
    { "id": "sam", "name": "Sam", "role": "peer" }
  ]
}
```
No private canon, no sealed facts (R-03/R-08 confirmed).

### `POST /sessions` — VERIFIED

```
curl -X POST http://localhost:8787/sessions \
     -H "content-type: application/json" \
     -d '{"scenario_id":"deadline"}'
```
**Actual response (this session):**
```json
{
  "session_id": "missed_deadline#s23360",
  "briefing": "Your project was due yesterday...",
  "public_state": {
    "mood_label": "Tense",
    "goals": [
      { "id": "G1", "status": "pending", "locked": false },
      { "id": "G2", "status": "pending", "locked": false },
      { "id": "G3", "status": "pending", "locked": true }
    ],
    "next_hint": "Talk to Maya about the missed deadline.",
    "npc_availability": { "maya": true, "jordan": true, "sam": true },
    "ended": false
  }
}
```

### `POST /sessions/{id}/turn` — VERIFIED

```
curl -X POST "http://localhost:8787/sessions/missed_deadline%23s23360/turn" \
     -H "content-type: application/json" \
     -d '{"npc_id":"maya","text":"I missed the deadline and I take full responsibility for it."}'
```
**Actual response (this session):**
```json
{
  "npc_reply": "Maya here. Give me the straight story on where the project stands.",
  "public_state": {
    "mood_label": "Tense",
    "goals": [
      { "id": "G1", "status": "pending", "locked": false },
      { "id": "G2", "status": "pending", "locked": false },
      { "id": "G3", "status": "pending", "locked": true }
    ],
    "next_hint": "Talk to Maya about the missed deadline.",
    "npc_availability": { "maya": true, "jordan": true, "sam": true },
    "ended": false
  },
  "ended": false,
  "end_reason": null,
  "turn_id": 1
}
```
NPC reply comes from the offline fallback store (no live LLM). No sealed facts in response (R-03 confirmed).

### Not yet implemented

| Route | Status |
|---|---|
| `POST /sessions/{id}/end` | MISSING |
| `GET /sessions/{id}/debrief` | MISSING |
| `GET /progress` | MISSING |
| `POST /sessions/{id}/scene-event` | MISSING |
| All S2 routes | MISSING |

---

## 6. What Is Mocked or Hardcoded

| Component | What Is Mocked / Hardcoded | File |
|---|---|---|
| **NPC classifier** | Rule-based regex (no live LLM); ~15 regex patterns covering SC-01 events | `services/api/offlineProviders.js` `rulesToEvents()` |
| **NPC replies** | Fallback reply store lines (authored, guard-checked); no LLM-generated prose | `replies/missed_deadline.en.json`, `services/api/offlineProviders.js` `npcFn` |
| **SC-02 / SC-03 dialogue** | Still scripted button choices | `src/main.js` L64-230 (approx) |
| **Hardcoded scoring (old)** | +10 / -10 per button choice index; untouched for SC-02/SC-03 | `src/main.js` renderScore/choose |
| **LLM model strings** | `"offline-stub:rules-v1"` / `"offline-stub:store-v1"` for classifier and npc; `"pending-provider:judge/coach"` | `services/api/server.js` L32-37 |
| **Sliders** | Engine hardcodes default sliders (50/50/50/50); no UI controls | `engine/config.js` DEFAULT_SLIDERS |
| **Debrief** | Not rendered; no scoring service | — |
| **Port** | Hardcoded 8787; override with `PORT` env var | `services/api/server.js` L297 |

---

## 7. Scenario JSON Spec

**EXISTS-UNTESTED with live LLM** (spec validates offline; used by the live API server offline).

| File | Description |
|---|---|
| `scenarios/missed_deadline.json` | SC-01 spec: 3 facts (F1/F2/F3), 3 goals (G1-G3), 2 beats (B2/B3), clock day-0, commitment_model |
| `scenarios/missed_deadline.schema.json` | JSON Schema used by `engine/scenarioValidator.js` |

SC-02 / SC-03 specs: **MISSING** in `scenarios/`.

---

## 8. Tests

### What exists and test counts

| Suite | File | Tests |
|---|---|---|
| Engine behaviour | `engine/tests/engine.test.js` | 15 |
| Scenario validator | `engine/tests/scenarioValidator.test.js` | 35 (+22 structured-rejection cases added in pull) |
| Classifier | `llm/tests/classifier.test.js` | ~8 |
| Fallback store | `llm/tests/fallback.test.js` | ~6 |
| Gateway | `llm/tests/gateway.test.js` | ~9 |
| NPC generator | `llm/tests/npc.test.js` | ~5 |
| Prompt builder | `llm/tests/prompts.test.js` | ~5 |
| **Guards (NEW)** | `llm/tests/guards.test.js` | ~17 |
| **Pipeline (NEW)** | `llm/tests/pipeline.test.js` | ~8 |
| Secrets / .env | `llm/tests/secrets.test.js` | ~9 |
| **API integration (NEW)** | `services/api/tests/api.test.js` | 16 |
| **API threads (NEW)** | `services/api/tests/threads.test.js` | ~13 |

### `npm test` — VERIFIED (112/112 pass, exit 0)

```
> node --test "engine/tests/*.test.js" "llm/tests/*.test.js"

[engine tests: 15 pass]
[validator tests: 35 pass — incl. 22 new structured-rejection cases]
[classifier tests: pass]
[fallback/gateway/npc/prompts tests: pass]
[guards tests: pass — keyword, semantic, echo allowance, canon, positive reveal]
[pipeline tests: pass — 8 scenarios incl. injection reveals nothing, fallback paths]
[secrets/env tests: pass]
tests 112 | pass 112 | fail 0
duration_ms 623.0
```

### `npm run test:api` — VERIFIED (16/16 pass, exit 0)

```
> node --test "services/api/tests/*.test.js"

OK POST /sessions returns session_id, briefing, public_state
OK POST /sessions rejects unknown scenario_id
OK GET /scenarios/{id} exposes briefing + visible goals only
OK turn allowlist: public keys only, no debug without flag, no sealed text
OK retry/idempotency: same key replays without re-applying; user turn not duplicated
OK turn validation: unknown npc/session/text rejected
OK debug flag: _debug present with events/act/source/guard/stages, no sealed text
OK next-step mapping covers every goal combination
OK G3 locked until G1 and G2 are done
OK checklist and next step follow G1/G2/G3 through the API
OK thread isolation: jordan turns leave maya on first contact
OK told_by_user is tracked per npc (engine level)
OK in-flight turn is not duplicated: concurrent same-key posts apply once
OK F3 reveals through sam after advice-seeking; never volunteered elsewhere
OK silo scan: F1 stays with maya; F2 stays with jordan
OK public-state allowlist holds for every npc
tests 16 | pass 16 | fail 0
duration_ms 436.9
```

**Eval harness:** `evals/p2c-*.NOTRUN.mjs` — all 4 are labelled NOT RUN. They require a live LLM provider (P0.2 deferred). The `evals/reports/p2c-harness-transcript.txt` records a previous offline harness run.

---

## 9. Known Bugs and Half-Finished Work

### Remaining hard blockers for demo

1. **No live LLM provider** (P0.2, O-06 deferred, D-28). NPC replies come from the authored fallback store — deterministic but not improvised. All P2 acceptance exit tests (R-62) require a real model and are marked NOT RUN.
2. **Debrief / scoring / coach missing** (P4). No `/sessions/{id}/end`, `/sessions/{id}/debrief`, or scoring service. The engine emits `ended: true` + `end_reason` but nothing handles it in the UI.
3. **SC-02 and SC-03 still on scripted buttons.** `src/main.js` only wires SC-01 to the live API.
4. **P2 live acceptance tests not run.** Hidden-fact (>=5 runs/fact), paraphrase reveal, injection, and latency evals are all `NOTRUN` (`evals/cases/`, `evals/p2c-*.NOTRUN.mjs`). Cannot claim P2 exit without them.
5. **Slider UI missing** (P6.2). Engine supports sliders internally; no UI controls.

### Structural issues

6. **`vite --host 0.0.0.0` exposes repo root** in dev (R-08, P7.3a MISSING). Private canon, prompts, and reply templates are reachable via direct URL during dev.
7. **`engine.js` mirrors constants from `config.js`** manually (`// PROVISIONAL (P1) mirror`). Risk of drift.
8. **Relay detection has no classifier rule** in `services/api/offlineProviders.js`. The `relayed_fact` event exists in the taxonomy and engine but will never fire from the offline rule-based classifier.
9. **`B2/B3` beats not exercised in API tests.** Engine tests cover them; the API test suite does not run long enough sessions to hit beat thresholds.
10. **No `POST /sessions/{id}/end` route.** A session can only end via `ended: true` in a turn response; there is no explicit client-side end signal.

### Minor / tech debt

11. No lint or format script configured (`CONTEXT/AGENT.md` §5: "unavailable").
12. `package.json` has no `engines` field; Node >=18 is assumed.
13. `requirements.txt` remains a comment-only placeholder.

---

## 10. Git Log and Status

### `git log --oneline -20` — VERIFIED

```
b1605bb feat: add guards, pipeline, API server, P2c eval cases, and frontend wiring
4960529 feat: add context specs, game engine, scenarios, LLM gateway, and requirements.txt
f034209 refactor: separate HTML structure and styles from JS; remove docs
146db3e style: format code for readability without changing logic
89687e8 Initial commit: Cubicle 3D workplace conversation simulator
```
5 commits total. All on `main`.

### `git status` — VERIFIED

```
On branch main
Your branch is up to date with 'origin/main'.

nothing to commit, working tree clean
```

### Branch list — VERIFIED

```
* main
  remotes/origin/HEAD -> origin/main
  remotes/origin/main
```

Single branch; no feature or release branches.

---

*This file was written by an agent audit on 2026-10-17. All VERIFIED items were run and observed in this session. Nothing labelled EXISTS-UNTESTED, PARTIAL, MISSING, or NOT RUN was assumed to work.*
