// src/api.js — Minimal turn-API client (P2c). Same endpoints as the text-only
// harness (services/api/client.mjs). No sealed data is stored here; the server
// returns briefing + public state only (R-08). ESM, no dependencies.

import { apiBase } from "./apiBase.js";
const BASE = apiBase(window.__CUBICLE_API, import.meta.env.DEV);

async function req(path, { method = "GET", body = null, timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { "content-type": "application/json" } : {},
      body: body ? JSON.stringify(body) : null,
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error((data && data.error) || `Request failed (${res.status})`);
      err.status = res.status;
      err.retryable = !!(data && data.retryable);
      throw err;
    }
    return data;
  } catch (e) {
    if (e && e.name === "AbortError") {
      const err = new Error("The conversation server is taking too long. Retry when ready.");
      err.retryable = true;
      err.timeout = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const createSession = (scenario_id, sliders) =>
  req("/sessions", { method: "POST", body: { scenario_id, ...(sliders ? { sliders } : {}) } });
export const getScenario = (scenario_id) => req(`/scenarios/${encodeURIComponent(scenario_id)}`);

export const endSession = (sessionId) =>
  req(`/sessions/${encodeURIComponent(sessionId)}/end`, { method: "POST", body: {} });
export const getDebrief = (sessionId) => req(`/sessions/${encodeURIComponent(sessionId)}/debrief`);
export const retryDebrief = (sessionId) => req(`/sessions/${encodeURIComponent(sessionId)}/debrief/retry`, { method: "POST", body: {} });

export const sendTurn = (sessionId, npc_id, text, idempotencyKey) =>
  req(`/sessions/${encodeURIComponent(sessionId)}/turn`, {
    method: "POST",
    body: { npc_id, text, idempotencyKey },
  });

export const newKey = () =>
  window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : `web-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
