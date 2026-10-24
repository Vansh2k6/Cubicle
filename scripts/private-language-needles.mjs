// Narrow SF-03 resource coverage; full registered-private-package scanning belongs to SF-04.
import {PLAN_REPLIES} from "../llm/deadlineV2Language.js";
export const privateLanguageNeedles = new Map([
  ["canon_date_out_of_bounds", "private language policy"],
  ["canon_invented_resources", "private language policy"],
  ["mismatched language context", "private language resolver"],
  ["canon_policy_invalid", "private language resolver"],
  ["the server's bound language policy resolves dates", "classifier v3 prompt"],
  ["npc prompt v4", "NPC v4 prompt"],
  ["optional bound proposal context", "classifier v4 prompt"],
  ["engine-selected plan acknowledgement", "NPC v5 prompt"],
  ["engine-bound plan reply", "private v2 acknowledgement boundary"],
  ["unsupported_plan_claim", "private v2 semantic normalization"],
  ...Object.values(PLAN_REPLIES).map((text) => [text.toLowerCase(), "private v2 acknowledgement text"]),
  ["later disclosures do not authorize an earlier better_reply", "coach v3 prompt"],
]);
