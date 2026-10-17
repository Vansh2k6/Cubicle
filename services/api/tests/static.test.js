import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { request as httpRequest } from "node:http";
import { createStaticHandler } from "../../static.js";
import { createServer } from "../server.js";
import { apiBase } from "../../../src/apiBase.js";

const fixtures = [], servers = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "cubicle-static-"));
  fixtures.push(root);
  const dist = join(root, "dist"); mkdirSync(dist);
  writeFileSync(join(dist, "index.html"), "<main>Built app</main>");
  mkdirSync(join(dist, "assets"));
  writeFileSync(join(dist, "assets", "app.js"), "/* public app */");
  writeFileSync(join(dist, "assets", "app.css"), "body{color:black}");
  writeFileSync(join(dist, "favicon.svg"), "<svg/>");
  return { root, dist };
}
async function launch(staticHandler = null) {
  const { server } = createServer({ debug: false, staticHandler });
  servers.push(server);
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  return server.address().port;
}
function request(port, path, method = "GET") {
  return new Promise((resolve, reject) => {
    // Raw HTTP preserves traversal syntax that fetch would normalize away.
    const req = httpRequest({ hostname: "127.0.0.1", port, path, method }, (res) => {
      const chunks = []; res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    req.on("error", reject); req.end();
  });
}
test.after(async () => {
  await Promise.all(servers.map((server) => new Promise((resolve) => server.close(resolve))));
  for (const root of fixtures) {
    assert.ok(resolve(root).startsWith(join(resolve(tmpdir()), "cubicle-static-")));
    rmSync(root, { recursive: true, force: true });
  }
});

test("built assets use correct types and immutable bytes; HEAD and methods are correct", async () => {
  const { dist } = fixture();
  const port = await launch(createStaticHandler(dist));
  writeFileSync(join(dist, "index.html"), "changed after startup");
  const page = await request(port, "/");
  assert.equal(page.status, 200); assert.equal(page.body, "<main>Built app</main>");
  assert.match(page.headers["content-type"], /text\/html/);
  assert.equal(page.headers["x-content-type-options"], "nosniff");
  const head = await request(port, "/", "HEAD");
  assert.equal(head.status, page.status); assert.equal(head.body, "");
  assert.equal(head.headers["content-length"], String(Buffer.byteLength(page.body)));
  assert.equal(head.headers["content-type"], page.headers["content-type"]);
  for (const [path, type] of [["/assets/app.js?check=1", "text/javascript"], ["/assets/app.css", "text/css"], ["/favicon.svg", "image/svg+xml"]]) {
    const res = await request(port, path); assert.equal(res.status, 200); assert.ok(res.headers["content-type"].startsWith(type));
  }
  const post = await request(port, "/assets/app.js", "POST");
  assert.equal(post.status, 405); assert.equal(post.headers.allow, "GET, HEAD");
  assert.equal((await request(port, "/unknown-page")).status, 404);
});

test("combined demo and API reject private paths and raw/encoded traversal", async () => {
  const { dist } = fixture();
  for (const path of ["CONTEXT/AGENT.md", "src/main.js", "assets/.env", ".env", ".env.local"]) {
    const file = join(dist, path); mkdirSync(resolve(file, ".."), { recursive: true }); writeFileSync(file, "private fixture");
  }
  const demo = await launch(createStaticHandler(dist)), api = await launch();
  const paths = ["/CONTEXT/AGENT.md", "/scenarios/missed_deadline.json", "/llm/prompts/npc/v3-tone.json", "/replies/missed_deadline.en.json", "/.env", "/.env.local", "/assets/.env", "/evals/reports/test.json", "/src/main.js", "/engine/config.js", "/scoring/config.js", "/services/api/server.js", "/.git/config", "/%43ONTEXT/AGENT.md", "/assets/%2eenv", "/assets/../index.html", "/assets/%2e%2e/index.html", "/%2e%2e/.env", "/assets/%252e%252e/index.html", "/..", "/.", "/%00", "/%zz", "/assets%5capp.js"];
  for (const port of [demo, api]) for (const path of paths) {
    const res = await request(port, path); assert.ok([403, 404].includes(res.status), `${path}: ${res.status}`);
    assert.ok(!res.body.includes("private fixture"));
  }
  const scenario = await request(demo, "/scenarios/deadline");
  assert.equal(scenario.status, 200); assert.match(scenario.headers["content-type"], /application\/json/);
  assert.ok(JSON.parse(scenario.body).briefing);
  for (const method of ["GET", "POST"]) assert.equal((await request(demo, "/sessions/unknown", method)).status, 404);
});

test("symlinked directories cannot escape dist and a symlinked dist root is refused", async () => {
  const { root, dist } = fixture(), outside = join(root, "outside"); mkdirSync(outside);
  writeFileSync(join(outside, "index.html"), "outside fixture");
  symlinkSync(outside, join(dist, "escape"), "junction");
  symlinkSync(outside, join(root, "linked-dist"), "junction");
  assert.throws(() => createStaticHandler(join(root, "linked-dist")), /non-symlink/);
  const port = await launch(createStaticHandler(dist));
  const escaped = await request(port, "/escape/index.html"); assert.equal(escaped.status, 404); assert.ok(!escaped.body.includes("outside fixture"));
});

test("missing dist fails clearly before serving", () => {
  const { root } = fixture();
  assert.throws(() => createStaticHandler(join(root, "missing")), /run npm run build/);
});

test("malformed request targets return sanitized 400 without stopping the server", async () => {
  const { dist } = fixture(), port = await launch(createStaticHandler(dist));
  const malformed = await request(port, "//[");
  assert.equal(malformed.status, 400);
  assert.deepEqual(JSON.parse(malformed.body), { error: "invalid request path" });
  assert.equal((await request(port, "/")).status, 200);
});

test("client chooses same-origin production API, development API, and explicit override", () => {
  assert.equal(apiBase(undefined, false), ""); assert.equal(apiBase(undefined, true), "http://localhost:8787");
  assert.equal(apiBase("http://localhost:8788/", false), "http://localhost:8788");
  assert.equal(apiBase("https://example.invalid/api///", true), "https://example.invalid/api");
});
