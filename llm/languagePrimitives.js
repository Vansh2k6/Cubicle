// Pure text and attributed-echo mechanics shared by guards and authored language.
export const NUMBER_WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

export const DAY_FULL = {
  mon: "monday", monday: "monday", mondays: "monday",
  tue: "tuesday", tues: "tuesday", tuesday: "tuesday", tuesdays: "tuesday",
  wed: "wednesday", weds: "wednesday", wednesday: "wednesday", wednesdays: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday", thursday: "thursday", thursdays: "thursday",
  fri: "friday", friday: "friday", fridays: "friday",
  sat: "saturday", saturday: "saturday", saturdays: "saturday",
  sun: "sunday", sunday: "sunday", sundays: "sunday",
};

const STOPWORDS = new Set(
  "the,a,an,is,in,on,of,to,and,for,with,you,your,it,its,that,this,these,those,have,has,had,been,are,was,were,be,as,at,by,from,or,not,can,will,would,should,about,our,we,i,my,me,us,so,do,does,if,there,here,what,when,how,why,which,who,all,any,but,no,yes,just,now,very,really,quite,more,most,some,such,than,then,they,them,their,he,she,his,her,having,doing,being,because,until,while,again,once".split(","),
);

const CONFIRM_WORDS = ["yes", "yeah", "correct", "exactly", "indeed", "confirmed", "agree", "agrees", "agreed", "true", "right", "absolutely", "definitely"];

const ATTRIB_RE = /you\s+(said|mentioned|proposed|asked|suggested|told\s+me|noted|wrote|put\s+it)|as\s+you\s+(said|put\s+it)|your\s+(proposal|words|message|question|guess)|you'?re\s+asking\s+about/i;

export function normalize(text) {
  let s = String(text || "").toLowerCase();
  s = s.replace(/[_—–−]+/g, " ");
  s = s.replace(/-/g, " ");
  s = s.replace(/[^a-z0-9\s]/g, " ");
  s = s.replace(/\b([a-z]+)\b/g, (w) => {
    if (Object.prototype.hasOwnProperty.call(NUMBER_WORDS, w)) return String(NUMBER_WORDS[w]);
    if (Object.prototype.hasOwnProperty.call(DAY_FULL, w)) return DAY_FULL[w];
    return w;
  });
  return s.replace(/\s+/g, " ").trim();
}

export function nospace(text) {
  return normalize(text).replace(/\s+/g, "");
}

export function tokens(text) {
  return normalize(text).split(" ").filter(Boolean);
}

export function contentTokens(text) {
  return tokens(text).filter((t) => !STOPWORDS.has(t) && t.length > 1);
}

export function echoCorpus({ userSaid = [], revealedTexts = [], commitments = [] } = {}) {
  const parts = [];
  for (const t of userSaid) parts.push(String(t || ""));
  for (const t of revealedTexts) parts.push(String(t || ""));
  for (const c of commitments) {
    if (c && typeof c === "object") {
      if (c.original_words) parts.push(String(c.original_words));
      if (c.what) parts.push(String(c.what));
    } else if (typeof c === "string") parts.push(c);
  }
  const norm = normalize(parts.join(" "));
  return { norm, flat: norm.replace(/\s+/g, "") };
}

export function phraseHit(replyNorm, replyFlat, phrase) {
  const p = normalize(phrase);
  if (!p) return false;
  if (replyNorm.includes(p)) return true;
  const pf = p.replace(/\s+/g, "");
  if (pf.length >= 4 && replyFlat.includes(pf)) return true;
  // Ordered token subsequence with a small gap allowance, so insertions like
  // "holding them off" still match the keyword "holding off".
  const pt = p.split(" ").filter(Boolean);
  if (pt.length >= 2) {
    const rt = replyNorm.split(" ").filter(Boolean);
    let pi = 0;
    let gap = 0;
    for (const w of rt) {
      if (w === pt[pi]) { pi += 1; gap = 0; if (pi === pt.length) return true; }
      else if (pi > 0) { gap += 1; if (gap > 3) { pi = 0; gap = 0; } }
    }
  }
  return false;
}

export function supportedByEcho(corpus, phrase) {
  const p = normalize(phrase);
  if (!p) return false;
  if (p.length >= 3 && corpus.norm.includes(p)) return true;
  const pf = p.replace(/\s+/g, "");
  return pf.length >= 4 && corpus.flat.includes(pf);
}

export function hasConfirmLanguage(reply) {
  const toks = new Set(tokens(reply));
  return CONFIRM_WORDS.some((w) => toks.has(w));
}

export function hasAttribution(reply) {
  return ATTRIB_RE.test(String(reply || ""));
}
