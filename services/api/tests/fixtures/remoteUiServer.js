// Isolated loopback UI evidence server. The application imports public JSON only.
import { remoteProofRegistry } from "./remoteProof.js";
import { fileURLToPath } from "node:url";
import { loadVoiceConfig } from "../../../../voice/config.js";

export async function startRemoteUiServer(port = 0) {
  if (process.env.LLM_PROVIDER && process.env.LLM_PROVIDER !== "offline") throw new Error("The private UI fixture requires offline providers.");
  const {createServer} = await import("../../server.js");
  const packages = remoteProofRegistry();
  const registry = {getScenario: (id) => packages.getScenario(id === "deadline" ? "private_remote_proof" : id), listScenarios: () => packages.listScenarios()};
  const app = createServer({registry, feedbackProviders: {}, voiceConfig: loadVoiceConfig({})});
  await new Promise((resolve) => app.server.listen(port, "127.0.0.1", resolve));
  return {...app, base: `http://127.0.0.1:${app.server.address().port}`, close: () => new Promise((resolve) => { app.server.closeAllConnections(); app.server.close(resolve); })};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await startRemoteUiServer();
  console.log(`Private UI fixture API: ${app.base}`);
}
