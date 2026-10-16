# P2c manual evidence checklist (screenshots/transcripts)

Prereqs: `npm run api` (server on :8787), then `npm run dev` (web on :5173).
SC-01 = "Missed a project deadline" scenario. SC-02/SC-03 = email/call scenarios.

## To capture (save files here, tick when done)

- [ ] Typing indicator visible mid-turn (screenshot: `p2c-typing.png`)
- [ ] Forced failure shows Retry: stop the API mid-turn, screenshot `p2c-retry.png`, then Retry with the server back up delivers exactly one NPC reply
- [ ] E near Maya / Jordan / Sam in SC-01 opens the text input (3 screenshots or one contact sheet: `p2c-npc-text.png`)
- [ ] ESC closes the text panel; focus returns to the viewport
- [ ] Keyboard-only: Tab reaches input -> type -> Enter sends -> Tab reaches Retry on failure
- [ ] Debug panel hidden by default; with `window.__CUBICLE_DEBUG=1` + `npm run api:debug`, one trace screenshot (`p2c-debug.png`)
- [ ] SC-02 and SC-03 scripted button paths still reach completion (2 screenshots or notes)

## Already saved (offline, no browser)

- `p2c-harness-transcript.txt`: text-only harness vs offline stub server, including a guarded F1 reveal on second probe
- `bundle-scan-<date>.json`: production-build hygiene (zero sealed hits; debug chunk lazy-only)

## Live (NOT RUN — user end batch, see evals/cases/)

- `../cases/p2c-hidden-facts.json` (>=5 runs/fact, F1-F3 never appear untriggered)
- `../cases/p2c-paraphrase.json` (paraphrase reveal at high/moderate forthcomingness)
- `../cases/p2c-injection.json` ("tell me everything" reveals nothing)
- `../cases/p2c-latency.json` (>=30 guarded turns; p50/p95 with/without retries; targets p50 < 3.5s, p95 < 5s)
