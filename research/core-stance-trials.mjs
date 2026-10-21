/**
 * The core stance's trials, one stand each (Node, the core's stand, 120 Hz unless `hz` is given):
 * the batteries `research/core-stance-sweep.mjs` sweeps a stance tuning over. Each returns plain numbers.
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody } from "../src/core/body.ts";
import { armed } from "../src/core/human/grip.ts";
import { modelSpec } from "../src/core/models.ts";
import { woodenClub } from "../src/core/items/club.ts";
import { balanceCeiling, balancePercent, rulebook } from "../src/core/rules/rulebook.ts";
import { GUARD, guardPosture } from "../src/core/skills/guard.ts";
import { SIMBICON, simbicon, simbiconWays } from "../src/core/skills/simbicon.ts";
import { runCycleSettings } from "../src/core/skills/cycle-run.ts";
import { stride } from "../src/core/skills/stride.ts";
import { WALK_RUN, walkRun } from "../src/core/skills/walk-run.ts";
import { RUN_POLICIES, learnedRun } from "../src/core/skills/learned-run.ts";
import { startWind } from "../src/lab/wind.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";
import { readFileSync } from "node:fs";

export const CORE_STANCE_HARNESS = "Node core stand (tests/harness/core-stand.mjs), Rapier";

const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * `model` on the stand: unarmed, its arms as the stance leaves them and nothing holding it up but its
 * muscles; or, given what its right hand holds (`held`, of `HELD`: "club" or "empty"), as a
 * fight plays it: the club in that hand, the arms in the body's guard (`guardPosture`) and built
 * in it, and its character's balance under it (`balanceCeiling`, the rulebook's per cent).
 * `actuation` is the world's (`createWorld`), and `physique` the body's (`Physique`,
 * `src/core/human/physique.ts`). `balance` is a per cent of its weight for its assist in place of its character's, which an unarmed
 * stand has none of unless given. Its ground is `GROUND` across, so no trial walks off it.
 */
/** The trials' ground, m across: the fastest run of a battery, 4.5 m/s, set off, held and stopped (some 70 m), stays on it. */
const GROUND = 200;

async function body(model, stance, hz, held = null, actuation, physique, { balance = null } = {}) {
  const spec = held === "club" ? armed(modelSpec(model, physique), "right", woodenClub()) : modelSpec(model, physique);
  const stand = await coreStand(spec, { ground: true, groundSize: GROUND, hz, actuation, ...(held === null ? {} : { posture: guardPosture(spec) }) });
  const assist = held === null && balance === null ? undefined : balanceCeiling(balance ?? stand.built.spec.attributes.balance.value, balancePercent(rulebook("arena")));
  const built = createBody(stand.built, stand.world, { servoSeconds: 0.1, stance, measuring: true, assist });
  return { stand, body: built, guard: guardPosture(spec), feet: ["left", "right"].map((side) => stand.built.segments.get(`foot.${side}`)) };
}

/** The seconds stood at which `stand` reads the centre of mass's speed as the body settles. */
const SETTLE_SECONDS = [0.5, 1, 1.5, 2];

/** Stand 5 s 3 cm low in the guard: the centre's speed as it settles (`SETTLE_SECONDS`), its stop off the soles' middle, its drift over the last 2 s, the feet's slide across the ground and sink. */
export async function stand({ model, stance, hz = 120, balance = null }) {
  const { stand, body: b, feet } = await body(model, stance, hz, null, undefined, undefined, { balance });
  let goal = null, from = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) { goal = { feet: ["left", "right"], centre: null, height: view.standing - 0.03, heading: 0 }; from = feet.map((f) => f.node.position.clone()); }
    return { posture: GUARD, pushes: [], stance: goal };
  });
  try {
    const settle = [];
    let stood = 0;
    for (const seconds of SETTLE_SECONDS) {
      stand.step(stand.seconds(seconds - stood));
      stood = seconds;
      settle.push(b.view.stance.velocity.length());
    }
    stand.step(stand.seconds(3 - stood));
    const before = b.view.stance.centre.clone();
    stand.step(stand.seconds(2));
    const s = b.view.stance;
    return { settle, off: across(s.centre, s.support), low: Math.abs(s.centre.y - s.support.y - goal.height), drift: Vector3.Distance(s.centre, before),
      speed: s.velocity.length(), slide: Math.max(...feet.map((f, k) => across(f.node.position, from[k]))),
      sink: Math.max(...feet.map((f, k) => from[k].y - f.node.position.y)) };
  } finally { b.dispose(); stand.dispose(); }
}

/** Asked for a place 30 cm out `degrees` about the vertical from forward, 6 s: the stop off the held place, the height's miss, the feet's slide. */
export async function edge({ model, degrees, stance, hz = 120, balance = null }) {
  const { stand, body: b, feet } = await body(model, stance, hz, null, undefined, undefined, { balance });
  const way = degrees * Math.PI / 180;
  let goal = null, from = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) {
      goal = { feet: ["left", "right"], centre: [s.support.x + 0.3 * Math.sin(way), s.support.z + 0.3 * Math.cos(way)], height: view.standing - 0.03, heading: 0 };
      from = feet.map((f) => f.node.position.clone());
    }
    return { posture: {}, pushes: [], stance: goal };
  });
  try {
    stand.step(stand.seconds(6));
    const s = b.view.stance;
    return { off: across(s.centre, s.place), low: Math.abs(s.centre.y - s.support.y - goal.height), speed: s.velocity.length(),
      slide: Math.max(...feet.map((f, k) => across(f.node.position, from[k]))), fell: s.centre.y - s.support.y < goal.height - 0.25 };
  } finally { b.dispose(); stand.dispose(); }
}

/** Step `foot` by (dx, dz) over 0.45 s lifted 5 cm after 1 s, to 6 s (`stepping` in the tests). */
export async function step({ model, foot, dx, dz, stance, hz = 120, balance = null }) {
  const { stand, body: b } = await body(model, stance, hz, null, undefined, undefined, { balance });
  const other = foot === "left" ? "right" : "left";
  const turnOf = () => stand.built.segments.get(`foot.${foot}`).node.rotationQuaternion.clone();
  let goal = null, swing = null, to = null, bearing = null, lifted = null, turned = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: view.standing - 0.03, heading: 0 };
    if (goal && !swing && view.time >= 1) {
      to = [s.soles[foot].x + dx, s.soles[foot].z + dz];
      bearing = s.soles[other].clone();
      swing = { foot, to, seconds: 0.45, lift: 0.05 };
    }
    return { posture: {}, pushes: [], stance: goal && { ...goal, swing } };
  });
  try {
    const phases = [];
    let landed = null, drift = 0;
    for (let i = 0; i < stand.seconds(6); i++) {
      stand.step(1);
      const s = b.view.stance;
      if (phases.at(-1) !== s.phase) phases.push(s.phase);
      if (s.phase === "swing" && !lifted) lifted = turnOf();
      if (phases.at(-1) === "stand" && phases.at(-2) === "swing" && !landed) {
        landed = s.soles[foot].clone();
        turned = 2 * Math.acos(Math.min(1, Math.abs(Quaternion.Dot(turnOf(), lifted))));
      }
      if (bearing) drift = Math.max(drift, across(s.soles[other], bearing));
    }
    const s = b.view.stance;
    return { phases: phases.join(" "), miss: landed ? Math.hypot(landed.x - to[0], landed.z - to[1]) : Infinity, turned, off: across(s.centre, s.place),
      low: goal.height - (s.centre.y - s.support.y), speed: s.velocity.length(), drift };
  } finally { b.dispose(); stand.dispose(); }
}

/**
 * Shoved at the middle trunk's centre of mass by `impulse` N s level `degrees` from forward after 1.5 s, watched `watch` s
 * (`shoved` in the tests). With `walked` (m/s) it first walks forward 3 s at that pace and stops, and is shoved 3 s
 * after the stop is asked: the lab's shove after a walk. `apart` is the soles' middles' distance across when shoved, m.
 * With `held` it stands as a fight plays it (`body`).
 */
export async function shove({ model, impulse, degrees, stance, hz = 120, walked = 0, held = null, watch = 4.5, actuation, physique, balance = null }) {
  const { stand, body: b, guard, feet } = await body(model, stance, hz, held, actuation, physique, { balance });
  let goal = null, pace = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: view.standing - 0.03, heading: 0 };
    return { posture: held === null ? {} : guard, pushes: [], stance: goal && { ...goal, walk: pace } };
  });
  try {
    stand.step(stand.seconds(1.5));
    if (walked) {
      pace = [0, walked];
      stand.step(stand.seconds(3));
      pace = null;
      stand.step(stand.seconds(3));
    }
    const apart = Math.abs(feet[0].node.position.x - feet[1].node.position.x);
    const trunk = stand.built.segments.get("middleTrunk"), turn = trunk.node.rotationQuaternion.multiply(Quaternion.Inverse(trunk.rest));
    const com = trunk.spec.centreOfMass.value, o = trunk.frame.origin, way = degrees * Math.PI / 180;
    const at = new Vector3(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternion(turn).add(trunk.node.position);
    trunk.body.applyImpulse(new Vector3(impulse * Math.sin(way), 0, impulse * Math.cos(way)), at);
    let low = -Infinity;
    for (let i = 0; i < stand.seconds(watch); i++) {
      stand.step(1);
      const s = b.view.stance;
      low = Math.max(low, goal.height - (s.centre.y - s.support.y));
    }
    const s = b.view.stance;
    return { steps: s.recoveries, fell: low > 0.25 || !Number.isFinite(low), low: goal.height - (s.centre.y - s.support.y), speed: s.velocity.length(), apart };
  } finally { b.dispose(); stand.dispose(); }
}

/** The learned run's policies read from their files, by path: each read once a thread. */
const POLICIES = new Map();
const policyAt = (path) => { if (!POLICIES.has(path)) POLICIES.set(path, JSON.parse(readFileSync(path, "utf8"))); return POLICIES.get(path); };

/**
 * The locomotion skill `legs` names, driving `b`: null for the stance's own walk, which a trial asks
 * of the stance's goal itself; `"stride"` for the stride (`src/core/skills/stride.ts`);
 * `"walk-run"` for the walk and run (`src/core/skills/walk-run.ts`), free to run; `"learned-run"`
 * for it with its run steered by the trained policy (`learnedRun`, `RUN_POLICIES["all-bodies"]`); `"simbicon"`
 * for the SIMBICON gait (`src/core/skills/simbicon.ts`), which drives the legs itself, told it may
 * not run, and `"simbicon-run"` for it free to run; a `SimbiconConfig` for a SIMBICON gait of its own;
 * `{ kind: "learned-run", policy, hasted }` for the learned run steered by the policy in the file
 * `policy` names, its gait timed to its haste by `hasted` (`WalkRunSettings.hasted`).
 */
function skillOf(legs, b) {
  switch (legs) {
    case null: case undefined: return null;
    case "stride": return stride(b);
    case "walk-run": return walkRun(b);
    case "learned-run": return learnedRun(b, RUN_POLICIES["all-bodies"]);
    case "simbicon": return simbicon(b, SIMBICON, simbiconWays(), runCycleSettings(), false);
    case "simbicon-run": return simbicon(b);
    default: {
      // A SIMBICON gait of its own: its settings over the defaults, its ways' and its run's tuning, and whether it may run.
      if (legs?.kind === "learned-run") return learnedRun(b, policyAt(legs.policy), { ...WALK_RUN, hasted: legs.hasted });
      if (legs?.kind === "simbicon") { const { kind, tuning, runs = true, ...settings } = legs; return simbicon(b, { ...SIMBICON, ...settings }, simbiconWays(tuning), runCycleSettings(tuning?.run), runs); }
      throw new Error(`no locomotion skill named ${legs}`);
    }
  }
}

/**
 * The command of a body walking by the locomotion skill `skill`, asked `walk` facing `face`, its
 * posture `posture`: the stance's goal it gives (kept by `keep`, which answers the goal to stand
 * by), or the legs it drives itself (`Locomotion.drive`) with no stance, their posture laid over.
 * The goal kept is what a fall is read against while the legs are driven.
 */
function skillCommand(skill, view, walk, face, dt, posture, keep) {
  const drive = skill.drive ? skill.drive(view, walk, face, dt) : { kind: "stance", goal: skill.goal(view, walk, face, dt) };
  if (drive.kind === "drive") return { posture: { ...posture, ...drive.posture }, pushes: drive.pushes, stance: null };
  const goal = keep(drive.goal);
  return { posture, pushes: [], stance: view.time > 0 ? goal : null };
}

/**
 * Walk at `speed` m/s `degrees` from forward for `setOff` s and 3 s measured after 1 s, then walk
 * nowhere `rest` s (`walking` in the tests); as a fight plays the body with `held` (`body`), walking by the stance's own walk or
 * by the locomotion skill `legs` names (`skillOf`). Given `wind` (`{ rate, strength, seed }`), the
 * lab's gusts blow on it throughout (`startWind`, `src/lab/wind.ts`). `stood` is the soles' distance
 * apart across the way as it sets off, m, and `width` their mean as each lands over the 3 s measured
 * (null if none landed).
 */
export async function walk({ model, degrees, speed, stance, hz = 120, held = null, actuation, physique, legs = null, wind = null, setOff = 5, rest = 4, balance = null }) {
  const { stand, body: b, guard } = await body(model, stance, hz, held, actuation, physique, { balance });
  const blowing = wind && startWind(stand.built, stand.world, { rate: wind.rate, strength: wind.strength }, wind.seed);
  const way = degrees * Math.PI / 180, ux = Math.sin(way), uz = Math.cos(way), skill = skillOf(legs, b);
  let goal = null, pace = null;
  b.drive((view, dt) => {
    const posture = held === null ? {} : guard;
    // The walk in the body's frame, facing +z: forward along z, right along x.
    if (skill) return skillCommand(skill, view, pace && [pace[1], pace[0]], 0, dt, posture, (next) => { goal = next ?? goal; return goal; });
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: view.standing - 0.03, heading: 0 };
    return { posture, pushes: [], stance: goal && { ...goal, walk: pace } };
  });
  try {
    stand.step(stand.seconds(1));
    let low = -Infinity, down = false, measuring = false;
    const was = { left: true, right: true }, widths = [];
    const run = (seconds) => {
      for (let i = 0; i < stand.seconds(seconds); i++) {
        stand.step(1);
        const s = b.view.stance;
        // The sink is read over the lower sole: the stance's support is raised with a sole that swings high, as a run's does.
        if (goal) low = Math.max(low, goal.height - (s.centre.y - Math.min(s.soles.left.y, s.soles.right.y)));
        down ||= b.view.down;
        // The soles' distance apart across the way walked as each lands, over the walk measured.
        for (const side of ["left", "right"]) {
          if (measuring && s.touching[side] && !was[side]) widths.push(Math.abs((s.soles.left.x - s.soles.right.x) * uz - (s.soles.left.z - s.soles.right.z) * ux));
          was[side] = s.touching[side];
        }
      }
    };
    const soles = b.view.stance.soles, stood = Math.abs((soles.left.x - soles.right.x) * uz - (soles.left.z - soles.right.z) * ux);
    pace = [speed * ux, speed * uz];
    run(setOff);
    const from = b.view.stance.centre.clone();
    measuring = true;
    run(3);
    measuring = false;
    const to = b.view.stance.centre;
    const along = ((to.x - from.x) * ux + (to.z - from.z) * uz) / 3, sideways = ((to.x - from.x) * uz - (to.z - from.z) * ux) / 3;
    // The pace the stance walks at, capped by its legs, as measured.
    const strides = b.view.stance.strides, capped = Math.hypot(b.view.stance.pace[0], b.view.stance.pace[1]);
    pace = null;
    run(rest - 2);
    const settled = b.view.stance.strides;
    run(2);
    const s = b.view.stance;
    return { strides, capped, fell: low > 0.25 || down || !Number.isFinite(low), along, across: sideways, speed: s.velocity.length(), phase: s.phase,
      stepped: s.strides - settled, off: across(s.centre, s.place), stood, width: widths.length ? widths.reduce((a, w) => a + w, 0) / widths.length : null };
  } finally { blowing?.dispose(); b.dispose(); stand.dispose(); }
}

/**
 * Walk forward at `speed` m/s for `after` s after 1 s, then turn the heading half round at `rate`
 * rad/s (`sense` 1 to the right, -1 to the left) still walking, walk on 3 s and stop for 2: whether
 * it fell, and how far the walk's direction was off the new heading over the last second of walking,
 * rad. At an `after` of 0 the heading turns as the walk sets off. As a fight plays the body with
 * `held` (`body`), walking by the stance's own walk or by the locomotion skill `legs` names (`skillOf`).
 */
export async function turn({ model, speed, rate, sense, stance, hz = 120, after = 3, held = null, actuation, physique, legs = null, balance = null }) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("a turn rate must be finite and positive");
  const { stand, body: b, guard } = await body(model, stance, hz, held, actuation, physique, { balance });
  const skill = skillOf(legs, b);
  let goal = null, heading = 0, turning = false, walking = false, turned = 0;
  b.drive((view, dt) => {
    if (turning && turned < Math.PI) {
      const d = Math.min(rate * dt, Math.PI - turned);
      turned += d;
      heading += sense * d;
    }
    const posture = held === null ? {} : guard;
    if (skill) return skillCommand(skill, view, walking ? [speed, 0] : null, heading, dt, posture, (next) => { goal = next ?? goal; return goal; });
    if (!goal && view.time > 0) goal = { feet: ["left", "right"], centre: null, height: view.standing - 0.03 };
    const walk = walking ? [speed * Math.sin(heading), speed * Math.cos(heading)] : null;
    return { posture, pushes: [], stance: goal && { ...goal, heading, walk } };
  });
  try {
    let low = -Infinity, down = false;
    const run = (seconds, each) => {
      for (let i = 0; i < stand.seconds(seconds); i++) {
        stand.step(1);
        const s = b.view.stance;
        // The sink is read over the lower sole: the stance's support is raised with a sole that swings high, as a run's does.
        if (goal) low = Math.max(low, goal.height - (s.centre.y - Math.min(s.soles.left.y, s.soles.right.y)));
        down ||= b.view.down;
        each?.(s);
      }
    };
    run(1);
    walking = true;
    run(after);
    turning = true;
    run(Math.PI / rate);
    // How far the body's facing lags the heading asked as the turn asked ends, rad.
    const facing = b.view.stance.facing, lag = Math.abs(Math.atan2(Math.sin(facing - heading), Math.cos(facing - heading)));
    run(2);
    let off = 0;
    run(1, (s) => { if (s.velocity.length() > 0.05) off = Math.max(off, Math.abs(Math.atan2(Math.sin(Math.atan2(s.velocity.x, s.velocity.z) - heading), Math.cos(Math.atan2(s.velocity.x, s.velocity.z) - heading)))); });
    walking = false;
    run(2);
    return { fell: low > 0.25 || down || !Number.isFinite(low), off, lag, speed: b.view.stance.velocity.length(), phase: b.view.stance.phase };
  } finally { b.dispose(); stand.dispose(); }
}

/**
 * Orders as a person or a crowd gives them, at random from `seed`, for `seconds` after 1 s standing:
 * each held `ORDERS.least` to `ORDERS.most` s, a stand (one in six), a walk at `speed` m/s turning
 * to a new heading (one in two), or a walk at it a new way with the heading kept (one in three). As a
 * fight plays the body with `held` (`body`), walking by the locomotion skill `legs` names
 * (`skillOf`): whether it fell, and when.
 */
export async function orders({ model, speed, seed, seconds = 30, stance, hz = 120, held = null, actuation, physique, legs = null, balance = null }) {
  const { stand, body: b, guard } = await body(model, stance, hz, held, actuation, physique, { balance });
  const skill = skillOf(legs, b);
  if (!skill) throw new Error("orders are given to a locomotion skill");
  let state = (seed * 2654435761) % 4294967296;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  let goal = null, walk = null, heading = 0;
  b.drive((view, dt) => skillCommand(skill, view, walk, heading, dt, held === null ? {} : guard, (next) => { goal = next ?? goal; return goal; }));
  try {
    stand.step(stand.seconds(1));
    let low = -Infinity, next = 0;
    for (let i = 0; i < stand.seconds(seconds); i++) {
      if (i >= next) {
        next = i + stand.seconds(ORDERS.least + (ORDERS.most - ORDERS.least) * random());
        const kind = random(), way = 2 * Math.PI * random();
        if (kind < 1 / 6) walk = null;
        else if (kind < 2 / 3) { walk = [speed, 0]; heading = way; }
        else { heading = skill.heading; walk = [speed * Math.cos(way), speed * Math.sin(way)]; }
      }
      stand.step(1);
      const s = b.view.stance;
      if (goal) low = Math.max(low, goal.height - (s.centre.y - s.support.y));
      if (low > 0.25 || !Number.isFinite(low)) return { fell: true, at: b.view.time };
    }
    return { fell: false, at: null };
  } finally { b.dispose(); stand.dispose(); }
}

/** How long each of `orders`' orders is held, s: from about a step to a few strides. */
const ORDERS = { least: 0.3, most: 2 };

export const TRIALS = { stand, edge, step, shove, walk, turn, orders };
