import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../../src/office.js", import.meta.url), "utf8");
const stepSource = source.slice(source.indexOf("  function step(dt) {"), source.indexOf("  let ready = false;"));

for (const paused of [false, true]) {
  test(`office frame updates ring and minimap while ${paused ? "paused" : "moving"}`, () => {
    const position = { x: 1, z: 2 };
    const map = {};
    let moves = 0;
    const limb = () => ({ rotation: { x: 0 } });
    const context = {
      hooks: { isPaused: () => paused, onMove: () => moves++, onNear() {} },
      keys: new Set(["d"]), target: null, walkTime: 0, moved: false,
      player: { root: { position, rotation: {} }, legs: [limb(), limb()], arms: [limb(), limb()], body: { position: {} } },
      allowed: () => true, reducedMotion: false, npcs: {}, near: null,
      nearRing: { position: {} }, playerRing: { position: {} },
      document: { querySelector: () => ({ setAttribute: (key, value) => { map[key] = value; } }) },
    };
    runInNewContext(`${stepSource}\nstep(1 / 60);`, context);
    assert.equal(context.playerRing.position.x, position.x);
    assert.equal(context.playerRing.position.z, position.z);
    assert.equal(map.cx, String(5 + ((position.x + 9) / 18) * 90));
    assert.equal(map.cy, String(5 + ((position.z + 6) / 12) * 60));
    assert.equal(moves, paused ? 0 : 1);
    if (paused) {
      assert.equal(position.x, 1);
      assert.equal(position.z, 2);
    } else {
      assert.ok(position.x > 1);
      assert.ok(position.z < 2);
    }
  });
}
