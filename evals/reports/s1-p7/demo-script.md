# Local demo operator guide

Status: offline rehearsal instructions. Live acceptance and demo readiness are **NOT RUN**, not approved. No additional provider calls are authorized by this guide. Use synthetic practice inputs only; do not commit personal transcripts.

## Start locally

In PowerShell from the project folder:

```powershell
$env:LLM_PROVIDER = 'offline'
Remove-Item Env:GROQ_API_KEY,Env:RUN_LIVE,Env:CUBICLE_DEBUG -ErrorAction SilentlyContinue
npm run verify:offline
npm run demo
```

Open http://127.0.0.1:4173. Verification builds the frontend; after later source changes build again. To include the optional preset selector, set `$env:VITE_PRESETS = '1'` before verification/build. Without it, the four sliders still work. The demo serves built assets and API together, forces debug off and binds loopback only. It is not a public deployment. `.env` is not automatically loaded by the API. Keep any eventual provider credential server-side; never paste it into the browser or a command recorded here.

## Offline rehearsal

Move with WASD/arrows or click the floor; approach a colleague and press E. Choose default sliders (50) and Start. The offline classifier is a limited rule stub, and NPC lines use authored responses. Offline feedback labels the unavailable judge as provisional; it cannot establish the smart-path final-score target.

1. **Trap:** tell Maya, “I will deliver tomorrow.” Visit Jordan for three neutral turns (“Hello.”, “Thanks.”, “Understood.”), then return to Maya: “I am back.” End & reflect. Inspect the premature-commitment flag and its exact quoted line. The existing deterministic synthetic fixture scores 7; treat the displayed run as new evidence, not an assumed result.
2. **Smart rehearsal:** own the unfinished work with Maya; ask about deadline flexibility twice; ask Jordan what remains and ask for help twice; explicitly accept Jordan's help; relay only the delivered fact to Maya; propose a realistic date and recap the same date. Ask Sam what is expected when someone learns of a delay. Watch the visible goals and delivered replies rather than assuming a classification. End & reflect and inspect quotes, separate code/judge points and missed facts. The earlier synthetic smart fixture scores 60 deterministic points with 25 judge points reserved; the live >=85 target is unmeasured. Do not promise a high final score in the presentation until calibrated acceptance passes.
3. Use Try again and compare summaries in My progress. Use Try again with new settings to inspect the shared controls. Restart scenario clears only the current attempt; it preserves saved summaries. A server restart loses full historical feedback but retains the local summary.

## Failure plan

- **Provider timeout/rate limit/budget exhaustion:** the gateway uses the guarded authored fallback. The app may show a normal safe fallback line rather than a Retry button; feedback can remain partial/provisional. The presenter names the unavailable model result instead of claiming live success. No repeated provider call should be forced for a demonstration.
- **Network/API failure:** the typed line remains with Retry; the presenter presses Retry once after the API is restored. Its idempotency key prevents a duplicate turn. If End fails, retry End after recovery. Check feedback recovers an uncertain feedback response; feedback regeneration is bounded to one explicit retry.
- **Cannot recover:** stop the rehearsal and show existing offline evidence with its limits. Do not switch providers, reveal hidden fixtures or enable debug in a shared screen.

## Deferred live acceptance

The request plan is `evals/cases/s1-14-acceptance.NOTRUN.json`; earlier paired slider requests are in `s1-12-shared-settings.NOTRUN.json`. All live runs require a separately authorized budget and protected server-side provider configuration. Existing `p2c-*.NOTRUN.mjs` files are request-plan stubs, not complete executing harnesses; RUN_LIVE=1 alone does not implement missing measurement. Prepare an executing harness and review it before the batch, record manifests, actual model/provider and network conditions, and save private raw evidence outside tracked files. Commit only sanitized/synthetic summaries.

No tuning is authorized: any proposed scoring weights or parameter changes return to the human and require versioning where applicable. Until every row in S1-14-gate.md has acceptance evidence, the project remains implementation-complete with demo acceptance deferred.


## Optional local voice (V4 candidate; acceptance pending)

Keep typed input available throughout. Voice needs both server `VOICE_ENABLED=1` and client `VITE_VOICE=1` when building. Supply the sidecar token privately through the environment, never in a screenshot, committed file or shared terminal transcript. Start the existing installed sidecar with `npm run voice:sidecar` first and wait for warm local readiness, then start the API/built demo and open the localhost page. The previous default build remains typed-only.

Microphone permission requires a secure browser context: HTTP localhost/127.0.0.1 qualifies for local practice; a nonlocal site requires HTTPS. The shipped local voice route policy is loopback-only, not a public HTTPS deployment. Grant microphone permission only when pressing the mic. Enable Voice and conversation Sounds deliberately; hold the mic, check/edit the draft, then Send. Replay/Listen/Send/mic/unmute gestures can unlock already opted-in playback after refresh. Captions always remain visible.

If voice misbehaves, switch it off and type. A down sidecar shows Voice unavailable and Retry voice; wait for backoff and retry after restoring the sidecar. This does not restart the page, change consent, auto-record, or send the draft. A failed NPC audio job may fall back to an installed local English browser voice; typed conversation is authoritative. Mute, Escape/close, End, blur and hidden-tab actions stop playback. In the ended debrief, use its Voice and Sounds controls, then Listen beside the improved reply; this speaks the stored caption, not arbitrary text. Feedback retry invalidates the earlier Listen IDs/audio.

After review, `npm run voice:latency` uses the configured local sidecar and its own temporary loopback API for 20 default runs (`VOICE_LATENCY_RUNS=20..50`); inherited live LLM selection is forcibly removed. It writes only hardware/timing metadata to `evals/reports/voice-latency-YYYY-MM-DD.json`. Keep the office open for a separate scene observation, but the runner has no frame sampler: scene stutter is honestly NOT RUN. Do not infer demo readiness, microphone accuracy, real-device playback, scene smoothness or a cloud-primary decision from synthetic timing alone.
