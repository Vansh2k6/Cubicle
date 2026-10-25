// scripts/bundle-scan.mjs — P2c bundle hygiene (offline, R-03/R-08).
// Builds the frontend (vite build -> dist/), then scans dist/ for SC-01
// sealed content: fact contents, leak keywords, trigger names,
// commitment_model / canon.private values, prompt text + markers, reply
// templates. Zero hits required.
// Single common-word keywords (e.g. "half", "pair") are NOT scanned bare:
// they collide with vendor code. Multi-word/phrase keywords and distinctive
// tokens are scanned case-insensitively; the exact rule is printed.
// The dev-only debug chunk may exist as a separate file but must be
// unreachable without the flag: the main entry chunk must not contain the
// "_debug" literal (only the lazy debug chunk may).
// Usage: node scripts/bundle-scan.mjs [--json]
// Writes evals/reports/bundle-scan-<date>.json. Exit 1 on any failure.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {privateLanguageNeedles} from "./private-language-needles.mjs";
import { scanRegistry, registeredPrivateNeedles } from "./registered-private-sources.mjs";
import {prototypeRegistry, publicScenario} from "../services/api/scenarioRegistry.js";
import { scanArtifacts } from "./bundle-scan-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scenario = JSON.parse(readFileSync(join(root, "scenarios", "missed_deadline.json"), "utf8"));
const replies = JSON.parse(readFileSync(join(root, "replies", "missed_deadline.en.json"), "utf8"));

const prototypeNeedles = registeredPrivateNeedles({allPackages: prototypeRegistry.allPackages,
  publishedPackages: prototypeRegistry.allPackages,
  listScenarios: () => prototypeRegistry.allPackages().map(publicScenario)});
const banned = new Map([...privateLanguageNeedles, ...registeredPrivateNeedles(scanRegistry), ...prototypeNeedles]); // lowercased needle -> reason
function add(needle, reason) {
  const n = String(needle);
  if (n.length < 6 && !/[\s-]/.test(n)) return; // skip bare common words (vendor collisions)
  banned.set(n.toLowerCase(), reason);
}
for (const f of scenario.facts || []) {
  add(f.content.en, `fact ${f.id} content`);
  for (const kw of (f.leak_keywords && f.leak_keywords.en) || []) add(kw, `fact ${f.id} keyword`);
  for (const tr of f.triggers || []) add(tr, `fact ${f.id} trigger`);
}
add("Friday", "canon.private label");
add("holding them off", "canon.private phrasing");
add("commitment_model", "spec key");
add("leak_keywords", "spec key");
add('"canon"', "spec key");
add("pending_delivery", "engine internals");
// D-29 authorizes this public setup-slider name; private scenario terms remain banned.
add("reveal_fact", "act internals");
add("CURRENT MOVE", "prompt marker");
add("Authorised disclosure", "prompt marker");
add("Verified project context", "prompt marker");
add("UNVERIFIED", "prompt marker");
add("prompts/classifier/v1", "prompt filename");
add("prompts/npc/v1", "prompt filename");
for (const e of replies.entries || []) {
  for (const v of e.variants || []) add(v.text, `reply template ${e.id}`);
}

console.log("building frontend...");
execSync("npm run build", { cwd: root, stdio: "inherit" });

const dist = join(root, "dist");
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(dist, []);
const artifacts = files.map((f) => ({ file: f.slice(root.length + 1), text: readFileSync(f, "utf8") }));
const hits = scanArtifacts(artifacts, banned);

// Debug-chunk reachability: the main entry must not reference _debug.
const entries = files.filter((f) => /index-[^/]+\.js$/.test(f) || /index\.js$/.test(f));
let debugInEntry = [];
for (const f of entries) {
  try {
    if (readFileSync(f, "utf8").includes("_debug")) debugInEntry.push(f.slice(root.length + 1));
  } catch { /* binary */ }
}
const debugChunks = files.filter((f) => {
  try {
    return f.endsWith(".js") && readFileSync(f, "utf8").includes("turn-debug");
  } catch {
    return false;
  }
});

const ok = hits.length === 0 && debugInEntry.length === 0;
const report = {
  date: new Date().toISOString(),
  files: files.map((f) => f.slice(root.length + 1)),
  needleCount: banned.size,
  hits,
  debugInEntry,
  debugChunks: debugChunks.map((f) => f.slice(root.length + 1)),
  ok,
};
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
mkdirSync(join(root, "evals", "reports"), { recursive: true });
writeFileSync(join(root, "evals", "reports", `bundle-scan-${date}.json`), JSON.stringify(report, null, 2));

if (process.argv.includes("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`scanned ${artifacts.filter((artifact) => typeof artifact.text === "string").length} text artifacts with ${banned.size} needles`);
  for (const h of hits) console.log(`HIT ${h.file}: [${h.reason}] "${h.needle.slice(0, 60)}"`);
  for (const f of debugInEntry) console.log(`DEBUG-IN-ENTRY ${f}`);
  console.log(`debug chunks (lazy, unreachable without flag): ${report.debugChunks.join(", ") || "(none)"}`);
  console.log(ok ? "BUNDLE SCAN PASS" : "BUNDLE SCAN FAIL");
}
process.exit(ok ? 0 : 1);
