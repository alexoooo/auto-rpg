// The action-surface probe: is each command axis buying what it claims. Session 07 of the learn set.
//
// **What is asserted here is the instrument, not the finding.** The findings are 2,784 bouts and
// live in `docs/measurements.md`; a test that pinned "a saturated advance buys 0.56 m" as a floor
// would be a regression gate on a number the next session is explicitly allowed to move. So what
// these four ask is that the probe measures what it says it measures: the pin lands on exactly the
// field named, the summary is the arithmetic it claims over the rows it is given, an unknown base
// is refused rather than substituted, and the one candidate this session added to the executor does
// on a real body what its own docstring says.
//
// **The pin test reads the recorded pack and not the pinning code.** The claim is "the contender
// overwrote exactly the axis named and nothing else", and the only way to ask that without
// asserting the implementation against itself is to run real bouts and read back what the executor
// was actually handed -- which is why `commandAxes` exists on the row at all. It is two-sided: a
// pin that missed its field turns the pinned column's min and max apart, and a pin that wrote every
// field brings the other eleven columns' min and max together, and each of those is a different
// defect.
//
// **Three mutations were watched red on 2026-09-09**, because a green test asserting nothing is
// this directory's worst defect:
//
// | mutation | what went red |
// |---|---|
// | apply the pin to the base's own command object rather than to this file's copy | nothing -- see the note on `pinnedMind`; the two are the same until a base leaves a field unwritten |
// | in `pinnedMind`, copy the twelve fields *after* applying the pin | the pin test, on `standOff.min` |
// | in `tactics-v4.ts`, read `holdMetres` at the first `hold` and not at the second | the hold test: the metres row settled at 1.210 m, which is their reach and not a metre |
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate.js";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import HavokPhysics from "@babylonjs/havok";

import { CONFIG } from "../src/config.ts";
import { attachPhysics, COLLIDES, LAYER } from "../src/physics.ts";
import { unitDefinition } from "../src/units.ts";
import { BUTTON_REACH } from "../src/buttons.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { COMMAND_RANGES, GOLEM_TACTICS_V4, freshCommand, golemDriven } from "../src/golem/tactics-v4.ts";
import { GOLEM_TACTICS } from "../src/golem/tactics.ts";
import { buildPool } from "../scripts/tournament.mjs";
import {
  GEOMETRY_AXES, PROBE_BASES, allCells, axisProbe, comparisonCells, grid, probeCells, probeJobs,
  probedSide, summariseCell, summariseProbe,
} from "../scripts/axis-probe.mjs";

const wasm = new URL("../node_modules/@babylonjs/havok/lib/esm/HavokPhysics.wasm", import.meta.url);
const FIXED = 1 / CONFIG.world.physicsHz;
const FRAME_MS = 1000 / 60;
const SEED = 20260909;

// ---------------------------------------------------------------------------------------
// The bench body, copied from `tests/tactics-v4.test.mjs` for the reason that file gives: a
// shared arena would be a second claim about what a body publishes, and the fixture is taken
// from a real published view precisely so that it cannot be one.
// ---------------------------------------------------------------------------------------

const blankIntent = () => ({
  forward: 0, strafe: 0, turn: 0, actingHand: "primary",
  natural: { thrust: false, guard: false },
  posture: { trunkLean: 0, trunkTwist: 0, crouch: 0 },
  primary: {
    pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  },
  secondary: {
    pointerX: 0, pointerY: 0, reach: BUTTON_REACH.neutral,
    roll: 0, wristBend: 0, thrust: false, guard: false,
  },
});

async function standAGolem(t, setup = defaultGolemSetup()) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  attachPhysics(scene, await HavokPhysics({ wasmBinary: await readFile(wasm) }));
  scene.getPhysicsEngine().setSubTimeStep(1000 / CONFIG.world.physicsHz);
  const mat = (name) => new StandardMaterial(name, scene);
  const materials = {
    flesh: mat("flesh"), cloth: mat("cloth"), steel: mat("steel"), leather: mat("leather"),
    brass: mat("brass"), hide: mat("hide"), wood: mat("wood"), arrowAccent: mat("arrow"),
  };
  const ground = MeshBuilder.CreateBox("ground", { width: 60, height: 1, depth: 60 }, scene);
  ground.position.y = -0.5;
  const slab = new PhysicsAggregate(ground, PhysicsShapeType.BOX,
    { mass: 0, friction: 0.9, restitution: 0.02 }, scene);
  slab.shape.filterMembershipMask = LAYER.WORLD;
  slab.shape.filterCollideMask = COLLIDES.WORLD;

  const golem = unitDefinition("golem").build({
    scene, side: "left", origin: Vector3.Zero(), facing: 0, golem: setup, materials,
    mind: { name: "still", decide: () => blankIntent() },
  });
  t.after(() => { golem.dispose(); scene.dispose(); engine.dispose(); });

  let clock = 0;
  scene.onBeforePhysicsObservable.add(() => {
    golem.observe(golem, clock);
    golem.locomotion.beginControlStep();
    golem.control.driver.step(FIXED);
    const proposal = golem.locomotion.proposal(FIXED);
    const fraction = golem.locomotion.registry.allowedFraction(
      proposal.prior, proposal.next, proposal.footprint, proposal.ownerPartIds);
    golem.locomotion.commitPhysical(proposal, Object.freeze({
      x: proposal.displacement.x * fraction, z: proposal.displacement.z * fraction,
      yaw: proposal.displacement.yaw,
    }), FIXED);
    golem.afterLocomotion(FIXED);
    clock += FIXED;
  });
  for (let frame = 0; frame < 60; frame += 1) {
    scene._renderId += 1;
    scene._advancePhysicsEngineStep(FRAME_MS);
  }
  return golem;
}

/**
 * A published view flattened into a plain record, `tests/tactics-v4.test.mjs`'s `fixtureOf`.
 *
 * **Not `publishedFixture` from `tests/fixtures/view.mjs`**, and the reason is worth a line: that
 * one asserts the record holds exactly `BODY_FIELDS`, and a golem publishes `capabilities` and
 * `effectors` on top of them, so it refuses every golem view outright. The points are read through
 * their accessors here for the same reason it gives -- a Babylon `Vector3` keeps `_x/_y/_z` behind
 * prototype accessors, so `structuredClone` of a live view comes back reading `undefined` from
 * every `.x` -- and `effectors` is dropped because a driven executor reads `capabilities` and a
 * second copy of the same table would be a second claim about the body.
 */
function fixtureOf(view) {
  const point = (value) => ({ x: value.x, y: value.y, z: value.z });
  const hand = (value) => ({ ...value, shoulder: point(value.shoulder), tip: point(value.tip),
    tipVelocity: point(value.tipVelocity) });
  const body = (value) => ({ ...value, ground: point(value.ground), shoulder: point(value.shoulder),
    tip: point(value.tip), health: { ...value.health },
    naturalAttacks: Object.fromEntries(Object.entries(value.naturalAttacks ?? {})
      .map(([name, attack]) => [name, { ...attack }])),
    hands: Object.fromEntries(Object.entries(value.hands)
      .map(([name, slot]) => [name, hand(slot)])),
    effectors: undefined,
  });
  const self = body(view.self);
  delete self.effectors;
  const opponent = body(view.opponent);
  delete opponent.effectors;
  return { self, opponent, projectiles: [], measure: view.measure, clock: 0 };
}

/** Put the opponent somewhere, as a body of a stated size, and re-derive `measure`. */
function place(fixture, { x, z, facing = Math.PI, shoulderY = 1.42, crownY = 1.75, reach = 1.45 }) {
  const them = fixture.opponent;
  them.unit = "warrior";
  them.ground.x = x; them.ground.y = 0; them.ground.z = z;
  them.facing = facing;
  them.shoulder.x = x + 0.21; them.shoulder.y = shoulderY; them.shoulder.z = z;
  them.crownHeight = crownY;
  them.vitalHeight = shoulderY * 0.82;
  them.reach = reach;
  them.collisionRadius = 0.22;
  them.tip.x = x; them.tip.y = shoulderY; them.tip.z = z - 0.8;
  them.tipSpeed = 1.0;
  for (const name of ["primary", "secondary"]) {
    const hand = them.hands[name];
    hand.weapon = name === "primary" ? "sword" : "empty";
    hand.lost = false;
    hand.shoulder.x = x + (name === "primary" ? 0.21 : -0.21);
    hand.shoulder.y = shoulderY;
    hand.shoulder.z = z;
    hand.tip.x = them.tip.x; hand.tip.y = them.tip.y; hand.tip.z = them.tip.z;
    hand.tipSpeed = name === "primary" ? 1.0 : 0;
    hand.reach = reach;
  }
  const self = fixture.self;
  fixture.measure = Math.hypot(self.shoulder.x - them.shoulder.x, self.shoulder.z - them.shoulder.z);
  return fixture;
}

/** Step one executor in front of a fixture for `seconds`, calling `each` after every step. */
function drive(fixture, mind, seconds, each = null) {
  const steps = Math.round(seconds * CONFIG.world.physicsHz);
  for (let step = 0; step < steps; step += 1) {
    fixture.clock += FIXED;
    const intent = mind.decide(fixture, FIXED);
    if (each) each(intent, step);
  }
  return steps;
}

// ---------------------------------------------------------------------------------------
// The grid, which is arithmetic and needs no body at all.
// ---------------------------------------------------------------------------------------

/**
 * The grids are the plan's grids, and their labels are the values a person would type back.
 *
 * The second half is the one worth a test: `0.4 + 0.2 * 7` is `1.7999999999999998` in this
 * arithmetic, so a cell labelled `standOff=1.8` whose pin was that number would be a row nobody
 * could reproduce from the table, and a `--axis` lookup by label would silently miss it.
 */
test("the_probe_grids_are_the_plans_grids_and_a_cells_label_is_the_value_it_pins", () => {
  assert.deepEqual(grid(0.4, 2.0, 0.2), [0.4, 0.6, 0.8, 1, 1.2, 1.4, 1.6, 1.8, 2]);
  assert.deepEqual(grid(-1, 1, 0.25), [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1]);

  for (const base of PROBE_BASES) {
    const cells = probeCells(base);
    assert.equal(cells[0].label, "control", `${base}'s first cell is not the control`);
    assert.deepEqual(cells[0].pinned, {}, "the control pins something");
    for (const cell of cells) {
      assert.equal(cell.base, base);
      for (const [field, value] of Object.entries(cell.pinned)) {
        assert.ok(field in COMMAND_RANGES, `${cell.name} pins "${field}", which is not a command field`);
        const [low, high] = COMMAND_RANGES[field];
        assert.ok(value >= low && value <= high, `${cell.name} pins ${field} to ${value}, outside [${low}, ${high}]`);
      }
      // The label names the pin it is about, at the value it is about, so `--axis` finds it and a
      // reader of the table can retype it.
      const [name, written] = cell.label.split(/[=@]/);
      if (cell.label === "control") continue;
      if (name === "askHz") {
        assert.equal(cell.table.askHz, Number(written), `${cell.name} does not set the cadence it names`);
        continue;
      }
      assert.equal(cell.pinned[name], Number(written), `${cell.name} does not pin the value it names`);
    }
  }
  // One cell a value, no duplicates anywhere in the run, and the count the entry reports.
  const all = allCells();
  assert.equal(new Set(all.map((cell) => cell.name)).size, all.length, "two cells share a name");
  assert.equal(all.length, 128);
  assert.equal(comparisonCells().length, 6);
  assert.deepEqual(GEOMETRY_AXES, ["standOff", "advance", "strafe"]);
});

/**
 * Every cell of a run fights the same bodies from the same seeds, and the probed corner swaps.
 *
 * This is the whole reason a sixteen-bout cell says anything: two rows of the table differ in the
 * pin and in nothing else, which is common random numbers and is the set's frozen choice 3 written
 * as a job list. The second half catches the defect that looks identical from the outside -- naming
 * the cell on `left` in both jobs of a pairing gives it the first body once and the *second* body
 * once and calls that a side swap.
 */
test("every_cell_fights_the_same_bodies_from_the_same_seeds_and_the_probed_corner_swaps", () => {
  const pool = buildPool({ seed: SEED, random: 6 });
  const cells = comparisonCells();
  const jobs = probeJobs({ pool, cells, bouts: 4, seed: SEED, cap: 60 });
  assert.equal(jobs.length, cells.length * 4);
  const byCell = new Map(cells.map((cell) => [cell.name, []]));
  for (const job of jobs) {
    const probed = probedSide(job);
    byCell.get(job[probed].policy).push(job);
    assert.equal(job[probed === "left" ? "right" : "left"].policy, "golem-driver");
  }
  const shape = (list) => list.map((job) => [job.pairing, job.swapped, job.left.build, job.right.build,
    job.seeds[0], job.seeds[1]]);
  const first = shape(byCell.get(cells[0].name));
  assert.equal(first.length, 4);
  for (const cell of cells.slice(1)) {
    assert.deepEqual(shape(byCell.get(cell.name)), first,
      `${cell.name} did not fight the bodies ${cells[0].name} fought, in the same order, on the same seeds`);
  }
  // The two jobs of one pairing hold the same two bodies with the corners exchanged, and the probed
  // corner follows the body rather than the side.
  const [a, b] = byCell.get(cells[0].name);
  assert.equal(a.pairing, b.pairing);
  assert.equal(a.left.build, b.right.build);
  assert.equal(a.right.build, b.left.build);
  assert.equal(a.left.policy, cells[0].name);
  assert.equal(b.right.policy, cells[0].name);
});

// ---------------------------------------------------------------------------------------
// The summary, over rows nobody had to run.
// ---------------------------------------------------------------------------------------

/** A row of the shape a worker writes, with only the columns the summary reads filled in. */
function probeRow({ index, swapped, winner, seconds, mine, theirDamage }) {
  const side = (over) => ({
    policy: "cell", build: "b", setup: defaultGolemSetup(), seed: 1, damage: 0, contacts: 0,
    severs: 0, blocks: 0, vitality: 1, ...over,
  });
  const probed = side(mine);
  const other = side({ damage: theirDamage });
  return {
    index, pairing: index, swapped, winner, ending: "cap", seconds, leadChanges: 0, firstLeader: null,
    left: swapped ? other : probed,
    right: swapped ? probed : other,
  };
}

/** A recorded command pack with every field flat at `value` except the ones named. */
function pack(asks, over = {}) {
  const out = { asks };
  for (const field of Object.keys(COMMAND_RANGES)) {
    const value = over[field] ?? 0;
    out[field] = { mean: value, min: value, max: value };
  }
  return out;
}

/**
 * The summary is the mean of what the rows carry, and the predicted column is the record's own
 * arithmetic over the same rows.
 *
 * `hold - advance / closeGain` is the fixed point of
 * `intent.forward = clamp((gap - hold) * closeGain + advance, -1, 1)`, which is the record's claim
 * about where the feet settle; the prediction is built from the *measured* hold and the *recorded*
 * advance rather than from the cell's pin, so a cell that pins nothing still gets one. The two
 * halves of this test are that the mean is a mean and that the prediction is that expression --
 * everything else about the table is a bout.
 */
test("the_probes_summary_is_the_mean_of_the_rows_and_the_prediction_is_the_records_own_expression", () => {
  const cell = { name: "uniform/standOff=1.4", base: "uniform", label: "standOff=1.4",
    pinned: { standOff: 1.4 }, table: null };
  const rows = [
    probeRow({ index: 0, swapped: false, winner: "left", seconds: 10, theirDamage: 4,
      mine: { damage: 20, hold: 2.0, gap: 1.8, gapOverTheirReach: 1.2, theirReach: 1.5, myReach: 1.6,
        strike: 1.47, strikeOverMyReach: 0.92, insideStrike: 0.5, insideStrikeSeconds: 5,
        strokesStarted: 10, aborts: 3, strokes: 7, blows: 2, strokeDamage: 3,
        nearRangeStallSeconds: 1, retreatOutsideReachSeconds: 2, asks: 120,
        commandAxes: pack(120, { standOff: 1.4, advance: 0.5 }) } }),
    probeRow({ index: 1, swapped: true, winner: "left", seconds: 20, theirDamage: 6,
      mine: { damage: 30, hold: 2.2, gap: 2.2, gapOverTheirReach: 1.4, theirReach: 1.7, myReach: 1.8,
        strike: 1.66, strikeOverMyReach: 0.92, insideStrike: 0.3, insideStrikeSeconds: 3,
        strokesStarted: 20, aborts: 5, strokes: 13, blows: 4, strokeDamage: 5,
        nearRangeStallSeconds: 3, retreatOutsideReachSeconds: 4, asks: 240,
        commandAxes: pack(240, { standOff: 1.4, advance: -0.5 }) } }),
  ];
  const seen = summariseCell(cell, rows);
  assert.equal(seen.bouts, 2);
  assert.equal(seen.decided, 1);
  // The first row is won by the probed corner and the second is won by the corner it is not in.
  assert.equal(seen.won, 0.5);
  assert.equal(seen.gap, 2.0);
  assert.equal(seen.damageDealt, 25);
  assert.equal(seen.damageTaken, 5);
  assert.equal(seen.strokesStarted, 15);
  assert.equal(seen.stallSeconds, 2);
  assert.equal(seen.outsideSeconds, 3);
  assert.equal(seen.commandedStandOff, 1.4);
  assert.equal(seen.commandedAdvance, 0);
  // Two rows 0.4 m apart about a mean of 2.0: the sample standard deviation is 0.2 * sqrt(2).
  assert.ok(Math.abs(seen.gapSd - 0.2 * Math.SQRT2) < 1e-12, `gap sd is ${seen.gapSd}`);
  // The prediction: the measured hold, less the recorded advance over this cell's own close gain.
  assert.equal(seen.predictedGap, 2.1 - 0 / GOLEM_TACTICS_V4.closeGain);
  assert.equal(seen.predictedStrikeOverMyReach, GOLEM_TACTICS.strikeFraction);

  // A cell that moves `closeGain` is predicted with the gain it moved to, not with the shipped one,
  // which is the whole point of the paired arm the comparison cells run.
  const doubled = summariseCell({ ...cell, table: { closeGain: 3.6 } },
    [rows[0], probeRow({ ...rows[1], index: 1 })]);
  assert.ok(doubled.predictedGap !== seen.predictedGap || seen.commandedAdvance === 0);

  // A row naming a cell the run does not have is a refusal and not a silently dropped bout.
  assert.throws(() => summariseProbe(rows, [{ ...cell, name: "other" }]), /not a cell of this run/);
});

// ---------------------------------------------------------------------------------------
// The pin, read back off real bouts.
// ---------------------------------------------------------------------------------------

/**
 * The pinned contender overwrites exactly the axis named and nothing else, seen through the pack.
 *
 * Two-sided on purpose. A pin that landed on the wrong field, or that the executor's clamp then
 * moved, shows up as a pinned column whose min and max are not the pinned value; a pin that wrote
 * the whole command shows up as eleven columns whose min and max have come together. Neither of
 * those is visible from the pinning code, which is why this runs bouts and reads `commandAxes` off
 * the rows the worker wrote rather than calling the function that writes them.
 *
 * Four bouts at an eight-second cap, on the twelve reference builds. It is not a measurement and
 * makes no claim about any of the numbers; what it is about is the plumbing between the contender
 * record, the worker's pilot and the row.
 */
test("a_pinned_contender_overwrites_exactly_the_axis_named_and_nothing_else", { timeout: 600_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "axis-probe-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cells = [
    { name: "uniform/standOff=1.4", base: "uniform", label: "standOff=1.4", pinned: { standOff: 1.4 }, table: null },
    { name: "uniform/control", base: "uniform", label: "control", pinned: {}, table: null },
  ];
  const { rows, summary } = await axisProbe({
    seed: SEED, bouts: 2, workers: 2, cap: 8, random: 0, cells, out: join(dir, "pin.jsonl"),
  });
  assert.equal(rows.length, 4);
  assert.equal(summary.length, 2);

  const packs = (name) => rows.filter((row) => row[probedSide(row)].policy === name)
    .map((row) => row[probedSide(row)].commandAxes);
  const pinned = packs("uniform/standOff=1.4");
  const control = packs("uniform/control");
  assert.equal(pinned.length, 2);
  for (const seen of pinned) {
    assert.ok(seen.asks > 20, `only ${seen.asks} asks in an eight-second bout`);
    assert.equal(seen.standOff.min, 1.4, "the pinned axis came through as something else");
    assert.equal(seen.standOff.max, 1.4, "the pinned axis moved during the bout");
    for (const field of Object.keys(COMMAND_RANGES)) {
      if (field === "standOff") continue;
      assert.ok(seen[field].max > seen[field].min,
        `${field} was flat at ${seen[field].min} under a pin that does not name it`);
      const [low, high] = COMMAND_RANGES[field];
      assert.ok(seen[field].min >= low && seen[field].max <= high,
        `${field} ran ${seen[field].min}..${seen[field].max}, outside [${low}, ${high}]`);
    }
  }
  // The control is the same base with nothing held, so the axis the other cell pinned varies here.
  for (const seen of control) {
    assert.ok(seen.standOff.max > seen.standOff.min,
      "the control held the stand-off flat, so the pinned row proves nothing");
  }
  // And the row carries the executor's own two distances, which is what the tables are built from.
  for (const row of rows) {
    const side = row[probedSide(row)];
    assert.ok(side.gapSamples > 100, `${side.policy} published ${side.gapSamples} geometry samples`);
    assert.ok(side.gap > 0 && Number.isFinite(side.gap));
    assert.ok(side.strikeOverMyReach > 0.5 && side.strikeOverMyReach < 3);
  }
});

/**
 * A base the worker does not know is an error, and not the uniform pilot wearing its name.
 *
 * `AGENTS.md`'s standing trap: a ternary chain with a default branch is a silent substitution, and
 * `Weapon`'s constructor shipped a shield as a club through every green test for exactly that
 * reason. A probe whose base name was mistyped and quietly answered by the null would print a whole
 * grid of rows about the wrong mind, in the same table as the right ones, with nothing anywhere
 * saying so.
 */
test("a_pinned_contender_over_a_base_the_worker_does_not_know_fails_the_run", { timeout: 600_000 }, async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "axis-probe-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(() => axisProbe({
    seed: SEED, bouts: 2, workers: 1, cap: 4, random: 0, out: join(dir, "bad.jsonl"),
    cells: [{ name: "nonesuch/control", base: "nonesuch", label: "control", pinned: {}, table: null }],
  }), /a pinned probe's base is uniform or golem-driver/);
});

// ---------------------------------------------------------------------------------------
// The candidate: an absolute stand-off.
// ---------------------------------------------------------------------------------------

/**
 * `holdMetres` holds a metre where the reach multiple holds a reach, on the bench body.
 *
 * The claim the candidate rests on is that the zero of the action space stops being a fact about
 * the opponent. So the test is not "one number came out" but a **pair against a pair**: the same
 * command of `standOff` 1.0 is driven at two opponents whose reaches differ by half a metre, and
 * what is asserted is that under the flag the two settle at the same place and under the multiple
 * they do not.
 *
 * What is measured is the executor's own fixed point -- the gap at which `intent.forward` changes
 * sign, found by walking the opponent out along the line and watching the feet -- because that is
 * what "holds" means for a body whose feet are a proportional controller and not a teleport. The
 * slack is a centimetre of the sweep's own step, which is what the search resolution costs.
 */
test("hold_metres_holds_a_metre_whatever_their_reach_and_the_reach_multiple_does_not", async (t) => {
  const golem = await standAGolem(t);
  /**
   * The gap at which the feet change their mind, walked out in centimetre steps.
   *
   * Close in, `keepHold` is `(gap - hold) * closeGain` with `gap` under `hold`, so the body backs
   * out; past the hold it walks in. The first step on which `forward` turns positive is therefore
   * the fixed point to within the step, and the step is a centimetre.
   */
  const settles = (holdMetres, reach) => {
    let previous = null;
    for (let z = 0.6; z <= 4.0; z += 0.01) {
      const fixture = place(fixtureOf(golem.view), { x: 0, z, reach });
      const driven = golemDriven(SEED, { ...GOLEM_TACTICS_V4, holdMetres, eventAsks: false },
        () => ({ ...freshCommand(), standOff: 1.0, commit: 0 }));
      let forward = 0;
      drive(fixture, driven, 0.25, (intent) => { forward = intent.forward; });
      const gap = driven.reading.gap;
      const hold = driven.reading.hold;
      if (previous !== null && previous.forward <= 0 && forward > 0) return { gap, hold };
      previous = { forward, gap, hold };
    }
    assert.fail(`the feet never turned round at holdMetres ${holdMetres}, their reach ${reach}`);
    return null;
  };

  const metresShort = settles(true, 1.2);
  const metresLong = settles(true, 1.7);
  assert.ok(Math.abs(metresShort.hold - 1.0) < 1e-9, `the hold is ${metresShort.hold} m, not the metre commanded`);
  assert.ok(Math.abs(metresLong.hold - 1.0) < 1e-9, `the hold is ${metresLong.hold} m, not the metre commanded`);
  assert.ok(Math.abs(metresShort.gap - 1.0) < 0.02,
    `the feet settled at ${metresShort.gap.toFixed(3)} m under a one-metre hold`);
  assert.ok(Math.abs(metresShort.gap - metresLong.gap) < 0.02,
    `an absolute hold settled at ${metresShort.gap.toFixed(3)} m against a 1.2 m arm and ` +
    `${metresLong.gap.toFixed(3)} m against a 1.7 m one, which is the thing it exists not to do`);

  const multipleShort = settles(false, 1.2);
  const multipleLong = settles(false, 1.7);
  assert.ok(Math.abs(multipleShort.hold - 1.2) < 1e-9, `the hold is ${multipleShort.hold}, not their reach`);
  assert.ok(Math.abs(multipleLong.hold - 1.7) < 1e-9, `the hold is ${multipleLong.hold}, not their reach`);
  assert.ok(multipleLong.gap - multipleShort.gap > 0.4,
    `the reach multiple settled at ${multipleShort.gap.toFixed(3)} m and ${multipleLong.gap.toFixed(3)} m ` +
    "against arms half a metre apart, so the two readings of the axis are not distinguishable here");
});
