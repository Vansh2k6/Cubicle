# Cast setup implementation plan

**Goal:** Let a new session carry an optional, validated four-slider override for each registered NPC while retaining the shared-slider contract and fixed-session lifecycle.

**Architecture:** `shared/settings.js` validates a detached, partial actor map against the captured package's NPC identifiers. `POST /sessions` resolves any ended retry package first, then passes only that validated map to the existing engine customisation option. The response returns the effective registered-cast settings under `npc_settings`; settings are rejected on later turns.

**Constraints:** D-39 deliberately supersedes D-29 only for per-NPC overrides and presets-before-office UI. Existing shared sliders, difficulty calculation, scoring, rules, live-provider behaviour and 3D avatars remain unchanged. No dependency or network call is added.

### Task 1: Contract and package-bound validation

**Files:** `shared/settings.js`, `llm/tests/settings.test.js`

- [x] Add `validateNpcSliders(value, npcIds)` returning `{ ok, value }`.
- [x] Treat omitted `npc_sliders` as `{}`; accept only own, plain actor-map properties for registered IDs and partial own four-slider maps with integer `0..100` values.
- [x] Return a detached map and reject arrays, null, inherited/prototype keys, unknown actor/trait keys and non-integers without default-filling partial actor overrides.
- [x] Verify shared-slider behaviour remains unchanged and validator copies cannot mutate its result.

### Task 2: Session creation and immutable response lifecycle

**Files:** `services/api/server.js`, `services/api/tests/settings.test.js`, `CONTEXT/DECISIONS.md`, `CONTEXT/ARCHITECTURE.md`

- [x] Resolve `previous_session_id` before deriving the permitted NPC IDs from `pkg.spec.npcs`.
- [x] Validate `npc_sliders`, pass it as the existing engine `customisation` option, and return the exact cloned effective registered-cast map as `npc_settings` while preserving the existing `settings` and difficulty fields.
- [x] Reject `npc_sliders` on `POST /sessions/{id}/turn`, alongside existing fixed-setting keys.
- [x] Record D-39 and its narrow D-29 supersession; document the request/response and inheritance lifecycle without changing scoring, rules, live operation or 3D avatars.

### Task 3: Cast-setup UI and bounded lifecycle

**Files:** `src/main.js`, `src/castSetup.js`, `src/api.js`, `src/style.css`, `index.html`, `DESIGN.md`, cast-setup visual assets as needed (frontend owner)

- [ ] Replace the first-conversation popup with a session-start setup surface that keeps shared sliders/presets and adds cast-specific partial overrides before office entry.
- [ ] Use public scenario cast metadata and `previous_session_id` retry metadata; keep historical/captured cast settings available for retry and debrief display.
- [ ] Send `npc_sliders` only at session creation, show returned effective `npc_settings`, and keep fixed scripted email/call scenarios outside this API setup path.
- [ ] Preserve the existing physical-avatar scene; use UI portraits only and do not introduce 3D NPC/avatar changes.

### Task 4: Focused offline proof and handoff

**Files:** `services/api/tests/settings.test.js`, `llm/tests/settings.test.js`

- [x] Prove independent actor overrides affect the actual engine customisation and initial mood, while a missing actor inherits the shared baseline.
- [x] Cover omitted-map compatibility, retry-package actor validation, invalid maps (actor, trait, values, arrays/null and prototype keys), post-start rejection, and a debrief score record retaining effective per-NPC settings.
- [x] Run only affected offline unit/API tests with provider credentials removed from the child environment; record commands and source hashes for reviewer/tester handoff.
- [ ] Reviewer checks the exact candidate against D-39, R-01/R-03/R-32/R-60/R-64 and the no-scoring/no-live/no-avatar bounds; tester then runs the approved affected suite and authored UI build/scan checks.
