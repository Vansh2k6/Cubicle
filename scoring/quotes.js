export function normalizeQuote(text) {
  return String(text ?? "").normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[‐‑‒–—−]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();
}
export function validateQuote(turns, turnId, quote) {
  const turn = (turns || []).find((t) => String(t.id) === String(turnId));
  const normalized = normalizeQuote(quote);
  // Partial-word substrings are accepted, matching the documented normalized substring contract.
  return !!turn && turn.speaker === "user" && normalized.length > 0 && normalizeQuote(turn.text).includes(normalized);
}
export const personalLabel = (text) => /\byou(?:'re| are)\s+(?:just\s+)?(?:an?\s+)?(?:bad|lazy|stupid|incompetent|hopeless|terrible|failure|idiot|worthless)\b/.test(normalizeQuote(text));
