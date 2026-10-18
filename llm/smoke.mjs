import { fileURLToPath } from "node:url";
import { complete } from "./gateway.js";
import { providerName, positiveInt } from "./config.js";
import { createGroqProvider } from "./providers/groq.js";

export async function runSmoke({ env = process.env, fetchFn = globalThis.fetch } = {}) {
  if (env.RUN_LIVE !== "1") throw new Error("Smoke refused: RUN_LIVE=1 required");
  if (providerName(env) !== "groq") throw new Error("Smoke refused: configured Groq provider required");
  let calls = 0;
  const provider = createGroqProvider({ env: { ...env, LLM_MAX_CALLS: String(Math.min(3, positiveInt(env.LLM_MAX_CALLS, 40))) }, fetchFn: (...args) => {
    if (++calls > 3) throw new Error("Smoke call limit reached");
    return fetchFn(...args);
  } });
  const summaries = [];
  for (const role of ["classifier", "npc"]) {
    const schema = role === "classifier"
      ? { type: "object", required: ["events"], properties: { events: { type: "array" } } }
      : { type: "object", required: ["text"], properties: { text: { type: "string" } } };
    const result = await complete({ role, provider, schema, system: "Return a JSON object. For a classifier return events as an empty array; for an NPC return text containing a brief hello.", messages: [{ role: "user", content: "Hello." }] });
    summaries.push({ role, latencyMs: result.latencyMs, jsonValidated: result.ok });
  }
  return { calls, results: summaries };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(await runSmoke())); }
  catch { console.error("Smoke refused or failed; RUN_LIVE=1 and configured Groq are required."); process.exitCode = 1; }
}
