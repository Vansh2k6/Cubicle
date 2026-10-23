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
  Mic,
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
  Mic,
};
import { createSession, getScenario, sendTurn, endSession, getDebrief, retryDebrief, getVoiceStatus, transcribeAudio, getTurnAudio, getDebriefAudio, newKey } from "./api.js";
import { DEFAULT_SLIDERS } from "../shared/settings.js";
import { settingsPreview } from "./settingsPreview.js";
import { PRESETS, presetName, presetSettings, presetsEnabled } from "../shared/presets.js";
import { renderDebrief, pollDebrief, recoverFeedbackRetry } from "./debrief.js";
import { createEndCoordinator, captureRun } from "./endCoordinator.js";
import { compareAttempts, displayAttemptMetric, displayAttemptScore, readProgress, saveProgress, summaryFromDebrief, upsertAttempt } from "./progress.js";
import {publicCast} from "../shared/presentation.js";
import { projectGuidance } from "./guidance.js";
import "./guidance.css";
const ending = createEndCoordinator();
const voiceBuildEnabled = import.meta.env.VITE_VOICE === "1";
let voiceStatus = null;
let voiceController = null;
let voiceMountCleanup = null;
let voiceStatusPending = null;
let speechPlayback = null;
let activeSpeechNpc = null;
let voiceViewRefresh = null;
let activeListenMoment = null;
function markListen(speaking) {
  document.querySelectorAll("[data-listen]").forEach((button) => {
    const active = speaking && button.dataset.listen === activeListenMoment;
    button.textContent = active ? "Listen · playing" : "Listen";
    button.setAttribute("aria-pressed", String(active));
  });
}
function unlockSpeech() { if (state.entry === "office" && !document.hidden && voiceBuildEnabled && !state.muted && voiceController?.isEnabled()) speechPlayback?.unlock().catch(() => {}); }
function stopSpeech() { speechPlayback?.stop(); markListen(false); activeListenMoment = null; if (activeSpeechNpc) office?.setSpeaking(activeSpeechNpc, false); activeSpeechNpc = null; }
async function playSpeech(line, thread, npcId, explicit = false) {
  if (state.entry !== "office" || document.hidden || !speechPlayback || !voiceBuildEnabled || !line?.speech || state.muted || !voiceController?.isEnabled() || ending.busy(state.sessionId, state.scenario)) return;
  const current = () => state.entry === "office" && !document.hidden && state.textMode && state.text === thread && state.dialogue === npcId && !thread.over && state.sessionId === line.sessionId && !state.muted && !ending.busy(state.sessionId, state.scenario) && voiceController?.isEnabled();
  speechPlayback.play({ sessionId: line.sessionId, speech: line.speech, text: line.text, current, muted: state.muted, explicit, unlocked: speechPlayback.isUnlocked(), npcId });
}
function playListen(sessionId, moment, current) {
  if (state.entry !== "office" || document.hidden || !voiceBuildEnabled || !speechPlayback || state.muted || !voiceController?.isEnabled() || !moment?.moment_id || !current()) return;
  activeListenMoment = moment.moment_id;
  speechPlayback.play({ sessionId, speech: { available: true, mode: "server", turn_id: `moment:${moment.moment_id}` }, text: moment.better_reply,
    current: () => state.entry === "office" && !document.hidden && current() && !state.muted && voiceController?.isEnabled(), muted: state.muted, explicit: true, npcId: "alex_coach" });
}
function cancelVoice() {
  if (voiceMountCleanup) voiceMountCleanup();
  voiceMountCleanup = null;
  if (voiceController) voiceController.cancel();
}
function initialiseVoice(retry = false) {
  if (!voiceBuildEnabled || (voiceStatus && !retry) || voiceStatusPending) return;
  voiceStatusPending = Promise.all([import("./voice.js"), getVoiceStatus()])
    .then(([module, status]) => {
      voiceStatus = status;
      if (status.enabled && !voiceController) {
        speechPlayback = module.createSpeechPlayback({
          fetchAudio: (id, turnId, options) => turnId.startsWith("moment:") ? getDebriefAudio(id, turnId.slice(7), options) : getTurnAudio(id, turnId, options),
          onSpeaking: (speaking, id) => { activeSpeechNpc = speaking ? id : null; office?.setSpeaking(id, speaking); if (id === "alex_coach") markListen(speaking); },
          onUnavailable: () => { toast("Audio unavailable; the caption is still here."); initialiseVoice(true); },
        });
        voiceController = module.createVoiceController({
          transcribe: async (...args) => { try { return await transcribeAudio(...args); } catch (error) { initialiseVoice(true); throw error; } },
          onMicStart: () => { stopSpeech(); unlockSpeech(); },
          onVoiceChange: (enabled) => { if (!enabled) stopSpeech(); else { unlockSpeech(); if (state.muted) toast("Enable conversation sounds to hear replies."); } rerenderVoiceSafely(); },
        });
      }
      rerenderVoiceSafely();
    }).catch(() => { voiceStatus = { enabled: false, stt: false, tts_mode: "none" }; rerenderVoiceSafely(); })
    .finally(() => { voiceStatusPending = null; });
}
function rerenderVoiceSafely() {
  voiceViewRefresh?.();
  if (!state.textMode || !state.text || !state.dialogue) return;
  const old = $("#text-input");
  const draft = old && { value: old.value, start: old.selectionStart, end: old.selectionEnd, focused: document.activeElement === old };
  renderTextDialogue();
  const input = $("#text-input");
  if (draft && input) {
    input.value = draft.value;
    if (draft.focused) { input.focus({ preventScroll: true }); input.setSelectionRange(draft.start, draft.end); }
  }
}
const scenarios = {
  deadline: {
    title: "Missed a project deadline",
    short: "Missed deadline",
    tag: "Taking ownership",
    description:
      "The project was due yesterday. Your manager is waiting for an update. Time to have that conversation.",
    goal: "Own the delay and agree on a realistic next step.",
    opening:
      "Hey Shubhankar, I noticed the project wasn’t submitted yesterday. Can you walk me through what happened?",
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
      "Hi Shubhankar. I sent you an email about the client proposal two days ago. I haven’t heard back. Did you get a chance to see it?",
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
      "Hey Shubhankar, we missed you on the project check-in this morning. Is everything okay?",
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
    name: "Snehal Mane",
    role: "Your manager",
    color: "purple",
    initials: "SM",
  },
  jordan: {
    name: "Vansh Singh",
    role: "Your teammate",
    color: "peach",
    initials: "VS",
  },
  sam: {
    name: "Prathamesh Surwase",
    role: "People & culture",
    color: "sage",
    initials: "PS",
  },
};
const saved = readProgress(() => window.localStorage, Object.keys(scenarios));
let state = {
  entry: "selection",
  scenario: "deadline",
  near: null,
  dialogue: null,
  round: 0,
  score: 0,
  complete: saved.complete,
  attempts: saved.attempts,
  muted: (() => { try { return window.localStorage.getItem("cubicle-muted") !== "false"; } catch { return true; } })(),
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
function currentGuidance() {
  return projectGuidance({
    scenarioId: state.scenarioMetadata?.id || (state.scenario === "deadline" ? "missed_deadline" : state.scenario),
    goals: state.sharedGoals,
    ...(state.scenarioMetadata ? {npcs: state.scenarioMetadata.npcs} : {}),
    currentNpc: state.dialogue,
    hint: state.sharedHint,
    ended: state.endReason != null,
  });
}
function updatePublicGuidance() {
  if (state.scenario !== "deadline") return;
  const guidance = currentGuidance();
  const heading = $("#next-heading"), description = $("#next-description"), step = $(".step-number");
  if (heading) heading.textContent = guidance.heading;
  if (description) {
    description.textContent = guidance.description;
    if (state.endReason && state.sessionId && !state.dialogue) {
      const sessionId = state.sessionId;
      const run = captureRun(state);
      const button = document.createElement("button");
      button.className = "secondary-button next-debrief";
      button.textContent = "View debrief";
      button.onclick = () => {
        if (run() && !state.dialogue && state.endReason && state.sessionId === sessionId) openDebrief(sessionId);
      };
      description.append(" ", button);
    }
  }
  if (step) step.innerHTML = `${guidance.step} <span>/ 03</span>`;
}
function updateScenario() {
  let s = scenarios[state.scenario];
  const title = $("#scenario-title");
  if (title) title.textContent = s.title;
  $("#scenario-description").textContent = s.description;
  $("#objective-text").textContent = s.goal;
  if (state.scenario === "deadline") updatePublicGuidance();
  else {
    $("#next-heading").textContent = "Say hello to Snehal";
    $("#next-description").innerHTML =
      "Walk up to your manager and press <kbd>E</kbd> to start the conversation.";
    $(".step-number").innerHTML = "01 <span>/ 03</span>";
  }
  updateProgress();
  refreshIcons();
}
function updateProgress() {
  $("#progress-count").textContent = new Set([...Object.keys(state.complete), ...state.attempts.map((a) => a.scenario)]).size;
}
function renderEntry() {
  $("#scenario-cards").innerHTML = Object.entries(scenarios).map(([id, s]) => `<button class="scenario-card" type="button" data-entry-scenario="${id}"><span>${escapeHtml(s.tag)}</span><strong>${escapeHtml(s.title)}</strong><small>${escapeHtml(s.goal)}</small></button>`).join("");
  document.querySelectorAll("[data-entry-scenario]").forEach((button) => button.onclick = () => showBriefing(button.dataset.entryScenario));
}
function showBriefing(id) {
  if (state.entry !== "selection" || !scenarios[id]) return;
  state.entry = "briefing";
  state.scenarioMetadata = null;
  state.scenario = id;
  $("#scenario").value = id;
  const s = scenarios[id], briefing = $("#scenario-briefing");
  briefing.hidden = false;
  briefing.innerHTML = `<h2>${escapeHtml(s.title)}</h2><p>${escapeHtml(s.description)}</p><dl><div><dt>Your role</dt><dd>Shubhankar, an employee</dd></div><div><dt>Your objective</dt><dd>${escapeHtml(s.goal)}</dd></div></dl><div class="entry-actions"><button class="secondary-button" id="briefing-back" type="button">Back</button><button class="primary-button" id="entry-start" type="button">Start your day ${icon("arrow-right")}</button></div>`;
  $("#scenario-cards").hidden = true;
  $("#briefing-back").onclick = showSelection;
  $("#entry-start").onclick = () => { updateScenario(); startOffice().catch(() => {}); };
  refreshIcons();
}
function showSelection() {
  officeGeneration++;
  officeCancel?.(); officeCancel = null;
  if (state.entry === "loading") { office?.dispose(); office = null; }
  officeStart = null;
  clearTimeout(entryFade);
  document.body.classList.remove("office-mounted", "office-entering");
  $("#entry-screen").classList.remove("entry-leaving");
  state.entry = "selection";
  $(".game-card").inert = true;
  document.body.classList.remove("office-active");
  $("#entry-screen").hidden = false;
  $("#entry-loading").hidden = true;
  $("#entry-error").hidden = true;
  $("#scenario-briefing").hidden = true;
  $("#scenario-cards").hidden = false;
  renderEntry();
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
let office = null;
let officeStart = null;
let officeGeneration = 0;
let entryFade;
let officeCancel = null;
function officeHooks() { return {
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
  isPaused: () => state.entry !== "office" || document.body.classList.contains("office-entering") || $("#end-practice-dialog").open || state.paused || (state.dialogue && !state.textMode),
  onReady() {
    $("#loading")?.remove();
  },
  isVisible: () => state.entry === "office" || state.entry === "loading",
}; }
function enterOffice() {
  state.entry = "office";
  document.body.classList.add("office-active", "office-entering");
  $("#entry-screen").classList.add("entry-leaving");
  const finish = () => {
    $("#entry-screen").hidden = true;
    $("#entry-screen").classList.remove("entry-leaving");
    document.body.classList.remove("office-entering");
    $(".game-card").inert = false;
    $("#game-viewport").focus({ preventScroll: true });
  };
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) finish();
  else entryFade = setTimeout(finish, 450);
}
function officeFailure() {
  cancelVoice(); stopSpeech();
  office?.dispose(); office = null; officeStart = null;
  state.entry = "error";
  $(".game-card").inert = true;
  document.body.classList.remove("office-active", "office-mounted", "office-entering");
  clearTimeout(entryFade);
  $("#entry-screen").classList.remove("entry-leaving");
  $("#entry-screen").hidden = false;
  $("#entry-loading").hidden = true;
  $("#entry-error").hidden = false;
  $("#entry-error").innerHTML = '<p>We could not prepare the office. Check graphics support, then try again.</p><button class="primary-button" id="entry-retry" type="button">Retry</button><button class="secondary-button" id="entry-back" type="button">Back</button>';
  $("#entry-retry").onclick = () => startOffice().catch(() => {});
  $("#entry-back").onclick = showSelection;
  $("#entry-retry").focus({ preventScroll: true });
}
function startOffice() {
  if (officeStart) return officeStart;
  if (!["briefing", "error"].includes(state.entry)) return Promise.resolve(office);
  const generation = ++officeGeneration;
  state.entry = "loading";
  document.body.classList.add("office-mounted");
  $("#scenario-briefing").hidden = true;
  $("#scenario-cards").hidden = true;
  $("#entry-error").hidden = true;
  $("#entry-loading").hidden = false;
  if (office) { enterOffice(); return Promise.resolve(office); }
  let instance;
  officeStart = import("./office.js").then(({ createOffice }) => {
    if (generation !== officeGeneration) return null;
    return new Promise((resolve, reject) => {
      officeCancel = () => reject(new Error("Office entry cancelled"));
      instance = createOffice($("#game-viewport"), { ...officeHooks(),
        onReady() {
          if (generation !== officeGeneration) { instance?.dispose(); resolve(null); return; }
          $("#loading")?.remove();
          resolve(instance);
        },
        onError(error) {
          if (generation === officeGeneration && state.entry === "loading") reject(error);
          else if (instance === office && state.entry === "office") officeFailure();
        },
      });
      office = instance;
    });
  }).then((result) => {
    if (generation === officeGeneration && result) enterOffice();
    else instance?.dispose();
    return result;
  }).catch((error) => {
    instance?.dispose();
    if (generation === officeGeneration) officeFailure();
    throw error;
  }).finally(() => { if (generation === officeGeneration) { officeStart = null; officeCancel = null; } });
  return officeStart;
}
function chime() {
  if (state.entry !== "office" || document.hidden || state.muted) return;
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
window.addEventListener("blur", stopSpeech);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") stopSpeech(); });
function openConversation() {
  if (state.entry !== "office" || $("#end-practice-dialog").open || !state.near || state.paused) return;
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
  cancelVoice();
  stopSpeech();
  state.dialogue = null;
  state.textMode = false;
  state.text = null;
  $("#dialogue-layer").innerHTML = "";
  $("#game-viewport").focus({ preventScroll: true });
  $("#talk-prompt").classList.toggle("hidden", !state.near);
  updatePublicGuidance();
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
        ? `Hey Shubhankar! ${state.scenario === "deadline" ? "I’ve been there with a late project. Be honest with Snehal, then bring a realistic plan. You don’t have to have it all figured out." : state.scenario === "email" ? "A quick, clear reply goes a long way. Tell Snehal when you can follow up, then make a little space in your day for your inbox." : "Check the meeting notes before you reconnect. It helps to arrive with a few specific questions."}`
        : "Hi Shubhankar! A reminder: tricky conversations get easier with practice. Take a breath, listen carefully, and focus on what you can do next. You’ve got this.";
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
  openSettings(state.appliedSettings || DEFAULT_SLIDERS, state.dialogue);
}

function startTextSession() {
  if (state.sessionId || state.startingSession || !state.textMode || !state.text) return;
  const current = captureRun(state), thread = state.text;
  state.startingSession = true;
  state.text.loadError = null;
  renderTextDialogue();
  createSession("deadline", state.appliedSettings || DEFAULT_SLIDERS).then(
    (data) => {
      if (!current()) return;
      state.startingSession = false;
      state.sessionId = data.session_id;
    state.scenarioMetadata = data.scenario ? {...data.scenario, npcs: publicCast(data.scenario.npcs, Object.fromEntries(data.scenario.npcs.map((npc) => [npc.id, npc])))} : null;
      state.sharedGoals = (data.public_state && data.public_state.goals) || [];
      state.sharedHint = (data.public_state && data.public_state.next_hint) || "";
      state.appliedSettings = data.settings || state.appliedSettings;
      updatePublicGuidance();
      if (state.textMode && state.text === thread) renderTextDialogue();
    },
    (err) => {
      if (!current()) return;
      state.startingSession = false;
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
  cancelVoice();
  const busy = t.busy || ending.busy(state.sessionId, state.scenario);
  const p = people[state.dialogue];
  const npcId = state.dialogue;
  const first = p.name.split(" ")[0];
  const guidance = currentGuidance();
  const voiceAvailable = !!(voiceStatus && voiceStatus.enabled && voiceStatus.stt && voiceController);
  const lines = t.transcript
    .map((l) =>
      l.who === "user"
        ? `<div class="t-line user"><span>${escapeHtml(l.text)}</span></div>`
        : `<div class="t-line npc"><strong>${escapeHtml(l.name)}</strong><span>${escapeHtml(l.text)}</span>${l.speech ? `<button class="speech-replay icon-button" type="button" data-replay="${escapeHtml(l.speech.turn_id)}" aria-label="Replay ${escapeHtml(l.name)}'s reply" ${state.muted || state.endReason || ending.busy(state.sessionId, state.scenario) || !voiceController?.isEnabled() ? "disabled" : ""}>${icon("volume-2")}</button>` : ""}</div>`,
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
    `<button id="close-dialogue" class="icon-button" aria-label="Leave conversation and continue exploring" title="Leave conversation and continue exploring">${icon("x")}</button></div>` +
    `<div class="transcript" role="log" aria-live="polite" aria-label="Conversation transcript">${lines || `<div class="t-empty">Say hello to ${escapeHtml(first)} — type your reply below.</div>`}</div>` +
    (state.startingSession
      ? `<div class="typing" role="status"><span class="dots" aria-hidden="true"><span></span><span></span><span></span></span>Preparing this conversation…</div>`
      : t.busy
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
        `<div class="text-row"><input id="text-input" name="text" type="text" maxlength="500" autocomplete="off" placeholder="Type your reply…" ${busy ? "disabled" : ""} aria-describedby="text-hint${voiceAvailable ? " voice-status" : ""}" />` +
        (voiceBuildEnabled && voiceStatus && !voiceStatus.stt ? `<span class="voice-status">Voice unavailable — type instead.</span><button class="voice-toggle" id="voice-retry" type="button">Retry voice</button>` : "") +
        (voiceAvailable ? `<button class="voice-toggle" type="button" id="voice-toggle" aria-pressed="false">Voice off</button><button class="voice-mic icon-button" type="button" id="voice-mic" aria-label="Hold to record a voice reply" aria-pressed="false" ${busy ? "disabled" : ""}>${icon("mic")}</button>` : "") +
        `<button class="primary-button" type="submit" ${busy ? "disabled" : ""}>Send ${icon("arrow-right")}</button></div>` +
        `<small id="text-hint">Enter sends · Esc leaves this conversation${voiceAvailable ? " · Ctrl+Shift+Space records" : ""}</small>${voiceAvailable ? `<span id="voice-status" class="voice-status" role="status" aria-live="polite"></span>` : ""}</form>`
      : "") +
    `<details class="guidance-hint"><summary>Goals & hints</summary><section class="public-objective" aria-label="Current objective"><strong>Current objective</strong>${escapeHtml(guidance.objective)}</section>${goals ? `<ul class="goal-list" aria-label="Visible goals">${goals}</ul>` : ""}${!t.over ? `${guidance.hint ? `<p>${escapeHtml(guidance.hint)}</p>` : ""}<p>${escapeHtml(guidance.question)}</p>` : ""}</details>` +
    `<div id="text-debug"></div>` +
    (state.sessionId && !t.over
      ? `<button class="secondary-button text-finish" id="finish-text" ${ending.busy(state.sessionId, state.scenario) ? "disabled" : ""}>${ending.busy(state.sessionId, state.scenario) ? "Ending…" : "Finish practice & reflect"} ${icon("arrow-right")}</button>`
      : "") +
    (state.sessionId && t.over
      ? `<button class="secondary-button text-view-debrief" id="text-view-debrief">View debrief</button>`
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
      unlockSpeech();
      cancelVoice();
      sendTextTurn(value, newKey(), false);
    };
  }
  const voiceRetry = $("#voice-retry");
  if (voiceRetry) voiceRetry.onclick = () => initialiseVoice(true);
  const retryLoad = $("#text-retry-load");
  if (retryLoad) retryLoad.onclick = startTextSession;
  const retryTurn = $("#text-retry-turn");
  if (retryTurn)
    retryTurn.onclick = () => {
      const f = state.text && state.text.failed;
      if (f) sendTextTurn(f.text, f.key, true);
    };
  document.querySelectorAll("[data-replay]").forEach((button) => button.onclick = () => {
    const line = t.transcript.find((entry) => entry.speech?.turn_id === button.dataset.replay);
    if (line) playSpeech(line, t, npcId, true);
  });
  const finish = $("#finish-text");
  if (finish) finish.onclick = completeTextSession;
  const viewDebrief = $("#text-view-debrief");
  if (viewDebrief) {
    const sessionId = state.sessionId;
    const run = captureRun(state);
    viewDebrief.onclick = () => {
      if (run() && state.text === t && t.over && state.sessionId === sessionId) openDebrief(sessionId);
    };
  }
  refreshIcons();
  const transcript = document.querySelector(".transcript");
  if (transcript) transcript.scrollTop = transcript.scrollHeight;
  const input = $("#text-input");
  if (voiceAvailable && input) {
    voiceMountCleanup = voiceController.mount({
      toggle: $("#voice-toggle"), mic: $("#voice-mic"), status: $("#voice-status"), input,
      sessionId: state.sessionId,
      current: () => state.entry === "office" && !document.hidden && state.textMode && state.text === t && state.dialogue === npcId && state.sessionId != null && !t.busy && !t.over && !ending.busy(state.sessionId, state.scenario),
    });
  }
  if (input && !t.busy) input.focus({ preventScroll: true });
  else $("#close-dialogue").focus({ preventScroll: true });
  paintTextDebug();
  initialiseVoice();
}

async function sendTextTurn(text, key, isRetry) {
  // The turn is bound to its thread at send time: closing the panel never
  // loses it. The resolved NPC line lands in the thread and renders on
  // reopen; retries reuse the same key so the server applies it once.
  cancelVoice();
  const thread = state.text;
  const npcId = state.dialogue;
  const sessionId = state.sessionId;
  const current = captureRun(state);
  if (state.entry !== "office" || !thread || !npcId || thread.busy || state.sessionId == null || thread.over || ending.busy(state.sessionId, state.scenario)) return;
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
      speech: data.speech?.available ? data.speech : null,
      sessionId,
    });
    const npcLine = thread.transcript[thread.transcript.length - 1];
    if (!current()) return;
    if (data.public_state) {
      state.sharedGoals = data.public_state.goals || state.sharedGoals;
      thread.mood = data.public_state.mood_label || thread.mood;
      state.sharedHint = data.public_state.next_hint || state.sharedHint;
      if (data.public_state.ended) thread.over = true;
      if (data.public_state.ended) state.endReason = data.end_reason || "ended";
      updatePublicGuidance();
    }
    if (data.ended) {
      for (const t of Object.values(threadsFor())) t.over = true;
      state.endReason = data.end_reason;
      updatePublicGuidance();
    }
    if (window.__CUBICLE_DEBUG) stashTextTrace(data, thread);
    if (data.ended) {
      if (state.text === thread) renderTextDialogue();
      openDebrief(sessionId);
    }
    else if (state.text === thread) { renderTextDialogue(); playSpeech(npcLine, thread, npcId); }
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
  cancelVoice();
  stopSpeech();
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
    if (result.public_state) {
      state.sharedGoals = result.public_state.goals || state.sharedGoals;
      state.sharedHint = result.public_state.next_hint || state.sharedHint;
    }
    updatePublicGuidance();
  } catch { if (current(sessionId, scenarioId)) { renderTextDialogue(); toast("Could not end the session. Please try again."); } return; }
  state.complete[state.scenario] = {
    date: new Date().toISOString(),
    mode: "text",
  };
  persistProgress();
  closeConversation();
  updateProgress();
  updatePublicGuidance();
  openDebrief(sessionId);
  refreshIcons();
}

function openDebrief(sessionId, historical = false) {
  const run = captureRun(state);
  const attemptScenario = state.attempts.find((attempt) => attempt.session_id === sessionId)?.scenario || state.scenario;
  showModal("Practice debrief", '<div id="debrief-content" aria-live="polite"></div>');
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
  let latest = null, latestPacket = null, feedbackRefreshing = false;
  const render = (packet) => {
    if (!current()) return;
    const focused = document.activeElement;
    const hadContentFocus = box.contains(focused);
    const focusedId = focused?.id;
    latestPacket = packet;
    latest = packet.debrief || latest;
    box.innerHTML = renderDebrief({ ...packet, debrief: latest }, { listenEnabled: voiceBuildEnabled && !!voiceController && packet.status !== "pending" && !feedbackRefreshing, listenDisabled: state.muted || !voiceController?.isEnabled() });
    if (voiceBuildEnabled) {
      const controls = document.createElement("div"); controls.className = "debrief-actions";
      controls.innerHTML = `${voiceController ? `<button class="voice-toggle" id="debrief-voice" aria-pressed="${voiceController.isEnabled()}">Voice ${voiceController.isEnabled() ? "on" : "off"}</button>` : ""}<button class="voice-toggle" id="debrief-sound" aria-pressed="${!state.muted}">Sounds ${state.muted ? "off" : "on"}</button>${!voiceStatus?.stt ? `<button class="voice-toggle" id="debrief-voice-retry">Voice unavailable — retry</button>` : ""}`;
      box.prepend(controls);
      const toggle = $("#debrief-voice"); if (toggle) toggle.onclick = () => voiceController.toggle();
      $("#debrief-sound").onclick = () => $("#sound").onclick();
      const retryVoice = $("#debrief-voice-retry"); if (retryVoice) retryVoice.onclick = () => initialiseVoice(true);
      box.querySelectorAll("[data-listen]").forEach((button) => button.onclick = () => {
        const moment = latest?.moments.find((m) => m.moment_id === button.dataset.listen);
        if (!moment || state.muted || !voiceController?.isEnabled() || !current()) return;
        const packetAtClick = latest;
        playListen(sessionId, moment, () => current() && latest === packetAtClick && latestPacket?.status !== "pending" && !feedbackRefreshing);
      });
    }
    if (latest) {
      const attempt = summaryFromDebrief(sessionId, "deadline", latest);
      state.attempts = upsertAttempt({ attempts: state.attempts }, attempt).attempts;
      persistProgress();
      const actions = document.createElement("div");
      actions.className = "debrief-actions";
      actions.innerHTML = `<button class="primary-button" id="try-again">Try again</button><button class="secondary-button" id="try-settings">Try again with new settings</button>`;
      (box.querySelector("[data-debrief-actions]") || box).append(actions);
      const attemptSettings = latest.settings?.maya || state.appliedSettings || DEFAULT_SLIDERS;
      $("#try-again").onclick = () => restartTextRun(false, attemptScenario, attemptSettings);
      $("#try-settings").onclick = () => restartTextRun(true, attemptScenario, attemptSettings);
    }
    const check = $("#feedback-refresh");
    if (check) check.onclick = () => { disableFeedbackControl(check); poll(); };
    const retry = $("#feedback-retry");
    if (retry) retry.onclick = async () => {
      feedbackRefreshing = true; stopSpeech();
      disableFeedbackControl(retry); retry.textContent = "Requesting feedback…";
      voiceViewRefresh?.();
      try { await recoverFeedbackRetry({ request: () => retryDebrief(sessionId), current, refresh: poll }); }
      finally { feedbackRefreshing = false; voiceViewRefresh?.(); }
    };
    if (hadContentFocus && current()) {
      const replacement = focusedId ? document.getElementById(focusedId) : null;
      const target = replacement && box.contains(replacement) && !replacement.disabled ? replacement : $(".modal-close");
      target.focus({ preventScroll: true });
    }
  };
  const poll = () => pollDebrief({ load, current, render });
  voiceViewRefresh = () => { if (latestPacket && current()) render(latestPacket); };
  render({ status: "pending", debrief: null });
  initialiseVoice();
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
    `<div class="completion-symbol">${icon("check")}</div><p>You practiced <strong>${scenarios[state.scenario].short.toLowerCase()}</strong> and made a clear plan with Snehal.</p><div class="reflection"><strong>Take this into your next conversation</strong><p>Own what happened. Recognize the impact. Offer a specific next step.</p></div><button id="try-next" class="primary-button">Try another scenario ${icon("arrow-right")}</button>`,
  );
  $("#try-next").onclick = () => {
    const keys = Object.keys(scenarios);
    state.scenarioMetadata = null;
    state.scenario = keys[(keys.indexOf(state.scenario) + 1) % keys.length];
    $("#scenario").value = state.scenario;
    closeModal();
    office?.reset();
    updateScenario();
  };
  refreshIcons();
}
function resetTextRun(scenarioId = state.scenario) {
  closeConversation();
  state.scenarioMetadata = null;
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
  office?.reset();
  updateScenario();
}
function startRetrySession(sliders = state.appliedSettings || DEFAULT_SLIDERS, resumeNpc = null) {
  const threads = threadsFor();
  const thread = resumeNpc ? threads[resumeNpc] : null;
  const current = captureRun(state);
  state.startingSession = true;
  if (thread && state.textMode && state.text === thread && state.dialogue === resumeNpc) renderTextDialogue();
  createSession("deadline", sliders).then((data) => {
    if (!current() || state.threads !== threads || state.sessionId) return;
    state.sessionId = data.session_id;
    state.scenarioMetadata = data.scenario ? {...data.scenario, npcs: publicCast(data.scenario.npcs, Object.fromEntries(data.scenario.npcs.map((npc) => [npc.id, npc])))} : null;
    state.sharedGoals = data.public_state?.goals || [];
    state.sharedHint = data.public_state?.next_hint || "";
    state.appliedSettings = data.settings || sliders;
    state.startingSession = false;
    updatePublicGuidance();
    if (thread && state.textMode && state.text === thread && state.dialogue === resumeNpc) renderTextDialogue();
  }, () => {
    if (!current() || state.threads !== threads) return;
    state.startingSession = false;
    if (thread && state.textMode && state.text === thread && state.dialogue === resumeNpc) {
      thread.loadError = "Could not reach the conversation server.";
      renderTextDialogue();
      return;
    }
    toast("Could not start a fresh conversation. Find Snehal and retry.");
  });
}
function openSettings(initial = DEFAULT_SLIDERS, resumeNpc = null) {
  const draft = { ...initial };
  const showPresets = presetsEnabled(import.meta.env.VITE_PRESETS);
  const preview = () => settingsPreview(draft);
  showModal("Set the conversation", '<div id="setup-content" aria-live="polite">Loading this practice…</div>');
  const box = $("#setup-content");
  const run = captureRun(state);
  const current = () => run() && $("#setup-content") === box;
  const render = (scenario) => {
    if (!current()) return;
    const controls = Object.keys(DEFAULT_SLIDERS).map((key) => `<label class="setup-slider">${escapeHtml(key)} <output id="slider-${key}">${draft[key]}</output><input type="range" min="0" max="100" step="1" value="${draft[key]}" data-slider="${key}"></label>`).join("");
    const presetOptions = Object.keys(PRESETS).map((name) => `<option value="${name}"${presetName(draft) === name ? " selected" : ""}>${name}</option>`).join("");
    const selector = showPresets ? `<label class="setup-preset">Starting style<select id="setup-preset"><option value="Custom"${presetName(draft) === "Custom" ? " selected" : ""}>Custom</option>${presetOptions}</select></label>` : "";
    box.innerHTML = `<p><strong>${escapeHtml(scenario.title)}</strong></p><p>${escapeHtml(scenario.briefing)}</p><ul>${scenario.goals.map((goal) => `<li>${escapeHtml(goal.label)}</li>`).join("")}</ul>${selector}<div class="setup-controls">${controls}</div><p id="setup-preview">${escapeHtml(preview())}</p><button class="primary-button" id="setup-start">Start practice</button>`;
    const refreshDraft = () => { Object.keys(draft).forEach((key) => { const input = document.querySelector(`[data-slider="${key}"]`); if (input) input.value = draft[key]; const output = $("#slider-" + key); if (output) output.value = draft[key]; }); $("#setup-preview").textContent = preview(); };
    document.querySelectorAll("[data-slider]").forEach((input) => input.oninput = () => { draft[input.dataset.slider] = Number(input.value); const selector = $("#setup-preset"); if (selector) selector.value = presetName(draft); refreshDraft(); });
    const preset = $("#setup-preset");
    if (preset) preset.onchange = () => { const values = presetSettings(preset.value); if (values) Object.assign(draft, values); refreshDraft(); };
    $("#setup-start").onclick = () => {
      closeModal();
      state.appliedSettings = { ...draft };
      if (resumeNpc && state.near === resumeNpc) {
        state.dialogue = resumeNpc;
        state.textMode = true;
        state.text = threadsFor()[resumeNpc];
        $("#talk-prompt").classList.add("hidden");
      }
      startRetrySession(draft, resumeNpc);
      toast(resumeNpc ? "Settings fixed. Preparing your conversation…" : "Settings fixed for this attempt. Find Snehal to begin.");
    };
  };
  getScenario("deadline").then(render, () => {
    if (!current()) return;
    box.innerHTML = '<div class="turn-error" role="alert"><p>Could not load this practice.</p><button class="secondary-button" id="setup-retry">Retry</button></div>';
    const retry = $("#setup-retry");
    if (retry) retry.onclick = () => openSettings(draft, resumeNpc);
  });
}
function restartTextRun(withSettings, scenarioId = state.scenario, settings = state.appliedSettings || DEFAULT_SLIDERS) {
  const previous = settings;
  closeModal();
  resetTextRun(scenarioId);
  if (scenarioId !== "deadline") {
    toast("Fresh scenario ready. Find Snehal to begin again.");
    return;
  }
  if (!withSettings) {
    state.appliedSettings = { ...previous };
    startRetrySession(previous);
    toast("Preparing a fresh conversation. Find Snehal to begin again.");
    return;
  }
  openSettings(previous);
}
function attemptLabel(attempt) {
  return `${new Date(attempt.date).toLocaleDateString()} · ${displayAttemptScore(attempt)}`;
}
function showProgress() {
  let selected = [];
  const metricLabels = { goals: "Goals", hidden_facts: "Hidden facts", integrity: "Integrity", relationship: "Relationship", rubric: "Communication (AI-assessed)" };
  const render = () => {
    const attempts = state.attempts.filter((attempt) => attempt.scenario === "deadline");
    const comparison = compareAttempts(...selected.map((id) => attempts.find((attempt) => attempt.session_id === id)));
    const rows = attempts.length ? attempts.map((attempt) => `<div class="attempt-row"><span><strong>${escapeHtml(scenarios[attempt.scenario].title)}</strong><small>${escapeHtml(attemptLabel(attempt))} · v${escapeHtml(attempt.scoring_version)}</small></span><button class="secondary-button" data-select-attempt="${escapeHtml(attempt.session_id)}">${selected.includes(attempt.session_id) ? "Selected" : "Compare"}</button><button class="secondary-button" data-open-attempt="${escapeHtml(attempt.session_id)}">Open feedback</button></div>`).join("") : "<p>No scored attempts yet. Finish a deadline conversation to see its feedback here.</p>";
    const compare = comparison ? `<section class="attempt-compare"><h3>Compare attempts${comparison.crossVersion ? " · versions differ" : ""}</h3><p>${escapeHtml(displayAttemptScore(comparison.first))} &nbsp; | &nbsp; ${escapeHtml(displayAttemptScore(comparison.second))}</p><table><thead><tr><th>Metric</th><th>First</th><th>Second</th></tr></thead><tbody>${comparison.metrics.map((metric) => `<tr><th>${escapeHtml(metricLabels[metric.id] || metric.id.replaceAll("_", " "))}</th><td>${escapeHtml(displayAttemptMetric(comparison.first, metric.id))}</td><td>${escapeHtml(displayAttemptMetric(comparison.second, metric.id))}</td></tr>`).join("")}</tbody></table></section>` : "<p class=\"debrief-muted\">Select two attempts from the same scenario to compare their server-reported totals and metrics.</p>";
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
  stopSpeech(); voiceViewRefresh = null;
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
  stopSpeech(); voiceViewRefresh = null;
  $("#modal-root").innerHTML = "";
  state.paused = false;
  $("#game-viewport").focus({ preventScroll: true });
}
function showGuide() {
  showModal(
    "Make yourself at home.",
    `<p>Practice everyday work conversations at your own pace.</p><ol class="guide-list"><li><strong>Pick a moment.</strong><span>Choose a workplace scenario from the menu.</span></li><li><strong>Explore the office.</strong><span>Use WASD or arrow keys. You can also click an open spot on the floor, or use the touch controls.</span></li><li><strong>Start a conversation.</strong><span>Get close to a colleague and press E, or click the talk prompt. Choose a reply and see how the conversation unfolds.</span></li></ol><div class="reflection">Press Escape to leave a conversation. Restart any time—this is your space to practice.</div>`,
  );
}
$("#scenario").onchange = (e) => {
  state.scenarioMetadata = null;
  state.scenario = e.target.value;
  resetTextRun();
  toast("New scenario, fresh start. Find Snehal to begin.");
};
$("#restart").onclick = () => {
  resetTextRun();
  toast("A fresh start. Take it at your own pace.");
};
$("#talk-prompt").onclick = openConversation;
let menuFocus = null;
$("#office-menu").onclick = () => {
  if (state.entry !== "office") return;
  const dialog = $("#end-practice-dialog");
  menuFocus = document.activeElement;
  dialog.returnValue = "cancel";
  dialog.showModal();
  dialog.querySelector("button[value=cancel]").focus();
};
$("#end-practice-dialog").addEventListener("close", () => {
  const dialog = $("#end-practice-dialog");
  if (dialog.returnValue !== "confirm") {
    if (menuFocus?.isConnected) menuFocus.focus({ preventScroll: true });
    return;
  }
  cancelVoice(); stopSpeech();
  closeModal();
  resetTextRun();
  showSelection();
  $("#entry-title").focus({ preventScroll: true });
});
$("#office-context").onclick = () => {
  const s = scenarios[state.scenario];
  showModal("Your practice", `<h3>${escapeHtml(s.title)}</h3><p>${escapeHtml(s.description)}</p><p>${escapeHtml(s.goal)}</p><button class="secondary-button" id="context-progress">My progress</button><button class="secondary-button" id="context-settings">Conversation settings</button><button class="secondary-button" id="context-restart">Restart scenario</button><div id="context-people"></div>`);
  $("#context-progress").onclick = showProgress;
  $("#context-settings").onclick = () => {
    const settings = state.appliedSettings || DEFAULT_SLIDERS;
    showModal("Conversation settings", `<p>${escapeHtml(settingsPreview(settings))}</p><dl>${Object.entries(settings).map(([name, value]) => `<dt>${escapeHtml(name)}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl><p>Choose your settings when you start your first conversation. Settings stay fixed for that attempt.</p>`);
  };
  $("#context-restart").onclick = () => { closeModal(); resetTextRun(); };
  const peopleBox = $("#context-people");
  peopleBox.innerHTML = Object.entries(people).map(([id, p]) => `<button class="person" data-context-person="${id}"><strong>${p.name}</strong><small>${p.role}</small></button>`).join("");
  peopleBox.querySelectorAll("[data-context-person]").forEach((button) => button.onclick = () => { closeModal(); office?.highlight(button.dataset.contextPerson); });
};
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
    `<div class="large-avatar">SP</div><h3>Shubhankar Parsewar</h3><p>You’re a project coordinator at a small creative company. Snehal is your manager, Vansh is your teammate, and Prathamesh looks after people & culture.</p><div class="reflection">Your mission: build confidence in the everyday conversations that make work better.</div>`,
  );
document.querySelectorAll("[data-person]").forEach(
  (b) =>
    (b.onclick = () => {
      office?.highlight(b.dataset.person);
      toast(
        `Find ${people[b.dataset.person].name.split(" ")[0]} by the highlighted marker. Walk over to chat.`,
      );
      $("#game-viewport").focus();
    }),
);
$("#sound").onclick = () => {
  state.muted = !state.muted;
  try { window.localStorage.setItem("cubicle-muted", String(state.muted)); } catch {}
  if (state.muted) stopSpeech(); else unlockSpeech();
  rerenderVoiceSafely();
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
$("#sound").innerHTML = icon(state.muted ? "volume-x" : "volume-2");
$("#sound").setAttribute("aria-label", state.muted ? "Enable conversation sounds" : "Mute conversation sounds");
$("#sound").title = state.muted ? "Enable conversation sounds" : "Mute conversation sounds";
refreshIcons();
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    toast("Fullscreen is unavailable in this browser.");
  }
};
document.querySelectorAll("[data-move]").forEach((b) => {
  b.onpointerdown = (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    if (state.entry === "office" && !$("#end-practice-dialog").open) office?.setKey(b.dataset.move, true);
  };
  b.onpointerup = b.onpointercancel = () =>
    office?.setKey(b.dataset.move, false);
});
window.addEventListener("keydown", (e) => {
  if ($("#end-practice-dialog").open) return;
  if (state.entry !== "office") return;
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
          'button,input,textarea,select,summary,[tabindex="0"]',
        ),
      ].filter((el) => !el.disabled && el.getClientRects().length > 0);
      if (!f.length) return;
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
showSelection();
