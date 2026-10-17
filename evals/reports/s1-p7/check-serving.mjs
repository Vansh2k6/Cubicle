// Offline acceptance evidence: actual built assets and private-path rejection.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { fileURLToPath } from "node:url";
for (const name of Object.keys(process.env)) if (/^(LLM_|GROQ_|OPENAI_|ANTHROPIC_|RUN_LIVE$|CUBICLE_DEBUG$)/i.test(name)) delete process.env[name];
const { createServer } = await import("../../../services/api/server.js");
const { createStaticHandler } = await import("../../../services/static.js");
const root = new URL("../../../", import.meta.url);
const reportFile = new URL("../s1-14-verification.json", import.meta.url);
const report = JSON.parse(readFileSync(reportFile, "utf8"));
const servers = [], paths = [];
async function launch(staticHandler = null) {
  const { server } = createServer({ debug: false, staticHandler }); servers.push(server);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return server.address().port;
}
function request(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: "127.0.0.1", port, path, method }, (res) => {
      const data = []; res.on("data", (chunk) => data.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(data).toString() }));
    }); req.on("error", reject); req.end();
  });
}
try {
  const demo = await launch(createStaticHandler(fileURLToPath(new URL("dist/", root))));
  const api = await launch();
  for (const [name, port] of [["built", demo], ["api", api]]) {
    for (const path of ["/CONTEXT/AGENT.md", "/scenarios/missed_deadline.json", "/llm/prompts/npc/v3-tone.json", "/replies/missed_deadline.en.json", "/.env", "/evals/reports/test.json", "/src/main.js", "/engine/config.js", "/assets/%2e%2e/index.html", "/%43ONTEXT/AGENT.md", "/.git/config"]) {
      const res = await request(port, path); assert.ok([403, 404].includes(res.status), `${name} ${path}: ${res.status}`);
      paths.push({ server: name, path, status: res.status });
    }
  }
  const page = await request(demo, "/"); assert.equal(page.status, 200); assert.match(page.headers["content-type"], /text\/html/);
  const head = await request(demo, "/", "HEAD"); assert.equal(head.status, 200); assert.equal(head.body, ""); assert.equal(head.headers["content-length"], page.headers["content-length"]);
  const assets = [...page.body.matchAll(/(?:src|href)="([^"#?]+\.(?:js|css))"/g)].map((match) => match[1]);
  assert.ok(assets.some((path) => path.endsWith(".js"))); assert.ok(assets.some((path) => path.endsWith(".css")));
  for (const path of assets) {
    const res = await request(demo, path); assert.equal(res.status, 200);
    assert.match(res.headers["content-type"], path.endsWith(".js") ? /javascript/ : /text\/css/);
    assert.equal(res.headers["x-content-type-options"], "nosniff"); paths.push({ server: "built", path, status: res.status });
  }
  assert.equal((await request(demo, "/sessions/unknown")).status, 404);
  assert.equal((await request(demo, "//[")).status, 400);
  assert.equal((await request(demo, "/")).status, 200);
  const hashesAfter = Object.fromEntries(Object.keys(report.hashes_before).map((path) => [path, createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex").toUpperCase()]));
  const drift = Object.keys(report.hashes_before).filter((path) => report.hashes_before[path].toUpperCase() !== hashesAfter[path]);
  assert.deepEqual(drift, []);
  report.hashes_after = hashesAfter;
  report.serving = { passed: true, paths, html_head: "PASS", malformed_recovery: "PASS", runtime_inputs: Object.keys(hashesAfter).length, hash_drift: drift };
  writeFileSync(reportFile, JSON.stringify(report, null, 2) + "\n");
  console.log(`Built serving PASS: ${paths.length} path checks, HTML/HEAD/MIME/recovery PASS, ${Object.keys(hashesAfter).length} runtime hashes unchanged.`);
} finally {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
}
