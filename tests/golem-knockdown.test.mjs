// A knockdown that runs its course (`KNOCKDOWN` in src/golem/config.ts), on a whole golem in a
// supported pair: the body goes limp below the waist and weak above it, lies until its centre of mass
// has come down and stopped coming down, and rises no faster than the table allows while its strength
// comes back, and a blow during that rise puts it down only if it would have put a standing body
// down. Since physical contact session 08 that is one table for every body, stone's included.
import assert from "node:assert/strict";
import test from "node:test";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import { CONFIG } from "../src/config.ts";
import { stepPair } from "../src/fighter.ts";
import { defaultGolemSetup } from "../src/golem/build.ts";
import { KNOCKDOWN, LOCOMOTION_BIPED, LOCOMOTION_MULTILEG, LOCOMOTION_WHEEL } from "../src/golem/config.ts";
import { GROUNDED_TONE, Golem } from "../src/golem/golem.ts";
import { JointActuator } from "../src/golem/joint-servo.ts";
import { bodyReaders } from "../src/golem/locomotion.ts";
import { SKELETON_BIPED } from "../src/golem/skeleton/body.ts";
import { skeletonSetup } from "../src/golem/skeleton/presets.ts";
import { NEUTRAL, idleMind } from "../src/mind.ts";
import { blankIntent } from "../src/policies.ts";
import { SUPPORTED_LOCOMOTION_V1 as V1 } from "../src/supported-locomotion-state.ts";
import { TIPPING } from "../src/tipping.ts";
import { flatSupportedWorldRegistry } from "../src/supported-locomotion-production.ts";
import { ATTRIBUTES, withAttributeSetting } from "../src/golem/attributes.ts";
import { createHeadlessArena } from "./harness/golem-headless-arena.mjs";

const FIXED = 1 / CONFIG.world.physicsHz;

/**
 * Asks to rise and to fight with every channel the whole time, so whatever the body does not do is
 * the body's refusal. No part of it is `NEUTRAL`'s, or a command that went limp would pass as one
 * that was obeyed.
 */
function fightingMind() {
  const blank = blankIntent();
  const intent = Object.freeze({ ...blank, turn: 0.5,
    posture: Object.freeze({ trunkLean: 0.4, trunkTwist: 0.3, crouch: 0 }),
    natural: Object.freeze({ thrust: true, guard: false }),
    primary: Object.freeze({ ...blank.primary, pointerX: 0.6, pointerY: 0.5, reach: 1 }),
    secondary: Object.freeze({ ...blank.secondary, pointerX: -0.5, pointerY: 0.2, reach: 0.8, guard: true }) });
  for (const channel of ["posture", "natural", "primary", "secondary"]) {
    assert.notDeepEqual(intent[channel], NEUTRAL[channel], channel);
  }
  return { name: "fights-from-the-floor", decide: () => intent };
}

/**
 * Every ceiling a `JointActuator` was last asked for, keyed on the actuator: the table value,
 * before the body's tone. The solver's own ceiling is read back from the joint.
 */
const asked = new Map();
const drive = JointActuator.prototype.drive;
JointActuator.prototype.drive = function (velocity, maxForce) {
  asked.set(this, maxForce);
  return drive.call(this, velocity, maxForce);
};

/**
 * Swaps each upper module for a copy whose `command` records what it was handed. The module
 * records are frozen closures, so a spread copy behaves as the original does.
 */
function recordUpperCommands(golem) {
  const last = {};
  const spy = (name, module) => ({ ...module, command: (value) => { last[name] = value; module.command(value); } });
  golem.torsoModule = spy("torso", golem.torsoModule);
  golem.headModule = spy("head", golem.headModule);
  golem.effectorModules.splice(0, golem.effectorModules.length, ...golem.effectorModules.map((effector) =>
    ({ ...effector, module: spy(effector.driven, effector.module) })));
  return last;
}

/**
 * A standing idle pair six metres apart, the left one knocked down by a queued shove twice its fall
 * line and watched for `seconds`; `reshoveIntoRise` shoves it again that far into its first rise,
 * at `reshoveAt` times the fall line.
 * `census` sorts every actuator driven by the tone it was built on.
 */
async function knockdown(setupOf, { seconds = 6, reshoveIntoRise = null, reshoveAt = 2 } = {}) {
  asked.clear();
  const arena = await createHeadlessArena();
  const { scene } = arena;
  const world = flatSupportedWorldRegistry();
  const setup = setupOf();
  const mind = fightingMind();
  const pair = ["left", "right"].map((side, i) => new Golem(scene, {
    side, origin: new Vector3(0, 0, i * 6), facing: i * Math.PI,
    setup, mind: i === 0 ? mind : idleMind(), controlPolicies: [], locomotionWorld: world,
  }));
  const golem = pair[0];
  const commands = recordUpperCommands(golem);
  const pelvis = golem.limbs.find((limb) => limb.key.endsWith("legs.pelvis")).part;
  // What the settle reads: the whole body's centre of mass and its lowest ground point.
  const readers = bodyReaders(() => golem.limbs.filter((limb) => !limb.severed).map((limb) => limb.part));
  let clock = 0;
  const control = scene.onBeforePhysicsObservable.add(() => { stepPair(...pair, FIXED, clock); clock += FIXED; });
  const samples = [];
  const shove = (atFall = 2) => {
    // Along the push: the line the ledger will read it against (`stabilityLinesAlong`).
    const massKg = golem.locomotion.diagnostic().stability.supportedMassKg;
    const fallAtMps = golem.locomotion.stabilityLinesAlong(1, 0).fallAtMps;
    golem.queueStabilityEvent({ horizontalShoveNs: [fallAtMps * massKg * atFall, 0] });
  };
  let riseStart = null;
  let reshoved = false;
  /** Each actuator of this golem, with its table ceiling and the ceiling the solver holds. */
  const ceilings = () => [...asked].filter(([actuator]) => actuator.tone === golem.tone)
    .map(([actuator, table]) => ({ table, held: actuator.joint.getAxisMotorMaxForce(actuator.axis) }));
  const sample = scene.onAfterPhysicsObservable.add(() => {
    const diagnostic = golem.locomotion.diagnostic();
    const state = golem.locomotion.state;
    samples.push({ at: clock, state, progress: diagnostic.recoveryProgress,
      pelvis: pelvis.mesh.position.clone(), y: pelvis.mesh.position.y, vy: pelvis.body.getLinearVelocity().y,
      com: readers.mass().y, floor: Math.min(...readers.ground().map((point) => point.y)),
      ceilings: ceilings(), commands: { ...commands } });
    riseStart = state !== "rising" ? null : riseStart ?? clock;
    if (reshoveIntoRise !== null && !reshoved && riseStart !== null && clock - riseStart >= reshoveIntoRise) {
      reshoved = true;
      shove(reshoveAt);
    }
  });
  const run = (seconds) => {
    const end = clock + seconds;
    while (clock < end) { scene._renderId += 1; scene._advancePhysicsEngineStep(1000 / 60); }
  };
  try {
    run(2);
    const standing = samples.at(-1);
    assert.equal(standing.state, "supported", "the pair did not stand");
    samples.length = 0;
    shove();
    run(seconds);
    const census = { own: 0, mirror: 0, stray: 0 };
    for (const actuator of asked.keys()) {
      census[actuator.tone === golem.tone ? "own" : actuator.tone === pair[1].tone ? "mirror" : "stray"] += 1;
    }
    return { golem, mind, standing, samples, census, reshoved };
  } finally {
    scene.onBeforePhysicsObservable.remove(control);
    scene.onAfterPhysicsObservable.remove(sample);
    for (const g of pair) g.dispose();
    arena.dispose();
  }
}

/** Every run of consecutive samples in `state`, in order. */
function stretches(samples, state) {
  const runs = [];
  samples.forEach((row, i) => {
    if (row.state !== state) return;
    if (i === 0 || samples[i - 1].state !== state) runs.push([]);
    runs.at(-1).push(row);
  });
  return runs;
}

const firstStretch = (samples, state) => stretches(samples, state)[0] ?? [];
const lasted = (stretch) => stretch.at(-1).at - stretch[0].at + FIXED;

/**
 * How far a lie held to its cap may read past the cap: three substeps. `KnockdownSettle` starts its
 * clock the step after the release, sums it a step at a time (so a cap that is a whole number of
 * steps can land a step late on the float), and the state leaves fallen on the boundary after the
 * rule says so. The latency is counted in substeps, so the allowance is too. Measured (Node headless
 * arena, skeleton at x1, 2026-09-25): one substep past the cap at 240 Hz, two at 120 -- which a
 * two-substep allowance missed by 2e-12 s.
 */
const CAP_LATENCY = 3 * FIXED;

/**
 * Every actuator driven was built on one of the two golems' tones, and the two mirrors drove as
 * many. The per-row ceiling check reads this golem's tone and so cannot see a module built on
 * another; this can.
 */
function assertCensus({ own, mirror, stray }) {
  assert.equal(stray, 0, `${stray} actuators were driven on a tone that is neither golem's`);
  assert.ok(own >= 9 && own === mirror, `${own} actuators on this golem's tone against ${mirror} on its mirror's`);
}

function assertCeilings(row, scale, label) {
  assert.ok(row.ceilings.length >= 9, `${label}: only ${row.ceilings.length} actuators driven`);
  for (const { table, held } of row.ceilings) {
    // Havok holds a ceiling as a 32-bit float.
    assert.ok(Math.abs(held - table * scale) <= 1e-6 * Math.max(1, table),
      `${label} at ${row.at.toFixed(3)} s: held ${held} of table ${table}, expected x${scale}`);
  }
}

function assertCommands(row, intent, label) {
  assert.deepEqual(row.commands, { torso: intent.posture, head: intent.natural,
    primary: intent.primary, secondary: intent.secondary }, `${label} at ${row.at.toFixed(3)} s`);
}

// **A downed body fights on, weakly** (physical contact session 02): every motor above the legs at
// `GROUNDED_TONE` and the whole command still handed through, where a skeleton once went limp and
// neutral. The command half is a pair with `standing`, so a fallen body commanded neutral fails it.
// Stone ran a frozen dwell and rise until session 08 gave every body the one table; both run it here.
for (const [name, setupOf] of [["skeleton", skeletonSetup], ["stone", defaultGolemSetup]]) {
  test(`a_knocked_down_${name}_goes_weak_lies_down_and_rises_as_slowly_as_the_table_says`, async () => {
    const rule = KNOCKDOWN;
    const tone = GROUNDED_TONE;
    assert.ok(tone > 0 && tone < 1);
    const { mind, standing, samples, census } = await knockdown(setupOf);
    assertCensus(census);
    assertCeilings(standing, 1, "standing");
    const intent = mind.decide();
    assertCommands(standing, intent, "standing");

    const fallen = firstStretch(samples, "fallen");
    assert.ok(fallen.length > 0, `the shove did not knock the ${name} down`);
    for (const row of fallen) {
      assertCeilings(row, tone, "fallen");
      assertCommands(row, intent, "fallen");
    }
    const lay = lasted(fallen);
    assert.ok(lay > V1.FALLEN_DWELL_S + 0.25,
      `the mind asked to rise from the first substep and the ${name} lay ${lay.toFixed(3)} s against the dwell's ${V1.FALLEN_DWELL_S}`);
    assert.ok(lay <= rule.maxLyingSeconds + 0.1, `lay ${lay.toFixed(3)} s against a cap of ${rule.maxLyingSeconds}`);

    const rising = firstStretch(samples, "rising");
    assert.ok(rising.length > 0 && rising[0].at > fallen.at(-1).at, `the ${name} never began to rise`);
    assert.ok(rising[0].y < 0.5 * standing.y,
      `the rise began with the pelvis at ${rising[0].y.toFixed(3)} m of a standing ${standing.y.toFixed(3)}`);
    const peak = Math.max(...rising.map((row) => row.vy));
    assert.ok(peak <= rule.risePeakMps * 1.02, `the pelvis rose at ${peak.toFixed(3)} m/s against ${rule.risePeakMps}`);
    // With the pelvis under half its standing height, the lift alone needs well over the frozen rise.
    const took = lasted(rising);
    const floor = 1.5 * (standing.y - rising[0].y) / rule.risePeakMps;
    assert.ok(took >= 0.95 * floor,
      `the rise took ${took.toFixed(3)} s; lifting ${(standing.y - rising[0].y).toFixed(3)} m at ${rule.risePeakMps} m/s needs ${floor.toFixed(3)}`);
    for (const row of rising) {
      // The progress the tone climbs along is the rise's own clock, read here from the state stretch.
      const along = (row.at - rising[0].at + FIXED) / took;
      assert.ok(Math.abs(row.progress - along) <= 2 * FIXED / took,
        `${row.at.toFixed(3)} s: progress ${row.progress.toFixed(4)} of a rise ${along.toFixed(4)} of the way through`);
      assertCeilings(row, tone + (1 - tone) * row.progress, "rising");
      assertCommands(row, intent, "rising");
    }

    assert.ok(rising.some((row) => row.progress > 0.25 && row.progress < 0.75),
      "no reading caught the strength part of the way back");

    const up = samples.find((row) => row.at > rising.at(-1).at);
    assert.ok(up && up.state !== "fallen" && up.state !== "rising", `after the rise the ${name} was ${up?.state}`);
    assertCeilings(up, 1, "up");
    assertCommands(up, intent, "up");
  });
}

test("every_locomotion_table_runs_the_one_knockdown", () => {
  // Session 08's rule: one knockdown for every body, and no family's own copy of it.
  for (const [name, table] of [["biped", LOCOMOTION_BIPED], ["skeleton", SKELETON_BIPED],
    ["wheel", LOCOMOTION_WHEEL], ["multileg", LOCOMOTION_MULTILEG]]) {
    assert.equal(table.knockdown, KNOCKDOWN, name);
    assert.equal(table.riseBudgetSeconds, LOCOMOTION_BIPED.riseBudgetSeconds, `${name}'s rise budget`);
  }
});

test("a_skeleton_rises_once_its_centre_of_mass_has_come_down_and_stopped_coming_down", async () => {
  // A cap three times the table's, so that the descent rule alone can end the lie.
  const rule = SKELETON_BIPED.knockdown;
  const cap = rule.maxLyingSeconds * 3;
  SKELETON_BIPED.knockdown = { ...rule, maxLyingSeconds: cap };
  try {
    const { standing, samples } = await knockdown(skeletonSetup, { seconds: 10 });
    const fallen = firstStretch(samples, "fallen");
    assert.ok(fallen.length > 0, "the shove did not knock the skeleton down");
    const lay = lasted(fallen);
    assert.ok(lay < cap - 0.25, `lay ${lay.toFixed(3)} s, at the cap of ${cap}: it never settled`);
    // Half way down from where the lie began to the floor under it, before the rise.
    const [start] = fallen;
    const halfway = start.com - 0.5 * (start.com - start.floor);
    assert.ok(fallen.at(-1).com <= halfway + 1e-3,
      `the rise began with the centre of mass at ${fallen.at(-1).com.toFixed(3)} m, above half way at ${halfway.toFixed(3)}`);
    // Not coming down faster than the rest speed over the window before the rise, less the two
    // substeps a sample after the step can lag the rule's reading by.
    const window = fallen.filter((row) => row.at > fallen.at(-1).at - rule.restSeconds + 2 * FIXED);
    const descent = Math.max(...window.slice(1).map((row, i) => (window[i].com - row.com) / FIXED));
    assert.ok(descent <= rule.restSpeedMps,
      `the centre of mass came down at ${descent.toFixed(3)} m/s in the last ${rule.restSeconds} s before the rise`);
    const rising = firstStretch(samples, "rising");
    assert.ok(rising.length > 0 && rising[0].y < 0.5 * standing.y,
      `the rise began with the pelvis at ${rising[0]?.y.toFixed(3)} m of a standing ${standing.y.toFixed(3)}`);
  } finally {
    SKELETON_BIPED.knockdown = rule;
  }
});

// **A rise is put down by what would put a standing body down, and by nothing less** (physical
// contact session 02). The two halves are a pair: a blow at twice the fall line during the rise
// fells the body, and one halfway between the stagger and fall lines does not. The second half is
// also the ledger's test, because a rise that carried its own fall's ledger would already hold more
// than the fall line and go down at the first touch.
const BETWEEN_STAGGER_AND_FALL = (TIPPING.STAGGER_FRACTION + 1) / 2;

test("a_fall_level_blow_while_a_skeleton_rises_puts_it_down_and_it_lies_its_whole_course_again", async () => {
  // Held to the cap by a rest it cannot reach, so each lie's length is the rule's alone; a lie that
  // carried the first one's clock into the second would be short.
  const rule = SKELETON_BIPED.knockdown;
  const tone = GROUNDED_TONE;
  SKELETON_BIPED.knockdown = { ...rule, restSeconds: rule.maxLyingSeconds * 4 };
  try {
    const { mind, samples, census, reshoved } = await knockdown(skeletonSetup, { seconds: 9, reshoveIntoRise: 0.3 });
    assertCensus(census);
    assert.ok(reshoved, "the rise was never struck");
    const lies = stretches(samples, "fallen");
    assert.ok(lies.length >= 2, `${lies.length} lies: the blow during the rise did not put the skeleton back down`);
    const [first, second] = lies;
    const between = samples.filter((row) => row.at > first.at(-1).at && row.at < second[0].at);
    assert.ok(between.length > 0 && between.every((row) => row.state === "rising"),
      `between the lies the skeleton was ${[...new Set(between.map((row) => row.state))].join(", ")}`);
    assert.ok(lasted(between) < 0.3 + 0.1, `the struck rise lasted ${lasted(between).toFixed(3)} s`);
    for (const [label, lie] of [["first", first], ["second", second]]) {
      assert.ok(Math.abs(lasted(lie) - rule.maxLyingSeconds) <= CAP_LATENCY,
        `the ${label} lie lasted ${lasted(lie).toFixed(3)} s against a cap of ${rule.maxLyingSeconds}`);
    }
    for (const row of second) {
      assertCeilings(row, tone, "fallen again");
      assertCommands(row, mind.decide(), "fallen again");
    }
    assert.ok(samples.some((row) => row.at > second.at(-1).at && row.state === "rising"), "never rose again");
  } finally {
    SKELETON_BIPED.knockdown = rule;
  }
});

test("a_staggering_blow_while_a_skeleton_rises_does_not_stop_the_rise", async () => {
  assert.ok(BETWEEN_STAGGER_AND_FALL > TIPPING.STAGGER_FRACTION && BETWEEN_STAGGER_AND_FALL < 1,
    "the blow is not between the two lines");
  const tone = GROUNDED_TONE;
  const { mind, samples, census, reshoved } = await knockdown(skeletonSetup,
    { seconds: 9, reshoveIntoRise: 0.3, reshoveAt: BETWEEN_STAGGER_AND_FALL });
  assertCensus(census);
  assert.ok(reshoved, "the rise was never struck");
  const lies = stretches(samples, "fallen");
  const rises = stretches(samples, "rising");
  assert.equal(lies.length, 1, `${lies.length} lies: a blow under the fall line put the rising skeleton back down`);
  assert.equal(rises.length, 1, `${rises.length} rises`);
  const [rise] = rises;
  // The reshove landed: a rise that ended before 0.3 s would have taken no blow at all.
  assert.ok(lasted(rise) > 0.3 + 0.25, `the rise lasted ${lasted(rise).toFixed(3)} s, too short to have been struck`);
  for (const row of rise) assertCeilings(row, tone + (1 - tone) * row.progress, "rising through the blow");
  const up = samples.find((row) => row.at > rise.at(-1).at);
  assert.ok(up && up.state !== "fallen" && up.state !== "rising", `after the struck rise the skeleton was ${up?.state}`);
  assertCeilings(up, 1, "up");
  assertCommands(up, mind.decide(), "up");
});

test("a_skeleton_that_never_comes_to_rest_still_rises_at_the_cap", async () => {
  // Recovery may not require a state the body cannot reach: a skeleton struck while it lies never
  // comes to rest, and asking for more stillness than the cap allows is the same body on a bench.
  const rule = SKELETON_BIPED.knockdown;
  SKELETON_BIPED.knockdown = { ...rule, restSeconds: rule.maxLyingSeconds * 4 };
  try {
    const { samples } = await knockdown(skeletonSetup);
    const fallen = firstStretch(samples, "fallen");
    assert.ok(fallen.length > 0, "the shove did not knock the skeleton down");
    const lay = fallen.at(-1).at - fallen[0].at + FIXED;
    assert.ok(Math.abs(lay - rule.maxLyingSeconds) <= CAP_LATENCY,
      `lay ${lay.toFixed(3)} s against a cap of ${rule.maxLyingSeconds}`);
    assert.ok(samples.some((row) => row.at > fallen.at(-1).at && row.state === "rising"), "never rose");
  } finally {
    SKELETON_BIPED.knockdown = rule;
  }
});

test("the_recovery_stat_divides_every_lie_and_rise_and_the_cap_still_ends_a_lie_at_both_ends_of_its_range", async () => {
  // Session 07's claims, on whole golems at the ends of the range the row ships. Each body is held
  // to its cap by a rest it cannot reach -- the house rule on recovery is that a body struck while it
  // lies still gets up, and the cap is what guarantees it -- so each lie is the cap over the stat,
  // and the body still stands at the end of it. Stone ran a frozen dwell and rise over the stat until
  // session 08; it runs the one table now, so it is read the same way.
  const row = ATTRIBUTES.recovery;
  const at = (setupOf, recovery) => () => withAttributeSetting(setupOf(), { recovery });
  const rule = KNOCKDOWN;
  const held = { ...rule, restSeconds: rule.maxLyingSeconds * 4 };
  LOCOMOTION_BIPED.knockdown = held;
  SKELETON_BIPED.knockdown = held;
  try {
    for (const [setupOf, recovery] of [[skeletonSetup, row.min], [skeletonSetup, row.max], [defaultGolemSetup, row.max]]) {
      const cap = rule.maxLyingSeconds / recovery;
      const { standing, samples } = await knockdown(at(setupOf, recovery), { seconds: cap + 4 });
      const lies = stretches(samples, "fallen");
      assert.equal(lies.length, 1, `x${recovery}: ${lies.length} lies`);
      const lay = lasted(lies[0]);
      assert.ok(Math.abs(lay - cap) <= CAP_LATENCY, `${setupOf.name} at x${recovery} lay ${lay.toFixed(3)} s against a cap of ${cap.toFixed(3)}`);
      const rising = firstStretch(samples, "rising");
      assert.ok(rising.length > 0, `${setupOf.name} at x${recovery} never began to rise`);
      // The lift is divided too: no faster than the table's peak times the stat, and no shorter than
      // that peak needs over the distance it lifted.
      const peak = Math.max(...rising.map((r) => r.vy));
      assert.ok(peak <= rule.risePeakMps * recovery * 1.02, `x${recovery}: the pelvis rose at ${peak.toFixed(3)} m/s`);
      const floor = Math.max(V1.RISING_DURATION_S / recovery, 1.5 * (standing.y - rising[0].y) / (rule.risePeakMps * recovery));
      assert.ok(Math.abs(lasted(rising) - floor) <= 0.05 * floor + 2 * FIXED,
        `x${recovery}: the rise took ${lasted(rising).toFixed(3)} s against ${floor.toFixed(3)}`);
      const up = samples.find((r) => r.at > rising.at(-1).at);
      assert.ok(up && up.state !== "fallen" && up.state !== "rising", `after the rise at x${recovery} the skeleton was ${up?.state}`);
    }
  } finally {
    LOCOMOTION_BIPED.knockdown = rule;
    SKELETON_BIPED.knockdown = rule;
  }
});
