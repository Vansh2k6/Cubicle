// src/api.js — Minimal turn-API client (P2c). Same endpoints as the text-only
// harness (services/api/client.mjs). No sealed data is stored here; the server
// returns briefing + public state only (R-08). ESM, no dependencies.

import { apiBase } from "./apiBase.js";
const BASE = apiBase(window.__CUBICLE_API, import.meta.env ? import.meta.env.DEV : false);

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

// Voice uses an audio body, never the JSON turn transport. These helpers expose
// only the small public STT contract and deliberately discard backend wording.
export async function getVoiceStatus() {
  const data = await req("/voice/status");
  return {
    enabled: data && data.enabled === true,
    stt: data && data.stt === true,
    tts_mode: data && data.tts_mode === "none" ? "none" : "none",
  };
}

export async function transcribeAudio(sessionId, audio, { signal, timeoutMs = 18000 } = {}) {
  if (signal && signal.aborted) {
    const cancelled = new Error("voice_cancelled");
    cancelled.code = "voice_cancelled";
    throw cancelled;
  }
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const abort = () => controller.abort();
  if (signal) signal.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`${BASE}/sessions/${encodeURIComponent(sessionId)}/voice/stt`, {
      method: "POST",
      headers: { "content-type": audio.type },
      body: audio,
      signal: controller.signal,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error("voice_unavailable");
      error.code = typeof data.error === "string" ? data.error : "voice_unavailable";
      throw error;
    }
    const text = typeof data.text === "string" ? data.text.trim() : "";
    if (text.length > 500) {
      const error = new Error("voice_too_long");
      error.code = "voice_too_long";
      throw error;
    }
    return {
      text,
      duration_ms: Number.isInteger(data.duration_ms) && data.duration_ms >= 0 && data.duration_ms <= 30000 ? data.duration_ms : null,
      provider: data.provider === "local" ? "local" : "",
    };
  } catch (error) {
    if (controller.signal.aborted) {
      const cancelled = new Error(timedOut ? "voice_timeout" : "voice_cancelled");
      cancelled.code = timedOut ? "voice_timeout" : "voice_cancelled";
      throw cancelled;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (signal) signal.removeEventListener("abort", abort);
  }
}

export const newKey = () =>
  window.crypto && window.crypto.randomUUID
    ? window.crypto.randomUUID()
    : `web-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
