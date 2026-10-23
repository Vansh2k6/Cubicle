# SF-02 — Engine and evidence

> **Head document: `CONTEXT/AGENT.md`.** Follow its workflow; D-37 authorises this bounded implementation prompt.

**Entry:** SF-01 accepted. **Goal:** extract bounded pure policy hooks while keeping the core as the sole authority and preserving SC-01 scoring behaviour.

## Read first

All six `CONTEXT` documents; master plan; `engine/{engine,config,scenarioValidator}.js`; `scoring/{config,score}.js`; SC-01 spec; associated engine/scoring tests.

## Assignments

Coder: replace the SF-01 SC-01-only adapter with the target pure readonly engine interfaces from the master plan: commitment bounds, goal candidates, pressure candidates and relay accuracy. Pass user text only to the operation that requires it. Core centrally validates every returned candidate, including declared beat/priority before pressure selection, and alone mutates state, IDs, delivery, credit, priority and ending. A candidate cannot authorize a private-fact outcome outside core permission. Capture goal proof in core for scoring; normalize scoring profile from one authored source. Preserve D-25 and D-31 constants, smart/trap 60/7, no double credit, and no scoring-version bump.

Reviewer: Sol reviews authority boundaries, source allocation, staged delivery and scoring semantics. Reviewer rejects any DSL, arbitrary code path, discovery credit after fallback, or scorer reconstruction of G1/G2/G3.

Tester: run hand-written event-list engine/scoring regressions and the listed deterministic fixtures after approval.

## Tests

Prove invalid policy output cannot mutate core state; pending reveal is credited only after delivery; failed fallback has no discovery/agreement credit; policy source IDs remain validated; exact SC-01 goals/facts/penalties/relationship population and 60/7 remain unchanged.

## Review

Check policies do not see/write private global state beyond their explicit read input; scorer consumes captured proof; profile identity is stored.

## Stop and ask

Stop for a changed SC-01 constant, penalty, metric, taxonomy, ending semantic or scoring version.

## Exit

Core authority and SC-01 deterministic results are preserved under the extracted package contract.
