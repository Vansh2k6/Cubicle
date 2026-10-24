import {defaultRegistry, publicScenario} from "../../services/api/scenarioRegistry.js";
import {parseScenarioMetadata} from "../../src/scenarioMetadata.js";
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { captureRun } from '../../src/endCoordinator.js';
const source = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
const part = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
const tick = () => new Promise(setImmediate);
function fixture({ reduced = false, fail = false } = {}) {
  const nodes = new Map(), timers = [], counts = { loads: 0, creates: 0, disposes: 0, voices: 0, speech: 0, resets: 0 };
  let hooks, loadResolve, keydown;
  const makeNode = () => {
    const classes = new Set();
    return { hidden: false, open: false, children: [], value: '', innerHTML: '', isConnected: true,
      classList: { add: (...v) => v.forEach(x => classes.add(x)), remove: (...v) => v.forEach(x => classes.delete(x)), contains: x => classes.has(x), toggle() {} },
      focus() { context.document.activeElement = this; }, remove() {}, setAttribute() {},
      querySelector: () => get('#cancel'), querySelectorAll: () => [], addEventListener(type, fn) { this[type] = fn; }, showModal() { this.open = true; },
    };
  };
  const get = id => { if (!nodes.has(id)) nodes.set(id, makeNode()); return nodes.get(id); };
  const state = { entry: 'selection', scenario: 'deadline', sessionId: null, threads: null, dialogue: null, near: null };
  const instance = { dispose() { counts.disposes++; }, reset() { counts.resets++; } };
  const context = { state, office: null, officeStart: null, officeGeneration: 0, officeCancel: null, entryFade: null,
    getScenario: async () => publicScenario(defaultRegistry.getScenario("deadline")), parseScenarioMetadata,
    $: get, escapeHtml: String, icon: () => '', refreshIcons() {}, updateScenario() {},
    cancelVoice() { counts.voices++; }, stopSpeech() { counts.speech++; },
    closeModal() { get('#modal-root').children = []; },
    resetTextRun() { counts.resets++; state.sessionId = null; state.threads = null; state.dialogue = null; },
    matchMedia: () => ({ matches: reduced }), setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {},
    document: { body: { classList: makeNode().classList }, activeElement: null, querySelectorAll: () => [] },
    window: { addEventListener(type, fn) { if (type === 'keydown') keydown = fn; } },
    loadOffice() { counts.loads++; return new Promise(resolve => { loadResolve = resolve; }); },
    officeHooks: () => ({}), loadScenarioMetadata() {},
  };
  // Execute the production entry and native-dialog handlers with a deferred scene module.
  const code = part('const scenarios =', 'const people =') + part('function renderEntry()', 'function persistProgress()') +
    part('function enterOffice()', 'function chime()').replace('import("./office.js")', 'loadOffice()') +
    part('let menuFocus = null;', '$("#office-context").onclick') +
    part('window.addEventListener("keydown", (e) => {', 'document.addEventListener("fullscreenchange"');
  runInNewContext(code, context);
  return { context, state, nodes, get, counts, timers, instance, keydown: (...args) => keydown(...args), hooks: () => hooks,
    load() { loadResolve({ createOffice(container, supplied) { counts.creates++; hooks = supplied; if (fail && counts.creates === 1) throw Error('WebGL failed'); return instance; } }); },
  };
}
for (const id of ['deadline', 'email', 'call']) test(`production selection briefs ${id} and Back returns to all three choices`, async () => {
  const f = fixture(); f.context.renderEntry();
  assert.equal((f.get('#scenario-cards').innerHTML.match(/data-entry-scenario=/g) || []).length, 3);
  f.context.showBriefing(id); await tick(); assert.equal(f.state.entry, 'briefing'); assert.equal(f.state.scenario, id);
  assert.match(f.get('#scenario-briefing').innerHTML, /Shubhankar, an employee/);
  assert.equal(f.get('#entry-prototype').hidden, true);
  assert.equal(f.counts.loads, 0); f.get('#briefing-back').onclick(); assert.equal(f.state.entry, 'selection');
  assert.equal(f.get('#entry-prototype').hidden, false);
});
test('Start defers one import and one scene, waits for successful onReady, then fades for 450 ms', async () => {
  const f = fixture(); f.context.showBriefing('deadline'); await tick(); const pending = f.context.startOffice();
  assert.equal(f.state.entry, 'loading'); assert.equal(f.context.document.body.classList.contains('office-mounted'), true);
  assert.equal(f.context.startOffice(), pending); assert.equal(f.counts.creates, 0);
  f.load(); await tick(); assert.equal(f.counts.creates, 1); assert.equal(f.state.entry, 'loading');
  f.hooks().onReady(); await pending; assert.equal(f.state.entry, 'office');
  assert.equal(f.timers[0].ms, 450); assert.equal(f.get('#entry-screen').hidden, false);
  f.timers[0].fn(); assert.equal(f.get('#entry-screen').hidden, true);
  f.context.showSelection(); f.context.showBriefing('email'); await f.context.startOffice();
  assert.equal(f.counts.loads, 1); assert.equal(f.counts.creates, 1);
});
test('reduced motion enters immediately after the same successful-render gate', async () => {
  const f = fixture({ reduced: true }); f.context.showBriefing('call'); const pending = f.context.startOffice();
  f.load(); await tick(); assert.equal(f.state.entry, 'loading'); f.hooks().onReady(); await pending;
  assert.equal(f.get('#entry-screen').hidden, true); assert.equal(f.timers.length, 0);
});
test('constructor failure becomes recoverable error; Retry creates a fresh scene', async () => {
  const f = fixture({ fail: true }); f.context.showBriefing('email'); const pending = f.context.startOffice(); f.load();
  await assert.rejects(pending); assert.equal(f.state.entry, 'error'); assert.equal(f.context.office, null);
  const retry = f.get('#entry-retry').onclick(); assert.equal(f.state.entry, 'loading'); assert.equal(f.counts.loads, 2);
  f.load(); await tick(); f.hooks().onReady(); await retry; assert.equal(f.state.entry, 'office'); assert.equal(f.counts.creates, 2);
});
test('render failure disposes the unsuccessful instance and exposes Back', async () => {
  const f = fixture(); f.context.showBriefing('email'); const pending = f.context.startOffice(); f.load(); await tick();
  f.hooks().onError(Error('render failed')); await assert.rejects(pending);
  assert.equal(f.context.office, null); assert.ok(f.counts.disposes > 0); assert.equal(f.state.entry, 'error');
  f.get('#entry-back').onclick(); assert.equal(f.state.entry, 'selection');
});
test('leaving loading invalidates the deferred import and disposes a pending scene', async () => {
  const f = fixture(); f.context.showBriefing('email'); const pending = f.context.startOffice(); f.context.showSelection(); f.load();
  await pending; assert.equal(f.counts.creates, 0); assert.equal(f.state.entry, 'selection');
  f.context.showBriefing('call'); const second = f.context.startOffice(); f.load(); await tick(); f.context.showSelection();
  await assert.rejects(second); assert.ok(f.counts.disposes > 0); assert.equal(f.context.office, null);
});
test('native Menu resets stale returnValue; cancel and Escape preserve run, voice, chat and focus', () => {
  const f = fixture(); f.state.entry = 'office'; f.state.dialogue = 'maya'; f.state.sessionId = 'current';
  const focus = f.get('#office-menu'); focus.focus(); const dialog = f.get('#end-practice-dialog'); dialog.returnValue = 'confirm';
  focus.onclick(); assert.equal(dialog.returnValue, 'cancel');
  f.keydown({ key: 'Escape' }); assert.equal(f.state.dialogue, 'maya');
  dialog.open = false; dialog.close(); assert.equal(f.context.document.activeElement, focus);
  assert.equal(f.state.sessionId, 'current'); assert.equal(f.counts.voices, 0); assert.equal(f.counts.speech, 0); assert.equal(f.counts.resets, 0);
});
test('confirmed Menu clears an ended feedback modal, cancels audio and invalidates pending turn/create captures', () => {
  const f = fixture(); f.state.entry = 'office'; f.state.sessionId = 'ended'; f.state.threads = {}; f.state.dialogue = 'maya';
  const current = captureRun(f.state); f.get('#modal-root').children = [{}];
  f.get('#office-menu').onclick(); const dialog = f.get('#end-practice-dialog'); dialog.returnValue = 'confirm'; dialog.open = false; dialog.close();
  assert.equal(f.state.entry, 'selection'); assert.equal(f.state.dialogue, null); assert.equal(current(), false);
  assert.equal(f.counts.voices, 1); assert.equal(f.counts.speech, 1); assert.equal(f.get('#modal-root').children.length, 0);
});
test('entry rendering uses full viewport mounting and reduced-motion CSS without a sidebar dashboard', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../src/style.css', import.meta.url), 'utf8');
  assert.match(html, /<button[^>]*id="entry-prototype"[^>]*>[\s\S]*Try scenarios[\s\S]*<\/button>/);
  assert.match(source, /\$\("#entry-prototype"\)\.onclick = openPrototypeModal/);
  assert.match(source, /\$\("#nav-prototype"\)\.onclick = openPrototypeModal/);
  assert.match(css, /\.sidebar, \.topbar, \.page-heading, \.page-footer \{ display: none; \}/);
  assert.match(css, /body\.office-mounted #game-viewport[^}]+height: 100%/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.entry-screen \{ transition: none; \}/);
  assert.doesNotMatch(part('function startOffice()', 'function chime()'), /requestAnimationFrame/);
});
