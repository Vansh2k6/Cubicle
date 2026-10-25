# Deadline dialogue fix status

This bounded fix makes the shared deadline-v2 interpreter nominate one
actor-and-topic-backed inquiry when the message is a safe question. Its
inquiry matcher uses the shared pure lexical normalizer and tokenizer, so
case, symbols, spacing, hyphens, and newlines do not change a supported intent;
raw double or paired single quotation and normalized negation still reject it.
Ordinary apostrophes in a direct question remain supported. The
classifier normalizer preserves that one inquiry even when a provider returns
an empty or harmlessly mislabeled result; it does not synthesize plans,
approvals, or relays. Existing delivery gates still require a guarded reply,
so a failed reveal remains undiscovered and `delivered: false`.

Jordan's existing help inquiry also covers ordinary remaining-work or
task-status questions, including work or tasks that are left, remaining,
unfinished, or pending and `what's left` wording. It remains the existing
`asked_for_help` event and does not change plan, approval, or relay handling.

Offline follow-up replies may repeat an already delivered authored fact only
for its speaking owner and only when the latest user text overlaps its content
tokens. The proof is an exact prior guarded assistant row, not a user claim;
the rule applies only to ordinary react or sealed-deflection moves and does
not create discovery credit.

NPC prompt v6 now asks for the exact engine-bound plan reply, exact selected
authorised disclosure text, and exact already-disclosed own facts when they
are referenced. Deflections request honest neutral clarification without
inventing unavailable-memory or access explanations. Prompt provenance now
uses v6 while v5 remains preserved.

Offline evidence is recorded by the focused language/pipeline tests: all four
fact owners discover their fact through the eight supplied reasonable
questions, and quoted, negated, approval-claim, and instruction traps remain
uncredited. `node --test llm/tests/deadlineV2Language.test.js
llm/tests/endCoordinator.test.js llm/tests/sf03Language.test.js
services/api/tests/deadlineV2.test.js` passed 45/45 offline tests; its complete
log is `out/deadline-dialogue-fix-focused.log`. Tests use mocked/offline
generation only. No live provider call,
physical-device check, or performance check was run; live wording and guard
behaviour remain NOT RETESTED.

The later remaining-work and known-fact follow-up regression ran 21/21 focused
language tests; its log is `out/deadline-dialogue-fix-followup.log`.
