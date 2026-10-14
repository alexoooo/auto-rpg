/**
 * **A bout is the same bout in any world it begins in**: the bout the page plays (`src/arena/main.ts`:
 * the engine `loadEngine` gives, the arena, and `boutStart` before each bout) is the one Node plays
 * in a fresh world (`buildBout`, `research/bout.mjs`), every segment's pose the same to the bit,
 * whether the page's bout is its first, follows another, or begins on a world whose clock has run.
 *
 * Without `boutStart` a disposed bout's bodies leave their slots in the solver, and the next bout's
 * contacts are solved in another order; a timer kept on the world's clock rounds another way. A
 * body's own time starts at its first view (`BodyView.born`), so a startup or a first step is not
 * read off the world's clock.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { boutStart, Duel, SIDES } from "../src/arena/duel.ts";
import { addArenaSolids, arenaSolids } from "../src/arena/room.ts";
import { loadEngine } from "../src/core/engine/engines.ts";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { createWorld } from "../src/core/world.ts";
import { buildBout } from "../research/bout.mjs";

const RECIPE = Object.freeze({ left: "workshop-fighter", right: "workshop-fighter", recoverySeconds: null,
  minds: { left: PRESETS.counter.config, right: PRESETS.puncher.config }, held: { left: "empty", right: "empty" } });
/** Long enough for each: a pre-stepped clock moves the first steps, a replay's solver order and its timers later ones. */
const STEPS = 240, EVERY = 30;

/** A world as the page makes one: the engine `loadEngine` gives, with the arena's solids. */
async function pageWorld() {
  const scene = new Scene(new NullEngine()), world = createWorld(scene, await loadEngine());
  const solids = arenaSolids();
  addArenaSolids(world.physics, solids);
  return { world, solids, dispose() { world.dispose(); scene.dispose(); } };
}

/** Every segment's place and turn on both sides, every `EVERY` steps of `duel`. */
function poses(world, duel) {
  const out = [];
  for (let s = 1; s <= STEPS; s++) {
    world.step();
    if (s % EVERY) continue;
    out.push(SIDES.flatMap((side) => [...duel.duelists[side].built.segments].map(([name, part]) => {
      const p = part.node.position, q = part.node.rotationQuaternion;
      return `${side} ${name} ${p.x} ${p.y} ${p.z} ${q.x} ${q.y} ${q.z} ${q.w}`;
    })));
  }
  return out;
}

const pageBout = ({ world, solids }) => {
  const duel = new Duel(world, RECIPE, { solids }), out = poses(world, duel);
  duel.dispose();
  return out;
};

test("the page's bout, its first, after another, or on a world that has run, is Node's", async () => {
  const node = await buildBout(RECIPE), first = await pageWorld(), replay = await pageWorld(), late = await pageWorld();
  try {
    assert.equal(node.world.physics.engine, first.world.physics.engine, "Node's bout runs on the page's engine");
    const expected = poses(node.world, node.duel);
    assert.deepEqual(pageBout(first), expected, "a first bout");

    const toStart = boutStart(replay.world);
    const before = new Duel(replay.world, RECIPE, { solids: replay.solids });
    for (let s = 0; s < 30; s++) replay.world.step();
    before.dispose();
    toStart();
    assert.equal(replay.world.steps, 0);
    assert.deepEqual(pageBout(replay), expected, "a bout after another");

    late.world.step();
    assert.deepEqual(pageBout(late), expected, "a bout on a world one step on");
  } finally { node.dispose(); first.dispose(); replay.dispose(); late.dispose(); }
});
