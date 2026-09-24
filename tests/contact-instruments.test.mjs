/**
 * The physical-contact set's session 01 instruments: the downed census, the idle-dummy matrix, the
 * x1 control band, the impact bench, the lift bench and the mass census. Each pure summary is checked against a record
 * built to exercise it, and each physical reading against a quantity the solver must reproduce --
 * a resting load's weight, a free body's own mass -- so an instrument that reads nothing cannot pass.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";

import { CONFIG } from "../src/config.ts";
import { COLLIDES, LAYER } from "../src/physics.ts";
import { boxPart } from "../src/rig.ts";
import { closeReachWindow, freshWindows, gateCause, stepReachWindow } from "../research/census-worker.mjs";
import { chains, dominantCause, summarizeCensus } from "../research/downed-census.mjs";
import { idleJobs, summarizeIdle } from "../research/idle-dummy.mjs";
import { bootstrapInterval, controlBand } from "../research/control-band.mjs";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";
import { tapProbe } from "./harness/impact-bench.mjs";
import { DIRECTIONS, contactForceReadout, freeTip, slabFor, sliderTrial } from "./harness/lift-bench.mjs";
import { censusOf, partClass, runMassCensus } from "./harness/mass-census.mjs";
import { createBout, freshHavok } from "./harness/bout-runner.mjs";
import { namedBuild } from "../src/golem/roster.ts";

Logger.LogLevels = Logger.ErrorLogLevel;

const gate = (reason, extra = {}) => ({ prior: "fallen", reason, pairOccupancyClear: true, withinAcceleration: true,
  risingElapsedS: 0, risingDurationS: 0.45, postureSupported: false, ...extra });

test("the census names every rise-gate refusal, and splits an obstructed rise by what obstructed it", () => {
  assert.equal(gateCause(null), null);
  assert.equal(gateCause(gate(null)), "rose");
  assert.equal(gateCause(gate("fallen dwell has not elapsed")), "dwell");
  assert.equal(gateCause(gate("the fall has not come to rest")), "unsettled");
  assert.equal(gateCause(gate("recovery was interrupted by a hit")), "re-hit");
  assert.equal(gateCause(gate("locomotion authority is unavailable")), "no-authority");
  assert.equal(gateCause(gate("support chain is not live")), "support-dead");
  assert.equal(gateCause(gate("standable recovery ground is unavailable")), "no-ground");
  const obstructed = "recovery occupancy is obstructed";
  assert.equal(gateCause(gate(obstructed, { pairOccupancyClear: false })), "occupancy");
  assert.equal(gateCause(gate(obstructed, { withinAcceleration: false })), "acceleration");
  assert.equal(gateCause(gate(obstructed)), "wall");
  assert.equal(gateCause(gate("something new")), "other:something new", "an unknown reason is kept, not folded");
  // A rise under way, and one that has overrun its duration without reaching posture.
  assert.equal(gateCause(gate(null, { prior: "rising", risingElapsedS: 0.2 })), "rising");
  assert.equal(gateCause(gate(null, { prior: "rising", risingElapsedS: 0.5 })), "stuck-rising");
  assert.equal(gateCause(gate(null, { prior: "rising", risingElapsedS: 0.5, postureSupported: true })), "rising");
});

test("a long episode is classed by the refusal it spent longest under, never by the rise", () => {
  assert.equal(dominantCause({ causes: { rising: 9, dwell: 0.35, unsettled: 4, wall: 1 } }), "unsettled");
  assert.equal(dominantCause({ causes: { rising: 3, rose: 1 } }), "rising", "an episode that only rose says so");
});

test("a knockdown within 2 s of the last rise extends a chain, and one after it starts a new one", () => {
  const episode = (start, seconds) => ({ start, seconds });
  // Down 1..2, 3..4 (1 s standing: a repeat), 4.5..5 (a repeat), then 8 (3 s standing: new chain).
  assert.deepEqual(chains([episode(1, 1), episode(3, 1), episode(4.5, 0.5), episode(8, 1)]), { longest: 3, repeats: 2 });
  assert.deepEqual(chains([episode(1, 1), episode(5, 1)]), { longest: 1, repeats: 0 });
  assert.deepEqual(chains([]), { longest: 0, repeats: 0 });
});

test("the census counts knockdowns per body and asks whether the first body down lost", () => {
  const side = (episodes, knockdowns, extra = {}) => ({ episodes, knockdowns, dealtDowned: 0, dealtStanding: 0,
    otherDownSeconds: 0, standingSeconds: 1, downWindows: 0, downWindowsScored: 0, reachToDownedCore: null, ...extra });
  const down = (start, seconds, end = "rose") => ({ start, seconds, end, causes: { dwell: seconds }, rehits: 0 });
  const rows = [
    // Left went down first and lost.
    { status: "ok", winner: "right", seconds: 30, sides: { left: side([down(2, 1)], 1), right: side([down(5, 1)], 1) } },
    // Right went down first and won.
    { status: "ok", winner: "right", seconds: 30, sides: { left: side([down(9, 6, "died")], 1), right: side([down(4, 1)], 1) } },
    // Left went down first and lost again, so the rate is 2 of 3 and not its own mirror.
    { status: "ok", winner: "right", seconds: 30, sides: { left: side([down(1, 1)], 1), right: side([], 0) } },
    // Nobody went down: not a decided bout with a knockdown.
    { status: "ok", winner: "left", seconds: 30, sides: { left: side([], 0), right: side([], 0) } },
    { status: "failed" },
  ];
  const s = summarizeCensus(rows);
  assert.equal(s.bouts, 4);
  assert.equal(s.knockdownsPerBody, 5 / 8);
  assert.equal(s.stunLock.decidedWithKnockdown, 3);
  assert.equal(s.stunLock.firstDownLoses, 2 / 3);
  assert.equal(s.longEpisodes, 1);
  assert.deepEqual(s.longByCause, { dwell: 1 });
  assert.deepEqual(s.longEndings, { died: 1 });
});

// Physical contact session 03's target is "struck in most of its downed seconds when the standing side
// is in reach", so a window counts only if the socket was in reach at some frame of it -- and a window
// that scored out of reach, or reached without scoring, must each land where it belongs.
test("a finishing window counts toward the in-reach share only if the socket reached in it", () => {
  const w = freshWindows();
  const frames = (n, scored, reached, touched = scored) => {
    for (let i = 0; i < n; i += 1) stepReachWindow(w, scored(i), reached(i), touched(i));
  };
  frames(60, (i) => i === 5, (i) => i === 59); // reached on its last frame, scored early: counts, scored
  frames(60, (i) => i === 30, () => false); // scored but never in reach: not counted
  frames(60, () => false, () => true, (i) => i === 7); // in reach throughout, touched under the floor
  frames(20, () => false, (i) => i === 3); // a partial window, closed early by the other body rising
  closeReachWindow(w);
  closeReachWindow(w); // closing an empty window counts nothing
  assert.deepEqual({ inReach: w.inReach, inReachScored: w.inReachScored, inReachTouched: w.inReachTouched },
    { inReach: 3, inReachScored: 1, inReachTouched: 2 });
});

test("an idle-dummy cell counts outright wins apart from the ones the overtime drain decided", () => {
  const over = CONFIG.bout.overtimeSeconds;
  const bout = (winner, seconds, attackerSide = "left", ending = "exhausted") =>
    ({ status: "ok", cell: "stone>giant", attacker: "stone", dummy: "giant", attackerSide, winner, seconds, ending });
  const [cell] = summarizeIdle([bout("left", over - 20), bout("right", over + 30, "right"), bout("right", over + 10),
    bout(null, 150, "left", "time")]);
  assert.equal(cell.bouts, 4);
  assert.equal(cell.winRate, 2 / 4, "a drain win is a win");
  assert.equal(cell.outrightRate, 1 / 4, "but not an outright one");
  assert.equal(cell.cappedShare, 1 / 4);
});

test("an idle-dummy block plays the attacker from both sides with the dummy always idle", () => {
  const jobs = idleJobs({ attackers: ["stone"], dummies: ["skeleton"], blocks: 2, runSeed: 7 });
  assert.equal(jobs.length, 4);
  for (const job of jobs) {
    const dummySide = job.attackerSide === "left" ? "right" : "left";
    assert.equal(job[dummySide], "idle");
    assert.notEqual(job[job.attackerSide], "idle");
    assert.equal(job[`${job.attackerSide}Build`], "attacker:stone");
    assert.equal(job[`${dummySide}Build`], "dummy:skeleton");
  }
  const [a, b] = jobs;
  assert.equal(a.block, b.block);
  assert.deepEqual(a.seeds, [b.seeds[1], b.seeds[0]], "each corner keeps its own seed across the swap");
});

test("the control band pools both bodies of each block and reads only the level it is asked for", () => {
  const row = (block, level, left, right, status = "ok") => ({ status, block, level, seconds: 10,
    sides: { left: { damage: left, knockdowns: left / 2 }, right: { damage: right, knockdowns: right / 2 } } });
  const rows = [row("a", "control", 6, 8), row("a", "control", 10, 0), row("b", "control", 2, 2),
    row("b", "max", 100, 100), row("b", "control", 50, 50, "failed")];
  const band = controlBand(rows);
  assert.equal(band.blocks, 2);
  assert.equal(band.damage.mean, (6 + 2) / 2, "block a reads 6, block b reads 2");
  assert.equal(band.knockdowns.mean, (3 + 1) / 2);
  assert.ok(band.damage.interval[0] >= 2 && band.damage.interval[1] <= 6);
  assert.throws(() => controlBand(rows, "absent"));
});

test("the bootstrap interval brackets the mean and narrows with more blocks", () => {
  const few = [1, 3, 5, 7, 9, 2, 4, 6];
  const many = Array.from({ length: 16 }, () => few).flat();
  const [lo, hi] = bootstrapInterval(few);
  assert.ok(lo < 4.625 && 4.625 < hi, `[${lo}, ${hi}]`);
  const [mlo, mhi] = bootstrapInterval(many);
  assert.ok(mhi - mlo < 0.5 * (hi - lo), "four times the blocks, under half the width");
  assert.deepEqual(bootstrapInterval(few), [lo, hi], "deterministic");
});

test("the mass census classes a part by its slot and its name", () => {
  assert.equal(partClass("locomotion", { id: "left.golem.legs.pelvis" }), "carrier");
  assert.equal(partClass("locomotion", { id: "left.golem.legs.chassis" }), "carrier");
  assert.equal(partClass("locomotion", { id: "left.golem.legs.yoke" }), "carrier");
  assert.equal(partClass("locomotion", { id: "left.golem.legs.thighL" }), "legs");
  assert.equal(partClass("torso", { id: "left.golem.trunk.core" }), "trunk");
  assert.equal(partClass("head", { id: "left.golem.head.neck" }), "head");
  assert.equal(partClass("primary", { id: "left.golem.primary.forearm" }), "arm links");
  assert.equal(partClass("secondary", { id: "left.golem.secondary.plate" }), "items");
  assert.equal(partClass("primary", { id: "left.golem.primary.hand", combatRole: "equipment" }), "items");
});

test("the mass census reads every body the golem owns off the solver", async () => {
  const setup = namedBuild("default").setup;
  const bout = createBout({ left: "idle", right: "idle", leftGolem: setup, rightGolem: setup,
    locomotionMode: "supported", physics: await freshHavok(), seeds: [1, 2] });
  try {
    const census = censusOf(bout.left, setup);
    const classes = Object.values(census.byClass).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(classes - census.wholeKg) < 1e-9, "every part lands in exactly one class");
    // Against the solver's own sum over the golem's limbs, which is a second route to the same bodies.
    const limbs = bout.left.limbs.reduce((a, limb) => a + limb.part.body.getMassProperties().mass, 0);
    assert.ok(Math.abs(limbs - census.wholeKg) < 1e-6, `census ${census.wholeKg} against limbs ${limbs}`);
    assert.ok(census.wholeKg > 60 && census.wholeKg < 120, `a stone default weighs ${census.wholeKg} kg`);
    for (const c of ["carrier", "legs", "trunk", "head", "arm links", "items"]) assert.ok(census.byClass[c] > 0, c);
  } finally { bout.dispose(); }
});

/**
 * Physical contact 04's first repair. The wheel and the multileg took their carried mass from a mount
 * that reads 0 in an assembly, so each divided a shove by its locomotion alone (59.66 kg of a
 * 117.39 kg wheel golem); and a wrist cast to its load weighed more than its effector declared, so
 * `golemUpperMassKg` was 1.55 kg short on stone and 2.08 on the skeleton. Both are read here against
 * the solver, on every family the census knows.
 */
test("every carrier holds up its whole body, and the build's upper mass is the solver's", async () => {
  const rows = await runMassCensus();
  assert.ok(rows.length >= 6, "the control: every census family was built");
  for (const row of rows) {
    const near = (a, b) => Math.abs(a - b) <= 1e-4 * b;
    assert.ok(near(row.supportedMassKg, row.wholeKg), `${row.family}: supports ${row.supportedMassKg} kg of ${row.wholeKg}`);
    assert.ok(near(row.upperMassKg.build, row.upperMassKg.solver),
      `${row.family}: the build says ${row.upperMassKg.build} kg above the waist, the solver ${row.upperMassKg.solver}`);
  }
});

test("a slab stands short of the free tip along its own normal, whichever way the arm went", () => {
  const socket = new Vector3(0, 1.4, 0);
  for (const [direction, tip] of [["up", new Vector3(0.3, 3.1, 0.4)], ["sideways", new Vector3(1.5, 1.6, 0.8)]]) {
    const slab = slabFor(direction, socket, tip, { shortM: 0.2, thicknessM: 0.2 });
    // The slab's thin side is its local Y; its near face is half a thickness back from the centre.
    const normal = Vector3.Up().applyRotationQuaternion(slab.rotation);
    assert.ok(Vector3.Distance(normal, slab.axis) < 1e-9, `${direction}: the thin side faces the arm`);
    const nearFace = Vector3.Dot(slab.centre.subtract(slab.axis.scale(0.1)).subtract(socket), slab.axis);
    assert.ok(Math.abs(Vector3.Dot(tip.subtract(socket), slab.axis) - nearFace - 0.2) < 1e-9, `${direction}: 0.2 m short`);
  }
  assert.ok(Math.abs(slabFor("sideways", socket, new Vector3(1.5, 1.6, 0.8)).axis.y) < 1e-12, "a wall is vertical");
});

test("the lift bench's force readout reads a resting load's weight, and nothing without one", async () => {
  for (const massKg of [0, 50]) {
    const arena = await createHeadlessArena();
    try {
      const scene = arena.scene;
      const slab = boxPart(scene, { name: "slab", position: new Vector3(0, 2, 0), rotation: Quaternion.Identity(),
        size: new Vector3(3, 0.2, 3), mass: 1000, layer: LAYER.RIGHT_TRUNK, collidesWith: COLLIDES.RIGHT_TRUNK,
        motionType: PhysicsMotionType.ANIMATED });
      if (massKg > 0) {
        const load = boxPart(scene, { name: "load", position: new Vector3(0, 2.3, 0), rotation: Quaternion.Identity(),
          size: new Vector3(0.4, 0.4, 0.4), mass: massKg, layer: LAYER.LEFT_TRUNK, collidesWith: COLLIDES.LEFT_TRUNK });
        // A resting load falls asleep and a sleeping body reports no contacts (`AGENTS.md`).
        scene.getPhysicsEngine().getPhysicsPlugin().setActivationControl(load.body, 1);
      }
      const readout = contactForceReadout(scene, slab.body);
      for (let i = 0; i < 60; i++) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); }
      const force = readout.meanOver(0.5);
      readout.dispose();
      const weight = massKg * 9.81;
      if (massKg === 0) assert.equal(force, 0);
      else assert.ok(Math.abs(force - weight) / weight < 0.06, `${force.toFixed(1)} N against a ${weight.toFixed(1)} N load`);
    } finally { arena.dispose(); }
  }
});

test("the tap reads a free striker's own mass along its axis, and more once the chain is behind it", async () => {
  const tap = await tapProbe({ moduleId: "effector.wrist.blade", normal: "axis", settleSeconds: 0.5 });
  // Along the axis through the tip the impulse passes through the blade's centre of mass, so the free
  // body answers with its whole mass: the formula's check against a number nothing tuned.
  assert.ok(Math.abs(tap.freeKg - tap.strikerBodyKg) / tap.strikerBodyKg < 0.02,
    `free ${tap.freeKg} against the body's ${tap.strikerBodyKg} kg`);
  assert.ok(tap.chainKg > 2 * tap.freeKg, `the chain adds its links: ${tap.chainKg} kg`);
  const edge = await tapProbe({ moduleId: "effector.wrist.blade", normal: "edge", settleSeconds: 0.5 });
  assert.ok(edge.freeKg < 0.5 * edge.strikerBodyKg, `across the blade at the tip a lever turns it: ${edge.freeKg} kg`);
});

test("the lift bench's slider pushes with the force it is given, and an arm holding it feels that force", async () => {
  const moduleId = "effector.reach.fist";
  const free = await freeTip({ moduleId, command: DIRECTIONS.up });
  const slab = slabFor("up", free.socket, free.tip, { shortM: 0.2, spanM: 0.8 });
  // Control: no arm, 196.2 N on the 20 kg plate is 9.81 m/s^2, so 0.25 s moves it 0.3066 m back.
  const alone = await sliderTrial({ moduleId, command: DIRECTIONS.up, slab, forceN: 196.2, withArm: false, holdSeconds: 0.25 });
  assert.ok(Math.abs(alone.movedM + 0.3066) < 0.02, `the plate alone moved ${alone.movedM} m`);
  assert.equal(alone.contactN, 0, "and touched nothing");
  // A load the arm holds: lifted toward the tip, with the plate feeling exactly the force it is given.
  const held = await sliderTrial({ moduleId, command: DIRECTIONS.up, slab, forceN: 500 });
  assert.ok(held.movedM >= 0.1, `the arm lifted it ${held.movedM} m`);
  assert.ok(Math.abs(held.contactN - 500) / 500 < 0.05, `contact ${held.contactN} N against 500`);
});
