const PUBLIC_CONTEXTS = [
  ["cutoff", /(?<![\w$])cutoffDistance(?![\w$])/gi],
  ["module", /(?<![\w$])modulepreload(?![\w$])/gi],
  ["review", /(?<![\w$])I underestimated the final review\. I should have flagged the delay sooner\.(?![\w$])/gi],
  ["review", /(?<![\w$])I’ll review it and reply by 11 AM\. I’ll also set a daily inbox check\.(?![\w$])/gi],
  ["review", /(?<![\w$])preview(?![\w$])/gi],
  ["agreed", /(?<![\w$])Summarize what you agreed, then finish practice when you are ready\.(?![\w$])/gi, true],
  ["storage", /(?<![\w$])Progress is available for this visit; browser storage is unavailable\.(?![\w$])/gi, true],
  ["storage", /(?<![\w$])[a-z_$][\w$]*\.storage(?=\s*(?:\/|=|&&|\)|\}|;))/gi, true],
  ["storage", /(?<![\w$])storage:0(?=\})/gi, true],
  ["storage", /(?<![\w$])function\s+[a-z_$][\w$]*\(\{transcribe:[a-z_$][\w$]*,storage:[a-z_$][\w$]*,navigatorRef:[a-z_$][\w$]*,windowRef:[a-z_$][\w$]*,documentRef:[a-z_$][\w$]*,clock:[a-z_$][\w$]*,onMicStart:[a-z_$][\w$]*,onVoiceChange:[a-z_$][\w$]*\}=\{\}\)/gi, true],
];

function maskAllowed(text, needle, file, reason) {
  let masked = PUBLIC_CONTEXTS.filter(([allowed, , keywordOnly]) => allowed === needle && (!keywordOnly || /^keywords /.test(reason))).reduce(
    (value, [, context]) => value.replace(context, (match) => " ".repeat(match.length)),
    text,
  );
  // Only HTML script attributes get this exemption; other text in the tag stays searchable.
  if (needle === "module" && /\.html?$/i.test(file)) {
    masked = masked.replace(
      /(<script\s+type\s*=\s*)(["'])module\2(?=\s|\/?>)/gi,
      (_, prefix, quote) => `${prefix}${quote}      ${quote}`,
    );
  }
  return masked;
}

export function scanArtifacts(artifacts, banned) {
  const hits = [];
  for (const { file, text } of artifacts) {
    if (typeof text !== "string") throw new TypeError("Artifact text is required");
    for (const [needle, reason] of banned) {
      const searchable = maskAllowed(text, needle, file, reason).toLowerCase();
      // Fact keywords name words, not fragments of unrelated JS identifiers.
      // Complete private text, templates and policy markers retain substring matching.
      const found = /^keywords /.test(reason) && /^[a-z]+$/.test(needle)
        ? new RegExp(`(?<![\\w$])${needle}(?![\\w$])`, "i").test(searchable)
        : searchable.includes(needle);
      if (found) hits.push({ file, needle, reason });
    }
  }
  return hits;
}
