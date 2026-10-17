const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const title = (value) => String(value || "").replaceAll("_", " ");
const quote = (entry) => entry.quote ? `<blockquote><span>Your line · ${esc(entry.user_turn_id ?? entry.turn_id)}</span><p>${esc(entry.quote)}</p></blockquote>` : `<p class="debrief-muted">Original line unavailable.</p>`;
export function renderDebrief(packet) {
  const d = packet.debrief;
  if (packet.status === "unavailable") return `<div role="status"><p>This earlier feedback is unavailable because the conversation server restarted. Your saved score summary is still in My progress.</p></div>`;
  if (!d) return `<div role="status"><p>${packet.status === "error" ? "Feedback could not be loaded. Your conversation is saved for this visit." : "Your conversation has ended. Preparing your feedback…"}</p></div>` +
    (["error", "paused"].includes(packet.status) ? `<button class="secondary-button" id="feedback-refresh">Check feedback</button>` : "");
  const notice = packet.status === "error" ? "Feedback could not be refreshed. Previous results remain below." : packet.status === "paused" ? "Feedback is still processing. You can check again when ready." : packet.status === "pending" ? "Refreshing feedback…" : d.total_status === "provisional" ? "Communication assessment is unavailable. This total is provisional; your deterministic results are complete." : d.coach_status === "unavailable" ? "Your score is ready; personalized coaching is unavailable." : "Your feedback is ready.";
  return `<div class="debrief-summary" role="status"><p>${esc(notice)}</p><p class="debrief-total"><strong>${esc(d.total)} / ${esc(d.total_cap)}</strong> · ${esc(d.band)}${d.total_status === "provisional" ? " (provisional)" : ""}</p><p>Deterministic: ${esc(d.deterministic.points)} / ${esc(d.deterministic.cap)} · Judged: ${esc(d.judged.points)} / ${esc(d.judged.cap)}${d.judged.status === "unavailable" ? " (unavailable)" : ""}</p></div>` +
    `<section><h3>What went well</h3><ul>${d.what_went_well.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></section>` +
    `<section><h3>Score breakdown</h3><table><thead><tr><th scope="col">Metric</th><th scope="col">Points</th><th scope="col">Source</th></tr></thead><tbody>${d.breakdown.map((r) => `<tr><th scope="row">${esc(r.label)}</th><td>${esc(r.points)} / ${esc(r.cap)}</td><td>${esc(r.source === "judged" ? "Judge" : "Code")}</td></tr>`).join("")}</tbody></table></section>` +
    `<details><summary>Communication quality evidence</summary>${d.judged.dimensions.length ? d.judged.dimensions.map((r) => `<div class="debrief-entry"><h4>${esc(title(r.id))} · ${esc(r.points)} / 5</h4><p>${esc(r.explanation)}</p>${r.quote ? quote(r) : "<p class=debrief-muted>Insufficient verified evidence.</p>"}</div>`).join("") : "<p>Communication assessment is unavailable.</p>"}</details>` +
    `<section><h3>Two priorities</h3>${d.priorities.length ? d.priorities.map((r) => `<div class="debrief-entry"><h4>${esc(r.label)}</h4><p>${esc(r.description)} · ${esc(r.loss)} points to work on</p>${r.kind === "not_observed" ? "" : quote(r)}</div>`).join("") : "<p>No point-loss priorities were identified.</p>"}</section>` +
    `<section><h3>Conversation timeline</h3>${d.timeline.length ? `<ol>${d.timeline.map((r) => `<li><strong>${esc(title(r.type))}</strong> · Turn ${esc(r.turn_id)}${quote(r)}</li>`).join("")}</ol>` : "<p>No flagged moments were identified.</p>"}</section>` +
    `<section><h3>A response to practice</h3>${d.coach_status === "unavailable" ? '<p class="debrief-muted">Personalized coaching is unavailable; a practice question is shown.</p>' : ""}${d.moments.map((m) => `<div class="debrief-entry"><h4>What went well</h4><p>${esc(m.what_went_well)}</p>${m.general ? "<p>General practice tip</p>" : quote(m)}<h4>What happened</h4><p>${esc(m.what_happened)}</p><h4>Why it matters</h4><p>${esc(m.why_it_matters)}</p><h4>Try saying</h4><p>${esc(m.better_reply)}</p></div>`).join("")}</section>` +
    `<section><h3>What you missed</h3><p class="debrief-muted">These details are shared after the session. They do not change your discovery credit.</p>${d.missed_facts.length ? d.missed_facts.map((f) => `<div class="debrief-entry"><p>${esc(f.content)}</p><p><strong>A question to ask:</strong> ${esc(f.unlock_question)}</p></div>`).join("") : "<p>You uncovered every hidden fact.</p>"}</section>` +
    `<details><summary>Settings and scoring version</summary><p>Scoring version ${esc(d.scoring_version)}</p><ul>${Object.entries(d.weights).map(([key, value]) => `<li>${esc(title(key))}: ${esc(value)}</li>`).join("")}</ul>${Object.entries(d.settings).map(([npc, sliders]) => `<p><strong>${esc(title(npc))}</strong>: ${Object.entries(sliders).map(([key, value]) => `${esc(title(key))} ${esc(value)}`).join(" · ")}</p>`).join("")}</details>` +
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
