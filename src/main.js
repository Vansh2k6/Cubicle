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
let saved;
try {
  saved = JSON.parse(
    localStorage.getItem("cubicle-progress") ||
      localStorage.getItem("workplay-progress") ||
      "{}",
  );
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) saved = {};
  saved = Object.fromEntries(
    Object.entries(saved).filter(([key]) => key in scenarios),
  );
} catch {
  saved = {};
}
let state = {
  scenario: "deadline",
  near: null,
  dialogue: null,
  round: 0,
  score: 0,
  complete: saved,
  muted: true,
  paused: false,
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
  $("#progress-count").textContent = Object.keys(state.complete).length;
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
    const b = $("#talk-prompt");
    b.classList.toggle("hidden", !id || !!state.dialogue);
    if (id)
      b.querySelector("strong").textContent = people[id].name.split(" ")[0];
  },
  onMove() {
    $("#move-hint").classList.add("dismissed");
  },
  onTalk() {
    openConversation();
  },
  isPaused: () => state.paused || !!state.dialogue,
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
  if (!state.near || state.dialogue || state.paused) return;
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
function completeScenario() {
  state.complete[state.scenario] = {
    date: new Date().toISOString(),
    score: state.score,
  };
  try {
    localStorage.setItem("cubicle-progress", JSON.stringify(state.complete));
  } catch {
    toast(
      "Progress is available for this visit; browser storage is unavailable.",
    );
  }
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
  closeConversation();
  office.reset();
  updateScenario();
  toast("New scenario, fresh start. Find Maya to begin.");
};
$("#restart").onclick = () => {
  closeConversation();
  office.reset();
  updateScenario();
  toast("A fresh start. Take it at your own pace.");
};
$("#talk-prompt").onclick = openConversation;
$("#help").onclick = showGuide;
$("#nav-guide").onclick = showGuide;
$("#nav-office").onclick = () => {
  closeModal();
  $("#game-viewport").focus();
};
$("#nav-progress").onclick = () =>
  showModal(
    "Look how far you’ve come.",
    `<p>${Object.keys(state.complete).length} of 3 workplace scenarios practiced. Every conversation counts.</p><div class="progress-list">${Object.entries(
      scenarios,
    )
      .map(
        ([id, s]) =>
          `<div>${icon(state.complete[id] ? "circle-check" : "circle")}<span><strong>${s.title}</strong><small>${s.tag}</small></span><span>${state.complete[id] ? "Practiced" : "Up next"}</span></div>`,
      )
      .join("")}</div>`,
  );
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
    ["1", "2", "3"].includes(e.key) &&
    state.dialogue === "maya" &&
    state.round < 2
  )
    choose(Number(e.key) - 1);
  if (e.key === "Tab") {
    let dialog = document.querySelector('[role="dialog"]');
    if (dialog) {
      let f = [...dialog.querySelectorAll('button,select,[tabindex="0"]')];
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
