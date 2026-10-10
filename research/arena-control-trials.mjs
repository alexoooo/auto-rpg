import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Duel } from "../src/arena/duel.ts";
import { addArenaSolids } from "../src/arena/room.ts";
import { centreOfToRef, pointOfToRef, motionAtToRef } from "../src/core/control/support.ts";
import { rigidPoints } from "../src/core/build/rigid.ts";
import { aimOf } from "../src/core/skills/strikes.ts";
import { RECIPE_FIGHTER } from "../src/core/mind/config.ts";
import { STAND_ORDERS } from "../src/core/mind/orders.ts";
import { createWorld } from "../src/core/world.ts";
import { freshEngine } from "../tests/harness/core-stand.mjs";
import { COMBAT, withParts } from "../tests/fixtures/minds.mjs";

/** Actual arena lifecycle, isolated by standing the other contestant out of reach. */
export async function controlArena({ held = "empty", hand = "right", model = "workshop-fighter", seconds = 120,
  engine: engineName, recoverySeconds = 60 } = {}) {
  const rendering = new NullEngine(), scene = new Scene(rendering), engine = await freshEngine(engineName), world = createWorld(scene, engine);
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: model, right: "workshop-rogue", gap: 8, capSeconds: seconds, recoverySeconds,
    held: { left: held, right: "empty" }, minds: { left: withParts(COMBAT, { tactics: { hands: hand } }), right: RECIPE_FIGHTER } });
  duel.order("left", STAND_ORDERS); duel.order("right", STAND_ORDERS);
  return { world, duel, fighter: duel.duelists.left,
    harness: { kind: "Node arena Duel", engine: engine.name, revision: engine.revision, hz: world.hz,
      actuation: world.actuation, balance: { left: 0, right: 0 }, held, hand, model },
    dispose() { duel.dispose(); world.dispose(); scene.dispose(); rendering.dispose(); } };
}

/** Physical shove in one of four fixed world directions; no pose is installed. */
export function shoveControlFighter(stand, direction) {
  const axes = [[0, 0, 1], [1, 0, 0], [0, 0, -1], [-1, 0, 0]], axis = axes[direction];
  if (!axis) throw new Error("unknown development shove direction");
  const { built } = stand.fighter, trunk = built.segments.get("middleTrunk");
  const mass = [...built.segments.values()].reduce((sum, part) => sum + part.rigid.mass, 0);
  trunk.body.applyImpulse(new Vector3(...axis).scale(mass * 1.5), centreOfToRef(trunk, new Vector3()));
}

/**
 * A commanded two-second walk followed by two seconds of standing: a rise can end in a stance
 * whose first weight shift, before the walk's first stride, takes over a second.
 */
export function walkAfterRecovery(stand) {
  const { world, duel, fighter } = stand;
  world.step(2);
  const heading = fighter.minded.skills.report.heading, from = fighter.body.view.stance.centre.clone();
  const strides = fighter.body.view.stance.strides;
  duel.order("left", { move: { x: Math.sin(heading), z: Math.cos(heading) }, face: null, attack: null });
  let fell = false;
  for (let step = 0; step < 480 && !duel.verdict; step++) {
    if (step === 240) duel.order("left", STAND_ORDERS);
    world.step(); fell ||= fighter.body.down;
  }
  const now = fighter.body.view.stance.centre;
  return { fell, strides: fighter.body.view.stance.strides - strides, travel: Math.hypot(now.x - from.x, now.z - from.z) };
}

/** Repeat placed attacks against a real collider, or against the same point in empty space. */
export function attackCycles(stand, { mode = "hit", seconds = 20, cancel = false } = {}) {
  const { world, duel, fighter, harness } = stand, report = fighter.minded.skills.report.strike;
  const heading = fighter.minded.skills.report.heading, forward = [Math.sin(heading), Math.cos(heading)];
  const head = fighter.body.view.head, reach = harness.held === "club" ? 1 : .65;
  const target = [head.x + reach * forward[0], head.y, head.z + reach * forward[1]];
  const obstacle = mode === "hit" ? world.physics.addFixedBox([target[0] + .04 * forward[0], target[1], target[2] + .04 * forward[1]], [.2, .2, .08], heading) : null;
  const initial = structuredClone(report.pointCycle), thrown = { ...report.thrown }, start = world.time;
  let fell = false, contactSteps = 0, swingContactSteps = 0, cancelled = false, previousPhase = null, contactedThisSwing = false;
  const transitions = [], contactHands = new Set(), impacts = [], touchingBefore = { left: false, right: false };
  const point = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  const aims = Object.fromEntries(["left", "right"].map((hand) => [hand,
    rigidPoints(fighter.built.spec, fighter.built.segments.get(`hand.${hand}`).spec).get(aimOf(fighter.built.spec, hand)).value]));
  duel.order("left", { move: null, face: null, attack: target });
  while (world.time - start < seconds && !duel.verdict) {
    const closing = {};
    for (const hand of ["left", "right"]) {
      const segment = fighter.built.segments.get(`hand.${hand}`);
      pointOfToRef(segment, aims[hand], point); motionAtToRef(segment, point, velocity, spin);
      const distance = Math.hypot(target[0] - point.x, target[1] - point.y, target[2] - point.z);
      closing[hand] = distance > 0 ? ((target[0] - point.x) * velocity.x + (target[1] - point.y) * velocity.y + (target[2] - point.z) * velocity.z) / distance : 0;
    }
    world.step(); fell ||= fighter.body.down;
    if (report.phase !== previousPhase) {
      if (report.phase === "swing") contactedThisSwing = false;
      transitions.push({ phase: report.phase, hand: report.hand, time: world.time - start }); previousPhase = report.phase;
    }
    if (cancel && !cancelled && report.phase === "swing" && report.since >= .1) { duel.order("left", STAND_ORDERS); cancelled = true; }
    for (const hand of ["left", "right"]) {
      const touching = obstacle && world.physics.contactsOf(fighter.built.segments.get(`hand.${hand}`).body).some((c) => c.fixed === obstacle.id && c.impulse > 0);
      if (touching) {
        contactSteps++;
        if (report.phase === "swing" && report.hand === hand && !fighter.body.down) {
          swingContactSteps++; contactHands.add(hand);
          if (!contactedThisSwing && !touchingBefore[hand] && closing[hand] > 0) impacts.push({ hand, time: world.time - start, closing: closing[hand] });
          contactedThisSwing = true;
        }
      }
      touchingBefore[hand] = Boolean(touching);
    }
  }
  duel.order("left", STAND_ORDERS);
  return { mode, fell, contactSteps, swingContactSteps, impacts, contactHands: [...contactHands], transitions, cancelled,
    thrown: Object.fromEntries(["left", "right"].map((h) => [h, report.thrown[h] - thrown[h]])),
    returned: Object.fromEntries(["left", "right"].map((h) => [h, report.pointCycle.returned[h] - initial.returned[h]])),
    failed: report.pointCycle.failed - initial.failed, interrupted: report.pointCycle.interrupted - initial.interrupted };
}

/** Recovery is accepted only after a real fall, quiet handover and a subsequent commanded walk. */
export async function recoveryCycle(config) {
  const stand = await controlArena(config), { world, duel, fighter } = stand;
  try {
    world.step(120);
    const trials = [];
    for (let trial = 0; trial < (config.repeat ?? 1) && !duel.verdict; trial++) {
      const recovery = fighter.body.state.mind.subs[0], before = recovery.completed;
      shoveControlFighter(stand, config.direction);
      const shoved = world.time;
      while (!fighter.body.down && world.time - shoved < 3 && !duel.verdict) world.step();
      const fell = fighter.body.down, fallenAt = world.time;
      let acquired = false;
      const stages = new Set();
      while (fell && recovery.completed === before && world.time - fallenAt < 60 && !duel.verdict) {
        world.step(); stages.add(recovery.rise.furthest);
        const contact = new Set([...fighter.built.segments].filter(([, s]) => world.physics.contactsOf(s.body).some((c) => c.fixed !== null && c.impulse > 0)).map(([name]) => name));
        acquired ||= ["hand.left", "hand.right", "shank.left", "shank.right"].every((s) => contact.has(s))
          && !["head", "upperTrunk", "middleTrunk", "lowerTrunk"].some((s) => contact.has(s));
      }
      const completed = recovery.completed > before, seconds = completed ? world.time - fallenAt : null;
      const walk = completed ? walkAfterRecovery(stand) : null;
      trials.push({ fell, acquired, completed, seconds, walk, stages: [...stages], retries: recovery.retries,
        success: fell && completed && walk !== null && !walk.fell && walk.strides > 0 && walk.travel > .15 });
      if (!trials.at(-1).success) break;
    }
    const attack = config.attack && trials.every((t) => t.success) ? attackCycles(stand, { seconds: 15 }) : null;
    return { harness: stand.harness, config, trials, attack, verdict: duel.verdict,
      success: trials.length === (config.repeat ?? 1) && trials.every((t) => t.success)
        && (!config.attack || (attack && !attack.fell && attack.impacts.length > 0 && attack.returned.right >= 2)),
      assist: { force: fighter.body.assist.meter.force, moment: fighter.body.assist.meter.moment } };
  } finally { stand.dispose(); }
}

export async function strikeCycle(config) {
  const stand = await controlArena({ ...config, seconds: 30 });
  try { stand.world.step(180); return { harness: stand.harness, config, ...attackCycles(stand, config) }; }
  finally { stand.dispose(); }
}
