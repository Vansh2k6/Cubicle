const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const title = (value) => String(value || "").replaceAll("_", " ");
const ownerName = (value) => title(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
const npcLabel = (value) => ({ maya: "Snehal Mane", jordan: "Vansh Singh", sam: "Prathamest Surwase" }[value] || ownerName(value));
const displayNumber = (value) => value !== "" && value !== null && value !== undefined && Number.isFinite(Number(value)) ? String(Math.round(Number(value) * 10) / 10) : "N/A";
const points = (value, cap) => `${displayNumber(value)} / ${displayNumber(cap)}`;
const quote = (entry) => {
  const turnId = entry.user_turn_id ?? entry.turn_id;
  const source = turnId === null || turnId === undefined || turnId === "" ? "" : `<span>Turn ${esc(turnId)}</span>`;
  return entry.quote ? `<blockquote>${source}<span>You said</span><p>${esc(entry.quote)}</p></blockquote>` : `<p class="debrief-muted">Original line unavailable.</p>`;
};

export function renderDebrief(packet, { listenEnabled = false, listenDisabled = false } = {}) {
  const d = packet.debrief;
  if (packet.status === "unavailable") return `<div role="status"><p>This earlier feedback is unavailable because the conversation server restarted. Your saved score summary is still in My progress.</p></div>`;
  if (!d) return `<div role="status"><p>${packet.status === "error" ? "Feedback could not be loaded. Your conversation is saved for this visit." : "Your conversation has ended. Preparing your feedback…"}</p></div>` +
    (["error", "paused"].includes(packet.status) ? `<button class="secondary-button" id="feedback-refresh">Check feedback</button>` : "");
  const assessed = d.total_status === "assessed" && d.judged?.status === "available";
  const notice = packet.status === "error" ? "Feedback could not be refreshed. Previous results remain below." : packet.status === "paused" ? "Feedback is still processing. You can check again when ready." : packet.status === "pending" ? "Refreshing feedback…" : assessed ? (d.coach_status === "unavailable" ? "Personalized coaching is unavailable." : "") : "Communication assessment unavailable.";
  const scoreSummary = assessed ? `<p class="debrief-total"><strong>${points(d.total, d.total_cap)}</strong> · ${esc(d.band)}</p>` : "";
  const rubric = (row) => row.source === "judged" && !assessed ? "Not assessed / 25" : points(row.points, row.cap);
  const listen = (m) => listenEnabled && m.moment_id ? `<button class="voice-toggle" type="button" data-listen="${esc(m.moment_id)}" aria-label="Listen to the improved reply" ${listenDisabled ? "disabled" : ""}>Listen</button>` : "";
  const primaryCoach = (m) => m.general ? `<div class="debrief-entry"><p class="debrief-muted">General practice tip</p><h4>Try saying</h4><p>${esc(m.better_reply)}</p>${listen(m)}</div>` : `<div class="debrief-entry">${quote(m)}<h4>Try saying</h4><p>${esc(m.better_reply)}</p>${listen(m)}</div>`;
  const coachingContext = (m) => m.general ? `<div class="debrief-entry"><p class="debrief-muted">General practice tip</p><h4>Practice focus</h4><p>${esc(m.what_went_well)}</p><h4>What to consider</h4><p>${esc(m.what_happened)}</p><h4>Why it can help</h4><p>${esc(m.why_it_matters)}</p><h4>Try saying</h4><p>${esc(m.better_reply)}</p>${listen(m)}</div>` : `<div class="debrief-entry"><h4>What went well</h4><p>${esc(m.what_went_well)}</p>${quote(m)}<h4>What happened</h4><p>${esc(m.what_happened)}</p><h4>Why it matters</h4><p>${esc(m.why_it_matters)}</p><h4>Try saying</h4><p>${esc(m.better_reply)}</p>${listen(m)}</div>`;
  const primaryMoment = d.moments[0];
  const coachingDetails = d.moments.map((m) => coachingContext(m)).join("");
  const positives = d.what_went_well.length ? `<p>${esc(d.what_went_well[0])}</p>` : "<p class=\"debrief-muted\">Your practice feedback is ready.</p>";
  return `<div class="debrief-layout"><div class="debrief-summary" role="status">${notice ? `<p>${esc(notice)}</p>` : ""}${scoreSummary}<div class="debrief-score-strip"><p><strong>Scenario outcomes</strong><br>${points(d.deterministic.points, d.deterministic.cap)} <span>deterministic</span></p><p><strong>Communication</strong><br>${assessed ? points(d.judged.points, d.judged.cap) : "Not assessed / 25"} <span>AI-assessed</span></p></div></div>` +
    `<section><h3>What worked</h3>${positives}</section>` +
    `<section><h3>Practice next</h3>${d.coach_status === "unavailable" ? '<p class="debrief-muted">Personalized coaching is unavailable; a practice suggestion is shown.</p>' : ""}${primaryMoment ? primaryCoach(primaryMoment) : "<p class=\"debrief-muted\">No coaching moment is available for this attempt.</p>"}</section>` +
    `<div data-debrief-actions></div>` +
    `<details><summary>Scores & evidence</summary><table><thead><tr><th scope="col">Metric</th><th scope="col">Points</th><th scope="col">Source</th></tr></thead><tbody>${d.breakdown.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${rubric(r)}</td><td>${esc(r.source === "judged" ? "AI-assessed" : "Deterministic")}</td></tr>`).join("")}</tbody></table>${d.judged.dimensions.length && assessed ? d.judged.dimensions.map((r) => `<div class="debrief-entry"><h4>${esc(title(r.id))} · ${points(r.points, 5)}</h4><p>${esc(r.explanation)}</p>${r.quote ? quote(r) : '<p class="debrief-muted">Insufficient verified evidence.</p>'}</div>`).join("") : "<p>Communication assessment is not assessed for this attempt.</p>"}${d.what_went_well.slice(1).length || coachingDetails ? `<h4>Coaching context</h4><ul>${d.what_went_well.slice(1).map((line) => `<li>${esc(line)}</li>`).join("")}</ul>${coachingDetails}` : ""}</details>` +
    `<details><summary>Missed opportunities</summary>${d.priorities.length ? d.priorities.map((r) => `<div class="debrief-entry"><h4>${esc(r.label)}</h4><p>${esc(r.description)} · ${displayNumber(r.loss)} points to work on</p>${r.kind === "not_observed" ? "" : quote(r)}</div>`).join("") : "<p>No point-loss priorities were identified.</p>"}${d.timeline.length ? `<h4>Conversation timeline</h4><ol>${d.timeline.map((r) => `<li><strong>${esc(title(r.type))}</strong>${quote(r)}</li>`).join("")}</ol>` : ""}<h4>What you missed</h4><p class="debrief-muted">These details are shared after the session. They do not change your discovery credit.</p>${d.missed_facts.length ? d.missed_facts.map((f) => `<div class="debrief-entry"><p><strong>Context from ${esc(npcLabel(f.owner))}</strong></p><p>${esc(f.content)}</p><p><strong>A question to ask:</strong> ${esc(f.unlock_question)}</p></div>`).join("") : "<p>You uncovered every hidden fact.</p>"}</details>` +
    `<details><summary>Session details</summary><p>Difficulty: ${esc(d.difficulty)} · Scoring version ${displayNumber(d.scoring_version)}</p><ul>${Object.entries(d.weights).map(([key, value]) => `<li>${esc(title(key))}: ${displayNumber(value)}</li>`).join("")}</ul>${Object.entries(d.settings).map(([npc, sliders]) => `<p><strong>${esc(npcLabel(npc))}</strong>: ${Object.entries(sliders).map(([key, value]) => `${esc(title(key))} ${displayNumber(value)}`).join(" · ")}</p>`).join("")}</details></div>` +
    (packet.retry_allowed ? `<button class="secondary-button" id="feedback-retry">Retry unavailable feedback once</button>` : d.status === "partial" ? `<p class="debrief-muted">Feedback retry has been used for this session.</p>` : "") +
    (packet.status === "error" || packet.status === "paused" ? `<button class="secondary-button" id="feedback-refresh">Check feedback</button>` : "");
}
export async function recoverFeedbackRetry({ request, current, refresh }) {
  try { await request(); } catch { /* The POST may have reached the server; GET observes its bounded job. */ }
  if (current()) await refresh();
}
export async function pollDebrief({ load, current, render, wait = (ms) => new Promise((r) => setTimeout(r, ms)), maxPolls = 60 }) {
  let latest = null;
  for (let i = 0; i < maxPolls && current(); i++) {
    let packet;
    try { packet = await load(); } catch { if (current()) render({ status: "error", debrief: latest }); return; }
    if (!current()) return;
    latest = packet.debrief || latest;
    render({ ...packet, debrief: latest });
    if (packet.status !== "pending") return;
    await wait(1000);
  }
  if (current()) render({ status: "paused", debrief: latest });
}
