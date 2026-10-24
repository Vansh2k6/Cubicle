# Scenario goal and fact repair — 2026-10-25

Root accepts this bounded repair **offline**, not full live or shared/demo acceptance. Source commit `83b83f4351d8754b731dec955aa29ccba3b86b05`; exact independently reviewed and tested tree `fea4470a47d2ed37036e764ad5223f48a3fec4bc`. Design: [MAIN-PROTOTYPE-DESIGN.md](MAIN-PROTOTYPE-DESIGN.md), including repair amendments. D-39 remains the private local-preview authority. Main is unchanged.

## Changes and contracts

- Hyphenated component fact IDs now select reveal instructions. Exact pending-fact and owner checks remain mandatory.
- Classifier v5 defines a concrete generic recap separately from structured deadline-v2 proposal rules. Classification never proves agreement or goal completion.
- NPC boundary v6 / moves v3 preserve the authorized fact or acknowledgment during regeneration, forbidding extra claims. Guards and `commitDelivery` remain authoritative.
- Prototype offline classification recognizes existing advice/flexibility events and requires work, owner and next-step wording for a recap.
- Anthropic receives the existing low-effort setting. Structured output accepts one exact JSON fence, then passes existing local schema and gateway validation. Outside prose, multiple fences, wrong labels, malformed/truncated content and extra objects remain rejected. NPC prose is unchanged.

Changed files are the design note, classifier/config/pipeline/promptBuilder/Anthropic adapter, the three new versioned prompt files, prototypeCatalog and focused tests. No engine predicates, scoring weights/version, schema, cast, UI, API routes or dependencies changed. No new LLM authoring role was necessary: the existing goals/facts have reachable supported mechanics. Inventory remains four frames / 36 reference components / six prototype packages plus main deadline-v2. Component versions are unchanged.

## Exact candidate checks

| Command/check | Status |
| --- | --- |
| `node --test services/api/tests/prototypeCatalog.test.js llm/tests/pipeline.test.js llm/tests/classifier.test.js llm/tests/deadlineV2Language.test.js llm/tests/anthropic.test.js llm/tests/prompts.test.js llm/tests/sf03Language.test.js llm/tests/endCoordinator.test.js` | PASS — 95/95 |
| `npm run verify:offline` | PASS — unit phase, API 99/99, build, bundle scan; no failures/skips |
| `git diff --check` | PASS |
| Standalone `npm test`, `npm run test:api`, `npm run build`, `npm run bundle:scan` | NOT RUN separately; covered by full offline gate |
| Browser/UI retest | NOT RUN; no UI changes, browser unavailable |
| Judge /25, smart >=85 total, trap <50 total, final full live completion | NOT RUN; acceptance blocked |

Tester verified the identical tree before/after. Root independently reviewed the diff with no blocking findings. Bundle scan: six artifacts / 383 needles / zero hits. Existing 547.65 kB office-chunk warning remains.

Offline real-pipeline tests deliver all 24 facts across manager, HR, client, coworker, omitted-feature and earlier-delivery packages, and complete required goals/automatic ending for all six. Natural wording passes through actual offline classification and guarded delivery. Baseline full/phased paths remain covered. Fenced-response fixtures use the adapter and real engine pipeline. Owner/early/injection, failed delivery, privacy and spend-cap checks remain in the gate. Fixtures do not measure live-model quality or arbitrary paraphrase coverage.

## Live evidence and limits

Intermediate reviewed/tested tree `2a7a06f0165da8176802d23a28a497c2e96edeb9` received a 30-dispatch targeted live run. Omitted-feature delivered three of four facts, two of three required goals, **46/75 deterministic**, without automatic completion. Baseline ownership completed G1 without fallback; its QA fact paraphrase remained guard-rejected. Baseline's partial two-turn score was **25/75 deterministic**, not a full playthrough. Repeated fenced classifier JSON caused missing fact/commitment/recap events and led to the final adapter fix.

On final tree `fea4470a47d2ed37036e764ad5223f48a3fec4bc`, the remaining three live classifier probes all passed on attempt one: requirement inquiry, committed deadline (day 3), concrete recap. **Classifier-only probes are not a complete NPC playthrough.** No final full deterministic score or judge score was measured. Total/band remain provisional; intermediate scores cannot be combined with final probes into acceptance.

Known limits: the coworker source unlock question differs from its urgency trigger; it stays sealed for that wording, while “Why is this handover urgent this week?” unlocks it. Offline classification is lexical and bounded. Baseline QA paraphrase rejection needs further investigation with a separately authorized live allowance; guards were not weakened to pass it.

## Persistent spend

Old grant unchanged: 28 calls, 195,510 reserved tokens, $0.488775 reserved; usage estimate $0.0021688.

`all-scenarios-live-gameplay`: **350/350 calls**, 2,715,938 reserved tokens, **$0.4149538/$0.50 reserved**; returned input/output 543,870 / 101,418; usage estimate **$0.105096**. Its call cap is exhausted. Do not reset or raise either ledger; further default play is offline without a new explicit allowance.

Cumulative: **378 calls**, 556,278 input / 103,274 output tokens; estimated returned-usage cost **$0.1072648**; combined reservations **$0.9037288** across two separate grants. Reservations are not billing. Failed calls without returned usage may have unmeasured cost; the provider dashboard is authoritative. No credentials or private transcripts are published here.

Local status: **local_preview_ready** under D-39 and local review. Shared readiness, R-45, demo/full live acceptance and publication remain **BLOCKED**. No unresolved owner decision is needed for this repair; new mechanics or paid allowances need separate authorization.
