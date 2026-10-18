import { readFileSync } from "node:fs";
import { complete } from "../llm/gateway.js";
import { createManifest } from "../llm/manifest.js";
import { loadConfig } from "../llm/config.js";
import { echoCorpus, keywordHitsForFact, semanticHitForFact, canonCheck } from "../llm/guards.js";
import { scoreSession } from "./score.js";
import { validateQuote, personalLabel, normalizeQuote } from "./quotes.js";
const prompt = readFileSync(new URL("../llm/prompts/coach/v2.md", import.meta.url), "utf8");
const text = { type: "string", minLength: 1 };
export const COACH_SCHEMA = { type: "object", additionalProperties: false,
  required: ["turn_id", "quote", "what_went_well", "what_happened", "why_it_matters", "better_reply"],
  properties: { turn_id: { type: ["integer", "string"] }, quote: text, what_went_well: text, what_happened: text, why_it_matters: text, better_reply: text } };
export function safeHistoricalText(value, scenario, known, history = {}) {
  if (typeof value !== "string" || !value.trim()) return false;
  const corpus = echoCorpus(); // A guessed secret in user words never authorizes a coaching answer.
  let canonText = normalizeQuote(value);
  // Exact already-delivered fact spans are verified; surrounding new claims still pass the canon guard.
  const knownTexts = scenario.facts.filter((f) => known.includes(f.id)).map((f) => f.content.en);
  for (const content of knownTexts) canonText = canonText.split(normalizeQuote(content)).join(" ");
  const permitted = echoCorpus({ userSaid: history.userSaid || [], revealedTexts: knownTexts, commitments: history.commitments || [] });
  const canon = canonCheck(canonText, { scenario, corpus: permitted, clockDay: scenario.clock.day,
    authorisedFactId: known.includes("F1") ? "F1" : null });
  // The canon guard treats any scope mention as material; these neutral inquiries assert no scope change.
  const neutralScopeQuestion = /^(?:what is the scope|can we clarify the scope|could you clarify the scope)\?$/.test(canonText);
  return canon.every((failure) => failure.code === "canon_invented_scope" && neutralScopeQuestion) && !personalLabel(value) && scenario.facts.filter((f) => !known.includes(f.id)).every((f) =>
    keywordHitsForFact(value, scenario, f.id, corpus, "en").length === 0 && !semanticHitForFact(value, scenario, f.id, corpus).hit);
}
export async function coachSession({ record, scenario = record.scenario, provider, manifest = createManifest(loadConfig()) }) {
  const deterministic = scoreSession(record, scenario);
  if (!record.session.ended) return { status: "pending", moments: [], manifestId: manifest.id, attempts: 0, source: "unavailable" };
  const turns = record.convo?.turns || [];
  const flag = deterministic.flags.find((f) => f.user_turn_id !== null && turns.some((t) => t.speaker === "user" && t.text.trim() && String(t.id) === String(f.user_turn_id)));
  const starter = { general: true, turn_id: null, quote: null, what_went_well: "You can take this practice at your own pace.",
    what_happened: "There is no verified flagged moment to review yet.", why_it_matters: "A clear question can help you understand the situation.",
    better_reply: "What should I understand before proposing a next step?", manifestId: manifest.id, source: "fallback" };
  if (!flag) return { moments: [starter], manifestId: manifest.id, attempts: 0 };
  const index = turns.findIndex((t) => t.speaker === "user" && String(t.id) === String(flag.user_turn_id));
  const original = turns[index];
  // Snapshot is AFTER a turn; current NPC disclosure is not known before this user moment.
  const before = (record.session.snapshots || []).filter((s) => s.turn < flag.turn_id).sort((a, b) => b.turn - a.turn)[0];
  const known = before?.user_known || [];
  const transcript = turns.slice(0, index + 1).map(({ id, speaker, npcId, text }) => ({ id, speaker, npcId, text }));
  const history = { userSaid: transcript.filter((t) => t.speaker === "user").map((t) => t.text), commitments: before?.commitments || [] };
  const preferred = scenario.facts.find((f) => f.id === flag.fact_id && !known.includes(f.id)) ||
    scenario.facts.find((f) => f.owner === original.npcId && !known.includes(f.id));
  const authored = preferred?.unlock_question?.en;
  const question = authored && safeHistoricalText(authored, scenario, known, history) ? authored : starter.better_reply;
  const fallback = { general: false, turn_id: original.id, quote: original.text,
    what_went_well: "You put your perspective into words.", what_happened: "This moment offers a chance to clarify the situation.",
    why_it_matters: "Checking missing information can make the next step clearer.", better_reply: question,
    manifestId: manifest.id, source: "fallback" };
  const valid = (data) => String(data.turn_id) === String(original.id) && validateQuote(transcript, data.turn_id, data.quote) &&
    [data.what_went_well, data.what_happened, data.why_it_matters, data.better_reply].every((value) => safeHistoricalText(value, scenario, known, history)) &&
    (() => { const sentences = (data.better_reply.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) || []).filter((s) => /[\p{L}\p{N}]/u.test(s)); return sentences.length >= 1 && sentences.length <= 3; })();
  const result = await complete({ role: "coach", provider: typeof provider === "function" ? provider : async () => { throw { code: "PROVIDER_UNAVAILABLE" }; }, manifestId: manifest.id, schema: COACH_SCHEMA, temperature: 0.7, validateData: valid,
    system: prompt, messages: [{ role: "user", content: JSON.stringify({ flag: { type: flag.type, turn_id: original.id }, original_user_turn: { id: original.id, text: original.text }, transcript,
      user_known: scenario.facts.filter((f) => known.includes(f.id)).map((f) => ({ id: f.id, content: f.content.en })) }) }],
  });
  const data = result.data;
  const moment = result.ok ? { general: false, turn_id: data.turn_id, quote: data.quote, what_went_well: data.what_went_well,
    what_happened: data.what_happened, why_it_matters: data.why_it_matters, better_reply: data.better_reply, manifestId: manifest.id, source: "llm" } : fallback;
  return { moments: [moment], manifestId: manifest.id, attempts: result.attempts };
}
