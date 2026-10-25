import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../src/office.js", import.meta.url), "utf8");
const stepSource = source.slice(source.indexOf("  function step(dt) {"), source.indexOf("  let ready = false;"));
const frameStart = source.indexOf("  function frame(now) {");
const frameSource = source.slice(frameStart, source.indexOf("\n  frameId = requestAnimationFrame(frame);", frameStart));
const visibilityStart = source.indexOf('  document.addEventListener("visibilitychange"');
const visibilitySource = source.slice(visibilityStart, source.indexOf("  const raycaster", visibilityStart));
const resetStart = source.indexOf("    reset() {");
const resetSource = source.slice(resetStart, source.indexOf("    highlight", resetStart)).replace("reset() {", "function reset() {").replace(/\n    },\s*$/, "\n}");

function vector(x = 0, y = 0, z = 0) {
  return { x, y, z, set(nx, ny, nz) { this.x = nx; this.y = ny; this.z = nz; return this; }, copy(other) { this.x = other.x; this.y = other.y; this.z = other.z; return this; }, project() { return this; } };
}

function motionContext({ paused = false, reducedMotion = false } = {}) {
  const position = vector(1, 0, 2);
  const map = {}, nearCalls = [];
  const limb = () => ({ rotation: { x: 0 } });
  const context = {
    hooks: { isPaused: () => paused, onMove() {}, onNear: (id) => nearCalls.push(id), onReady() {} },
    keys: new Set(), target: null, targetYaw: 0, walkTime: 0, moved: false, near: null,
    player: { root: { position, rotation: { y: 0 } }, legs: [limb(), limb()], arms: [limb(), limb()], body: { position: {} } },
    allowed: () => true, reducedMotion, npcs: {}, phone: {visible: false}, nearRing: { position: {} }, playerRing: { position: {} },
    document: { hidden: false, querySelector: () => ({ setAttribute: (key, value) => { map[key] = value; } }) },
    disposed: false, frameId: null, events: { signal: undefined }, dispose() { this.disposed = true; }, requestAnimationFrame() {}, renderer: { render() {} }, scene: {}, camera: {}, width: 1, height: 1,
    entries: {}, projection: vector(), ready: false, accumulator: 0, last: 0, map, nearCalls,
  };
  context.entries.player = { root: context.player.root, label: { style: {} } };
  return context;
}

test("fixed movement, rings, minimap, and paused proximity retain baseline coordinates", () => {
  const moving = motionContext(); moving.keys.add("d");
  runInNewContext(`${stepSource}\nstep(1 / 60);`, moving);
  const firstDistance = Math.hypot(moving.player.root.position.x - 1, moving.player.root.position.z - 2);
  assert.ok(Math.abs(firstDistance - 3.3 / 60) < 1e-9);
  assert.notEqual(moving.targetYaw, 0);
  assert.equal(moving.player.root.rotation.y, 0);
  assert.equal(moving.playerRing.position.x, moving.player.root.position.x);
  assert.equal(moving.map.cy, String(5 + ((moving.player.root.position.z + 6) / 12) * 60));
  moving.keys.clear(); moving.keys.add("w");
  const before = { ...moving.player.root.position };
  runInNewContext(`${stepSource}\nstep(1 / 60);`, moving);
  assert.ok(Math.abs(Math.hypot(moving.player.root.position.x - before.x, moving.player.root.position.z - before.z) - firstDistance) < 1e-9);
  const paused = motionContext({ paused: true }); paused.npcs.maya = { root: { position: vector(1.5, 0, 2), visible: true } };
  runInNewContext(`${stepSource}\nstep(1 / 60);`, paused);
  assert.deepEqual(paused.nearCalls, ["maya"]);
  assert.equal(paused.player.root.position.x, 1);
});

function runFrame(context, now = 10) {
  runInNewContext(`${stepSource}\n${frameSource}\nthis.runFrame = frame;`, context);
  context.runFrame(now);
}

test("display heading eases 90 and 180 degree turns while movement heading updates immediately", () => {
  const quarter = motionContext(); quarter.targetYaw = Math.PI / 2; runFrame(quarter);
  assert.ok(quarter.player.root.rotation.y > 0 && quarter.player.root.rotation.y < Math.PI / 2);
  const half = motionContext(); half.targetYaw = Math.PI; runFrame(half);
  assert.ok(half.player.root.rotation.y > 0 && half.player.root.rotation.y < Math.PI);
  const wrap = motionContext(); wrap.player.root.rotation.y = 3.1; wrap.targetYaw = -3.1; runFrame(wrap);
  assert.ok(wrap.player.root.rotation.y > 3.1);
});

test("reduced motion, pause, visibility, and reset keep the displayed heading coherent", () => {
  const reduced = motionContext({ reducedMotion: true }); reduced.targetYaw = 1.5; runFrame(reduced);
  assert.equal(reduced.player.root.rotation.y, 1.5);
  const paused = motionContext({ paused: true }); paused.targetYaw = 1.5; runFrame(paused);
  assert.equal(paused.player.root.rotation.y, 0);
  const context = motionContext(); let visibility;
  context.document.addEventListener = (_, handler) => { visibility = handler; };
  context.performance = { now: () => 99 }; context.player.root.rotation.y = 0; context.targetYaw = 2;
  runInNewContext(visibilitySource, context); visibility();
  assert.equal(context.player.root.rotation.y, 2);
  context.player.root.position.x = 7; context.targetYaw = 1; context.keys.add("d"); context.target = { x: 0, z: 0 };
  context.document.querySelector = () => ({ classList: { remove() {} } });
  runInNewContext(`${resetSource}\nthis.runReset = reset;`, context); context.runReset();
  assert.equal(context.player.root.position.x, 2.9);
  assert.equal(context.player.root.rotation.y, -0.65);
  assert.equal(context.targetYaw, -0.65);
  assert.equal(context.keys.size, 0);
});

test("hidden scene frames clear movement and timing without simulating or rendering", () => {
  const context = motionContext(); let renders = 0, ready = 0;
  context.renderer.render = () => { renders++; }; context.hooks.onReady = () => { ready++; };
  context.hooks.isVisible = () => false; context.keys.add("w"); context.target = { x: 1, z: 2 }; context.accumulator = 3;
  runFrame(context, 5000);
  assert.equal(renders, 0); assert.equal(ready, 0); assert.equal(context.keys.size, 0); assert.equal(context.target, null); assert.equal(context.accumulator, 0); assert.equal(context.last, 5000);
});

test("onReady follows only a successful nonzero render; failure disposes and reports once", () => {
  const context = motionContext(); let renders = 0, ready = 0, failures = 0, disposed = 0;
  context.hooks.onReady = () => { ready++; }; context.hooks.onError = () => { failures++; };
  context.renderer.render = () => { renders++; }; context.dispose = () => { disposed++; context.disposed = true; };
  context.width = 0; runFrame(context); assert.equal(renders, 0); assert.equal(ready, 0);
  context.width = 100; context.runFrame(20); assert.equal(renders, 1); assert.equal(ready, 1);
  context.runFrame(30); assert.equal(ready, 1);
  context.renderer.render = () => { throw Error("lost context"); }; context.runFrame(40);
  assert.equal(disposed, 1); assert.equal(failures, 1); context.runFrame(50); assert.equal(failures, 1);
});

test("hidden and paused offices ignore E and walking key presses", () => {
  const start = source.indexOf('  window.addEventListener("keydown"');
  const code = source.slice(start, source.indexOf('  window.addEventListener("keyup"', start));
  for (const visible of [true, false]) for (const paused of [true, false]) {
    let keydown, talks = 0;
    const context = { window: { addEventListener(_, handler) { keydown = handler; } }, events: { signal: undefined },
      isInput: () => false, document: { hidden: false }, hooks: { isPaused: () => paused, isVisible: () => visible, onTalk() { talks++; } }, keys: new Set(), target: null };
    runInNewContext(code, context);
    keydown({ key: "e", preventDefault() {} }); keydown({ key: "w", preventDefault() {} });
    assert.equal(talks, visible && !paused ? 1 : 0); assert.equal(context.keys.size, visible && !paused ? 1 : 0);
  }
});

test("the enabled phone is a floor interaction target without a fourth character or collision change", () => {
  const context = motionContext(); context.player.root.position.set(1.15, 0, 0.65);
  context.hooks.phoneContact = () => "client";
  runInNewContext(`${stepSource}\nstep(1 / 60);`, context);
  assert.equal(context.near, "@phone"); assert.deepEqual(context.nearCalls, ["@phone"]);
  assert.equal(context.nearRing.position.x, 1.15); assert.equal(context.nearRing.position.z, 0.65);
  assert.equal(Object.keys(context.npcs).length, 0);
  context.hooks.phoneContact = () => null; context.runFrame = null;
  runInNewContext(`${stepSource}\nstep(1 / 60);`, context); assert.equal(context.near, null);
  const paused = motionContext({paused: true}); paused.player.root.position.set(1.15, 0, 0.65); paused.hooks.phoneContact = () => "client";
  runInNewContext(`${stepSource}\nstep(1 / 60);`, paused); assert.equal(paused.near, null);
  const hidden = motionContext(); hidden.hooks.phoneContact = () => "client"; hidden.hooks.isVisible = () => false;
  runFrame(hidden); assert.equal(hidden.phone.visible, false);
});

test("scene disposal cancels its loop, listeners, observer, DOM and GPU resources idempotently", () => {
  const start = source.indexOf('  function dispose()');
  const code = source.slice(start, source.indexOf('  try {', start));
  const calls = []; const mark = value => () => calls.push(value);
  const context = { disposed: false, frameId: 7, cancelAnimationFrame: mark("frame"), events: { abort: mark("events") }, observer: { disconnect: mark("observer") },
    ownedLabels: [{ remove: mark("label") }], scene: { traverse(fn) { fn({ geometry: { dispose: mark("geometry") }, material: { dispose: mark("material") }, shadow: { map: { dispose: mark("shadow") } } }); } },
    renderer: { dispose: mark("renderer"), domElement: { remove: mark("canvas") } } };
  runInNewContext(code, context); context.dispose(); context.dispose();
  assert.deepEqual(calls, ["frame", "events", "observer", "label", "geometry", "material", "shadow", "renderer", "canvas"]);
});

test("WebGL constructor failure throws instead of returning a fake successful office", () => {
  const code = source.slice(source.indexOf('export function createOffice'), source.indexOf('  const events')).replace('export function', 'function') + '\n}';
  const context = { THREE: { Scene: class {}, Color: class {}, OrthographicCamera: class { position = { set() {} }; lookAt() {} }, WebGLRenderer: class { constructor() { throw Error("No WebGL"); } } } };
  runInNewContext(code, context);
  assert.throws(() => context.createOffice({}, {}), /needs WebGL/);
});
