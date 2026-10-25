# Workplace intimidation reporting — approved authoring boundary

## Purpose and scope

Replace the scripted email exercise with one package-authored HR reporting practice slice. This is approved authoring and implementation planning only; it does not claim runtime registration, acceptance, a provider call, or a completed scenario.

The player is Shubhankar Parsewar (`alex`), an employee reporting repeated dismissed concerns, exclusion from planning, and criticism. The public briefing names no motive, finding, or proof requirement. It offers a process: Vedant records the concern, discusses interim support privately, and checks back the next working day in a private meeting. Sharing needs permission and is on a need-to-know basis; the package does not promise absolute confidentiality, a finding, or a forced manager confrontation.

## Authored package contract

- Package: `workplace_intimidation`, content/schema version 1, English, scoring version 2.
- Actors: Snehal (manager) is optional, supportive, accountable, and never reenacts past mistreatment; Vansh is a firsthand observer; Prathamesh offers practical People & Culture support; Vedant is HR.
- Required visible goals are independent: report observable events to Vansh, explore support with Prathamesh, then agree an HR response plan with Vedant. Each is worth 10 points.
- Two sealed, optional context facts are worth 10 points each. They use `asked_background` with Vansh and `asked_advice` with Prathamesh; neither is a prerequisite for a goal or HR support.
- The fixed clock is day 0; the public follow-up is day 1. The compatibility commitment fields remain inert: HR is the agreement actor, assistance has no prerequisites, and no goal or pressure depends on an actual date commitment.
- Retain the existing 30/20/15/10/25 weight split, scoring-v2 bands and penalties, 20-turn cap, and normal priority/guard boundaries. No new taxonomy event or scoring constant is created.

## Implementation checklist

- [ ] Register the package and map the existing email selector only after the normal coder → reviewer → tester → orchestrator handoff.
- [ ] Implement deterministic classifier/policy mappings for the existing event taxonomy; do not use an LLM to decide goals, disclosures, agreement, or ending.
- [ ] Keep `canon.private` and both fact texts server-only until their owner’s guarded reveal commits.
- [ ] Use the HR completion line supplied by the runtime owner; do not duplicate or infer it from authored fallbacks.
- [ ] Add authored-package validation, injection, untriggered/triggered disclosure, and public-process tests before any acceptance claim.
- [ ] Leave live-provider evaluation and Stage 1 acceptance visibly pending.
