const METRICS = ["goals", "hidden_facts", "integrity", "relationship", "rubric"];

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const object = (value) => value && typeof value === "object" && !Array.isArray(value);
const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));

function cleanCompletion(value) {
  if (!object(value) || !validDate(value.date)) return null;
  const completion = { date: value.date };
  if (["text", "scripted"].includes(value.mode)) completion.mode = value.mode;
  if (finite(value.score) && value.score >= 0 && value.score <= 3) completion.score = value.score;
  return completion;
}

function cleanAttempt(value, scenarios) {
  if (!object(value) || !scenarios.includes(value.scenario) || typeof value.session_id !== "string" ||
      !validDate(value.date) || !finite(value.total) || value.total < 0 || value.total > 100 || typeof value.band !== "string" ||
      !Number.isInteger(value.scoring_version) || value.scoring_version < 1 || !object(value.metrics)) return null;
  if (!value.session_id.trim() || !value.band.trim()) return null;
  const metrics = {};
  for (const id of METRICS) {
    if (!finite(value.metrics[id]) || value.metrics[id] < 0 || value.metrics[id] > 100) return null;
    metrics[id] = value.metrics[id];
  }
  return { date: value.date, session_id: value.session_id, scenario: value.scenario, total: value.total,
    band: value.band, scoring_version: value.scoring_version, metrics, provisional: value.provisional === true };
}

export function loadProgress(raw, scenarios) {
  let value;
  try { value = JSON.parse(raw || "{}"); } catch { value = {}; }
  if (!object(value)) value = {};
  const complete = object(value.complete) ? value.complete : Object.fromEntries(Object.entries(value).filter(([id]) => scenarios.includes(id)));
  const attempts = Array.isArray(value.attempts) ? value.attempts.map((a) => cleanAttempt(a, scenarios)).filter(Boolean) : [];
  return { complete: Object.fromEntries(Object.entries(complete).map(([id, entry]) => [id, scenarios.includes(id) ? cleanCompletion(entry) : null]).filter(([, entry]) => entry)), attempts };
}

export function readProgress(storage, scenarios) {
  let raw = null;
  let target;
  try { target = typeof storage === "function" ? storage() : storage; raw = target?.getItem("cubicle-progress"); } catch { return loadProgress(null, scenarios); }
  if (!raw) {
    try { raw = target?.getItem("workplay-progress"); } catch { return loadProgress(null, scenarios); }
  }
  return loadProgress(raw, scenarios);
}

export function summaryFromDebrief(session_id, scenario, debrief, date = new Date().toISOString()) {
  if (typeof session_id !== "string" || !object(debrief)) return null;
  const metrics = Object.fromEntries((debrief.breakdown || []).map((row) => [row.id, row.points]));
  const candidate = { date, session_id, scenario, total: debrief.total, band: debrief.band,
    scoring_version: debrief.scoring_version, metrics, provisional: debrief.total_status === "provisional" };
  return cleanAttempt(candidate, [scenario]);
}

export function upsertAttempt(progress, attempt) {
  if (!attempt) return progress;
  const existing = progress.attempts.find((item) => item.session_id === attempt.session_id);
  if (existing) attempt = { ...attempt, date: existing.date };
  return { ...progress, attempts: [...progress.attempts.filter((item) => item.session_id !== attempt.session_id), attempt]
    .sort((a, b) => b.date.localeCompare(a.date)) };
}

export function compareAttempts(first, second) {
  if (!first || !second || first.scenario !== second.scenario) return null;
  return { first, second, metrics: METRICS.map((id) => ({ id, first: first.metrics[id], second: second.metrics[id] })),
    crossVersion: first.scoring_version !== second.scoring_version,
    provisional: first.provisional || second.provisional };
}

export function saveProgress(storage, progress, scenarios) {
  const clean = loadProgress(JSON.stringify(progress), scenarios);
  try { const target = typeof storage === "function" ? storage() : storage; target?.setItem("cubicle-progress", JSON.stringify(clean)); return !!target; }
  catch { return false; }
}

export { METRICS };
