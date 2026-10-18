// llm/npc.js — NPC line generation: gateway (temp ~0.8) + shape guard.
// Trims to 1–3 sentences, strips stage directions, falls back on empty (R-12/R-13).

import { complete } from "./gateway.js";

const STAGE_PATTERNS = [
  /\*[^*\n]*\*+/g, // *actions*
  /\[[^\[\]\n]+\]/g, // [directions]
];
// NOTE (P2a): inline (parenthetical) asides are NOT stripped — only whole-line
// (directions) below — because legitimate content uses parens (e.g. F1 "3 days
// (Friday)"). The npc prompt forbids stage directions; mid-sentence survivors
// are caught by the S1-04 leak/canon guards, never silently kept as fact text.

export function stripStageDirections(text) {
  let out = String(text);
  for (const re of STAGE_PATTERNS) out = out.replace(re, " ");
  // Whole-line (parenthetical) directions.
  out = out.split("\n").filter((line) => !/^\s*\(.*\)\s*$/.test(line)).join("\n");
  return out.replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();
}

export function splitSentences(text) {
  const t = String(text).trim();
  if (!t) return [];
  const parts = t.match(/[^.!?]+[.!?]+["']?|\S[^.!?]*$/g) || [];
  return parts.map((s) => s.trim()).filter((s) => s.length > 0);
}

// generateNpcReply({prompt{system,messages}, provider, manifestId, fallback{text}|string, timeoutMs?})
// -> {text, source: llm|fallback, trimmed, manifestId}.
export async function generateNpcReply(opts = {}) {
  const { prompt, provider, manifestId = null, fallback, timeoutMs = 3000 } = opts;
  const fbText = typeof fallback === "string"
    ? fallback
    : (fallback && typeof fallback.text === "string" ? fallback.text : "Let me get back to you on that.");
  const res = await complete({
    role: "npc",
    system: prompt && prompt.system,
    messages: (prompt && prompt.messages) || [],
    schema: null,
    temperature: 0.8,
    timeoutMs,
    provider,
    manifestId,
    fallback: { fallback: true },
  });
  if (res.source !== "llm" || typeof res.text !== "string") {
    return { text: fbText, source: "fallback", trimmed: false, manifestId, failureCode: res.failureCode, httpStatus: res.httpStatus };
  }
  const cleaned = stripStageDirections(res.text);
  const sentences = splitSentences(cleaned);
  if (sentences.length === 0) {
    return { text: fbText, source: "fallback", trimmed: false, manifestId, failureCode: "EMPTY_OUTPUT" };
  }
  const trimmed = sentences.length > 3;
  return { text: sentences.slice(0, 3).join(" "), source: "llm", trimmed, manifestId };
}
