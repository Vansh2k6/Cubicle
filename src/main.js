import {
  createIcons,
  Box,
  ChartNoAxesCombined,
  BookOpen,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Flag,
  Sprout,
  ChevronsUpDown,
  ChevronRight,
  CircleHelp,
  RotateCcw,
  Building2,
  Users,
  VolumeX,
  Volume2,
  Maximize,
  Sparkles,
  MessageCircle,
  ChevronUp,
  ChevronLeft,
  MessageSquareText,
  Lightbulb,
  X,
  ArrowRight,
  Check,
  CircleCheck,
  Circle,
} from "lucide";
const icons = {
  Box,
  ChartNoAxesCombined,
  BookOpen,
  ArrowUpRight,
  CalendarClock,
  ChevronDown,
  Flag,
  Sprout,
  ChevronsUpDown,
  ChevronRight,
  CircleHelp,
  RotateCcw,
  Building2,
  Users,
  VolumeX,
  Volume2,
  Maximize,
  Sparkles,
  MessageCircle,
  ChevronUp,
  ChevronLeft,
  MessageSquareText,
  Lightbulb,
  X,
  ArrowRight,
  Check,
  CircleCheck,
  Circle,
};
import { createOffice } from "./office.js";
import { createSession, getScenario, sendTurn, endSession, getDebrief, retryDebrief, newKey } from "./api.js";
import { DEFAULT_SLIDERS } from "../shared/settings.js";
import { settingsPreview } from "./settingsPreview.js";
import { renderDebrief, pollDebrief, recoverFeedbackRetry } from "./debrief.js";
import { createEndCoordinator, captureRun } from "./endCoordinator.js";
import { compareAttempts, readProgress, saveProgress, summaryFromDebrief, upsertAttempt } from "./progress.js";
const ending = createEndCoordinator();
const scenarios = {
  deadline: {
    title: "Missed a project deadline",
    short: "Missed deadline",
    tag: "Taking ownership",
    description:
      "The project was due yesterday. Your manager is waiting for an update. Time to have that conversation.",
    goal: "Own the delay and agree on a realistic next step.",
    opening:
      "Hey Alex, I noticed the project wasn’t submitted yesterday. Can you walk me through what happened?",
    choices: [
      [
        "I underestimated the final review. I should have flagged the delay sooner.",
        "I had a lot going on. It’s not really my fault.",
        "It’s almost done, so I didn’t think it was a big deal.",
      ],
      [
        "I can send the completed draft by 3 PM and flag any risks before noon.",
        "I’ll get to it as soon as I can.",
        "Can someone else finish it?",
      ],
    ],
    replies: [
      "Thank you for being upfront. The delay affects the team’s handoff. What’s your plan to get us back on track?",
      "I appreciate you taking responsibility and giving me a clear plan. Let’s check in at noon, then aim for the 3 PM handoff.",
    ],
  },
  email: {
    title: "Forgot to reply to an email",
    short: "Missed email",
    tag: "Clear communication",
    description:
      "An important email slipped through the cracks. Your manager needs an answer before the team can move forward.",
    goal: "Acknowledge the oversight and close the loop.",
    opening:
      "Hi Alex. I sent you an email about the client proposal two days ago. I haven’t heard back. Did you get a chance to see it?",
    choices: [
      [
        "I missed it, and I’m sorry for holding things up. Let me prioritize it now.",
        "You should have sent me a reminder.",
        "I saw it, but I thought it could wait.",
      ],
      [
        "I’ll review it and reply by 11 AM. I’ll also set a daily inbox check.",
        "I’ll try to remember next time.",
        "Could you just tell me everything in person?",
      ],
    ],
    replies: [
      "Thanks for acknowledging it. We need your input to move the proposal forward. When can I expect your response?",
      "That works. Please include any questions in your reply so we can resolve them together. Thanks for closing the loop.",
    ],
  },
  call: {
    title: "Missed an important call",
    short: "Missed call",
    tag: "Building trust",
    description:
      "You missed a scheduled check-in with your manager. Reconnect, understand what you missed, and reset expectations.",
    goal: "Apologize, catch up, and arrange a new check-in.",
    opening:
      "Hey Alex, we missed you on the project check-in this morning. Is everything okay?",
    choices: [
      [
        "I’m sorry I missed it. I lost track of time and should have let you know.",
        "It was just a check-in. Was it really necessary?",
        "Nobody reminded me that it was happening.",
      ],
      [
        "Could we reconnect at 2 PM? I’ll read the notes first and set a reminder.",
        "Let’s just skip this week.",
        "I’ll call whenever I have a free moment.",
      ],
    ],
    replies: [
      "I’m glad you’re okay. We made a few decisions that affect your work. How would you like to catch up?",
      "Sounds good. I’ll see you at 2 PM. Bring any questions from the notes, and we’ll make sure you have what you need.",
    ],
  },
};
const people = {
  maya: {
    name: "Maya Chen",
    role: "Your manager",
    color: "purple",
    initials: "MC",
  },
  jordan: {
    name: "Jordan Lee",
    role: "Your teammate",
    color: "peach",
    initials: "JL",
  },
  sam: {
    name: "Sam Taylor",
    role: "People & culture",
    color: "sage",
    initials: "ST",
  },
};
const saved = readProgress(() => window.localStorage, Object.keys(scenarios));
let state = {
  scenario: "deadline",
  near: null,
  dialogue: null,
  round: 0,
  score: 0,
  complete: saved.complete,
  attempts: saved.attempts,
  muted: true,
  paused: false,
  textMode: false,
  text: null,
  // P3a threads: one API session shared by all three NPCs; each NPC keeps
  // its own transcript/mood while goals + next-step hint are session-global
  // public state. Threads survive panel close; in-flight turns resolve into
  // their thread and appear on reopen (no duplicate send: same key retry).
  sessionId: null,
  threads: null,
  sharedGoals: [],
  sharedHint: "",
  startingSession: false,
  appliedSettings: null,
};
const icon = (name, cls = "") => `<i data-lucide="${name}" class="${cls}"></i>`;
const $ = (s) => document.querySelector(s);
const refreshIcons = () => createIcons({ icons });
function updateScenario() {
  let s = scenarios[state.scenario];
  $("#scenario-description").textContent = s.description;
  $("#objective-text").textContent = s.goal;
  $("#next-heading").textContent = "Say hello to Maya";
  $("#next-description").innerHTML =
    "Walk up to your manager and press <kbd>E</kbd> to start the conversation.";
  $(".step-number").innerHTML = "01 <span>/ 03</span>";
  updateProgress();
  refreshIcons();
}
function updateProgress() {
  $("#progress-count").textContent = new Set([...Object.keys(state.complete), ...state.attempts.map((a) => a.scenario)]).size;
}
function persistProgress() {
  if (!saveProgress(() => window.localStorage, { complete: state.complete, attempts: state.attempts }, Object.keys(scenarios))) toast("Progress is available for this visit; browser storage is unavailable.");
}
function toast(message) {
  $("#toast").textContent = message;
  $("#toast").classList.add("show");
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(
    () => $("#toast").classList.remove("show"),
    3200,
  );
}
let office = createOffice($("#game-viewport"), {
  onNear(id) {
    state.near = id;
    // P3.1 walk-away close: proximity stays live while the text panel is
    // open, so leaving range (or reaching another NPC) closes the panel.
    // Threads and in-flight turns persist; reopening resumes the thread.
    if (state.textMode && state.dialogue && id !== state.dialogue) {
      closeConversation();
    }
    const b = $("#talk-prompt");
    b.classList.toggle("hidden", !state.near || !!state.dialogue);
    if (state.near)
      b.querySelector("strong").textContent = people[state.near].name.split(" ")[0];
  },
  onMove() {
    $("#move-hint").classList.add("dismissed");
  },
  onTalk() {
    openConversation();
  },
  // Text panels do not freeze the scene (P3.1 walk-away close needs live
  // proximity). Typing is safe: the scene ignores key events from inputs.
  isPaused: () => state.paused || (state.dialogue && !state.textMode),
  onReady() {
    $("#loading").remove();
  },
});
function chime() {
  if (state.muted) return;
  try {
    const ac = window.audioContext || new AudioContext();
    window.audioContext = ac;
    ac.resume();
    const o = ac.createOscillator(),
      g = ac.createGain();
    o.connect(g);
    g.connect(ac.destination);
    o.frequency.setValueAtTime(660, ac.currentTime);
    o.frequency.exponentialRampToValueAtTime(880, ac.currentTime + 0.13);
    g.gain.setValueAtTime(0.045, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.2);
    o.start();
    o.stop(ac.currentTime + 0.22);
  } catch {}
}
function openConversation() {
  if (!state.near || state.paused) return;
  // E near another NPC while a text thread is open switches threads on the
  // same session (P3.1 interact{npc_id}); the previous thread keeps its
  // history and any in-flight turn.
  if (state.dialogue) {
    if (!state.textMode || state.near === state.dialogue) return;
    closeConversation();
  }
  // SC-01 ("deadline") uses free-text turns via the turn API. SC-02/SC-03
  // keep the scripted button baseline untouched (P2c contract).
  if (state.scenario === "deadline") {
    openTextConversation();
    return;
  }
  state.dialogue = state.near;
  state.round = 0;
  state.score = 0;
  $("#talk-prompt").classList.add("hidden");
  if (state.dialogue === "maya") {
    $("#next-heading").textContent = "Listen, then take your next step";
    $(".step-number").innerHTML = "02 <span>/ 03</span>";
  }
  chime();
  renderDialogue();
}
function closeConversation() {
  state.dialogue = null;
  state.textMode = false;
  state.text = null;
  $("#dialogue-layer").innerHTML = "";
  $("#game-viewport").focus({ preventScroll: true });
  $("#talk-prompt").classList.toggle("hidden", !state.near);
}
function renderDialogue(feedback = "") {
  const p = people[state.dialogue],
    s = scenarios[state.scenario];
  let line, choices;
  if (state.dialogue === "maya") {
    line = state.round === 0 ? s.opening : s.replies[state.round - 1];
    choices = state.round < 2 ? s.choices[state.round] : null;
  } else {
    line =
      state.dialogue === "jordan"
        ? `Hey Alex! ${state.scenario === "deadline" ? "I’ve been there with a late project. Be honest with Maya, then bring a realistic plan. You don’t have to have it all figured out." : state.scenario === "email" ? "A quick, clear reply goes a long way. Tell Maya when you can follow up, then make a little space in your day for your inbox." : "Check the meeting notes before you reconnect. It helps to arrive with a few specific questions."}`
        : "Hi Alex! A reminder: tricky conversations get easier with practice. Take a breath, listen carefully, and focus on what you can do next. You’ve got this.";
    choices = null;
  }
  $("#dialogue-layer").innerHTML =
    `<section class="dialogue" role="dialog" aria-modal="true" aria-labelledby="dialogue-name"><div class="dialogue-heading"><span class="dialogue-avatar ${p.color}">${p.initials}</span><div><strong id="dialogue-name">${p.name}</strong><small>${p.role}</small></div><span class="conversation-label">${state.dialogue === "maya" ? `CONVERSATION ${Math.min(state.round + 1, 3)} / 3` : "A FRIENDLY CHECK-IN"}</span><button id="close-dialogue" class="icon-button" aria-label="Close conversation">${icon("x")}</button></div>${feedback ? `<div class="response-feedback">${icon("lightbulb")}${feedback}</div>` : ""}<p class="dialogue-line">“${line}”</p>${choices ? `<div class="response-label">HOW WOULD YOU RESPOND?</div><div class="responses">${choices.map((c, i) => `<button data-choice="${i}"><span>${i + 1}</span>${c}${icon("arrow-up-right")}</button>`).join("")}</div>` : `<button class="primary-button" id="finish-conversation">${state.dialogue === "maya" ? "Finish & reflect" : "Thanks, that helps"} ${icon("arrow-right")}</button>`}</section>`;
  $("#close-dialogue").onclick = closeConversation;
  document
    .querySelectorAll("[data-choice]")
    .forEach((b) => (b.onclick = () => choose(Number(b.dataset.choice))));
  if ($("#finish-conversation"))
    $("#finish-conversation").onclick = () => {
      if (state.dialogue === "maya") completeScenario();
      else closeConversation();
    };
  refreshIcons();
  $("#close-dialogue").focus({ preventScroll: true });
}
function choose(index) {
  chime();
  if (index === 0) {
    state.score++;
    state.round++;
    renderDialogue();
  } else
    renderDialogue(
      state.round === 0
        ? "Try acknowledging your part and its impact. You can choose a different response."
        : "Try offering a specific action and a realistic time. You can choose a different response.",
    );
}
function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// --- P3a threads (one session, per-NPC history). No quick-reply chips
// (D-12 unconfirmed). The panel shows public state only (R-03/R-08).
function freshThread() {
  return {
    transcript: [],
    busy: false,
    failed: null,
    over: false,
    loadError: null,
    mood: null,
    traces: [],
  };
}

function threadsFor() {
  if (!state.threads) {
    state.threads = { maya: freshThread(), jordan: freshThread(), sam: freshThread() };
  }
  return state.threads;
}

function openTextConversation() {
  if (!state.near || state.dialogue || state.paused) return;
  if (state.startingSession) { toast("Preparing your fresh conversation…"); return; }
  state.dialogue = state.near;
  state.textMode = true;
  state.text = threadsFor()[state.dialogue];
  $("#talk-prompt").classList.add("hidden");
  chime();
  if (state.sessionId) {
    renderTextDialogue();
    return;
  }
  openSettings(state.appliedSettings || DEFAULT_SLIDERS);
}

function startTextSession() {
  if (state.sessionId || state.startingSession || !state.textMode || !state.text) return;
  const current = captureRun(state);
  state.text.loadError = null;
  renderTextDialogue();
  createSession("deadline", state.appliedSettings || DEFAULT_SLIDERS).then(
    (data) => {
      if (!current() || !state.textMode || !state.text) return;
      state.sessionId = data.session_id;
      state.sharedGoals = (data.public_state && data.public_state.goals) || [];
      state.sharedHint = (data.public_state && data.public_state.next_hint) || "";
      state.appliedSettings = data.settings || state.appliedSettings;
      renderTextDialogue();
    },
    (err) => {
      if (!current()) return;
      if (!state.textMode || !state.text) {
        // Session creation failed while closed: keep the error on the open
        // thread so reopening shows Retry instead of a dead panel.
        const threads = threadsFor();
        for (const th of Object.values(threads)) {
          if (!state.sessionId) th.loadError = (err && err.message) || "Could not reach the conversation server.";
        }
        return;
      }
      state.text.loadError =
        (err && err.message) || "Could not reach the conversation server.";
      renderTextDialogue();
    },
  );
}

function renderTextDialogue() {
  const t = state.text;
  if (!t || !state.dialogue) return;
  const busy = t.busy || ending.busy(state.sessionId, state.scenario);
  const p = people[state.dialogue];
  const first = p.name.split(" ")[0];
  const lines = t.transcript
    .map((l) =>
      l.who === "user"
        ? `<div class="t-line user"><span>${escapeHtml(l.text)}</span></div>`
        : `<div class="t-line npc"><strong>${escapeHtml(l.name)}</strong><span>${escapeHtml(l.text)}</span></div>`,
    )
    .join("");
  const goals = (state.sharedGoals || [])
    .map((g) => {
      const done = g.status === "done";
      const locked = !done && !!g.locked;
      const cls = done ? "done" : locked ? "locked" : "";
      const word = done ? "Done" : locked ? "Locked" : "Todo";
      return `<li class="${cls}"><span class="g-state">${word}</span>${escapeHtml(g.label)}</li>`;
    })
    .join("");
  $("#dialogue-layer").innerHTML =
    `<section class="dialogue text-mode" role="dialog" aria-modal="true" aria-labelledby="dialogue-name">` +
    `<div class="dialogue-heading"><span class="dialogue-avatar ${p.color}">${p.initials}</span>` +
    `<div><strong id="dialogue-name">${p.name}</strong><small>${p.role}</small></div>` +
    `<span class="conversation-label">TEXT SESSION${t.mood ? ` · ${escapeHtml(t.mood).toUpperCase()}` : ""}</span>` +
    `<button id="close-dialogue" class="icon-button" aria-label="Close conversation">${icon("x")}</button></div>` +
    `<div class="transcript" role="log" aria-live="polite" aria-label="Conversation transcript">${lines || `<div class="t-empty">Say hello to ${escapeHtml(first)} — type your reply below.</div>`}</div>` +
    (t.busy
      ? `<div class="typing" role="status"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>${escapeHtml(first)} is typing…</div>`
      : "") +
    (t.loadError
      ? `<div class="turn-error" role="alert"><p>${escapeHtml(t.loadError)}</p><button class="secondary-button" id="text-retry-load">Retry</button></div>`
      : "") +
    (t.failed
      ? `<div class="turn-error" role="alert"><p>${escapeHtml(t.failed.message)} Your message was kept — retry sends the same turn once.</p><button class="secondary-button" id="text-retry-turn">Retry</button></div>`
      : "") +
    (state.sessionId && !t.over
      ? `<form class="text-form" id="text-form"><label for="text-input">Reply to ${escapeHtml(first)}</label>` +
        `<div class="text-row"><input id="text-input" name="text" type="text" maxlength="500" autocomplete="off" placeholder="Type your reply…" ${busy ? "disabled" : ""} aria-describedby="text-hint" />` +
        `<button class="primary-button" type="submit" ${busy ? "disabled" : ""}>Send ${icon("arrow-right")}</button></div>` +
        `<small id="text-hint">${state.sharedHint ? escapeHtml(state.sharedHint) : "Enter sends · Esc closes"}</small></form>`
      : "") +
    (goals ? `<ul class="goal-list" aria-label="Visible goals">${goals}</ul>` : "") +
    `<div id="text-debug"></div>` +
    (state.sessionId
      ? `<button class="primary-button text-finish" id="finish-text" ${ending.busy(state.sessionId, state.scenario) ? "disabled" : ""}>${ending.busy(state.sessionId, state.scenario) ? "Ending…" : t.over ? "Wrap up & reflect" : "End & reflect"} ${icon("arrow-right")}</button>`
      : "") +
    `</section>`;
  $("#close-dialogue").onclick = closeConversation;
  const form = $("#text-form");
  if (form) {
    form.onsubmit = (e) => {
      e.preventDefault();
      const input = $("#text-input");
      const value = input ? input.value.trim() : "";
      if (!value || state.text.busy) return;
      sendTextTurn(value, newKey(), false);
    };
  }
  const retryLoad = $("#text-retry-load");
  if (retryLoad) retryLoad.onclick = startTextSession;
  const retryTurn = $("#text-retry-turn");
  if (retryTurn)
    retryTurn.onclick = () => {
      const f = state.text && state.text.failed;
      if (f) sendTextTurn(f.text, f.key, true);
    };
  const finish = $("#finish-text");
  if (finish) finish.onclick = completeTextSession;
  refreshIcons();
  const transcript = document.querySelector(".transcript");
  if (transcript) transcript.scrollTop = transcript.scrollHeight;
  const input = $("#text-input");
  if (input && !t.busy) input.focus({ preventScroll: true });
  else $("#close-dialogue").focus({ preventScroll: true });
  paintTextDebug();
}

async function sendTextTurn(text, key, isRetry) {
  // The turn is bound to its thread at send time: closing the panel never
  // loses it. The resolved NPC line lands in the thread and renders on
  // reopen; retries reuse the same key so the server applies it once.
  const thread = state.text;
  const npcId = state.dialogue;
  const sessionId = state.sessionId;
  const current = captureRun(state);
  if (!thread || !npcId || thread.busy || state.sessionId == null || thread.over || ending.busy(state.sessionId, state.scenario)) return;
  // The user line is appended exactly once: retries resend the same key and
  // must not duplicate the transcript or double-apply engine state.
  if (!isRetry) thread.transcript.push({ who: "user", name: "You", text });
  thread.busy = true;
  thread.failed = null;
  if (state.text === thread) renderTextDialogue();
  try {
    const data = await sendTurn(sessionId, npcId, text, key);
    thread.busy = false;
    thread.transcript.push({
      who: "npc",
      name: people[npcId].name.split(" ")[0],
      text: data.npc_reply,
    });
    if (!current()) return;
    if (data.public_state) {
      state.sharedGoals = data.public_state.goals || state.sharedGoals;
      thread.mood = data.public_state.mood_label || thread.mood;
      state.sharedHint = data.public_state.next_hint || state.sharedHint;
      if (data.public_state.ended) thread.over = true;
    }
    if (data.ended) {
      for (const t of Object.values(threadsFor())) t.over = true;
      state.endReason = data.end_reason;
    }
    if (window.__CUBICLE_DEBUG) stashTextTrace(data, thread);
    if (data.ended) openDebrief(sessionId);
    else if (state.text === thread) renderTextDialogue();
  } catch (err) {
    thread.busy = false;
    thread.failed = {
      text,
      key,
      message: (err && err.message) || "Something went wrong.",
    };
    if (!current()) return;
    if (state.text === thread) renderTextDialogue();
  }
}

// Dev-only trace stash + paint. Every reference to the server's debug field
// lives inside the lazily imported debug module, so the main entry chunk
// contains no debug field literal at all (bundle hygiene, R-03).
function stashTextTrace(data, thread) {
  import("./debug.js")
    .then((m) => {
      const t = m.capture(data);
      if (t) {
        thread.traces.push(t);
        if (state.text === thread) paintTextDebug();
      }
    })
    .catch(() => {});
}

function paintTextDebug() {
  if (!window.__CUBICLE_DEBUG || !state.textMode || !state.text) return;
  const traces = state.text.traces;
  if (!traces || traces.length === 0) return;
  import("./debug.js")
    .then((m) => {
      const box = document.querySelector("#text-debug");
      if (!box || !state.textMode || !state.text) return;
      box.innerHTML = "";
      for (const d of state.text.traces) m.renderDebug(box, d);
    })
    .catch(() => {});
}

async function completeTextSession() {
  if (ending.busy(state.sessionId, state.scenario)) return;
  if (Object.values(threadsFor()).some((t) => t.busy)) { toast("Wait for the current reply before ending."); return; }
  const sessionId = state.sessionId, scenarioId = state.scenario;
  const current = (id, scenario) => state.sessionId === id && state.scenario === scenario;
  try {
    const pending = ending.run(sessionId, scenarioId, endSession, current);
    renderTextDialogue();
    const result = await pending;
    if (!result) return;
    state.endReason = result.end_reason;
    for (const t of Object.values(threadsFor())) t.over = true;
  } catch { if (current(sessionId, scenarioId)) { renderTextDialogue(); toast("Could not end the session. Please try again."); } return; }
  state.complete[state.scenario] = {
    date: new Date().toISOString(),
    mode: "text",
  };
  persistProgress();
  closeConversation();
  updateProgress();
  $("#next-heading").textContent = "One conversation. A little more confident.";
  $("#next-description").textContent =
    "Try another scenario, or chat with your teammates.";
  $(".step-number").innerHTML = "03 <span>/ 03</span>";
  openDebrief(sessionId);
  refreshIcons();
}

function openDebrief(sessionId, historical = false) {
  const run = captureRun(state);
  const attemptScenario = state.attempts.find((attempt) => attempt.session_id === sessionId)?.scenario || state.scenario;
  showModal("Your practice debrief", '<div id="debrief-content" aria-live="polite"></div>');
  const box = $("#debrief-content");
  $(".modal").classList.add("debrief-modal");
  $(".modal .eyebrow")?.remove();
  const current = () => run() && $("#debrief-content") === box && (historical || state.sessionId === sessionId);
  const load = async () => {
    try { return await getDebrief(sessionId); }
    catch (error) {
      if (historical && error.status === 404) return { status: "unavailable", debrief: null };
      throw error;
    }
  };
  const disableFeedbackControl = (button) => {
    const hadFocus = document.activeElement === button;
    button.disabled = true;
    if (hadFocus && current()) $(".modal-close").focus({ preventScroll: true });
  };
  let latest = null;
  const render = (packet) => {
    if (!current()) return;
    const focused = document.activeElement;
    const hadContentFocus = box.contains(focused);
    const focusedId = focused?.id;
    latest = packet.debrief || latest;
    box.innerHTML = renderDebrief({ ...packet, debrief: latest });
    if (latest) {
      const attempt = summaryFromDebrief(sessionId, "deadline", latest);
      state.attempts = upsertAttempt({ attempts: state.attempts }, attempt).attempts;
      persistProgress();
      const actions = document.createElement("div");
      actions.className = "debrief-actions";
      actions.innerHTML = `<button class="primary-button" id="try-again">Try again</button><button class="secondary-button" id="try-settings">Try again with new settings</button>`;
      box.append(actions);
      const attemptSettings = latest.settings?.maya || state.appliedSettings || DEFAULT_SLIDERS;
      $("#try-again").onclick = () => restartTextRun(false, attemptScenario, attemptSettings);
      $("#try-settings").onclick = () => restartTextRun(true, attemptScenario, attemptSettings);
    }
    const check = $("#feedback-refresh");
    if (check) check.onclick = () => { disableFeedbackControl(check); poll(); };
    const retry = $("#feedback-retry");
    if (retry) retry.onclick = async () => {
      disableFeedbackControl(retry); retry.textContent = "Requesting feedback…";
      await recoverFeedbackRetry({ request: () => retryDebrief(sessionId), current, refresh: poll });
    };
    if (hadContentFocus && current()) {
      const replacement = focusedId ? document.getElementById(focusedId) : null;
      const target = replacement && box.contains(replacement) && !replacement.disabled ? replacement : $(".modal-close");
      target.focus({ preventScroll: true });
    }
  };
  const poll = () => pollDebrief({ load, current, render });
  render({ status: "pending", debrief: null });
  poll();
}

function completeScenario() {
  state.complete[state.scenario] = {
    date: new Date().toISOString(),
    score: state.score,
  };
  persistProgress();
  closeConversation();
  updateProgress();
  $("#next-heading").textContent = "One conversation. A little more confident.";
  $("#next-description").textContent =
    "Try another scenario, or chat with your teammates.";
  $(".step-number").innerHTML = "03 <span>/ 03</span>";
  showModal(
    "A small step worth celebrating.",
    `<div class="completion-symbol">${icon("check")}</div><p>You practiced <strong>${scenarios[state.scenario].short.toLowerCase()}</strong> and made a clear plan with Maya.</p><div class="reflection"><strong>Take this into your next conversation</strong><p>Own what happened. Recognize the impact. Offer a specific next step.</p></div><button id="try-next" class="primary-button">Try another scenario ${icon("arrow-right")}</button>`,
  );
  $("#try-next").onclick = () => {
    const keys = Object.keys(scenarios);
    state.scenario = keys[(keys.indexOf(state.scenario) + 1) % keys.length];
    $("#scenario").value = state.scenario;
    closeModal();
    office.reset();
    updateScenario();
  };
  refreshIcons();
}
function resetTextRun(scenarioId = state.scenario) {
  closeConversation();
  state.scenario = scenarioId;
  $("#scenario").value = scenarioId;
  state.sessionId = null;
  state.threads = null;
  state.sharedGoals = [];
  state.sharedHint = "";
  state.startingSession = false;
  state.endReason = null;
  state.round = 0;
  state.score = 0;
  state.appliedSettings = null;
  office.reset();
  updateScenario();
}
function startRetrySession(sliders = state.appliedSettings || DEFAULT_SLIDERS) {
  const threads = threadsFor();
  const current = captureRun(state);
  state.startingSession = true;
  createSession("deadline", sliders).then((data) => {
    if (!current() || state.threads !== threads || state.sessionId) return;
    state.sessionId = data.session_id;
    state.sharedGoals = data.public_state?.goals || [];
    state.sharedHint = data.public_state?.next_hint || "";
    state.appliedSettings = data.settings || sliders;
    state.startingSession = false;
  }, () => {
    if (!current() || state.threads !== threads) return;
    state.startingSession = false;
    toast("Could not start a fresh conversation. Find Maya and retry.");
  });
}
function openSettings(initial = DEFAULT_SLIDERS) {
  const draft = { ...initial };
  const preview = () => settingsPreview(draft);
  showModal("Set the conversation", '<div id="setup-content" aria-live="polite">Loading this practice…</div>');
  const box = $("#setup-content");
  const run = captureRun(state);
  const current = () => run() && $("#setup-content") === box;
  const render = (scenario) => {
    if (!current()) return;
    const controls = Object.keys(DEFAULT_SLIDERS).map((key) => `<label class="setup-slider">${escapeHtml(key)} <output id="slider-${key}">${draft[key]}</output><input type="range" min="0" max="100" step="1" value="${draft[key]}" data-slider="${key}"></label>`).join("");
    box.innerHTML = `<p><strong>${escapeHtml(scenario.title)}</strong></p><p>${escapeHtml(scenario.briefing)}</p><ul>${scenario.goals.map((goal) => `<li>${escapeHtml(goal.label)}</li>`).join("")}</ul><div class="setup-controls">${controls}</div><p id="setup-preview">${escapeHtml(preview())}</p><button class="primary-button" id="setup-start">Start practice</button>`;
    document.querySelectorAll("[data-slider]").forEach((input) => input.oninput = () => { draft[input.dataset.slider] = Number(input.value); $("#slider-" + input.dataset.slider).value = input.value; $("#setup-preview").textContent = preview(); });
    $("#setup-start").onclick = () => { closeModal(); state.appliedSettings = { ...draft }; startRetrySession(draft); toast("Settings fixed for this attempt. Find Maya to begin."); };
  };
  getScenario("deadline").then(render, () => {
    if (!current()) return;
    box.innerHTML = '<div class="turn-error" role="alert"><p>Could not load this practice.</p><button class="secondary-button" id="setup-retry">Retry</button></div>';
    const retry = $("#setup-retry");
    if (retry) retry.onclick = () => openSettings(draft);
  });
}
function restartTextRun(withSettings, scenarioId = state.scenario, settings = state.appliedSettings || DEFAULT_SLIDERS) {
  const previous = settings;
  closeModal();
  resetTextRun(scenarioId);
  if (scenarioId !== "deadline") {
    toast("Fresh scenario ready. Find Maya to begin again.");
    return;
  }
  if (!withSettings) {
    state.appliedSettings = { ...previous };
    startRetrySession(previous);
    toast("Preparing a fresh conversation. Find Maya to begin again.");
    return;
  }
  openSettings(previous);
}
function attemptLabel(attempt) {
  return `${new Date(attempt.date).toLocaleDateString()} · ${attempt.total}/100 · ${attempt.band}${attempt.provisional ? " · Provisional" : ""}`;
}
function showProgress() {
  let selected = [];
  const render = () => {
    const attempts = state.attempts.filter((attempt) => attempt.scenario === "deadline");
    const comparison = compareAttempts(...selected.map((id) => attempts.find((attempt) => attempt.session_id === id)));
    const rows = attempts.length ? attempts.map((attempt) => `<div class="attempt-row"><span><strong>${escapeHtml(scenarios[attempt.scenario].title)}</strong><small>${escapeHtml(attemptLabel(attempt))} · v${escapeHtml(attempt.scoring_version)}</small></span><button class="secondary-button" data-select-attempt="${escapeHtml(attempt.session_id)}">${selected.includes(attempt.session_id) ? "Selected" : "Compare"}</button><button class="secondary-button" data-open-attempt="${escapeHtml(attempt.session_id)}">Open feedback</button></div>`).join("") : "<p>No scored attempts yet. Finish a deadline conversation to see its feedback here.</p>";
    const compare = comparison ? `<section class="attempt-compare"><h3>Compare attempts${comparison.crossVersion ? " · versions differ" : ""}</h3><p>${escapeHtml(comparison.first.total)} / 100 · ${escapeHtml(comparison.first.band)} &nbsp; | &nbsp; ${escapeHtml(comparison.second.total)} / 100 · ${escapeHtml(comparison.second.band)}${comparison.provisional ? " · Includes provisional feedback" : ""}</p><table><thead><tr><th>Metric</th><th>First</th><th>Second</th></tr></thead><tbody>${comparison.metrics.map((metric) => `<tr><th>${escapeHtml(metric.id.replaceAll("_", " "))}</th><td>${escapeHtml(metric.first)}</td><td>${escapeHtml(metric.second)}</td></tr>`).join("")}</tbody></table></section>` : "<p class=\"debrief-muted\">Select two attempts from the same scenario to compare their server-reported totals and metrics.</p>";
    showModal("My progress", `<p>${Object.keys(state.complete).length} of 3 workplace scenarios practiced. Every conversation counts.</p><div class="progress-list attempt-list">${rows}</div>${compare}`);
    document.querySelectorAll("[data-select-attempt]").forEach((button) => button.onclick = () => {
      const id = button.dataset.selectAttempt;
      selected = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected.slice(-1), id];
      render();
    });
    document.querySelectorAll("[data-open-attempt]").forEach((button) => button.onclick = () => openDebrief(button.dataset.openAttempt, true));
  };
  render();
}
function showModal(title, content) {
  if (state.dialogue) closeConversation();
  if (document.fullscreenElement)
    document.fullscreenElement.append($("#modal-root"));
  state.paused = true;
  $("#modal-root").innerHTML =
    `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="icon-button modal-close" aria-label="Close">${icon("x")}</button><div class="eyebrow">YOUR CUBICLE SPACE</div><h2 id="modal-title">${title}</h2>${content}</section></div>`;
  $(".modal-close").onclick = closeModal;
  $(".modal-backdrop").onclick = (e) => {
    if (e.target === $(".modal-backdrop")) closeModal();
  };
  refreshIcons();
  $(".modal-close").focus({ preventScroll: true });
}
function closeModal() {
  $("#modal-root").innerHTML = "";
  state.paused = false;
  $("#game-viewport").focus({ preventScroll: true });
}
function showGuide() {
  showModal(
    "Make yourself at home.",
    `<p>Practice everyday work conversations at your own pace.</p><ol class="guide-list"><li><strong>Pick a moment.</strong><span>Choose a workplace scenario from the sidebar.</span></li><li><strong>Explore the office.</strong><span>Use WASD or arrow keys. You can also click an open spot on the floor, or use the touch controls.</span></li><li><strong>Start a conversation.</strong><span>Get close to a colleague and press E, or click the talk prompt. Choose a reply and see how the conversation unfolds.</span></li></ol><div class="reflection">Press Escape to leave a conversation. Restart any time—this is your space to practice.</div>`,
  );
}
$("#scenario").onchange = (e) => {
  state.scenario = e.target.value;
  resetTextRun();
  toast("New scenario, fresh start. Find Maya to begin.");
};
$("#restart").onclick = () => {
  resetTextRun();
  toast("A fresh start. Take it at your own pace.");
};
$("#talk-prompt").onclick = openConversation;
$("#help").onclick = showGuide;
$("#nav-guide").onclick = showGuide;
$("#nav-office").onclick = () => {
  closeModal();
  $("#game-viewport").focus();
};
$("#nav-progress").onclick = showProgress;
$("#profile").onclick = () =>
  showModal(
    "Meet your work self.",
    `<div class="large-avatar">A</div><h3>Alex Morgan</h3><p>You’re a project coordinator at a small creative company. Maya is your manager, Jordan is your teammate, and Sam looks after people & culture.</p><div class="reflection">Your mission: build confidence in the everyday conversations that make work better.</div>`,
  );
document.querySelectorAll("[data-person]").forEach(
  (b) =>
    (b.onclick = () => {
      office.highlight(b.dataset.person);
      toast(
        `Find ${people[b.dataset.person].name.split(" ")[0]} by the highlighted marker. Walk over to chat.`,
      );
      $("#game-viewport").focus();
    }),
);
$("#sound").onclick = () => {
  state.muted = !state.muted;
  $("#sound").innerHTML = icon(state.muted ? "volume-x" : "volume-2");
  $("#sound").setAttribute(
    "aria-label",
    state.muted ? "Enable conversation sounds" : "Mute conversation sounds",
  );
  $("#sound").title = state.muted
    ? "Enable conversation sounds"
    : "Mute conversation sounds";
  refreshIcons();
  chime();
  toast(state.muted ? "Conversation sounds off" : "Conversation sounds on");
};
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await $(".game-card").requestFullscreen();
  } catch {
    toast("Fullscreen is unavailable in this browser.");
  }
};
document.querySelectorAll("[data-move]").forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    office.setKey(b.dataset.move, true);
  };
  b.onpointerup = b.onpointercancel = () =>
    office.setKey(b.dataset.move, false);
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if ($("#modal-root").children.length) closeModal();
    else if (state.dialogue) closeConversation();
  }
  if (
    state.dialogue &&
    !state.textMode &&
    ["1", "2", "3"].includes(e.key) &&
    state.dialogue === "maya" &&
    state.round < 2
  )
    choose(Number(e.key) - 1);
  if (e.key === "Tab") {
    let dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      let f = [
        ...dialog.querySelectorAll(
          'button,input,textarea,select,[tabindex="0"]',
        ),
      ].filter((el) => !el.disabled);
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === f.at(-1)) {
        e.preventDefault();
        f[0].focus();
      }
    }
  }
});
document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) $("#app").append($("#modal-root"));
});
updateScenario();
