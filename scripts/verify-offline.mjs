import { spawnSync } from "node:child_process";

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath) {
  console.error("verify:offline must be run through npm (npm_execpath is unavailable).");
  process.exit(1);
}

const blockedPrefixes = ["LLM_", "GROQ_", "OPENAI_", "ANTHROPIC_"];
const blockedNames = new Set(["RUN_LIVE", "CUBICLE_DEBUG"]);
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => {
  const normalized = name.toUpperCase();
  return !blockedNames.has(normalized) && !blockedPrefixes.some((prefix) => normalized.startsWith(prefix));
}));

for (const args of [["test"], ["run", "test:api"], ["run", "bundle:scan"]]) {
  const result = spawnSync(process.execPath, [npmExecPath, ...args], { env, stdio: "inherit", shell: false });
  if (result.error) {
    console.error(`verify:offline could not start npm ${args.join(" ")}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.signal) {
    console.error(`verify:offline stopped while running npm ${args.join(" ")} (${result.signal}).`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`verify:offline failed: npm ${args.join(" ")}.`);
    process.exit(result.status ?? 1);
  }
}
