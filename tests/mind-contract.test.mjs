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
import { buildBout } from "../research/bout.mjs";
import { SIDES } from "../src/arena/duel.ts";
import { CONTROLLERS } from "../src/core/mind/controllers.ts";
import { BODY_MODELS, modelSupportsMind } from "../src/core/models.ts";
import { traceOf } from "./harness/trace.mjs";
import { coreStand } from "./harness/core-stand.mjs";
import { modelSpec } from "../src/core/models.ts";
import { replayedBody, sheetLog } from "../src/core/mind/sheets.ts";

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
  const { world, duel, dispose } = await buildBout(recipe, { hooks });
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

test("a replayed body is down when its sheets say its mind read it down, and only then", async () => {
  const stand = await coreStand(modelSpec("workshop-fighter"));
  const log = sheetLog();
  log.initial = false;
  const body = replayedBody(stand.built, stand.world, log, {});
  try {
    const n = body.muscles.channels.length;
    for (let k = 0; k < 4; k++) log.sheets.push({ step: stand.world.steps + k, activation: new Float64Array(n), velocity: new Float64Array(n),
      force: [0, 0, 0], moment: [0, 0, 0], hands: [], down: k === 2 });
    const downs = [body.down];
    for (let k = 0; k < 4; k++) { stand.step(); downs.push(body.down); }
    assert.deepEqual(downs, [false, false, false, true, false]);
  } finally { body.dispose(); stand.dispose(); }
});

test("a replay refuses a step with no order sheet, so a record that is short is found", async () => {
  const [, config] = MINDS[0];
  const model = BODY_MODELS.find((candidate) => modelSupportsMind(candidate, config));
  const recipe = { left: model, right: model, gap: GAP, minds: { left: config, right: config } };
  const first = await played(recipe, { record: true }, false);
  const short = Object.fromEntries(SIDES.map((side) => [side, { ...first.sheets[side], sheets: first.sheets[side].sheets.slice(0, FORK) }]));
  await assert.rejects(played(recipe, { replay: short }, false), /no order sheet for step/);
});
