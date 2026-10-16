// services/api/server.js — Minimal Node built-in HTTP API (P2c, ARCHITECTURE.md §18 slice).
// Endpoints: POST /sessions, POST /sessions/{id}/turn, GET /scenarios/{id}.
// Server-side spec only (R-08): the client receives briefing + visible goals.
// Offline only: runTurn is wired to deterministic stub providers (D-28: no live
// LLM, Groq wiring deferred). Debug fields (_debug) are emitted only when
// CUBICLE_DEBUG=1 or --debug is set (R-03); shared-demo builds run without it.
// Idempotency: a turn request may carry idempotencyKey. Completed responses are
// cached per key and replayed without re-applying engine state; a failed
// attempt rolls its session/convo mutation back so a same-key retry applies
// exactly once. ESM, Node stdlib only (R-65).

import http from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as engine from "../../engine/engine.js";
import { SessionStore } from "../../engine/store.js";
import { createConversation, runTurn, publicResponse, projectGoals, nextHintFor } from "../../llm/pipeline.js";
import { createManifest } from "../../llm/manifest.js";
import { classifyProviderFor, npcFn } from "./offlineProviders.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPEC = JSON.parse(readFileSync(join(root, "scenarios", "missed_deadline.json"), "utf8"));

// Frontend scenario keys ("deadline") map to the server-side spec id.
const SCENARIO_ALIASES = { deadline: "missed_deadline", missed_deadline: "missed_deadline" };

const TURN_TIMEOUT_MS = 15000;
const MAX_TEXT = 2000;
const MAX_BODY = 1 << 20;

const manifest = createManifest({
  classifier: { model: "offline-stub:rules-v1", promptVersion: "v1", schemaVersion: 1 },
  npc: { model: "offline-stub:store-v1", promptVersion: "v1", schemaVersion: 1 },
  judge: { model: "pending-provider:judge", promptVersion: "v1", schemaVersion: 1 },
  coach: { model: "pending-provider:coach", promptVersion: "v1", schemaVersion: 1 },
});

function moodLabel(mood) {
  const m = Number(mood) || 0;
  if (m >= 65) return "Calm";
  if (m >= 40) return "Tense";
  if (m >= 20) return "Frustrated";
  return "Hostile";
}

function publicGoals(session) {
  return projectGoals(SPEC, session);
}

function availability(session) {
  return Object.fromEntries(Object.keys(session.npcs || {}).map((id) => [id, true]));
}

function initialPublic(session) {
  return {
    mood_label: moodLabel(session.npcs.maya ? session.npcs.maya.mood : 50),
    goals: publicGoals(session),
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
    provider: "offline-stub (no live LLM)",
    guard: res.trace.guardEvents,
    latencyMs: res.trace.latencyMs,
    stages: res.trace.stages,
    manifest: manifest.id,
    turn: res.turnId,
    delivered: res.delivered,
    regen: res.regen,
    fallback: res.usedFallback ? res.fallbackAct : null,
  };
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

export function createServer({ debug = false } = {}) {
  const store = new SessionStore(engine);
  const convos = new Map();
  const idem = new Map(); // `${sessionId}:${key}` -> response body
  const inflight = new Map(); // `${sessionId}:${key}` -> promise

  function send(res, status, body) {
    const text = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
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
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type",
      });
      res.end();
      return;
    }
    try {
      // GET /scenarios/{id} — briefing + visible goals only (R-03/R-08).
      if (req.method === "GET" && path.startsWith("/scenarios/")) {
        const id = decodeURIComponent(path.slice("/scenarios/".length));
        if (SCENARIO_ALIASES[id] !== "missed_deadline" || id.includes("/")) {
          send(res, 404, { error: "unknown scenario" });
          return;
        }
        send(res, 200, {
          id: SPEC.id,
          title: SPEC.title,
          briefing: SPEC.briefing.en,
          difficulty: SPEC.difficulty,
          duration_min: SPEC.duration_min,
          goals: (SPEC.goals || []).filter((g) => g.visible).map((g) => ({ id: g.id, label: g.label, requires: Array.isArray(g.requires) ? g.requires : [] })),
          npcs: (SPEC.npcs || []).map((n) => ({ id: n.id, name: n.name, role: n.role })),
        });
        return;
      }
      // POST /sessions
      if (req.method === "POST" && path === "/sessions") {
        const body = await readBody(req);
        const sid = body && body.scenario_id;
        if (SCENARIO_ALIASES[sid] !== "missed_deadline") {
          send(res, 400, { error: "unknown scenario_id" });
          return;
        }
        const session = store.create(SPEC, { seed: (Date.now() % 100000) + Math.floor(Math.random() * 1000), locale: "en" });
        convos.set(session.id, createConversation());
        send(res, 200, {
          session_id: session.id,
          briefing: SPEC.briefing.en,
          public_state: initialPublic(session),
          manifest: debug ? manifest.id : undefined,
        });
        return;
      }
      // POST /sessions/{id}/turn
      const turnMatch = /^\/sessions\/([^/]+)\/turn$/.exec(path);
      if (req.method === "POST" && turnMatch) {
        const sessionId = decodeURIComponent(turnMatch[1]);
        const session = store.getState(sessionId);
        const convo = convos.get(sessionId);
        if (!session || !convo) {
          send(res, 404, { error: "unknown session" });
          return;
        }
        if (session.ended) {
          send(res, 409, { error: "session ended", retryable: false });
          return;
        }
        const body = await readBody(req);
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
        const snapSession = JSON.stringify(session);
        const snapConvo = JSON.stringify(convo);
        const attempt = (async () => {
          const out = await withTimeout(
            runTurn({
              session,
              scenario: SPEC,
              convo,
              npcId,
              text,
              engine,
              providers: { classify: classifyProviderFor(text), npc: npcFn },
              manifestId: manifest.id,
            }),
            TURN_TIMEOUT_MS,
          );
          const pub = publicResponse(out);
          if (debug) pub._debug = debugOf(out);
          return pub;
        })();
        if (ck) inflight.set(ck, attempt);
        try {
          const bodyOut = await attempt;
          if (ck) {
            idem.set(ck, bodyOut);
            inflight.delete(ck);
          }
          send(res, 200, bodyOut);
        } catch (e) {
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

  return { server, manifestId: manifest.id };
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
