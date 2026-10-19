/**
 * **Is the core broken?** The quick whole-path check: two Arena bouts (Node, core world, vendored
 * Rapier, 120 Hz), the Warrior against the Rogue and the options fighter against the Classic
 * fighter, each played for its first 12 s twice over. Each runs its seconds or to a verdict, every
 * body stays finite and none is flung, neither side is assisted, and the two playings agree to the
 * bit. How well they fight is measured apart (`tests/smoke-capability.test.mjs`).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBout } from "../research/bout.mjs";
import { SIDES } from "../src/arena/duel.ts";
import { PRESETS } from "../src/core/mind/controllers.ts";
import { traceOf } from "./harness/trace.mjs";

const RECIPES = Object.freeze({
  "the Warrior against the Rogue": { left: "workshop-fighter", right: "workshop-rogue" },
  "the options fighter against the Classic fighter": { left: "workshop-fighter", right: "workshop-fighter", minds: { left: PRESETS.options.config, right: PRESETS.classic.config } },
});
const SECONDS = 12;
/**
 * The most a segment's centre may move, m/s, and a body's centre of mass: well over what a fist or
 * a run reaches, and under what a body the solver has flung reaches.
 */
const FLUNG = Object.freeze({ segment: 40, body: 12 });

/**
 * Play `recipe` to its verdict or `SECONDS`, reading every segment of both bodies after each step:
 * how it ended, the steps at which a pose or velocity was not finite, the fastest a segment and a
 * body's centre of mass moved, each side's assist meter, and the trace's digest.
 */
async function floorOf(recipe) {
  const { world, duel, dispose } = await buildBout(recipe);
  try {
    duel.play([]);
    const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts);
    const v = new Vector3(), w = new Vector3(), momentum = new Vector3();
    const peak = { segment: 0, body: 0 }, unfinite = [];
    while (!duel.verdict && duel.clock < SECONDS) {
      world.step();
      trace.take();
      for (const built of builts) {
        let mass = 0;
        momentum.setAll(0);
        for (const segment of built.segments.values()) {
          const { position: p, rotationQuaternion: q } = segment.node;
          segment.body.linearVelocityToRef(v); segment.body.angularVelocityToRef(w);
          if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z, w.x, w.y, w.z].every(Number.isFinite)) unfinite.push(world.steps);
          peak.segment = Math.max(peak.segment, v.length());
          momentum.addInPlace(v.scale(segment.rigid.mass)); mass += segment.rigid.mass;
        }
        peak.body = Math.max(peak.body, momentum.length() / mass);
      }
    }
    return {
      seconds: duel.clock, ending: duel.verdict?.ending ?? "none", winner: duel.verdict?.winner ?? null,
      unfinite, peak, assist: SIDES.map((side) => duel.duelists[side].body.assist.meter), digest: trace.digest(),
    };
  } finally { dispose(); }
}

for (const [name, recipe] of Object.entries(RECIPES)) test(`${name}: a short arena bout runs, stays finite, flings nobody, is unassisted, and plays the same twice`, async () => {
  const first = await floorOf(recipe), second = await floorOf(recipe);
  assert.ok(first.seconds >= SECONDS || first.winner !== null, `the bout ran ${first.seconds} s to no verdict`);
  assert.deepEqual(first.unfinite, [], "every pose and velocity is finite");
  assert.ok(first.peak.segment < FLUNG.segment && first.peak.body < FLUNG.body, `the fastest segment ${first.peak.segment} m/s, body ${first.peak.body} m/s`);
  assert.deepEqual(first.assist.map(({ force, moment }) => [force, moment]), [[0, 0], [0, 0]], "neither side is assisted");
  assert.deepEqual(second, first, "a bout is the same each time it is played");
});
