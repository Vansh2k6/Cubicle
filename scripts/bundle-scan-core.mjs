const PUBLIC_CONTEXTS = [
  ["cutoff", /(?<![\w$])cutoffDistance(?![\w$])/gi],
  ["module", /(?<![\w$])modulepreload(?![\w$])/gi],
  ["review", /(?<![\w$])I underestimated the final review\. I should have flagged the delay sooner\.(?![\w$])/gi],
  ["review", /(?<![\w$])I’ll review it and reply by 11 AM\. I’ll also set a daily inbox check\.(?![\w$])/gi],
  ["review", /(?<![\w$])preview(?![\w$])/gi],
];

function maskAllowed(text, needle, file) {
  let masked = PUBLIC_CONTEXTS.filter(([allowed]) => allowed === needle).reduce(
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
      if (maskAllowed(text, needle, file).toLowerCase().includes(needle)) hits.push({ file, needle, reason });
    }
  }
  return hits;
}
