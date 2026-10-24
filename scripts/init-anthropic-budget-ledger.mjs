import { initializeAnthropicBudgetLedger } from "../llm/providers/anthropic.js";

const gameplayGrant = "all-scenarios-live-gameplay";
const prototypeGrant = "cubicle-scenario-prototype-haiku-2026-10-25";
const grantName = process.argv[2] || process.env.CUBICLE_LIVE_TEST;
if (grantName && ![gameplayGrant, prototypeGrant].includes(grantName)) {
  console.error("Unknown Anthropic task grant; use an approved exact grant name.");
  process.exitCode = 2;
} else {
  try {
    const path = await initializeAnthropicBudgetLedger(grantName, process.env.ANTHROPIC_BUDGET_LEDGER);
    console.log(`Initialized new grant ledger at ${path}`);
  } catch (error) {
    console.error(`Ledger initialization refused (${error?.code || "file exists or storage unavailable"}). Existing ledgers are never overwritten.`);
    process.exitCode = 1;
  }
}
