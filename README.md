# Cubicle

A frontend-only, playable 3D office for practicing workplace conversations.

## Run

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. `npm run build` creates a static production build in `dist`; `npm run preview` previews that build.

## Play

- Move with WASD or arrow keys, click the floor, or use the mobile direction controls.
- Approach Maya, Jordan, or Sam and press E or click the conversation prompt.
- Choose replies with a mouse or the 1–3 keys. Escape closes conversations and help.
- Change the scenario in the sidebar. Each manager conversation has its own script and feedback.
- Progress is stored in localStorage on this browser. No server, account, API key, or AI service is needed.

Built with Three.js, Lucide, and Vite. All office geometry and characters are generated locally. Google Fonts is optional; system fonts are used when unavailable. WebGL is required.

## Scenario prototype

Choose **Try scenarios** to review five fixed situations before starting a text practice. The two supported client requests are an omitted product feature and a request for earlier delivery. Other free-text requests are rejected with guidance; this is a bounded prototype, not open-ended scenario generation. The existing office, voice flow and regular scenario selector remain available.

The API remains offline by default. For a live Claude Haiku 5.5 provider, keep the key in the ignored root `.env` file (create it from `.env.example` only if one does not already exist), then set `ANTHROPIC_API_KEY`, `LLM_PROVIDER=anthropic`, `RUN_LIVE=1`, and `CUBICLE_LIVE_TEST=cubicle-scenario-prototype-haiku-2026-10-25`. For a built same-origin demo, run `npm run build`, then `node --env-file=.env services/demo.mjs`; it serves `dist` and the API together on port 4173. For development, run `npm run dev` and `node --env-file=.env services/api/server.js` in separate terminals; Vite proxies API requests to port 8787. The key is read only by the server and must never use a `VITE_` variable.

Before the first live request, initialize the persistent budget ledger once with `node --env-file=.env scripts/init-anthropic-budget-ledger.mjs`. The adapter refuses missing, malformed, or mismatched ledgers and reserves budget before dispatch. Its fixed task grant permits at most 40 requests, 200,000 reserved tokens, 1,024 output tokens per request and a $4 hard ceiling using the conservative $2.50 per million token rate. The token cap bounds worst-case reserved cost to $0.50 at that rate. Reservations are not refunded after errors or cancellation. Do not delete or reset the ledger. Leaving `RUN_LIVE` unset keeps practices offline; no provider request is made by startup, preview or keyword composition.

The separate `all-scenarios-live-gameplay` grant is capped at 350 dispatches, 5,000,000 reserved tokens, 1,024 output tokens per request, and $0.50. To select it, set `CUBICLE_LIVE_TEST=all-scenarios-live-gameplay` and point `ANTHROPIC_BUDGET_LEDGER` to `./.state/all-scenarios-live-gameplay-ledger.json` (the existing `.env.example` path belongs to the earlier grant). Then explicitly initialize it with `node --env-file=.env scripts/init-anthropic-budget-ledger.mjs all-scenarios-live-gameplay`. Initialization uses exclusive-create and refuses an existing file. Its input bound is UTF-8 request bytes plus 2,048 tokens, rejected above 100,000; reservations price input at $0.10/M and output at $0.50/M. Both grants retain separate ledgers and limits; selecting one with the other grant's ledger fails closed.

Each provider dispatch has a server timeout and the existing gateway may retry once; both attempts reserve budget. If the browser reports a delayed response, retry the same message so the server's idempotency key replays the original turn. Closing the browser does not abort a turn already running on the server; its bounded provider timeout and budget reservation still apply.
