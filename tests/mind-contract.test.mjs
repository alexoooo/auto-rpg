/**
 * **What every registered Mind keeps to** (Node, core world, vendored Rapier, 120 Hz): for each
 * controller's presets, or its defaults where it names none, a short Arena bout of that Mind
 * against itself on the first body it fits runs and stays finite, flings nobody, forks and resumes
 * to the bit, and plays again to the bit from its recipe and its recorded order sheets with no
 * Mind made (`replayedBody`). How well a Mind fights is measured apart.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { buildBout } from "../src/evaluation/bout.ts";
import { BOUT_ENGINE } from "../research/bout.mjs";
import { SIDES } from "../src/arena/duel.ts";
import { CONTROLLERS } from "../src/core/mind/controllers.ts";
import { BODY_MODELS, modelSupportsMind } from "../src/core/models.ts";
import { LOADOUTS, loadoutKey } from "../src/core/items/held.ts";
import { traceOf } from "../src/evaluation/trace.ts";
import { modelSpec } from "../src/core/models.ts";
import { replayedBody } from "../src/core/mind/sheets.ts";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { createBody, SERVO_SECONDS } from "../src/core/body.ts";
import { buildBody } from "../src/core/build/build-body.ts";
import { poseAngles } from "../src/core/control/kinematics.ts";
import { GUARD } from "../src/core/skills/guard.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "./harness/core-stand.mjs";

/** The bout's steps, the step it is forked at, and the gap its sides start at, m: near enough for a blow. */
const STEPS = 180, FORK = 90, GAP = 0.9;
/** The most a segment's centre may move, m/s, and a body's centre of mass: as the smoke test holds a bout to. */
const FLUNG = Object.freeze({ segment: 40, body: 12 });

/** Every registered Mind: each controller's presets by id, or its defaults by its kind where it names none. */
const MINDS = Object.entries(CONTROLLERS).flatMap(([kind, controller]) => {
  const presets = Object.entries(controller.presets);
  return presets.length > 0 ? presets.map(([id, preset]) => [id, preset.config]) : [[kind, controller.defaults]];
});

/** Step `duel` to `until` bout steps, taking each of `traces` and the peaks after each. */
function stepTo(world, duel, until, traces, peak) {
  const v = new Vector3(), momentum = new Vector3();
  while (duel.steps < until) {
    world.step();
    for (const trace of traces) trace.take();
    for (const side of SIDES) {
      let mass = 0;
      momentum.setAll(0);
      for (const segment of duel.duelists[side].built.segments.values()) {
        const { position: p, rotationQuaternion: q } = segment.node;
        segment.body.linearVelocityToRef(v);
        if (![p.x, p.y, p.z, q.x, q.y, q.z, q.w, v.x, v.y, v.z].every(Number.isFinite)) peak.unfinite.push(world.steps);
        peak.segment = Math.max(peak.segment, v.length());
        momentum.addInPlace(v.scale(segment.rigid.mass)); mass += segment.rigid.mass;
      }
      peak.body = Math.max(peak.body, momentum.length() / mass);
    }
  }
}

/** The bout of `recipe` under `hooks` played to `STEPS`, forked at `FORK` and played on again from there when asked. */
async function played(recipe, hooks, fork) {
  const { world, duel, dispose } = await buildBout(recipe, { engine: BOUT_ENGINE, hooks });
  try {
    duel.play([]);
    const builts = SIDES.map((side) => duel.duelists[side].built), trace = traceOf(builts), tail = traceOf(builts);
    const peak = { segment: 0, body: 0, unfinite: [] };
    stepTo(world, duel, FORK, [trace], peak);
    const saved = fork ? duel.save() : null;
    stepTo(world, duel, STEPS, [trace, tail], peak);
    const end = { digest: trace.digest(), tail: tail.digest(), physics: Buffer.from(world.physics.save()).toString("base64") };
    let resumed = null;
    if (saved) {
      duel.load(saved);
      const again = traceOf(builts);
      stepTo(world, duel, STEPS, [again], { segment: 0, body: 0, unfinite: [] });
      resumed = again.digest();
    }
    const sheets = Object.fromEntries(SIDES.map((side) => [side, duel.duelists[side].sheets]));
    return { end, peak, resumed, sheets, minds: SIDES.map((side) => duel.duelists[side].minded.kind), blows: duel.blows.length };
  } finally { dispose(); }
}

for (const [id, config] of MINDS) test(`${id}: a short bout runs, stays finite, flings nobody, forks and resumes, and replays from its order sheets`, async () => {
  const model = BODY_MODELS.find((candidate) => modelSupportsMind(candidate, config));
  assert.ok(model, `${id} fits no body`);
  const recipe = { left: model, right: model, gap: GAP, minds: { left: config, right: config } };
  const first = await played(recipe, { record: true }, true);
  assert.deepEqual(first.peak.unfinite, [], "every pose and velocity is finite");
  assert.ok(first.peak.segment < FLUNG.segment && first.peak.body < FLUNG.body, `the fastest segment ${first.peak.segment} m/s, body ${first.peak.body} m/s`);
  assert.equal(first.resumed, first.end.tail, "the bout forked and resumed is the bout, step by step");
  for (const side of SIDES) assert.equal(first.sheets[side].sheets.length, STEPS, `${side} wrote a sheet a step`);
  const replay = await played(recipe, { replay: first.sheets }, false);
  assert.deepEqual(replay.minds, ["replay", "replay"]);
  assert.equal(replay.end.digest, first.end.digest, "the replay's poses are the bout's, step by step");
  assert.equal(replay.end.physics, first.end.physics, "the replay's physical state is the bout's to the bit");
});

test("an assisted bout with blows, fists and assist asks replays from its sheets to the bit", async () => {
  // The control for the bouts above, where nobody is assisted: each side has a quarter of its weight to ask.
  const config = CONTROLLERS.options.presets.options.config;
  const recipe = { left: "workshop-fighter", right: "workshop-fighter", gap: GAP, balance: { left: 25, right: 25 }, minds: { left: config, right: config } };
  const first = await played(recipe, { record: true }, false);
  const carried = (key) => SIDES.map((side) => first.sheets[side].sheets.filter((sheet) => key(sheet)).length);
  assert.ok(first.blows > 0, "a blow lands");
  assert.ok(carried((sheet) => sheet.hands.length > 0).every((n) => n > 0), "each side's sheets carry its hand poses");
  assert.ok(carried((sheet) => sheet.force.some((v) => v !== 0) || sheet.moment.some((v) => v !== 0)).every((n) => n > 0), "each side asks its assist");
  const replay = await played(recipe, { replay: first.sheets }, false);
  assert.equal(replay.end.digest, first.end.digest);
  assert.equal(replay.end.physics, first.end.physics);
});

test("a body is down by the fight's rule of the body alone, whatever height its mind asks it to hold", async () => {
  // The Warrior on its back, its mind asking its stance for a centre of mass 2 cm over its soles:
  // under that ask its own view reads it not down, and the fight reads it down all the same.
  const rendering = new NullEngine(), scene = new Scene(rendering), world = createWorld(scene, await freshEngine());
  world.physics.addFixedBox([0, -.5, 0], [20, 1, 20]);
  const spec = modelSpec("workshop-fighter"), half = Math.sqrt(.5);
  const built = buildBody(spec, world, { position: [0, .4, 0], rotation: [-half, 0, 0, half], joints: poseAngles(spec, GUARD) });
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  try {
    body.drive(() => ({ posture: poseAngles(spec, GUARD), pushes: [], stance: { feet: ["left", "right"], centre: null, height: 0.02, heading: 0 } }));
    world.step(world.hz);
    assert.ok(body.physical.height < body.view.standing - 0.5, `the fixture is not lying: its centre of mass is ${body.physical.height.toFixed(2)} m over its lowest point`);
    assert.deepEqual({ itsMind: body.view.down, theFight: body.down }, { itsMind: false, theFight: true });
  } finally { body.dispose(); built.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); }
});

test("a replay refuses a step with no order sheet, so a record that is short is found", async () => {
  const [, config] = MINDS[0];
  const model = BODY_MODELS.find((candidate) => modelSupportsMind(candidate, config));
  const recipe = { left: model, right: model, gap: GAP, minds: { left: config, right: config } };
  const first = await played(recipe, { record: true }, false);
  const short = Object.fromEntries(SIDES.map((side) => [side, { ...first.sheets[side], sheets: first.sheets[side].sheets.slice(0, FORK) }]));
  await assert.rejects(played(recipe, { replay: short }, false), /no order sheet for step/);
});


test("both-hand loadouts fork and replay their physical commands", async () => {
  const config = CONTROLLERS.options.presets.options.config;
  const recipe = { left: "workshop-fighter", right: "workshop-rogue", gap: 3,
    loadouts: { left: { left: "club", right: "club" }, right: { left: "club", right: "empty" } },
    minds: { left: config, right: config } };
  const first = await played(recipe, { record: true }, true);
  assert.deepEqual(first.peak.unfinite, []);
  assert.equal(first.resumed, first.end.tail);
  const replay = await played(recipe, { replay: first.sheets }, false);
  assert.deepEqual(replay.minds, ["replay", "replay"]);
  assert.equal(replay.end.digest, first.end.digest);
  assert.equal(replay.end.physics, first.end.physics);
});

test("every registered Mind is built on each character and catalog loadout it fits", async () => {
  // Fitting is the promise that a mind can be built and fight there: two cases a bout, one a side.
  const cases = MINDS.flatMap(([id, config]) => BODY_MODELS.flatMap((model) => LOADOUTS
    .filter((loadout) => modelSupportsMind(model, config, loadout)).map((loadout) => ({ id, config, model, loadout }))));
  assert.ok(cases.some(({ loadout }) => loadout.left === "buckler" && loadout.right === "sword"), "the fixture reaches sword and buckler");
  const failed = [];
  for (let k = 0; k < cases.length; k += 2) {
    const left = cases[k], right = cases[k + 1] ?? cases[k];
    try {
      const { dispose } = await buildBout({ left: left.model, right: right.model, gap: 4, loadouts: { left: left.loadout, right: right.loadout }, minds: { left: left.config, right: right.config } }, { engine: BOUT_ENGINE });
      dispose();
    } catch (error) { failed.push(`${left.id}/${left.model}/${loadoutKey(left.loadout)} or ${right.id}/${right.model}/${loadoutKey(right.loadout)}: ${error.message}`); }
  }
  assert.deepEqual(failed, []);
});
