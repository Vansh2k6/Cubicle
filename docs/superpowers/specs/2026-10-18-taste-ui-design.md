# Cubicle interface direction — 2026-10-18

## Intent

Cubicle is a focused practice workspace. The interface should support the office scene and a clear conversation, rather than compete with them through decorative containers or tiny metadata.

## Visual contract

- Canvas: `#f4f6f3`; panels: white; ink: `#1f2d29`; muted text: `#596861`; action and focus accent: `#28634e`.
- Type remains Manrope and DM Sans. UI copy is normally 13–14px or larger; headings use a compact, dark hierarchy.
- Flat surfaces, 1px structural borders, restrained 6–10px radii, and no gradients, purple UI treatment, ambient effects, or decorative numbers.
- The 3D office canvas, camera, controls, and game flow remain unchanged.

## Layout contract

- Desktop uses a quiet 232px navigation rail and a compact 48px workspace header.
- The current objective is a single flat strip above the office. The office keeps the primary visual area at a 1280px-wide desktop.
- At 390px, the rail becomes a compact horizontal control area; the scenario briefing stays in its native disclosure, and all controls remain reachable without page-width overflow.
- Conversation prioritises transcript and composer. Send is the primary action; ending the session is secondary. Public goals and hints remain optional native disclosure content.
- Debrief leads with one positive takeaway and one evidence-backed better reply. The score remains a modest summary with deterministic and AI portions separated. Supporting material stays in the existing three native disclosures.

## Preserved product contracts

No score arithmetic, scenario data, engine state, API requests, provider settings, turn IDs, escaping, retry/polling logic, focus handling, or office interaction changes are part of this direction.

## Historical note

Earlier documents describe an ivory-and-purple visual system. This direction supersedes it for the application interface only; those notes remain a record of the earlier implementation contract.
