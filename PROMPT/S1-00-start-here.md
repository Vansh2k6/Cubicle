# S1-00 — Start here: how to run the Stage 1 prompt set

**Rank:** these prompts are working aids. They sit **below** `AGENT.md`, `RULES.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `PRD.md` and `PHASES.md`. Where a prompt and a project document disagree, the document wins (AGENT.md §2). Never use a prompt to justify bending a rule.

Suggested location: `/CONTEXT/prompts/`. Adding that folder means one line in AGENT.md §4's layout; touch nothing else in AGENT.md because of it.

## 1. How to run

1. **One part per fresh session.** Paste only that part's file. Do not chain parts in one session.
2. Every part is addressed to the **Orchestrator (root)** of AGENT.md §6. The orchestrator assigns **Coder → Reviewer → Tester**, then accepts or sends back. If your tool cannot spawn sub-agents, run the roles as separate passes: the reviewer pass reads the diff and the rules, not the coder's reasoning; the tester pass runs checks on the reviewed candidate only.
3. A part ends at its **gate**. Do not start the next part until the gate report is `ACCEPTED` and you have read it.
4. Parts marked **HUMAN STOP** need your decision before code. The orchestrator must ask and wait; it must not pick a provider, confirm scenario constants, or change scoring weights on its own (AGENT.md §9).
5. Only the orchestrator checks items in `PHASES.md`, and only after acceptance. Unrun live checks are never checked off.

## 2. Order and dependencies

| # | File | PHASES.md items | Needs from you | Gate (summary) |
|---|---|---|---|---|
| 01 | P0 baseline freeze | P0.2–P0.5 | **HUMAN STOP:** provider/models, SC-01 constants, backend language, schema additions | Schema validates; docs match reality |
| 02 | P1 engine core | P1.1–P1.7 | — | Engine tests pass offline; deterministic |
| 03 | P2a gateway, classifier, generation | P2.1–P2.4 | Provider keys set **server-side** (never in chat) for live evals | Offline suite green; live classifier eval run or `NOT RUN` |
| 04 | P2b guards | P2.5 | — | Guard fixtures + adversarial pipeline tests pass |
| 05 | P2c text UI + P2 exit | P2.6–P2.8 | Provider access for exit measurements | P2 exit criteria measured or `NOT RUN` |
| 06 | P3a scene threads, goals, silos | P3.1–P3.3 | — | Per-NPC threads, checklist, silo tests |
| 07 | P3b relay, beats, ending | P3.4–P3.6 | Decision: mood effect of accurate relay (default none) | Scripted playthroughs; text-only parity |
| 08 | P4a deterministic scoring + flags | P4.1, P4.4 | **HUMAN STOP:** relationship averaging population | Exact breakdown fixtures |
| 09 | P4b judge, quote validator, coach | P4.2, P4.3, P4.5 | Provider for live consistency eval | Quote validator proof; judge/coach safety |
| 10 | P4c debrief | P4.6 + P4 exit | Approval of any new dev dependency for UI tests | Every quote verified; trap/smart targets measured |
| 11 | P5 retry + progress | P5.1–P5.3 | — | Play → feedback → retry → compare |
| 12 | P6 sliders (core) | P6.2 | **HUMAN STOP:** which NPCs, difficulty formula | Sliders change behaviour and are recorded |
| 13 | P6x presets + voice (**optional**) | P6.1, P6.3–P6.5 | Go/no-go; STT/TTS provider (D-19) | Flagged and tested, or hidden |
| 14 | P7 hardening + demo | P7.1–P7.4 | Weight-tuning approval | All ten Stage 1 exit criteria with evidence |

Parts 01–12 and 14 are core (D-23). Part 13 may slip. P6.2 is core even though its neighbours are optional.

## 3. Test vocabulary (use these words exactly)

- **Offline test:** runs with no network and no API keys (R-60). Must run in the tester gate every time.
- **Live eval:** calls a real provider with server-side keys. Subset per change is allowed in Stage 1 (R-61/D-23).
- **PASS:** the command ran, output is shown in the report. **FAIL:** it ran and failed. **NOT RUN:** it did not run, with the reason. **A build pass is not an engine/eval pass.** Missing provider or harness is `NOT RUN`, never `PASS`.
- **Cumulative regression:** from P1 onward the tester runs the **entire** offline suite, not only the new tests. Once a single command exists (AGENT.md §5 `test all`), use it.
- **Evidence:** transcripts, screenshots and eval outputs saved under `/evals/reports/` (create if absent) with date, part ID, and run manifest ID.

Assets each part leaves for later parts (keep them reusable): scenario validator (01) → engine fixtures and event lists (02) → fake LLM provider, run manifests, labelled event set (03) → guard fixture set (04) → latency/R-62 runner (05) → scripted-bot runner (07) → recorded session fixtures (08) → judge/coach fixtures (09).

## 4. Gate report format (every part ends with this)

```
PART: S1-xx · PHASE ITEMS: P?.?, …
STATUS: ACCEPTED | BLOCKED (human decision) | SENT BACK
CHANGES: files touched, grouped by role
GATES: | Gate | Command or method | Result (PASS / FAIL / NOT RUN + reason) | Evidence path |
RULES CHECKED: R-xx → how verified
PROVISIONAL CONSTANTS introduced: name, value, where configured (unconfirmed unless the human confirmed)
DOC UPDATES: files and sections changed
UNVERIFIED / LIMITATIONS: plain list
HUMAN DECISIONS NEEDED: plain list
HANDOFF: what the next session must know (commands, fixtures, open risks)
```

The orchestrator must confirm the **tested candidate is still the current candidate** before `ACCEPTED`. Any code change after review repeats review → test.

## 5. Doc tensions found while preparing these prompts (resolve before relying on them)

1. AGENT.md §8 says "the five acceptance playthroughs"; PHASES.md lists **ten** Stage 1 exit criteria. These prompts use all ten.
2. ARCHITECTURE §11 averages relationship over **scenario NPCs**. A user who never visits Sam leaves Sam at zero improvement, which lowers the average and the ≥85 smart-path target. Part 08 asks you to decide.
3. The docs define no mood effect for an **accurate relay**. Part 07 defaults to none and asks.
4. The earlier single prompt for P0→P3 is superseded by this set. Where it differs from the project documents, the documents win.
5. Ambiguous-date handling needs a representation (clarification signal) the taxonomy does not define. Part 01 asks for a schema decision; recommended default: a separate `clarify` field on classifier output, not a new event type.

## 6. Standing do-nots (every part)

- Do not request, print, or commit API keys (R-50; AGENT.md §10).
- Do not put sealed text, private canon, commitment bounds or trigger lists into any prompt, client bundle, API response or user-visible log (R-01, R-03, R-08, R-66).
- Do not let a model decide reveals, goals, endings, acts, agreement, or score arithmetic (R-11).
- Do not scaffold folders or dependencies "for later" (AGENT.md §3 item 3; R-65).
- Do not widen scope beyond the part. Work outside the current phase waits (R-63).
- Do not claim a feature works because it builds. State what ran.
