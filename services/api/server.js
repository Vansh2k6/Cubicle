// services/api/server.js — Minimal Node built-in HTTP API (P2c, ARCHITECTURE.md §18 slice).
// Endpoints: POST /sessions, POST /sessions/{id}/turn, GET /scenarios/{id}.
// Server-side spec only (R-08): the client receives briefing + visible goals.
// Defaults to offline; explicit Groq configuration enables the live gateway.
// Debug fields (_debug) are emitted only when
// CUBICLE_DEBUG=1 or --debug is set (R-03); shared-demo builds run without it.
// Idempotency: a turn request may carry idempotencyKey. Completed responses are
// cached per key and replayed without re-applying engine state; a failed
// attempt rolls its session/convo mutation back so a same-key retry applies
// exactly once. ESM, Node stdlib only (R-65).

import http from "node:http";
import { fileURLToPath } from "node:url";
import * as engine from "../../engine/engine.js";
import { SessionStore } from "../../engine/store.js";
import { createConversation, runTurn, publicResponse, projectGoals, nextHintFor } from "../../llm/pipeline.js";
import { createManifest } from "../../llm/manifest.js";
import { difficultyFor, validateSliders } from "../../shared/settings.js";
import { createOfflineProviders, classifyProviderFor } from "./offlineProviders.js";
import { defaultRegistry, publicScenario } from "./scenarioRegistry.js";
import { loadConfig, providerName } from "../../llm/config.js";
import { createGroqProvider } from "../../llm/providers/groq.js";
import { assembleDebrief } from "../../scoring/debrief.js";
import { createScoreRecord } from "../../scoring/score.js";
import { loadVoiceConfig } from "../../voice/config.js";
import { createSttHandler } from "../../voice/http.js";
import { createLocalVoiceProvider } from "../../voice/providers/local.js";
import { createVoiceHealth } from "../../voice/health.js";
import { createSpeechService } from "../../voice/speech.js";


const TURN_TIMEOUT_MS = 15000;
const MAX_TEXT = 2000;
const MAX_BODY = 1 << 20;
function localOrigin(origin) {
  if (origin === undefined) return true;
  try { const value = new URL(origin); return value.origin === origin && value.protocol === "http:" && ["localhost", "127.0.0.1"].includes(value.hostname); } catch { return false; }
}

const selectedProvider = providerName();
const liveProvider = selectedProvider === "groq" ? createGroqProvider() : null;
const manifest = createManifest(liveProvider ? loadConfig() : {
  classifier: { model: "offline-stub:rules-v1", promptVersion: "v2", schemaVersion: 1 },
  npc: { model: "offline-stub:store-v1", promptVersion: "v3", schemaVersion: 1 },
  judge: { model: "offline-unavailable:judge", promptVersion: "v2", schemaVersion: 2 },
  coach: { model: "authored-fallback:coach", promptVersion: "v2", schemaVersion: 2 },
});

function moodLabel(mood) {
  const m = Number(mood) || 0;
  if (m >= 65) return "Calm";
  if (m >= 40) return "Tense";
  if (m >= 20) return "Frustrated";
  return "Hostile";
}

function publicGoals(session, spec) {
  return projectGoals(spec, session);
}

function availability(session) {
  return Object.fromEntries(Object.keys(session.npcs || {}).map((id) => [id, true]));
}

function initialPublic(session, spec) {
  return {
    mood_label: moodLabel(session.npcs.maya ? session.npcs.maya.mood : 50),
    goals: publicGoals(session, spec),
    next_hint: nextHintFor(session.goals),
    npc_availability: availability(session),
    ended: false,
  };
}

function debugOf(res) {
  return {
    events: res.trace.events,
    act: res.trace.act,
    source: res.trace.replySource,
    provider: selectedProvider,
    guard: res.trace.guardEvents,
    latencyMs: res.trace.latencyMs,
    stages: res.trace.stages,
    manifest: manifest.id,
    turn: res.turnId,
    delivered: res.delivered,
    regen: res.regen,
    fallback: res.usedFallback ? res.fallbackAct : null,
    npcFailure: res.trace.npcFailure || null,
    npcHttpStatus: res.trace.npcHttpStatus,
  };
}

export function warnNpcFallback(npcId, trace, spec) {
  const reasons = new Set(["TIMEOUT", "PROVIDER_ERROR", "OUTPUT_INVALID", "PROVIDER_UNAVAILABLE", "LLM_BUDGET_EXCEEDED", "THROTTLED", "RATE_LIMITED", "INVALID_JSON", "SCHEMA_INVALID", "EMPTY_OUTPUT", "GUARD_REJECTED"]);
  const reason = reasons.has(trace?.npcFailure) ? trace.npcFailure : "PROVIDER_ERROR";
  const httpStatus = Number.isInteger(trace?.npcHttpStatus) && trace.npcHttpStatus >= 400 && trace.npcHttpStatus <= 599 ? trace.npcHttpStatus : undefined;
  const npc = spec?.npcs?.some((candidate) => candidate.id === npcId) ? npcId : "maya";
  console.warn(JSON.stringify({ event: "npc_fallback", npc, reason, ...(httpStatus ? { httpStatus } : {}) }));
}

function withTimeout(promise, ms) {
  let timer = null;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("turn timeout"), { code: "TURN_TIMEOUT" })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

function restoreInPlace(obj, snapshotJson) {
  const data = JSON.parse(snapshotJson);
  for (const k of Object.keys(obj)) delete obj[k];
  Object.assign(obj, data);
}

export function createServer({ debug = false, staticHandler = null, feedbackProviders = { judge: liveProvider, coach: liveProvider }, debriefAssembler = assembleDebrief, npcProvider = null, registry = defaultRegistry, voiceConfig = loadVoiceConfig(), voiceProviders = null, voiceUploadTimeoutMs = 8000 } = {}) {
  const store = new SessionStore(engine);
  const convos = new Map();
  const contexts = new Map();
  const idem = new Map(); // `${sessionId}:${key}` -> response body
  const inflight = new Map(); // `${sessionId}:${key}` -> promise
  const debriefs = new Map();
  const sttProviders = voiceProviders || (voiceConfig.enabled
    ? voiceConfig.sttChain.map(() => createLocalVoiceProvider({ url: voiceConfig.localUrl, token: voiceConfig.localToken })) : []);
  const health = createVoiceHealth({ config: voiceConfig, provider: sttProviders[0] });
  if (voiceConfig.enabled) health.check();
  const handleVoice = createSttHandler({ config: voiceConfig, providers: sttProviders, health,
    getSession: (id) => store.getState(id), uploadTimeoutMs: voiceUploadTimeoutMs });
  const speechOptions = { config: voiceConfig, providers: sttProviders, localReady: async () => (await health.check()).tts,
    onFailure: () => health.unavailable(), log: (entry) => console.info(JSON.stringify(entry)) };
  const speech = createSpeechService(speechOptions);
  const coachSpeech = createSpeechService({ ...speechOptions, ended: true });
  function beginDebrief(session, retry = false) {
    let job = debriefs.get(session.id);
    if (job && (!retry || job.status === "pending" || job.retryUsed || job.status === "ready")) return job;
    const context = contexts.get(session.id);
    if (!context) return null;
    if (!job) job = { revision: 0, record: createScoreRecord(session, convos.get(session.id), context.pkg.spec, context.pkg.scoringProfile), retryUsed: false };
    if (retry) { job.retryUsed = true; job.revision++; coachSpeech.clear(session.id); }
    const previous = job.result || null;
    job.status = "pending"; job.result = previous;
    debriefs.set(session.id, job);
    job.promise = Promise.resolve().then(() => debriefAssembler({ record: structuredClone(job.record), providers: feedbackProviders, manifest, previous }))
      .then((result) => { job.result = result; job.status = result.status; })
      .catch(async () => {
        try { job.result = await assembleDebrief({ record: structuredClone(job.record), providers: {}, manifest, previous }); job.status = "partial"; }
        catch { job.status = "error"; }
      });
    return job;
  }
  const debriefBody = (job) => ({ status: job.status, debrief: !job.result ? null : !voiceConfig.enabled ? job.result : { ...job.result,
    moments: job.result.moments.map((moment, index) => ({ ...moment, moment_id: `${job.revision}-${index}` })) },
    retry_allowed: !job.retryUsed && ["partial", "error"].includes(job.status) });

  function send(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      ...(res.audioPolicy || { "access-control-allow-origin": "*" }),
      "access-control-allow-methods": "GET,POST,OPTIONS",
      "access-control-allow-headers": "content-type",
    });
    res.end(text);
  }

  function readBody(req) {
    return new Promise((resolve, reject) => {
      let n = 0;
      const chunks = [];
      req.on("data", (c) => {
        n += c.length;
        if (n > MAX_BODY) {
          reject(Object.assign(new Error("body too large"), { code: "TOO_LARGE" }));
          req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw) return resolve(null);
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(Object.assign(new Error("invalid JSON"), { code: "BAD_JSON" }));
        }
      });
      req.on("error", reject);
    });
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try { url = new URL(req.url || "/", "http://localhost"); }
    catch { send(res, 400, { error: "invalid request path" }); return; }
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const isAudio = path.includes("/audio");
    if (isAudio) {
      res.audioPolicy = { "cache-control": "no-store", vary: "Origin",
        ...(localOrigin(req.headers.origin) && req.headers.origin ? { "access-control-allow-origin": req.headers.origin } : {}) };
      for (const [key, value] of Object.entries(res.audioPolicy)) res.setHeader(key, value);
    }
    if (await handleVoice(req, res, path)) return;
    const audioPath = isAudio;
    if (req.method === "OPTIONS") {
      if (isAudio && !localOrigin(req.headers.origin)) { res.writeHead(403).end(); return; }
      res.writeHead(204, {
        ...(isAudio ? res.audioPolicy : { "access-control-allow-origin": "*" }),
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    try {
      const audioMatch = /^\/sessions\/([^/]+)\/turns\/([^/]+)\/audio$/.exec(path);
      const momentMatch = /^\/sessions\/([^/]+)\/debrief\/moments\/([^/]+)\/audio$/.exec(path);
      if (isAudio) {
        if (!localOrigin(req.headers.origin)) { send(res, 403, { error: "voice_unavailable" }); return; }
        const match = audioMatch || momentMatch;
        if (!match || req.method !== "GET" || url.search) { send(res, 404, { error: "not found" }); return; }
        let id, itemId;
        try { id = decodeURIComponent(match[1]); itemId = decodeURIComponent(match[2]); } catch { send(res, 404, { error: "not found" }); return; }
        const session = store.getState(id);
        let result;
        if (momentMatch) {
          const job = debriefs.get(id);
          const index = /^(\d+)-(0|[1-9]\d*)$/.exec(itemId);
          const moment = index && job?.result?.moments[Number(index[2])];
          if (!voiceConfig.enabled || !session?.ended || !job || !["ready", "partial"].includes(job.status) || !index || String(job.revision) !== index[1] || !moment || typeof moment.better_reply !== "string" || !moment.better_reply.trim()) { send(res, 404, { error: "not found" }); return; }
          const revision = job.revision;
          coachSpeech.prefetch(session, { id: itemId, speaker: "npc", npcId: "alex_coach", text: moment.better_reply });
          result = await coachSpeech.audio(session, itemId);
          if (job.revision !== revision || !["ready", "partial"].includes(job.status)) result = null;
        } else {
          const turn = convos.get(id)?.turns.find((candidate) => String(candidate.id) === itemId);
          if (!session || session.ended || !turn || turn.speaker !== "npc") { send(res, 404, { error: "not found" }); return; }
          result = await speech.audio(session, itemId);
        }
        if (!result) { send(res, 404, { error: "not found" }); return; }
        if (result.speech) { send(res, 200, { speech: result.speech }); return; }
        res.writeHead(200, { "content-type": result.mime, "content-length": result.audio.length }); res.end(result.audio); return;
      }
      const debriefMatch = /^\/sessions\/([^/]+)\/debrief(\/retry)?$/.exec(path);
      if (debriefMatch && ((req.method === "GET" && !debriefMatch[2]) || (req.method === "POST" && debriefMatch[2]))) {
        const session = store.getState(decodeURIComponent(debriefMatch[1]));
        if (!session || !contexts.has(session.id)) { send(res, 404, { error: "unknown session" }); return; }
        if (!session.ended) { send(res, 409, { status: "not_ready", error: "end the session first" }); return; }
        if (inflight.has(session.id)) { send(res, 202, { status: "pending", debrief: null, retry_allowed: false }); return; }
        const existing = debriefs.get(session.id);
        if (debriefMatch[2] && existing && existing.status !== "pending" && (existing.retryUsed || existing.status === "ready")) {
          send(res, 409, { error: "feedback retry is unavailable", ...debriefBody(existing) }); return;
        }
        const job = beginDebrief(session, !!debriefMatch[2]);
        send(res, job.status === "pending" ? 202 : 200, debriefBody(job)); return;
      }
      if (req.method === "GET" && path === "/scenarios") { send(res, 200, registry.listScenarios()); return; }
      // GET /scenarios/{id} — briefing + visible goals only (R-03/R-08).
      if (req.method === "GET" && path.startsWith("/scenarios/")) {
        const id = decodeURIComponent(path.slice("/scenarios/".length));
        const pkg = !id.includes("/") ? registry.getScenario(id) : null;
        if (!pkg) {
          send(res, 404, { error: "unknown scenario" });
          return;
        }
        send(res, 200, publicScenario(pkg));
        return;
      }
      // POST /sessions
      if (req.method === "POST" && path === "/sessions") {
        const body = await readBody(req);
        const sid = body && body.scenario_id;
        const pkg = registry.getScenario(sid);
        if (!pkg) {
          send(res, 400, { error: "unknown scenario_id" });
          return;
        }
        if (body && Object.prototype.hasOwnProperty.call(body, "customisation")) { send(res, 400, { error: "customisation is not supported", retryable: false }); return; }
        const sliders = validateSliders(body && body.sliders);
        if (!sliders.ok) { send(res, 400, { error: "sliders must be integer values from 0 to 100", retryable: false }); return; }
        const offline = createOfflineProviders(pkg);
        if (!offline?.store || typeof offline.npcProvider !== "function" || typeof offline.classifyProviderFor !== "function") { send(res, 400, { error: "unsupported scenario_id" }); return; }
        const runtime = Object.freeze({ scenarioId: pkg.spec.id, policyId: pkg.policy.id, policyVersion: pkg.policy.version, engine: pkg.policy.engine, rules: pkg.policy.rules });
        const context = Object.freeze({ pkg, runtime, store: offline.store, npcProvider: npcProvider || liveProvider || offline.npcProvider, classifyProviderFor: offline.classifyProviderFor });
        const session = store.create(pkg.spec, { seed: (Date.now() % 100000) + Math.floor(Math.random() * 1000), locale: "en", sliders: sliders.value, runtime });
        session.identity = pkg.identity;
        contexts.set(session.id, context);
        convos.set(session.id, createConversation());
        send(res, 200, {
          session_id: session.id,
          briefing: pkg.spec.briefing.en,
          settings: sliders.value, difficulty: difficultyFor(sliders.value),
          public_state: initialPublic(session, pkg.spec),
          manifest: debug ? manifest.id : undefined,
        });
        return;
      }
      const endMatch = /^\/sessions\/([^/]+)\/end$/.exec(path);
      if (req.method === "POST" && endMatch) {
        const id = decodeURIComponent(endMatch[1]);
        const session = store.getState(id);
        const context = session && contexts.get(session.id);
        if (!session || !context) { send(res, 404, { error: "unknown session" }); return; }
        if (inflight.has(id)) { send(res, 409, { error: "wait for the current turn", retryable: true }); return; }
        engine.endSession(session);
        speech.clear(session.id);
        beginDebrief(session);
        send(res, 200, { ended: true, end_reason: session.endReason, public_state: { ...initialPublic(session, context.pkg.spec), ended: true } });
        return;
      }
      // POST /sessions/{id}/turn
      const turnMatch = /^\/sessions\/([^/]+)\/turn$/.exec(path);
      if (req.method === "POST" && turnMatch) {
        const sessionId = decodeURIComponent(turnMatch[1]);
        const session = store.getState(sessionId);
        const convo = convos.get(sessionId);
        const context = session && contexts.get(session.id);
        if (!session || !convo || !context) {
          send(res, 404, { error: "unknown session" });
          return;
        }
        const body = await readBody(req);
        if (body && (Object.prototype.hasOwnProperty.call(body, "sliders") || Object.prototype.hasOwnProperty.call(body, "customisation"))) { send(res, 400, { error: "settings are fixed for this session", retryable: false }); return; }
        const npcId = body && body.npc_id;
        const text = body && body.text;
        const key = body && body.idempotencyKey;
        if (!session.npcs[npcId]) {
          send(res, 400, { error: "unknown npc_id", retryable: false });
          return;
        }
        if (typeof text !== "string" || text.trim().length === 0 || text.length > MAX_TEXT) {
          send(res, 400, { error: "text must be 1..2000 chars", retryable: false });
          return;
        }
        if (key !== undefined && (typeof key !== "string" || key.length === 0 || key.length > 128)) {
          send(res, 400, { error: "idempotencyKey must be a short string", retryable: false });
          return;
        }
        const ck = key ? `${sessionId}:${key}` : null;
        if (ck && idem.has(ck)) {
          send(res, 200, idem.get(ck));
          return;
        }
        if (ck && inflight.has(ck)) {
          try {
            send(res, 200, await inflight.get(ck));
          } catch {
            send(res, 503, { error: "turn in flight failed; retry with the same key", retryable: true });
          }
          return;
        }
        if (session.ended) { send(res, 409, { error: "session ended", retryable: false }); return; }
        if (inflight.has(sessionId)) { send(res, 409, { error: "wait for the current turn", retryable: true }); return; }
        const snapSession = JSON.stringify(session);
        const snapConvo = JSON.stringify(convo);
        const attempt = (async () => {
          const out = await withTimeout(
            runTurn({
              session,
              scenario: context.pkg.spec,
              convo,
              npcId,
              text,
              engine, runtime: context.runtime,
              providers: { classify: liveProvider || context.classifyProviderFor(text), npc: context.npcProvider },
              manifestId: manifest.id,
              store: context.store,
            }),
            liveProvider ? 180000 : TURN_TIMEOUT_MS, // includes capped live Retry-After and guard regeneration
          );
          if (out.usedFallback) warnNpcFallback(npcId, out.trace, context.pkg.spec);
          const pub = publicResponse(out);

          // TTS is strictly after the guarded row and public response exist.
          const npcTurn = convo.turns[convo.turns.length - 1];
          if (!out.ended && npcTurn?.speaker === "npc") {
            try { pub.speech = speech.prefetch(session, npcTurn); } catch { /* text turn remains authoritative */ }
          }
          if (debug) pub._debug = { ...debugOf(out), tts_provider: pub.speech.mode === "server" ? "local" : pub.speech.mode, tts_latency_ms: null };
          return pub;
        })();
        if (ck) inflight.set(ck, attempt);
        inflight.set(sessionId, attempt);
        try {
          const bodyOut = await attempt;
          inflight.delete(sessionId);
          if (bodyOut.ended) { speech.clear(session.id); beginDebrief(session); }
          if (ck) {
            idem.set(ck, bodyOut);
            inflight.delete(ck);
          }
          send(res, 200, bodyOut);
        } catch (e) {
          inflight.delete(sessionId);
          if (ck) inflight.delete(ck);
          // Roll back the partial mutation so a same-key retry applies once.
          try {
            restoreInPlace(session, snapSession);
            restoreInPlace(convo, snapConvo);
          } catch {
            // Restore itself failed; safest is to end use of this session.
            send(res, 500, { error: "turn failed and state could not be restored; start a new session", retryable: false });
            return;
          }
          const timeout = e && e.code === "TURN_TIMEOUT";
          send(res, timeout ? 504 : 503, {
            error: timeout ? "turn timed out; retry with the same idempotency key" : "turn failed; retry with the same idempotency key",
            retryable: true,
          });
        }
        return;
      }
      if (path === "/sessions" || path.startsWith("/sessions/") || path === "/scenarios" || path.startsWith("/scenarios/")) { send(res, 404, { error: "not found" }); return; }
      if (staticHandler && staticHandler(req, res)) return;
      send(res, 404, { error: "not found" });
    } catch (e) {
      const code = e && e.code;
      if (code === "BAD_JSON" || code === "TOO_LARGE") {
        send(res, 400, { error: "invalid request body", retryable: false });
        return;
      }
      send(res, 500, { error: "internal error" });
    }
  });

  server.on("close", () => { health.close(); for (const id of convos.keys()) { speech.clear(id); coachSpeech.clear(id); } });

  // Server-only test seam; the HTTP API never projects this context.
  const resolveSessionContext = (sessionId) => contexts.get(sessionId) || null;
  return { server, manifestId: manifest.id, resolveSessionContext };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  const debug = process.argv.includes("--debug") || process.env.CUBICLE_DEBUG === "1";
  const port = Number(process.env.PORT || 8787);
  const { server, manifestId } = createServer({ debug });
  server.listen(port, () => {
    console.log(`cubicle api listening on http://localhost:${port} debug=${debug ? "on" : "off"} ${manifestId}`);
  });
}
