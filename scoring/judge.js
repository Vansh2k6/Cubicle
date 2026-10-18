import { readFileSync } from "node:fs";
import { complete } from "../llm/gateway.js";
import { createManifest } from "../llm/manifest.js";
import { loadConfig } from "../llm/config.js";
import { scoreSession } from "./score.js";
import { validateQuote, personalLabel } from "./quotes.js";
export const DIMENSIONS = Object.freeze(["honest_status", "ownership", "recovery_planning", "communication", "collaboration_under_pushback"]);
const prompt = readFileSync(new URL("../llm/prompts/judge/v2.md", import.meta.url), "utf8");
export const JUDGE_SCHEMA = {
  type: "object", required: ["dimensions"], additionalProperties: false,
  properties: { dimensions: { type: "array", minItems: 5, maxItems: 5, items: {
    type: "object", additionalProperties: false, required: ["id", "score", "turn_id", "quote", "explanation"], properties: {
      id: { enum: DIMENSIONS }, score: { type: ["integer", "null"], minimum: 0, maximum: 5 },
      turn_id: { type: ["integer", "string", "null"] }, quote: { type: "string" }, explanation: { type: "string", minLength: 1 },
    },
  } } },
};
export async function judgeSession({ record, scenario = record.scenario, provider, manifest = createManifest(loadConfig()) }) {
  const deterministic = scoreSession(record, scenario);
  if (!record.session.ended) return { status: "pending", points: 0, cap: 25, dimensions: [], deterministic: deterministic.deterministic,
    manifestId: manifest.id, attempts: 0, source: "unavailable" };
  const turns = (record.convo?.turns || []).map(({ id, speaker, npcId, text }) => ({ id, speaker, npcId, text }));
  const achievements = deterministic.ledger.filter((r) => r.metric !== "relationship").map(({ metric, source_id, points }) => ({ metric, source_id, points }));
  const result = await complete({ role: "judge", provider: typeof provider === "function" ? provider : async () => { throw { code: "PROVIDER_UNAVAILABLE" }; }, manifestId: manifest.id, schema: JUDGE_SCHEMA, temperature: 0,
    system: prompt, messages: [{ role: "user", content: JSON.stringify({ transcript: turns, already_scored_elsewhere_do_not_reward: achievements }) }],
    validateData: (data) => data.dimensions.length === 5 && new Set(data.dimensions.map((d) => d.id)).size === 5 && data.dimensions.every((d) => d.explanation.trim().length > 0),
  });
  const dimensions = DIMENSIONS.map((id) => {
    const d = result.ok ? result.data.dimensions.find((d) => d.id === id) : null;
    const valid = d && d.score !== null && validateQuote(turns, d.turn_id, d.quote) && !personalLabel(d.explanation);
    return valid ? { ...d, status: "verified", points: d.score, manifestId: manifest.id }
      : { id, score: null, points: 0, status: "insufficient", turn_id: null, quote: "", explanation: "There is not enough verified evidence for this assessment.", manifestId: manifest.id };
  });
  return { points: dimensions.reduce((n, d) => n + d.points, 0), cap: 25, dimensions,
    deterministic: deterministic.deterministic, manifestId: manifest.id, attempts: result.attempts, source: result.source };
}
