import { mkdir, open } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const path = resolve(process.env.ANTHROPIC_BUDGET_LEDGER || ".state/anthropic-budget-ledger.json");
const initial = {version: 1, calls: 0, reservedTokens: 0, reservedUsd: 0, actualInputTokens: 0, actualOutputTokens: 0};
await mkdir(dirname(path), {recursive: true});
let handle;
try {
  handle = await open(path, "wx", 0o600);
  await handle.writeFile(`${JSON.stringify(initial, null, 2)}\n`, "utf8");
  console.log("Created an empty Anthropic budget ledger. Keep this file between runs; the adapter binds it to the named task grant before first dispatch.");
} catch (error) {
  if (error.code === "EEXIST") {
    console.error("Budget ledger already exists; it was left unchanged.");
    process.exitCode = 1;
  } else {
    console.error("Could not create the budget ledger.");
    process.exitCode = 1;
  }
} finally {
  await handle?.close();
}
