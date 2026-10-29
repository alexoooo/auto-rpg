/**
 * **The body layer's probes**: each legs-goal field and claim term asked of a body standing (or
 * walking, where the term is a walk's), and read in its own units against its limit. A probe
 * passes where the body does what was asked, or where its controllers report it undone: the legs'
 * report (`Locomotion.unmet`, `LegsUnmet`), the motor's (`MotorControl.unmet`). An implementation
 * of a role (legs, balance, motor) is probed by naming it in the rig's configs; one that passes
 * every probe honours the vocabulary, whatever it does inside.
 *
 * Harness: Node, the core's world on the stand's engine (`coreStand`), 120 Hz; the Warrior built
 * standing in the guard, which its posture holds.
 */
import { coreStand } from "./core-stand.mjs";
import { createBody, SERVO_SECONDS } from "../../src/core/body.ts";
import { partLookup } from "../../src/core/mind/catalog.ts";
import { GAME_MOTOR, legsOf, motorOf } from "../../src/core/mind/kit.ts";
import { modelSpec } from "../../src/core/models.ts";
import { GAIT_NAMES } from "../../src/core/skills/gaits.ts";
import { guardPosture } from "../../src/core/skills/guard.ts";
import { STANCE_LOWER } from "../../src/core/skills/locomotion.ts";
import { ALL_MET } from "../../src/core/skills/skill.ts";
import { wrap } from "../../src/core/math/turn.ts";

/** The parts a rig names, by kind: the registry's, and `more` (a test's own: stubs, controls). */
export const lookupWith = (more) => Object.freeze({ of: (role, config) => more[config.kind] ?? partLookup.of(role, config) });

/**
 * A rig: the Warrior standing in the guard on a stand of its own, its motor `motor` (the game's
 * unless named), its legs `legs`, the parts found by `lookup`. `run(seconds, ask)` steps it, each
 * control step asking `ask(view)`'s claim: the legs goal (`legs`, a walk of none facing the legs'
 * heading unless set), the posture over the guard, and the other claim terms as they are.
 * `wrapLegs(legs)` stands in for the legs a test controls; `filter(command)` for the command a
 * motor is given.
 */
export async function rig({ legs: legsConfig = { kind: "stance-walk" }, motor = GAME_MOTOR, lookup = partLookup, wrapLegs = (legs) => legs,
  filter = (command) => command } = {}) {
  const spec = modelSpec("workshop-fighter"), guard = guardPosture(spec), stand = await coreStand(spec, { posture: guard });
  const hosted = createBody(stand.built, stand.world, { servoSeconds: SERVO_SECONDS, motor: motorOf(lookup, motor) });
  const legs = wrapLegs(legsOf(lookup, hosted.driver, legsConfig));
  let ask = () => ({});
  hosted.drive((view, dt) => {
    const claim = ask(view), drive = legs.goal(view, { walk: null, face: legs.heading, ...claim.legs }, dt);
    const stance = drive.kind === "stance";
    return filter({ posture: { ...guard, ...(stance ? {} : drive.posture), ...claim.posture }, pushes: [...(stance ? [] : drive.pushes), ...claim.pushes ?? []],
      stance: stance ? drive.goal : null, ...(claim.effectors ? { effectors: claim.effectors } : {}), ...(claim.points ? { points: claim.points } : {}),
      ...(claim.handPoses ? { handPoses: claim.handPoses } : {}) });
  });
  // The first step builds the stance's reference; what the probes read from is the body standing after it.
  stand.step(1);
  const view = hosted.view, s = view.stance;
  const start = { heading: s.facing, standing: view.standing, soles: { left: [s.soles.left.x, s.soles.left.z], right: [s.soles.right.x, s.soles.right.z] },
    support: [s.support.x, s.support.z], guard };
  return {
    view, legs, start, channels: hosted.muscles.channels.map((channel) => channel.name),
    run(seconds, asked) { ask = asked; stand.step(stand.seconds(seconds)); },
    dispose() { hosted.dispose(); stand.dispose(); },
  };
}

/** Where `heading` faces across the ground, `metres` along it from `at` (x, z). */
const ahead = (at, heading, metres) => [at[0] + metres * Math.sin(heading), at[1] + metres * Math.cos(heading)];
const apart = (a, b) => Math.sqrt((a[0] - b[0]) * (a[0] - b[0]) + (a[1] - b[1]) * (a[1] - b[1]));
const along = (view, heading) => view.stance.velocity.x * Math.sin(heading) + view.stance.velocity.z * Math.cos(heading);
const unmetOf = (rig) => rig.legs.unmet ?? ALL_MET;
const listed = (rig, field) => unmetOf(rig).fields.includes(field);
/** How far the root is tipped from upright, rad. */
const tilt = (view) => { const q = view.root.rotation; return Math.acos(Math.max(-1, Math.min(1, 1 - 2 * (q.x * q.x + q.z * q.z)))); };
const round = (x) => Math.round(x * 1000) / 1000;

/**
 * A probe's reading: whether the body did what was asked (`met`), whether a controller reported it
 * undone (`reported`), and what was read against what limit (`detail`).
 */
const reading = (met, reported, detail) => ({ met, reported, passed: met || reported, detail });

/**
 * **The legs goal's probes**, by name, each the field it asks (`field`) and how it is read (`run`), on
 * a rig of its own. A field with no probe says why:
 * `destination` is what a walk's stopping and a gait's choice read, not a thing the legs do, and
 * `carriage` is probed once a carriage other than the square one names a width to stand at.
 */
export const LEGS_PROBES = Object.freeze({
  walk: { field: "walk", run: async (rig) => {
    const h = rig.start.heading;
    rig.run(1.5, () => ({ legs: { walk: [0.5, 0], face: h } }));
    const speed = along(rig.view, h);
    return reading(speed >= 0.25 && !rig.view.down, listed(rig, "walk"), `walked ${round(speed)} m/s forward, asked 0.5, limit 0.25`);
  } },
  face: { field: "face", run: async (rig) => {
    const face = rig.start.heading + 0.6;
    rig.run(1.5, () => ({ legs: { walk: [0.4, 0], face } }));
    const off = Math.abs(wrap(rig.view.stance.facing - face));
    return reading(off <= 0.15 && !rig.view.down, listed(rig, "face"), `faced ${round(off)} rad off the face asked, limit 0.15`);
  } },
  footing: { field: "footing", run: async (rig) => {
    const h = rig.start.heading, footing = { "foot.left": ahead(rig.start.soles.left, h, 0.1), "foot.right": ahead(rig.start.soles.right, h, 0.1) };
    rig.run(2, () => ({ legs: { footing } }));
    const s = rig.view.stance, off = Math.max(apart([s.soles.left.x, s.soles.left.z], footing["foot.left"]), apart([s.soles.right.x, s.soles.right.z], footing["foot.right"]));
    return reading(off <= 0.04 && !rig.view.down, listed(rig, "footing"), `the farther sole ${round(off)} m from its footing, limit 0.04`);
  } },
  gait: { field: "gait", run: async (rig) => {
    const missed = [];
    for (const gait of GAIT_NAMES) {
      rig.run(0.5, () => ({ legs: { gait } }));
      if (rig.legs.gait !== gait && !listed(rig, "gait")) missed.push(`${gait}: walks by ${rig.legs.gait ?? "no gait by name"}, unreported`);
    }
    return reading(missed.length === 0, false, missed.join("; ") || `each of ${GAIT_NAMES.join(", ")} walked by or reported`);
  } },
  feet: { field: "feet", run: async (rig) => {
    // The weight over the left sole first, both feet down; then on it alone, the right leg the posture's, which lifts it.
    const left = rig.start.soles.left, lifted = { "hip.right flexion": 0.5, "knee.right flexion": 0.9 };
    rig.run(1, () => ({ legs: { centre: left } }));
    rig.run(1, () => ({ legs: { feet: ["foot.left"], centre: left }, posture: lifted }));
    const s = rig.view.stance, up = s.soles.right.y - s.soles.left.y;
    return reading(up >= 0.025 && !rig.view.down, listed(rig, "feet"), `the free sole ${round(up)} m over the bearing one, limit 0.025`);
  } },
  height: { field: "height", run: async (rig) => {
    const height = rig.start.standing - STANCE_LOWER - 0.04;
    rig.run(1, () => ({ legs: { height } }));
    const s = rig.view.stance, off = Math.abs(s.centre.y - s.support.y - height);
    return reading(off <= 0.015 && !rig.view.down, listed(rig, "height") || unmetOf(rig).height >= off - 0.015,
      `held ${round(off)} m from the height asked, limit 0.015; reported ${round(unmetOf(rig).height)} m`);
  } },
  heading: { field: "heading", run: async (rig) => {
    const heading = rig.start.heading + 0.3;
    rig.run(1, () => ({ legs: { heading } }));
    const off = Math.abs(wrap(rig.view.stance.facing - heading));
    return reading(off <= 0.05 && !rig.view.down, listed(rig, "heading"), `faced ${round(off)} rad off the heading asked, limit 0.05`);
  } },
  "heading at a run": { field: "heading", run: async (rig) => {
    // Asked the fastest walk first, where legs that run are running.
    const h = rig.start.heading, heading = h + 0.3;
    rig.run(2.25, () => ({ legs: { walk: [4, 0], face: h } }));
    rig.run(0.5, () => ({ legs: { walk: [4, 0], face: h, heading } }));
    const off = Math.abs(wrap(rig.view.stance.facing - heading));
    return reading(off <= 0.05 && !rig.view.down, listed(rig, "heading"), `faced ${round(off)} rad off the heading asked at ${round(Math.hypot(rig.view.stance.velocity.x, rig.view.stance.velocity.z))} m/s, limit 0.05`);
  } },
  centre: { field: "centre", run: async (rig) => {
    const { left } = rig.start.soles, mid = rig.start.support, centre = [mid[0] + 0.6 * (left[0] - mid[0]), mid[1] + 0.6 * (left[1] - mid[1])];
    rig.run(1.5, () => ({ legs: { centre } }));
    const c = rig.view.stance.centre, off = apart([c.x, c.z], centre);
    return reading(off <= 0.03 && !rig.view.down, listed(rig, "centre") || unmetOf(rig).centre >= off - 0.03,
      `held ${round(off)} m from the centre asked, limit 0.03; reported ${round(unmetOf(rig).centre)} m`);
  } },
  "centre beyond the soles": { field: "centre", run: async (rig) => {
    const { left } = rig.start.soles, mid = rig.start.support, out = 0.3 / apart(left, mid), centre = [left[0] + out * (left[0] - mid[0]), left[1] + out * (left[1] - mid[1])];
    rig.run(1.5, () => ({ legs: { centre } }));
    const c = rig.view.stance.centre, off = apart([c.x, c.z], centre);
    return reading(off <= 0.03 && !rig.view.down, listed(rig, "centre") || unmetOf(rig).centre >= off - 0.03,
      `held ${round(off)} m from a centre 0.3 m past the left sole, limit 0.03; reported ${round(unmetOf(rig).centre)} m`);
  } },
  pose: { field: "pose", run: async (rig) => {
    const before = tilt(rig.view);
    rig.run(1, () => ({ legs: { pose: { pitch: 0.3, seconds: 0.3 } } }));
    const pitched = tilt(rig.view) - before;
    return reading(Math.abs(pitched - 0.3) <= 0.08 && !rig.view.down, listed(rig, "pose"), `pitched ${round(pitched)} rad, asked 0.3, limit 0.08`);
  } },
  swing: { field: "swing", run: async (rig) => {
    const to = ahead(rig.start.soles.right, rig.start.heading, 0.15);
    rig.run(1.5, () => ({ legs: { feet: ["foot.left"], swing: { foot: "foot.right", to, seconds: 0.4, lift: 0.05, shift: true } } }));
    const r = rig.view.stance.soles.right, off = apart([r.x, r.z], to);
    return reading(off <= 0.03 && !rig.view.down, listed(rig, "swing"), `the right sole ${round(off)} m from its landing, limit 0.03`);
  } },
  halt: { field: "halt", run: async (rig) => {
    const h = rig.start.heading;
    rig.run(1.2, () => ({ legs: { walk: [0.6, 0], face: h } }));
    rig.run(0.6, () => ({ legs: { walk: [0.6, 0], face: h, halt: true } }));
    const speed = Math.hypot(rig.view.stance.velocity.x, rig.view.stance.velocity.z);
    return reading(speed <= 0.15 && !rig.view.down, listed(rig, "halt"), `${round(speed)} m/s 0.6 s into the halt, limit 0.15`);
  } },
});

/** **The claim's other terms' probes**, by term (`term`): what a motor carries out, or reports undone (`MotorUnmet`, `BodyView.unmet`). */
export const CLAIM_PROBES = Object.freeze({
  posture: { term: "posture", run: async (rig) => {
    const angle = rig.start.guard["elbow.right flexion"] + 0.4;
    rig.run(0.6, () => ({ posture: { "elbow.right flexion": angle } }));
    const off = Math.abs(rig.view.angles["elbow.right flexion"] - angle);
    return reading(off <= 0.1, false, `the elbow ${round(off)} rad from its posture, limit 0.1`);
  } },
  pushes: { term: "pushes", run: async (rig) => {
    // An arm's push moves it; a push on a leg the stance drives is reported.
    const from = rig.view.angles["elbow.right flexion"];
    rig.run(0.15, () => ({ pushes: [{ channel: "elbow.right flexion", sense: 1, level: 1 }] }));
    const bent = rig.view.angles["elbow.right flexion"] - from;
    rig.run(1 / 120, () => ({ pushes: [{ channel: "knee.left flexion", sense: 1, level: 1 }] }));
    const reported = rig.view.unmet.pushes[rig.channels.indexOf("knee.left flexion")] === 1;
    return reading(bent >= 0.2 && reported, false, `the elbow pushed ${round(bent)} rad in 0.15 s, limit 0.2; a stance leg's push ${reported ? "" : "not "}reported`);
  } },
  effectors: { term: "effectors", run: async (rig) => {
    const knuckles = rig.view.effectors["hand.right"].points.knuckles, goal = [knuckles.x, knuckles.y + 0.05, knuckles.z + 0.2];
    rig.run(0.8, () => ({ effectors: { "hand.right": { places: [{ point: "knuckles", position: goal }], seconds: 0.4 } } }));
    const at = rig.view.effectors["hand.right"].points.knuckles, off = Math.hypot(at.x - goal[0], at.y - goal[1], at.z - goal[2]);
    return reading(off <= 0.03, false, `the knuckles ${round(off)} m from their place, limit 0.03`);
  } },
  points: { term: "points", run: async (rig) => {
    const h = rig.start.heading, accel = [30 * Math.sin(h), 0, 30 * Math.cos(h)];
    rig.run(0.1, () => ({ points: [{ segment: "hand.right", point: "knuckles", accel }] }));
    const v = rig.view.fists.right.velocity, speed = v.x * Math.sin(h) + v.z * Math.cos(h);
    return reading(speed >= 1, rig.view.unmet.points > 0, `the fist ${round(speed)} m/s forward after 0.1 s at 30 m/s^2, limit 1`);
  } },
  handPoses: { term: "handPoses", run: async (rig) => {
    const now = rig.view.handPoses["hand.right"].applied, asked = now === "open" ? "fist" : "open";
    rig.run(0.3, () => ({ handPoses: { "hand.right": asked } }));
    const applied = rig.view.handPoses["hand.right"].applied;
    return reading(applied === asked, false, `the hand ${applied}, asked ${asked}`);
  } },
});
