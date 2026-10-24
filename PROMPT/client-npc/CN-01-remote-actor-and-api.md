# CN-01 — Remote actor and API

**Head document:** `CONTEXT/AGENT.md` — master: [Client NPC and Deadline Story Implementation Plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md)

## Entry Goal

Make one registered remote actor available through the existing package/API pipeline.

## Read first

CP-00, D-38, the [master plan](../../plans/CLIENT_AND_DEADLINE_IMPLEMENTATION.md), and affected package/public/API tests.

## Assignments

**Coder:**

Implement the CP-00 contract in the shared package path. A remote contact is a normal registered scenario NPC: `id: "client"`, Rohan Mehta, Client Operations Lead, with regular engine NPC state/mood/facts/events, provider handling and per-NPC thread. Its only distinction is `contactMode: "phone"` in presentation metadata; it has no scene anchor/avatar. Extend public projection and strict validation so legacy physical actors retain `{sceneAnchor,voiceId}` exactly and a package can have at most three distinct physical anchors plus one remote phone binding. The registered remote binding uses `en_GB-alan-medium`; unknown mode/voice, duplicate remote or arbitrary remote override fails. Preserve legacy four-key VOICE_MAP overrides without forcing caller changes; only registered remote binding may reuse its known voice.

Before session creation, the existing public scenario projection may supply remote metadata but creates no LLM/microphone call, session or frontend private-fixture import. Phone target resolution accepts only the bound public scenario actor id, then invokes the normal turn/thread pipeline. Audit both current three-actor speech eligibility in `voice/speech.js` and the four-unique voice configuration caller so regular package identity reaches the shared audio lifecycle. CN-02 owns People/text-only and phone UI consumption. Do not create a phone/call session endpoint, WebRTC, telephony protocol, client-only contact state, second pipeline, or migrate SC-02/03.

**Reviewer:** verify public projection, package binding, route authorization and voice-reuse compatibility.

**Tester:** run only CP-00’s prescribed affected offline API/package/audio tests after Sol approval.

**Root:** compare the tested source to the frozen manifest and accept or return it.

## Tests

Update `llm/tests/sf03Language.test.js`, `services/api/tests/scenarioRegistry.test.js`, `services/api/tests/threads.test.js`, `services/api/tests/voice.test.js`, `voice/tests/speechWiring.test.js`, and `voice/tests/client.test.js`; add `services/api/tests/clientRemote.test.js`. Use an injected registry/private server-side fixture: default server stays the old three actors. Cover remote public shape omitting anchor/private fields; old three physical cast exact; fourth physical/multiple remote/unknown mode or voice/arbitrary target rejection; ordinary remote state/thread/event behavior; legacy VOICE_MAP/public sessions/cross-session pin compatibility; and speech eligibility. Run only those affected offline unit/API suites.

## Review

Sol reviews the exact candidate for public/private leakage, target authorization, voice reuse boundary and package/legacy compatibility.

## Stop and ask

Stop for root if compatibility needs changing old public shape, a new endpoint/pipeline, a second remote contact, new voice assets/download, or a changed voice override contract.

## Exit

Report changed paths, exact commands/results, remaining CN-02 lifecycle work, and unrun live/browser/device checks. Then hand to reviewer → tester → root; do not self-approve.
