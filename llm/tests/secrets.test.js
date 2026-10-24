// llm/tests/secrets.test.js — no keys in repo text, .env ignored and untracked.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, dirname, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync, execFileSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "reports", ".opencode"]);
const SKIP_FILES = new Set(["package-lock.json"]);
const rootEnv = join(root, ".env");
const localInstallDirs = new Set([join(root, "voice-sidecar", ".venv"), join(root, "voice-sidecar", "models")]);

// A user-local root .env is deliberately ignored by the content scan. Every
// other file, including nested .env files, remains in scope.
function excludedFromContentScan(file) {
  return file === rootEnv;
}

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
    if (localInstallDirs.has(p)) continue; // Exactly the ignored model/runtime artifacts, never sidecar source.
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (st.isFile() && st.size < 512 * 1024 && !excludedFromContentScan(p)) out.push(p);
  }
  return out;
}

function hasTrackedRootEnv(listing) {
  return listing.split("\n").map((line) => line.trim()).includes(".env");
}

function rootEnvIsEffectivelyIgnored(cwd) {
  try {
    execFileSync("git", ["check-ignore", "-q", "--no-index", "--", ".env"], { cwd, stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
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
    const allowed = { LLM_PROVIDER: "offline", LLM_MAX_CALLS: "40", LLM_MAX_TOKENS_TOTAL: "60000", LLM_TPM_LIMIT: "6000", CLASSIFIER_MODEL: "openai/gpt-oss-20b", NPC_MODEL: "qwen/qwen3.8-27b", JUDGE_MODEL: "openai/gpt-oss-120b", COACH_MODEL: "openai/gpt-oss-120b", CLASSIFIER_REASONING_EFFORT: "low", NPC_REASONING_EFFORT: "none", JUDGE_REASONING_EFFORT: "low", COACH_REASONING_EFFORT: "low", ANTHROPIC_BUDGET_LEDGER: "./.state/anthropic-budget-ledger.json", VOICE_ENABLED: "0", VITE_VOICE: "0", VOICE_STT_DEVICE: "auto", VOICE_STT_CHAIN: "local", VOICE_TTS_CHAIN: "local,browser", VOICE_LOCAL_URL: "http://127.0.0.1:8790", VOICE_STT_TIMEOUT_MS: "8000", VOICE_TTS_TIMEOUT_MS: "6000" };
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
    assert.ok(!hasTrackedRootEnv(tracked), ".env is git-tracked");
    assert.ok(rootEnvIsEffectivelyIgnored(root), ".env is not effectively ignored");
  } catch (e) {
    if (e.message && (e.message.includes(".env is git-tracked") || e.message.includes(".env is not effectively ignored"))) throw e;
    assert.ok(!existsSync(join(root, ".env")), ".env exists but git unavailable to check tracking");
  }
});

test("only the exact user-local root .env is exempt from the content scan", () => {
  assert.equal(excludedFromContentScan(rootEnv), true);
  assert.equal(excludedFromContentScan(join(root, "nested", ".env")), false);
  assert.equal(excludedFromContentScan(join(root, ".env.example")), false);
});

test("tracked root .env remains a hard failure", () => {
  assert.equal(hasTrackedRootEnv("src/main.js\n.env\n"), true);
  assert.equal(hasTrackedRootEnv("nested/.env\n"), false);
});

test("effective ignore guard rejects a later root .env unignore", () => {
  const fixture = mkdtempSync(join(tmpdir(), "cubicle-ignore-"));
  try {
    execFileSync("git", ["init", "-q"], { cwd: fixture });
    writeFileSync(join(fixture, ".gitignore"), ".env\n");
    assert.equal(rootEnvIsEffectivelyIgnored(fixture), true);
    writeFileSync(join(fixture, ".gitignore"), ".env\n!.env\n");
    assert.equal(rootEnvIsEffectivelyIgnored(fixture), false);
  } finally {
    const verified = resolve(fixture);
    const tempPrefix = `${resolve(tmpdir())}${sep}cubicle-ignore-`;
    assert.ok(verified.startsWith(tempPrefix), "fixture cleanup escaped its temporary directory");
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("local install exclusions are exact, ignored directories; voice sources remain scanned", () => {
  for (const name of [".venv", "models"]) {
    const path = join(root, "voice-sidecar", name);
    assert.equal(localInstallDirs.has(path), true);
    assert.equal(localInstallDirs.has(join(root, "other", name)), false);
    execFileSync("git", ["check-ignore", "-q", "--no-index", "--", "voice-sidecar/" + name + "/"], { cwd: root, stdio: "ignore" });
  }
  assert.equal(localInstallDirs.has(join(root, "voice-sidecar", "server.py")), false);
  assert.equal(excludedFromContentScan(join(root, "voice-sidecar", ".env")), false);
});
