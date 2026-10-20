import { driveFighter } from "../src/core/mind/fighter.ts";
import { actionProducer } from "../src/core/mind/action-producer.ts";
import { approachActionWindow } from "../src/core/mind/action-window.ts";
import { standIntent } from "../src/core/mind/intent.ts";
import { actionCycles } from "./action-cycles.mjs";
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
import { COMBAT } from "../tests/fixtures/minds.mjs";

/** Actual arena lifecycle, isolated by standing the other contestant out of reach. */
export async function controlArena({ held = "empty", hand = "right", model = "workshop-fighter", seconds = 120,
  engine: engineName, recoverySeconds = 60 } = {}) {
  const rendering = new NullEngine(), scene = new Scene(rendering), engine = await freshEngine(engineName), world = createWorld(scene, engine);
  addArenaSolids(world.physics);
  const duel = new Duel(world, { left: model, right: "workshop-rogue", gap: 8, capSeconds: seconds, recoverySeconds,
    loadouts: { left: { left: "empty", right: held }, right: { left: "empty", right: "empty" } }, minds: { left: { ...COMBAT, actions: COMBAT.actions.map(action => ({ ...action, effectors: hand === "alternate" ? action.effectors : ["hand." + hand] })), subs: [{ kind: "support-recovery" }] }, right: RECIPE_FIGHTER } });
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
  duel.order("left", { move: { x: Math.sin(heading), z: Math.cos(heading) }, face: null });
  // A step is landed when the stance's swing, or a run's flight, gives way to bearing: whichever walk takes it.
  const swinging = () => ["swing", "flight"].includes(fighter.body.view.stance.phase);
  let fell = false, steps = 0, was = swinging();
  for (let step = 0; step < 480 && !duel.verdict; step++) {
    if (step === 240) duel.order("left", STAND_ORDERS);
    world.step(); fell ||= fighter.body.down;
    const is = swinging();
    if (was && !is) steps += 1;
    was = is;
  }
  const now = fighter.body.view.stance.centre;
  return { fell, steps, travel: Math.hypot(now.x - from.x, now.z - from.z) };
}

/**
 * The fighter's own skills, driven by a script in place of its tactics, striking the world point
 * `target` with its first action again and again, with `hand` or each in turn ("alternate"), until
 * `state.own.cancelled`. Its `state` is what of it a step changes, beside the bout's.
 */
function pointAttacks(stand, target, hand = stand.harness.hand) {
  const { world, fighter } = stand;
  const producer = actionProducer(), action = fighter.mind.actions[0], own = { cancelled: false };
  const script = { name: "point-cycles", state: producer.state, decide(sight) {
    const around = { heading: sight.report.heading, placed: sight.view.stance.phase === "stand", support: sight.report.support ?? null, walk: null, lower: .03 };
    const retained = sight.report.actions.find(item => item.id === producer.state.current?.id);
    const effector = retained?.effector ?? (hand === "alternate" ? action.effectors[cycles.state.sequence % action.effectors.length] : "hand." + hand);
    const ask = producer.request(sight, own.cancelled ? null : { action: action.name, effector, target: { kind: "point", at: target } }, around);
    const position = ask.readiness?.kind === "position" ? approachActionWindow(sight.view, ask.readiness.window, sight.report.heading, sight.envelope?.walk.value ?? 0, .4) : {};
    return { ...standIntent(sight.report.heading), ...position, actions: ask.requests };
  } };
  const skills = driveFighter(fighter.body.driver, world, { ...fighter.mind, tactics: { kind: "script" } }, { name: "point-cycles", orders: () => null, script });
  const cycles = actionCycles(skills);
  return { skills, cycles, state: { own, skills: skills.state, cycles: cycles.state } };
}

/** Repeat placed attacks against a real collider, or against the same point in empty space. */
export function attackCycles(stand, { mode = "hit", seconds = 20, cancel = false } = {}) {
  const { world, duel, fighter, harness } = stand;
  const heading = fighter.minded.skills.report.heading, forward = [Math.sin(heading), Math.cos(heading)];
  const head = fighter.body.view.head, reach = harness.held === "club" ? 1 : .65;
  const target = [head.x + reach * forward[0], head.y, head.z + reach * forward[1]];
  const obstacle = mode === "hit" ? world.physics.addFixedBox([target[0] + .04 * forward[0], target[1], target[2] + .04 * forward[1]], [.2, .2, .08], heading) : null;
  const attacks = pointAttacks(stand, target), { skills, cycles } = attacks;
  const report = skills.report, active = () => report.actions[0], start = world.time;
  let fell = false, contactSteps = 0, swingContactSteps = 0, previousPhase = null, contactedThisSwing = false;
  const transitions = [], contactHands = new Set(), impacts = [], touchingBefore = { left: false, right: false };
  const point = new Vector3(), velocity = new Vector3(), spin = new Vector3();
  const aims = Object.fromEntries(["left", "right"].map((hand) => [hand,
    rigidPoints(fighter.built.spec, fighter.built.segments.get(`hand.${hand}`).spec).get(aimOf(fighter.built.spec, hand)).value]));
  while (world.time - start < seconds && !duel.verdict) {
    const closing = {};
    for (const hand of ["left", "right"]) {
      const segment = fighter.built.segments.get(`hand.${hand}`);
      pointOfToRef(segment, aims[hand], point); motionAtToRef(segment, point, velocity, spin);
      const distance = Math.hypot(target[0] - point.x, target[1] - point.y, target[2] - point.z);
      closing[hand] = distance > 0 ? ((target[0] - point.x) * velocity.x + (target[1] - point.y) * velocity.y + (target[2] - point.z) * velocity.z) / distance : 0;
    }
    world.step(); cycles.sample(); fell ||= fighter.body.down;
    if ((active()?.stage ?? null) !== previousPhase) {
      if (active()?.stage === "swing") contactedThisSwing = false;
      transitions.push({ phase: active()?.stage ?? null, hand: active()?.effector.slice(5), time: world.time - start }); previousPhase = active()?.stage ?? null;
    }
    if (cancel && !attacks.state.own.cancelled && active()?.stage === "swing" && world.time - (active()?.began ?? world.time) >= .1) { duel.order("left", STAND_ORDERS); attacks.state.own.cancelled = true; }
    for (const hand of ["left", "right"]) {
      const touching = obstacle && world.physics.contactsOf(fighter.built.segments.get(`hand.${hand}`).body).some((c) => c.fixed === obstacle.id && c.impulse > 0);
      if (touching) {
        contactSteps++;
        if (active()?.stage === "swing" && active()?.effector.slice(5) === hand && !fighter.body.down) {
          swingContactSteps++; contactHands.add(hand);
          if (!contactedThisSwing && !touchingBefore[hand] && closing[hand] > 0) impacts.push({ hand, time: world.time - start, closing: closing[hand] });
          contactedThisSwing = true;
        }
      }
      touchingBefore[hand] = Boolean(touching);
    }
  }
  duel.order("left", STAND_ORDERS);
  return { mode, fell, contactSteps, swingContactSteps, impacts, contactHands: [...contactHands], transitions, cancelled: attacks.state.own.cancelled,
    thrown: cycles.reading().thrown, returned: cycles.reading().returned, failed: cycles.reading().failed, interrupted: cycles.reading().aborted };
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
        success: fell && completed && walk !== null && !walk.fell && walk.steps > 0 && walk.travel > .15 });
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
