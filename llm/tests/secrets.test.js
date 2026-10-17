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
  "gs" + "k_[A-Za-z0-9]{20,}",
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

function checkExample(text) {
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const separator = t.indexOf("=");
    const name = t.slice(0, separator);
    const value = t.slice(separator + 1);
    const allowed = { LLM_PROVIDER: "offline", LLM_MAX_CALLS: "40", LLM_MAX_TOKENS_TOTAL: "60000", LLM_TPM_LIMIT: "6000", CLASSIFIER_MODEL: "openai/gpt-oss-20b", NPC_MODEL: "qwen/qwen3.8-27b", JUDGE_MODEL: "openai/gpt-oss-120b", COACH_MODEL: "openai/gpt-oss-120b", CLASSIFIER_REASONING_EFFORT: "low", NPC_REASONING_EFFORT: "none", JUDGE_REASONING_EFFORT: "low", COACH_REASONING_EFFORT: "low" };
    assert.ok(separator > 0 && /^[A-Z_]+$/.test(name), "invalid environment variable name");
    assert.ok(value === (allowed[name] || ""), `unapproved default for ${name}`);
  }
}

test(".env.example carries only approved nonsecret defaults", () => {
  checkExample(readFileSync(join(root, ".env.example"), "utf8"));
});

test("example validation rejects additional equals and keeps values out of errors", () => {
  for (const line of ["GROQ_API_KEY==other", "CLASSIFIER_MODEL=openai/gpt-oss-20b=other"]) {
    assert.throws(() => checkExample(line), (e) => !e.message.includes("=other") && !e.message.includes("openai/"));
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
