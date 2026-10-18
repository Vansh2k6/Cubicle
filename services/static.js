import { lstatSync, readFileSync, realpathSync, readdirSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";

const TYPES = { ".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
const BLOCKED = /(?:^\/(?:CONTEXT|scenarios|llm|replies|evals|src|engine|scoring|services)(?:\/|$)|(?:^|\/)\.[^/]+)/i;

export function createStaticHandler(distPath) {
  const requestedRoot = resolve(distPath);
  let rootStat;
  try { rootStat = lstatSync(requestedRoot); } catch { throw new Error("dist is missing; run npm run build"); }
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error("dist must be a regular non-symlink directory");
  const root = realpathSync(requestedRoot);
  const files = new Map();
  const add = (url, file, type) => {
    const stat = lstatSync(file);
    const real = realpathSync(file), rel = relative(root, real);
    if (!stat.isFile() || stat.isSymbolicLink() || rel.startsWith("..") || isAbsolute(rel)) throw new Error("invalid dist asset");
    files.set(url, { body: readFileSync(file), type });
  };
  const scan = (dir, prefix = "") => {
    for (const name of readdirSync(dir)) {
      const file = resolve(dir, name), stat = lstatSync(file);
      if (stat.isSymbolicLink()) continue;
      const url = `${prefix}/${name}`;
      if (BLOCKED.test(url)) continue;
      if (stat.isDirectory()) scan(file, url);
      else if (stat.isFile()) add(url, file, TYPES[url.slice(url.lastIndexOf("."))] || "application/octet-stream");
    }
  };
  scan(root);
  if (!files.has("/index.html")) throw new Error("dist/index.html is required");
  files.set("/", files.get("/index.html"));
  return (req, res) => {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405, { Allow: "GET, HEAD" }); res.end(); return true; }
    const raw = (req.url || "/").split("?", 1)[0];
    if (BLOCKED.test(raw) || raw.includes("\\") || /%00|%2f|%5c|(?:^|\/)\.\.?($|\/)/i.test(raw)) { res.writeHead(404); res.end(); return true; }
    let path; try { path = decodeURIComponent(raw); } catch { res.writeHead(404); res.end(); return true; }
    if (BLOCKED.test(path) || path.includes("\0") || path.includes("\\") || /(?:^|\/)\.\.?($|\/)/.test(path)) { res.writeHead(404); res.end(); return true; }
    const asset = files.get(path);
    if (!asset) return false;
    res.writeHead(200, { "content-type": asset.type, "content-length": asset.body.length, "x-content-type-options": "nosniff" });
    if (req.method === "GET") res.end(asset.body); else res.end();
    return true;
  };
}
