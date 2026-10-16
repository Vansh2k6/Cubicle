// llm/tests/secrets.test.js — no keys in repo text, .env ignored and untracked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "reports", ".opencode"]);
const SKIP_FILES = new Set(["package-lock.json"]);

// Patterns assembled from fragments so this file itself carries no literal.
const PATTERNS = [
  "AK" + "IA[0-9A-Z]{16}",
  "gh" + "p_[A-Za-z0-9]{20,}",
  "sk-" + "ant-[A-Za-z0-9-]{10,}",
  "xo" + "xb-[0-9A-Za-z-]{10,}",
  "BEG" + "IN PRIVATE KEY",
].map((s) => new RegExp(s));

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name) || SKIP_FILES.has(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile() && st.size < 512 * 1024) out.push(p);
  }
  return out;
}

test("repo text contains no key-like secrets", () => {
  const hits = [];
  for (const file of walk(root, [])) {
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue; // binary; skip
    }
    if (text.includes("\u0000")) continue;
    for (const re of PATTERNS) {
      if (re.test(text)) hits.push(`${file}: ${re.source.slice(0, 12)}...`);
    }
  }
  assert.deepEqual(hits, []);
});

test(".env.example carries names only, no values", () => {
  const text = readFileSync(join(root, ".env.example"), "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    assert.match(t, /^[A-Z_]+=$/, `valued line in .env.example: ${t}`);
  }
});

test(".gitignore lists .env and .env is untracked", () => {
  const gi = readFileSync(join(root, ".gitignore"), "utf8");
  assert.ok(gi.split("\n").map((l) => l.trim()).includes(".env"));
  try {
    const tracked = execSync("git ls-files", { cwd: root, encoding: "utf8" });
    assert.ok(!tracked.split("\n").map((l) => l.trim()).includes(".env"), ".env is git-tracked");
  } catch (e) {
    if (e.message && e.message.includes(".env is git-tracked")) throw e;
    assert.ok(!existsSync(join(root, ".env")), ".env exists but git unavailable to check tracking");
  }
});
