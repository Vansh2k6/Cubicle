# Main-based custom generation handoff — 2026-10-25

- Base: GitHub main `cd88ef9106b76727247dabe7ad1647aa13878ea4`.
- Branch: `codex/main-custom-scenario-generation`.
- Source commit: `922b2fc60c2550dd08ebceab6e06c360c7ec1692`, whose direct parent is that main commit.
- Reviewed/tested source tree: `2f4e6ebedb10f9f893ccc6be94aa5eb1ad8e7059`. Only this results document was added afterwards.
- Design/authority: [MAIN_GENERATION_PORT.md](MAIN_GENERATION_PORT.md), CONTEXT D-42. Supersedes divergent PR #4; this branch does not contain its provider/grant/history changes.

## Scope and preservation

Includes four authored frames / 36 reference components, six validated prototype packages, two deterministic client-request matchers, loopback-only private routes, exact selected package binding, and a compact description-first popup with local review. Five prepared choices remain: main missed deadline plus manager, internal transfer, client change and employee handover. Main's separate workplace-concern scenario remains in its ordinary selector. The two custom requests cover an omitted feature and an earlier client deadline; unsupported or ambiguous requests are rejected.

Main's engine, scorer, HR package/policy, deadline package/policy, provider implementation/configuration, settings, cast setup and office implementation are unchanged from the fetched main. The shared prompt/offline-act parser changes only enable hyphenated fact IDs. Prototype prompts are package-bound and separately versioned; main's prompt versions remain. A small terminal-harness shutdown correction is explained in the design findings and verified by existing ending tests. No provider calls, budget edits or credential copies occurred.

## Checks on the source candidate

| Check | Status |
| --- | --- |
| `node --test llm/tests/prototypePrivacy.test.js services/api/tests/prototype.test.js services/api/tests/prototypeCatalog.test.js voice/tests/prototypePopup.test.js` | PASS — 20/20 |
| `node --test services/api/tests/ending.test.js` | PASS — 4/4 after the documented shutdown fix |
| `npm run verify:offline` | PASS — 434 unit tests, 112 API tests, build and privacy scan |
| `git diff --cached --check` | PASS |
| Separate `npm test`, `npm run test:api`, `npm run build`, `npm run bundle:scan` | Covered by `verify:offline`; one additional bundle scan also passed during diagnosis |
| Browser, live model, judge /25, smart >=85 total, trap <50 total | NOT RUN for this port |

Privacy scan includes prototype private needles: seven text artifacts, 804 needles, zero hits. Existing office chunk-size warning: 547.97 kB. Logs are local ignored `out/generation-focused.log`, `out/main-generation-final.log`, and `out/ending-recheck.log`.

Manager, HR-transfer, client, coworker, omitted-feature and earlier-delivery packages each pass schema/semantic checks and offline real-pipeline fact delivery/required-goal ending. Exact selected identity flows through engine, API/session, debrief and scorer checks. Main HR/deadline/cast tests pass in the same gate. Wrong-owner/early/injection, protected mechanics/tampering, no-match/unsupported requests, provider failure safety, public-content escaping, local-review gating and non-loopback route protections are covered. The scanner checks prototype sealed content, without weakening existing exclusions. No secret component/spec records enter the popup.

These are deterministic offline tests, not full live quality evidence. Deterministic scoring remains capped at /75; judge /25 and full total/band acceptance are unmeasured here. No synthetic judge is used. Local preview remains distinct from shared readiness; shared/demo/R-45/publication gates remain blocked.

## Review and limits

The implementer performed targeted diff review, preserved-main file comparison and offline verification; side-conversation instructions prohibit subagents, so **no independent review** is claimed. The PR still needs human review. No automatic merge or publication.

Existing prototype limits remain: only two bounded custom request types, lexical offline classification, and the coworker authored unlock question differs from its urgency trigger (the supported urgency probe remains tested). This port does not broaden generation, add a map/cast requirement or integrate generated play into the 3D office. It leaves the main chat checkout and running app untouched.
