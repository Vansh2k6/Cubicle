import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../src/office.js", import.meta.url), "utf8");
const stepSource = source.slice(source.indexOf("  function step(dt) {"), source.indexOf("  let ready = false;"));
const frameStart = source.indexOf("  function frame(now) {");
const frameSource = source.slice(frameStart, source.indexOf("\n  requestAnimationFrame(frame);", frameStart));
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
    allowed: () => true, reducedMotion, npcs: {}, nearRing: { position: {} }, playerRing: { position: {} },
    document: { hidden: false, querySelector: () => ({ setAttribute: (key, value) => { map[key] = value; } }) },
    requestAnimationFrame() {}, renderer: { render() {} }, scene: {}, camera: {}, width: 1, height: 1,
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
  const paused = motionContext({ paused: true }); paused.npcs.maya = { root: { position: vector(1.5, 0, 2) } };
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
