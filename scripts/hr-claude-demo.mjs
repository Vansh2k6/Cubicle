// Opt-in Haiku-only HR preview. Existing deadline sessions remain offline.
import {mkdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createAnthropicProvider} from "../llm/providers/anthropic.js";

if (process.env.RUN_LIVE !== "1" || !process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error("HR Claude preview requires RUN_LIVE=1 and a server-side ANTHROPIC_API_KEY.");
  process.exit(1);
}
const key = process.env.ANTHROPIC_API_KEY;
// Never let an inherited Groq setting enable paid calls in scenario one.
process.env.LLM_PROVIDER = "offline";
delete process.env.GROQ_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
mkdirSync(new URL("../out/", import.meta.url), {recursive: true});
const provider = createAnthropicProvider({apiKey: key, budgetPath: fileURLToPath(new URL("../out/claude-hr-testing.json", import.meta.url)), maxUsd: 0.50});
const {createServer} = await import("../services/api/server.js");
const {createStaticHandler} = await import("../services/static.js");
const {server} = createServer({hrProvider: provider, staticHandler: createStaticHandler(fileURLToPath(new URL("../dist/", import.meta.url)))});
const port = Number(process.env.PORT || 5191);
server.listen(port, "127.0.0.1", () => console.log(`HR Haiku preview: http://127.0.0.1:${port} (persistent phase cap $0.50; deadline offline)`));
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => server.close(() => process.exit()));
