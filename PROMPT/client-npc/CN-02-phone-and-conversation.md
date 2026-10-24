# CN-02 — Phone and conversation

**Head document:** `CONTEXT/AGENT.md` — master: [Client NPC and Deadline Story Implementation Plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md)

## Entry Goal

Expose the ordinary remote actor through the work-island phone affordance safely.

## Read first

CN-01, D-38, [master plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md), and current office/voice lifecycle code and tests.

## Assignments

**Coder:**

Add only the visible entry mechanism for the already-normal remote NPC: a phone/context affordance at the existing shared work island, reachable by nearby E/context button, and the existing People/text-only entry. The scene object targets the ordinary bound `client` NPC id. Do not add a room, desk, avatar, physical proximity server rule, phone session, WebRTC, telephony, or separate conversation pipeline.

Use existing typed input, voice record confirmation, committed playback/captions/replay, per-NPC thread and ordinary guarded turn path. Hangup closes the panel and cancels capture/playback while preserving the thread. Restart, End and scenario change invalidate every late create/turn/audio/UI effect. A hidden scene must not leave an interactive affordance. Keyboard access and People/text-only access remain available.

**Reviewer:** Sol checks lifecycle/stale-state safety and R-41/R-42/R-50–54.

**Tester:** run affected UI/lifecycle tests after review; record browser/device checks as NOT RUN unless actually authorised and performed.

**Root:** verifies the reviewed/tested manifest before acceptance.

## Tests

Update `llm/tests/officeMovement.test.js`, `voice/tests/client.test.js`, `voice/tests/playback.test.js`, `voice/tests/speechWiring.test.js`, `services/api/tests/threads.test.js`, and `services/api/tests/voice.test.js`; add `llm/tests/clientRemotePhone.test.js`. The browser-integration test uses a loopback injected-registry fixture server and the same public JSON as the application, never a private frontend import or a public-default-story enablement/dev-mode API. Cover E/context and People paths, no physical server-proximity requirement, hangup cancellation/persistent thread, stale audio/UI after hangup/restart/end/scenario switch, and no hidden-scene interaction. Run only affected offline tests; no browser/device/live-provider claim.

## Review

Sol reviews lifecycle/stale-state safety and R-41/R-42/R-50–54 boundaries. Luna then runs the prescribed affected suite.

## Stop and ask

Stop for root if current cancellation primitives cannot safely invalidate remote-target playback/capture without redesigning shared voice/session state.

## Exit

Return touched paths, test evidence, known browser/device gaps and the handoff. Runtime activation of the new deadline story remains DS-04 work.
