/**
 * **Trials of the stance** (`src/core/control/stance.ts`) on the Node core stand, Rapier, 120 Hz: a
 * human stood, stepped, shoved and walked by hand, each read as a record
 * (`tests/core-stance.test.mjs`, `tests/core-stance-capability.test.mjs`).
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../../src/core/body.ts";
import { humanSpec } from "../../src/core/human/spec.ts";
import { modelSpec } from "../../src/core/models.ts";
import { coreStand } from "../harness/core-stand.mjs";

/** Both arms raised in a guard. */
export const GUARD = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

/**
 * Stand `model` for `seconds`: the first view fixes the goal, `ask(first)` of the first reading
 * (the centre of mass, the soles' middle, its height over them). Returns the readings at the end and
 * 2 s before it; the feet's slide across the ground and sink into it since the goal was set, and
 * their travel over the last 2 s; and the pelvis's heading.
 */
export async function standing(model, seconds, ask, { posture = {}, stance } = {}) {
  const stand = await coreStand(modelSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  const feet = ["left", "right"].map((side) => stand.built.segments.get(`foot.${side}`));
  const pelvis = stand.built.joints.get("hip.left").parent;
  let goal = null, from = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) {
      goal = ask({ centre: s.centre.clone(), support: s.support.clone(), height: s.centre.y - s.support.y });
      from = feet.map((foot) => foot.node.position.clone());
    }
    return { posture, pushes: [], stance: goal };
  });
  const read = () => {
    const s = body.view.stance;
    return { centre: s.centre.clone(), support: s.support.clone(), height: s.centre.y - s.support.y, held: s.centre.y - s.support.y - s.plan.y, speed: s.velocity.length() };
  };
  try {
    stand.step(stand.seconds(seconds - 2));
    const before = read(), late = feet.map((foot) => foot.node.position.clone());
    stand.step(stand.seconds(2));
    const after = read();
    const slide = Math.max(...feet.map((foot, k) => across(foot.node.position, from[k])));
    const sink = Math.max(...feet.map((foot, k) => from[k].y - foot.node.position.y));
    const still = Math.max(...feet.map((foot, k) => Vector3.Distance(foot.node.position, late[k])));
    // The pelvis's turn about the vertical since its reference pose.
    const turn = pelvis.node.rotationQuaternion.multiply(Quaternion.Inverse(pelvis.rest));
    const forward = new Vector3(0, 0, 1).applyRotationQuaternion(turn);
    const heading = Math.atan2(forward.x, forward.z);
    const inertia = feet.map((foot) => foot.body.massProperties.moments[0] / modelSpec(model).segments.find((s) => s.name === foot.spec.name).inertia.value[0]);
    return { goal, before, after, slide, sink, still, heading, inertia, angles: { ...body.view.angles }, place: body.view.stance.place.clone() };
  } finally { body.dispose(); stand.dispose(); }
}

export const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * Stand `model` 1 s, 3 cm under its reference height, then step `foot`'s sole's middle by (dx, dz)
 * over 0.45 s lifted 5 cm, the heading turned to `heading` as it steps, and stand to 6 s. Returns the
 * phases seen, where the sole landed against where it was asked to, how far the foot turned between
 * leaving the ground and landing and how far off the heading it landed, the centre of mass's distance
 * from its place and its height and speed at the end, and how far the other foot moved.
 */
export async function stepping(model, foot, dx, dz, stance, heading = 0) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  const other = foot === "left" ? "right" : "left";
  const turnOf = () => stand.built.segments.get(`foot.${foot}`).node.rotationQuaternion.clone();
  let goal = null, swing = null, to = null, bearing = null, lifted = null, turned = null, faced = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    if (goal && !swing && view.time >= 1) {
      to = [s.soles[foot].x + dx, s.soles[foot].z + dz];
      bearing = s.soles[other].clone();
      swing = { foot, to, seconds: 0.45, lift: 0.05 };
      goal = { ...goal, heading };
    }
    return { posture: {}, pushes: [], stance: goal && { ...goal, swing } };
  });
  try {
    const phases = [];
    let landed = null, drift = 0;
    for (let i = 0; i < stand.seconds(6); i++) {
      stand.step(1);
      const s = body.view.stance;
      if (phases.at(-1) !== s.phase) phases.push(s.phase);
      if (s.phase === "swing" && !lifted) lifted = turnOf();
      if (phases.at(-1) === "stand" && phases.at(-2) === "swing" && !landed) {
        landed = s.soles[foot].clone();
        turned = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(turnOf(), lifted))));
        const level = Quaternion.RotationAxis(Vector3.Up(), heading).multiply(stand.built.segments.get(`foot.${foot}`).rest);
        faced = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(turnOf(), level))));
      }
      if (bearing) drift = Math.max(drift, across(s.soles[other], bearing));
    }
    const s = body.view.stance;
    return { phases, miss: landed ? Math.hypot(landed.x - to[0], landed.z - to[1]) : Infinity, turned, faced, off: across(s.centre, s.place),
      low: goal.height - (s.centre.y - s.support.y), speed: s.velocity.length(), drift };
  } finally { body.dispose(); stand.dispose(); }
}

/**
 * Stand `model` 1.5 s, 3 cm under its reference height, then shove the middle trunk at its centre
 * of mass by `impulse` N s level, `degrees` about the vertical from forward (+z; 90 is +x), and
 * watch 4.5 s. Returns the steps the stance took to catch it, whether it fell (its centre sank
 * 25 cm under the goal's height), and its speed and height under the goal at the end.
 */
export async function shoved(model, impulse, degrees, stance) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  let goal = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    return { posture: {}, pushes: [], stance: goal };
  });
  try {
    stand.step(stand.seconds(1.5));
    const trunk = stand.built.segments.get("middleTrunk"), turn = trunk.node.rotationQuaternion.multiply(Quaternion.Inverse(trunk.rest));
    const com = trunk.spec.centreOfMass.value, o = trunk.frame.origin, way = degrees * Math.PI / 180;
    const at = new Vector3(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternion(turn).add(trunk.node.position);
    trunk.body.applyImpulse(new Vector3(impulse * Math.sin(way), 0, impulse * Math.cos(way)), at);
    let low = -Infinity;
    for (let i = 0; i < stand.seconds(4.5); i++) {
      stand.step(1);
      const s = body.view.stance;
      low = Math.max(low, goal.height - (s.centre.y - s.support.y));
    }
    const s = body.view.stance;
    return { steps: s.recoveries, fell: low > 0.25, low: goal.height - (s.centre.y - s.support.y), held: s.centre.y - s.support.y - s.plan.y, speed: s.velocity.length() };
  } finally { body.dispose(); stand.dispose(); }
}

/**
 * Stand the Warrior 1 s, 3 cm under its reference height, ask its left foot 15 cm forward, and
 * 0.1 s into the weight shift shove its middle trunk at its centre of mass by `impulse` N s straight
 * back; watch 3 s. Returns the phases seen from the shove, the steps it took to catch itself, and
 * whether it is down.
 */
export async function shovedShifting(impulse, stance) {
  const stand = await coreStand(humanSpec("workshop-fighter"), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance });
  let goal = null, swing = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    if (goal && !swing && view.time >= 1) swing = { foot: "left", to: [s.soles.left.x, s.soles.left.z + 0.15], seconds: 0.45, lift: 0.05 };
    return { posture: {}, pushes: [], stance: goal && { ...goal, swing } };
  });
  try {
    stand.step(stand.seconds(1.1));
    const phases = [body.view.stance.phase];
    const trunk = stand.built.segments.get("middleTrunk"), turn = trunk.node.rotationQuaternion.multiply(Quaternion.Inverse(trunk.rest));
    const com = trunk.spec.centreOfMass.value, o = trunk.frame.origin;
    trunk.body.applyImpulse(new Vector3(0, 0, -impulse), new Vector3(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternion(turn).add(trunk.node.position));
    for (let i = 0; i < stand.seconds(3); i++) {
      stand.step(1);
      if (phases.at(-1) !== body.view.stance.phase) phases.push(body.view.stance.phase);
    }
    return { phases, steps: body.view.stance.recoveries, down: body.view.down };
  } finally { body.dispose(); stand.dispose(); }
}

/**
 * Stand `model` 1 s, 3 cm under its reference height, walk at `speed` m/s `degrees` about the
 * vertical from forward (+z; 90 is +x) for 8 s, then walk nowhere for 4 s. Returns the strides,
 * whether it fell (its centre sank 25 cm under the goal's height), the mean velocity along the walk
 * and across it over the walk's last 3 s, the steps taken over the stop's last 2 s, and the speed,
 * phase and the centre's distance from the place the stance holds at the end.
 */
export async function walking(model, degrees, speed) {
  const stand = await coreStand(humanSpec(model), { ground: true, hz: 120 });
  const body = createBody(stand.built, stand.world, { servoSeconds: 0.1 });
  const way = degrees * Math.PI / 180, ux = Math.sin(way), uz = Math.cos(way);
  let goal = null, walk = null;
  body.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: s.centre.y - s.support.y - 0.03, heading: 0 };
    return { posture: {}, pushes: [], stance: goal && { ...goal, walk } };
  });
  try {
    stand.step(stand.seconds(1));
    let low = -Infinity;
    const run = (seconds) => {
      for (let i = 0; i < stand.seconds(seconds); i++) {
        stand.step(1);
        const s = body.view.stance;
        low = Math.max(low, goal.height - (s.centre.y - s.support.y));
      }
    };
    walk = [speed * ux, speed * uz];
    run(5);
    const from = body.view.stance.centre.clone();
    run(3);
    const to = body.view.stance.centre;
    const along = ((to.x - from.x) * ux + (to.z - from.z) * uz) / 3, across = ((to.x - from.x) * uz - (to.z - from.z) * ux) / 3;
    const strides = body.view.stance.strides;
    walk = null;
    run(2);
    const settled = body.view.stance.strides;
    run(2);
    const s = body.view.stance;
    return { strides, fell: low > 0.25, along, across, speed: s.velocity.length(), phase: s.phase,
      stepped: s.strides - settled, off: Math.hypot(s.centre.x - s.place.x, s.centre.z - s.place.z) };
  } finally { body.dispose(); stand.dispose(); }
}
