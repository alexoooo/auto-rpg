/**
 * **Every legs, balance and motor the toolkit offers honours the body layer's vocabulary**
 * (`tests/harness/probes.mjs`; Node, the core's world, Rapier, 120 Hz): each gait (`GAITS`), the
 * stance walk and Move, each balance (`BALANCES`) and motor (`MOTORS`), and the swap test's stubs of
 * each, asked every legs-goal field and claim term on the Warrior, does it within its limit or
 * reports it undone. A probe has teeth: legs that ignore its field, or a motor its term, and say
 * nothing, fail it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { rig, lookupWith, LEGS_PROBES, CLAIM_PROBES } from "./harness/probes.mjs";
import { STUB_LEGS } from "./fixtures/swap/stub-legs.mjs";
import { STUB_BALANCE } from "./fixtures/swap/stub-balance.mjs";
import { STUB_MOTOR } from "./fixtures/swap/stub-motor.mjs";
import { BALANCES } from "../src/core/control/balances.ts";
import { MOTORS } from "../src/core/control/motors.ts";
import { MOVE } from "../src/core/mind/config.ts";
import { GAME_MOTOR } from "../src/core/mind/kit.ts";
import { GAITS } from "../src/core/skills/gaits.ts";
import { ALL_MET } from "../src/core/skills/skill.ts";

const lookup = lookupWith({ "swap:stub-legs": STUB_LEGS, "swap:stub-balance": STUB_BALANCE, "swap:stub-motor": STUB_MOTOR });

/**
 * Each implementation probed, by name: the rig's configs, and the probes that ask what it carries
 * out. Legs stand on the game's motor and balance (`GAME_MOTOR`, the stance), and the stance walk on
 * each other balance.
 */
const PROBED = [
  ["the stance walk on the stance", { legs: { kind: "stance-walk" } }, LEGS_PROBES],
  ...Object.entries(GAITS).map(([name, gait]) => [`the ${name} gait`, { legs: gait.legs }, LEGS_PROBES]),
  ["Move", { legs: MOVE }, LEGS_PROBES],
  ["the stub legs", { legs: STUB_LEGS.defaults }, LEGS_PROBES],
  ...Object.keys(BALANCES).concat("swap:stub-balance").filter((kind) => kind !== GAME_MOTOR.balance.kind)
    .map((kind) => [`the stance walk on the ${kind} balance`, { motor: { ...GAME_MOTOR, balance: { kind } } }, LEGS_PROBES]),
  ...Object.keys(MOTORS).concat("swap:stub-motor").map((kind) => [`the ${kind} motor`, { motor: kind === "swap:stub-motor" ? STUB_MOTOR.defaults : { ...GAME_MOTOR, kind } }, CLAIM_PROBES]),
];

/** Each of `probes` on a rig of `configs`, by name: its reading. */
async function probeAll(configs, probes) {
  const readings = {};
  for (const [name, probe] of Object.entries(probes)) {
    const made = await rig({ ...configs, lookup });
    try { readings[name] = await probe.run(made); } finally { made.dispose(); }
  }
  return readings;
}

const failures = (readings) => Object.entries(readings).filter(([, one]) => !one.passed).map(([name, one]) => `${name}: ${one.detail}`);

for (const [name, configs, probes] of PROBED) {
  test(`${name} does or reports every term it is asked`, async () => {
    const readings = await probeAll(configs, probes);
    assert.deepEqual(failures(readings), [], `${name}, Warrior in the guard, Rapier, 120 Hz`);
    // The run carries no stance of the stance's: a heading asked while it runs is reported, not met.
    if (configs.legs === GAITS.run.legs) assert.deepEqual(readings["heading at a run"].reported && !readings["heading at a run"].met, true,
      `the run gait was not running at the heading's ask: ${readings["heading at a run"].detail}`);
  });
}

/** Legs that leave `field` out of every goal they are given, and say nothing undone. */
const deaf = (field) => (legs) => Object.create(legs, {
  goal: { value: (view, goal, dt) => legs.goal(view, field === "walk" ? { ...goal, walk: null } : field === "face" ? { ...goal, face: legs.heading } : { ...goal, [field]: undefined }, dt) },
  unmet: { get: () => ALL_MET },
});

/** A command without `term`. */
const without = (term) => (command) => term === "posture" ? { ...command, posture: {} } : term === "pushes" ? { ...command, pushes: [] } : { ...command, [term]: undefined };

test("each probe fails on legs that ignore its field, or a motor its term, and say nothing", async () => {
  const passed = [];
  for (const [name, probe] of Object.entries(LEGS_PROBES)) {
    const made = await rig({ lookup, wrapLegs: deaf(probe.field) });
    try { const one = await probe.run(made); if (one.passed) passed.push(`${name}, its ${probe.field} ignored: ${one.detail}`); } finally { made.dispose(); }
  }
  for (const [name, probe] of Object.entries(CLAIM_PROBES)) {
    const made = await rig({ lookup, filter: without(probe.term) });
    try { const one = await probe.run(made); if (one.passed) passed.push(`${name}, its ${probe.term} dropped: ${one.detail}`); } finally { made.dispose(); }
  }
  assert.deepEqual(passed, []);
});
