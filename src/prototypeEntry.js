import { composePrototypeScenario, createSession, endSession, getDebrief, getScenario, newKey, sendTurn } from "./api.js";
import { DEFAULT_SLIDERS } from "../shared/settings.js";

const choices = [
  ["missed_deadline", "Missed a project deadline"],
  ["prototype_manager", "Manager scope change"],
  ["prototype_hr", "Request an internal transfer"],
  ["prototype_client", "Client change after sign-off"],
  ["prototype_coworker", "Employee handover"],
];
const composedIds = new Set(["prototype_omitted_feature", "prototype_earlier_delivery"]);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));

export function renderPrototypeEntry(host) {
  let selected = "missed_deadline", preview = null, session = null, npcId = "", busy = false, previewRevision = 0, pendingTurn = null;
  const transcript = [];
  const showError = (message) => { const node = host.querySelector("[data-prototype-error]"); if (node) node.textContent = message; };
  const render = () => {
    if (session) {
      const contacts = (session.scenario?.npcs || []).map((npc) => `<option value="${escapeHtml(npc.id)}" ${npc.id === npcId ? "selected" : ""}>${escapeHtml(npc.name)} · ${escapeHtml(npc.role)}</option>`).join("");
      host.innerHTML = `<p>${escapeHtml(session.briefing)}</p><p class="debrief-muted">Provider mode: ${escapeHtml(session.provider_mode || "offline")}. Your selected scenario is fixed for this practice.</p><label class="field-label" for="prototype-contact">Talk with</label><select id="prototype-contact" ${busy || pendingTurn ? "disabled" : ""}>${contacts}</select><div class="prototype-transcript" aria-live="polite">${transcript.map((item) => `<p><strong>${item.speaker === "you" ? "You" : escapeHtml(item.name)}:</strong> ${escapeHtml(item.text)}</p>`).join("")}</div><form id="prototype-turn"><label class="field-label" for="prototype-message">Your message</label><textarea id="prototype-message" maxlength="500" required></textarea><button class="primary-button" ${busy ? "disabled" : ""}>Send</button><button type="button" class="secondary-button" id="prototype-end" ${busy ? "disabled" : ""}>End and get feedback</button></form><p data-prototype-error role="status"></p>`;
      host.querySelector("#prototype-contact").onchange = (event) => { npcId = event.target.value; };
      host.querySelector("#prototype-turn").onsubmit = async (event) => {
        event.preventDefault(); if (busy) return;
        const text = host.querySelector("#prototype-message").value.trim(); if (!text) return;
        if (pendingTurn && (pendingTurn.text !== text || pendingTurn.npcId !== npcId)) { showError("Retry the same message to avoid sending it twice."); return; }
        if (!pendingTurn) { pendingTurn = {text,npcId,key:newKey()}; transcript.push({speaker: "you", name: "", text}); }
        busy = true; render();
        try {
          const reply = await sendTurn(session.session_id, npcId, text, pendingTurn.key, {timeoutMs:190000});
          const npc = session.scenario.npcs.find((entry) => entry.id === npcId);
          transcript.push({speaker: "npc", name: npc?.name || "Colleague", text: reply.npc_reply || "Let's take that one step at a time."});
          if (reply.reply_source === "fallback") transcript.push({speaker: "system", name: "Practice status", text: "This turn used a guarded fallback reply."});
          pendingTurn = null;
          if (reply.ended) { await showFeedback(); return; }
        } catch { busy = false; render(); const input = host.querySelector("#prototype-message"); if (input) { input.value = text; input.focus(); } showError("The response is delayed. Retry this same message safely; it may still be processing."); return; }
        busy = false; render(); host.querySelector("#prototype-message")?.focus();
      };
      host.querySelector("#prototype-end").onclick = async () => { if (busy) return; busy = true; try { await endSession(session.session_id); await showFeedback(); } catch { busy = false; showError("This practice could not be ended. Please try again."); } };
      return;
    }
    const composedOption = composedIds.has(selected) && preview?.id === selected
      ? `<option value="${escapeHtml(selected)}" selected>${escapeHtml(preview.title)}</option>` : "";
    const options = choices.map(([id, label]) => `<option value="${id}" ${id === selected ? "selected" : ""}>${label}</option>`).join("");
    host.innerHTML = `<label class="field-label" for="prototype-choice">Scenario</label><select id="prototype-choice">${composedOption}${options}</select><details class="prototype-compose"><summary>Create a custom scenario</summary><label class="field-label" for="prototype-request">Describe an omitted feature or an earlier client deadline</label><textarea id="prototype-request" maxlength="400" placeholder="The client wants delivery sooner"></textarea><button type="button" class="secondary-button" id="prototype-compose">Generate scenario</button></details><div data-prototype-error role="status"></div><div id="prototype-preview"></div>`;
    host.querySelector("#prototype-choice").onchange = (event) => { selected = event.target.value; preview = null; renderPreview(); };
    host.querySelector("#prototype-compose").onclick = async () => {
      const text = host.querySelector("#prototype-request").value;
      try { const result = await composePrototypeScenario(text); selected = result.scenario_id; preview = result.scenario; render(); showError(""); }
      catch (error) { preview = null; render(); showError(error.status === 422 ? "That request is outside the two supported client changes. Try describing an omitted feature or an earlier delivery request." : "The preview could not be built. Please try again."); }
    };
    renderPreview();
  };
  const renderPreview = async () => {
    const revision = ++previewRevision;
    const previewId = selected;
    const box = host.querySelector("#prototype-preview"); if (!box) return;
    if (!preview) {
      box.innerHTML = "<p>Loading the prepared scenario…</p>";
      let loaded;
      try { loaded = await getScenario(previewId); } catch { if (revision === previewRevision && selected === previewId) box.textContent = "This scenario is unavailable right now."; return; }
      if (!host.querySelector("#prototype-preview") || revision !== previewRevision || selected !== previewId) return;
      preview = loaded;
    }
    const checkedId = previewId;
    box.innerHTML = `<article class="prototype-check"><h3>${escapeHtml(preview.title)}</h3><p>${escapeHtml(preview.briefing)}</p><details class="prototype-goals"><summary>Practice goals</summary><ul>${preview.goals.map((goal) => `<li>${escapeHtml(goal.label)}</li>`).join("")}</ul></details><label><input id="prototype-checked" type="checkbox"> I've checked the scenario and goals.</label><button id="prototype-start" class="primary-button" disabled>Start practice</button></article>`;
    box.querySelector("#prototype-checked").onchange = (event) => { box.querySelector("#prototype-start").disabled = !event.target.checked; };
    box.querySelector("#prototype-start").onclick = async () => {
      const button = box.querySelector("#prototype-start"); button.disabled = true; button.textContent = "Starting…";
      try {
        if (selected !== checkedId) { button.disabled = false; button.textContent = "Start practice"; return; }
        session = await createSession(checkedId, DEFAULT_SLIDERS);
        npcId = session.scenario?.npcs?.[0]?.id || "maya"; pendingTurn = null;
        transcript.length = 0; render();
      } catch { button.disabled = false; button.textContent = "Start practice"; showError("The practice could not be started. Please try again."); }
    };
  };
  const showFeedback = async () => {
    try {
      let report = await getDebrief(session.session_id);
      for (let attempt = 0; report.status === "pending" && attempt < 20; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        report = await getDebrief(session.session_id);
      }
      const score = Number.isFinite(report.deterministic?.points) ? `${report.deterministic.points}/75` : "not available";
      const judge = report.judged?.status === "available" && Number.isFinite(report.judged.points) ? `${report.judged.points}/25` : "not available";
      host.innerHTML = `<h3>Practice complete</h3><p>${escapeHtml(report.summary || "Your conversation has been saved for feedback.")}</p><p>Evidence score: ${score}. Communication feedback: ${judge}.</p><button class="secondary-button" id="prototype-again">Choose another scenario</button>`;
      host.querySelector("#prototype-again").onclick = () => { session = null; preview = null; pendingTurn = null; transcript.length = 0; render(); };
    } catch { host.innerHTML = `<h3>Practice complete</h3><p>Your conversation ended. Feedback is temporarily unavailable.</p>`; }
  };
  render();
}
