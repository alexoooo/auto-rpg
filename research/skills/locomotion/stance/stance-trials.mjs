import { isRefused } from "../../../../src/core/refusal.ts";
import { footOn } from "../../../../src/control/support.ts";
/**
 * The core stance's trials, one stand each (Node, the core's stand, 120 Hz unless `hz` is given):
 * the batteries `research/skills/locomotion/stance/stance-sweep.mjs` sweeps a stance tuning over. Each returns plain numbers.
 */
import { Quaternion, Vector3 } from "../../../../src/core/math/vector.ts";
import { stockBody } from "../../../../src/app/stock-body.ts";
import { armed } from "../../../../src/core/bodies/human/grip.ts";
import { modelSpec } from "../../../../src/core/bodies/models.ts";
import { woodenClub } from "../../../../src/core/bodies/items/club.ts";
import { steadinessCeiling, steadinessPercent, rulebook } from "../../../../src/combat/rulebook.ts";
import { GUARD, guardPosture } from "../../../../src/skills/guard/shared/guard.ts";
import { WALK_RUN, WALK_RUN_CYCLE, walkRun } from "../../../../src/skills/locomotion/walk-run/walk-run/walk-run.ts";
import { STANCE_WALK_PART } from "../../../../src/skills/locomotion/stance-walk/index.ts";
import { WALK_RUN_PART } from "../../../../src/skills/locomotion/walk-run/index.ts";
import { travelSpeed } from "../../../../src/skills/locomotion/shared/travel.ts";
import "../../../../tests/harness/preload-data.mjs";
import { startWind } from "../../../../src/game/lab/wind.ts";
import { coreStand } from "../../../../tests/harness/core-stand.mjs";
import { SIDES } from "../../../../src/core/bodies/bilateral.ts";

export const CORE_STANCE_HARNESS = "Node core stand (tests/harness/core-stand.mjs), Rapier";

const across = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/**
 * `model` on the stand: unarmed, its arms as the stance leaves them and nothing holding it up but its
 * muscles; or, given what its right hand holds (`held`, of `HELD`: "club" or "empty"), as a
 * fight plays it: the club in that hand, the arms in the body's guard (`guardPosture`) and built
 * in it, and its character's steadiness under it (`steadinessCeiling`, the rulebook's per cent).
 * `actuation` is the world's (`createWorld`), and `physique` the body's (`Physique`,
 * `src/core/bodies/human/physique.ts`). `steadiness` is a per cent of its weight for its assist in place of its character's, which an unarmed
 * stand has none of unless given. With `envelope` it reads its stance's measured envelope
 * (`Body.envelope`) as a game's body does, which caps its walk's pace and turn; else the stance is
 * being measured, and it has none. Its ground is `GROUND` across, so no trial walks off it.
 */
/** The trials' ground, m across: the fastest run of a battery, 4.5 m/s, set off, held and stopped (some 70 m), stays on it. */
const GROUND = 200;

async function body(model, stance, hz, held = null, actuation, physique, { steadiness = null, envelope = false } = {}) {
  const spec = held === "club" ? armed(modelSpec(model, physique), "right", woodenClub()) : modelSpec(model, physique);
  const stand = await coreStand(spec, { ground: true, groundSize: GROUND, hz, actuation, ...(held === null ? {} : { posture: guardPosture(spec) }) });
  const assist = held === null && steadiness === null ? undefined : steadinessCeiling(steadiness ?? stand.built.spec.attributes.steadiness.value, steadinessPercent(rulebook("arena")));
  const built = stockBody(stand.built, stand.world, { servoSeconds: 0.1, stance, measuring: !envelope, assist });
  return { stand, body: built, guard: guardPosture(spec), feet: SIDES.map(side => stand.built.segments.get(spec.ends.find(end => end.name === footOn(spec, side)).segment)) };
}

/** The seconds stood at which `stand` reads the centre of mass's speed as the body settles. */
const SETTLE_SECONDS = [0.5, 1, 1.5, 2];

/** Stand 5 s 3 cm low in the guard: the centre's speed as it settles (`SETTLE_SECONDS`), its stop off the soles' middle, its drift over the last 2 s, the feet's slide across the ground and sink. */
export async function stand({ model, stance, hz = 120, steadiness = null }) {
  const { stand, body: b, feet } = await body(model, stance, hz, null, undefined, undefined, { steadiness });
  let goal = null, from = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) { goal = { feet: SIDES.map(side => footOn(b.built.spec, side)), centre: null, height: view.standing - 0.03, heading: 0 }; from = feet.map((f) => f.pose.position.clone()); }
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
      speed: s.velocity.length(), slide: Math.max(...feet.map((f, k) => across(f.pose.position, from[k]))),
      sink: Math.max(...feet.map((f, k) => from[k].y - f.pose.position.y)) };
  } finally { b.dispose(); stand.dispose(); }
}

/** Asked for a place 30 cm out `degrees` about the vertical from forward, 6 s: the stop off the held place, the height's miss, the feet's slide. */
export async function edge({ model, degrees, stance, hz = 120, steadiness = null }) {
  const { stand, body: b, feet } = await body(model, stance, hz, null, undefined, undefined, { steadiness });
  const way = degrees * Math.PI / 180;
  let goal = null, from = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) {
      goal = { feet: SIDES.map(side => footOn(b.built.spec, side)), centre: [s.support.x + 0.3 * Math.sin(way), s.support.z + 0.3 * Math.cos(way)], height: view.standing - 0.03, heading: 0 };
      from = feet.map((f) => f.pose.position.clone());
    }
    return { posture: {}, pushes: [], stance: goal };
  });
  try {
    stand.step(stand.seconds(6));
    const s = b.view.stance;
    return { off: across(s.centre, s.place), low: Math.abs(s.centre.y - s.support.y - goal.height), speed: s.velocity.length(),
      slide: Math.max(...feet.map((f, k) => across(f.pose.position, from[k]))), fell: s.centre.y - s.support.y < goal.height - 0.25 };
  } finally { b.dispose(); stand.dispose(); }
}

/** Step `foot` by (dx, dz) over 0.45 s lifted 5 cm after 1 s, to 6 s (`stepping` in the tests). */
export async function step({ model, foot, dx, dz, stance, hz = 120, steadiness = null }) {
  const { stand, body: b } = await body(model, stance, hz, null, undefined, undefined, { steadiness });
  const other = foot === "left" ? "right" : "left";
  const turnOf = () => stand.built.segments.get(`foot.${foot}`).pose.rotation.clone();
  let goal = null, swing = null, to = null, bearing = null, lifted = null, turned = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: SIDES.map(side => footOn(b.built.spec, side)), centre: null, height: view.standing - 0.03, heading: 0 };
    if (goal && !swing && view.time >= 1) {
      to = [s.ends[footOn(b.built.spec, foot)].middle.x + dx, s.ends[footOn(b.built.spec, foot)].middle.z + dz];
      bearing = s.ends[footOn(b.built.spec, other)].middle.clone();
      swing = { foot: footOn(b.built.spec, foot), to, seconds: 0.45, lift: 0.05 };
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
        landed = s.ends[footOn(b.built.spec, foot)].middle.clone();
        const now = turnOf();
        turned = 2 * Math.acos(Math.min(1, Math.abs(now.x * lifted.x + now.y * lifted.y + now.z * lifted.z + now.w * lifted.w)));
      }
      if (bearing) drift = Math.max(drift, across(s.ends[footOn(b.built.spec, other)].middle, bearing));
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
export async function shove({ model, impulse, degrees, stance, hz = 120, walked = 0, held = null, watch = 4.5, actuation, physique, steadiness = null }) {
  const { stand, body: b, guard, feet } = await body(model, stance, hz, held, actuation, physique, { steadiness });
  let goal = null, pace = null;
  b.drive((view) => {
    const s = view.stance;
    if (!goal && view.time > 0) goal = { feet: SIDES.map(side => footOn(b.built.spec, side)), centre: null, height: view.standing - 0.03, heading: 0 };
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
    const apart = Math.abs(feet[0].pose.position.x - feet[1].pose.position.x);
    shoveTrunk(stand, impulse, degrees * Math.PI / 180);
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

/** A level shove of `impulse` N s at the middle trunk's centre of mass, `way` rad from +z toward +x. */
function shoveTrunk(stand, impulse, way) {
  const trunk = stand.built.segments.get("middleTrunk"), turn = trunk.pose.rotation.multiply(Quaternion.Inverse(trunk.rest));
  const com = trunk.spec.centreOfMass.value, o = trunk.frame.origin;
  const at = new Vector3(com[0] - o[0], com[1] - o[1], com[2] - o[2]).applyRotationQuaternionToRef(turn, new Vector3()).add(trunk.pose.position);
  trunk.body.applyImpulse(new Vector3(impulse * Math.sin(way), 0, impulse * Math.cos(way)), at);
}

/** The learned run's policies read from their files, by path: each read once a thread. */
/**
 * The locomotion skill `legs` names, driving `b`: null for the stance's own walk, which a trial asks
 * of the stance's goal itself; `"walk-run"` for the walk and run (`src/skills/locomotion/walk-run/walk-run/walk-run.ts`),
 * free to run; `"braced"`, `"staggered"` and `"quick-start"` for the stance walk's variations (`STANCE_WALK_PART`), named, as a body may hold several.
 */
function skillOf(legs, b, stride) {
  switch (legs) {
    case null: case undefined: return null;
    // The walk and run as the game builds it, from the body's record and its learned corrections; a stride searched, over the defaults.
    case "walk-run": return stride === undefined ? WALK_RUN_PART.make(b.commanded, { kind: "walk-run" }) : walkRun(b.commanded, WALK_RUN, WALK_RUN_CYCLE, { stride });
    case "quick-run": return WALK_RUN_PART.make(b.commanded, { kind: "walk-run", variation: "quick-start" });
    case "footwork": return STANCE_WALK_PART.make(b.commanded, { kind: "stance-walk", variation: "footwork" });
    case "braced": return STANCE_WALK_PART.make(b.commanded, { kind: "stance-walk", variation: "stance-walk" });
    case "staggered": return STANCE_WALK_PART.make(b.commanded, { kind: "stance-walk", variation: "staggered" });
    case "quick-start": return STANCE_WALK_PART.make(b.commanded, { kind: "stance-walk", variation: "quick-start" });
    default: throw new Error(`no locomotion skill named ${legs}`);
  }
}

/**
 * The command of a body walking by the locomotion skill `skill`, asked `walk` facing `face`, its
 * posture `posture`: the stance's goal it gives (kept by `keep`, which answers the goal to stand
 * by), or the legs it drives itself (`LegsDrive`) with no stance, their posture laid over.
 * The goal kept is what a fall is read against while the legs are driven.
 */
function skillCommand(skill, view, walk, face, dt, posture, keep) {
  const drive = skill.goal(view, { walk, face }, dt);
  if (drive.kind === "drive") return { posture: { ...posture, ...drive.posture }, pushes: drive.pushes, stance: null };
  const goal = keep(drive.goal);
  return { posture, pushes: [], stance: view.time > 0 ? goal : null };
}

/**
 * Walk at `speed` m/s `degrees` from forward for `setOff` s and 3 s measured after 1 s, then walk
 * nowhere `rest` s (`walking` in the tests); as a fight plays the body with `held` (`body`), walking by the stance's own walk or
 * by the locomotion skill `legs` names (`skillOf`). Given `wind` (`{ rate, strength, seed }`), the
 * lab's gusts blow on it throughout (`startWind`, `src/game/lab/wind.ts`). `stood` is the soles' distance
 * apart across the way as it sets off, m, and `width` their mean as each lands over the 3 s measured
 * (null if none landed), and the greatest absolute pelvis facing, rad, through travel and rest.
 * `stop` is how it stopped: the centre's speed the way it walked as the stop was asked (`on`, m/s),
 * and how far it went on that way from there to the rest's end (`went`, m).
 * `trace` retains each step's motion, stance recovery state and hip rotation readings; `watch`, if
 * given, is called with the body built and the world's time after each step (to draw it).
 */
export async function walk({ model, degrees, speed, stance, hz = 120, held = null, actuation, physique, legs = null, wind = null, setOff = 5, rest = 4, steadiness = null, stride, trace = false, watch = null }) {
  const { stand, body: b, guard } = await body(model, stance, hz, held, actuation, physique, { steadiness });
  const blowing = wind && startWind(stand.built, stand.world, { rate: wind.rate, strength: wind.strength }, wind.seed);
  if (isRefused(blowing)) { b.dispose(); stand.dispose(); throw new Error(blowing.refused); }
  const way = degrees * Math.PI / 180, ux = Math.sin(way), uz = Math.cos(way), skill = skillOf(legs, b, stride);
  let goal = null, pace = null;
  b.drive((view, dt) => {
    const posture = held === null ? {} : guard;
    // The walk in the body's frame, facing +z: forward along z, right along x.
    if (skill) return skillCommand(skill, view, pace && [pace[1], pace[0]], 0, dt, posture, (next) => { goal = next ?? goal; return goal; });
    if (!goal && view.time > 0) goal = { feet: SIDES.map(side => footOn(b.built.spec, side)), centre: null, height: view.standing - 0.03, heading: 0 };
    return { posture, pushes: [], stance: goal && { ...goal, walk: pace } };
  });
  try {
    stand.step(stand.seconds(1));
    let low = -Infinity, down = false, measuring = false, facing = 0;
    const samples = [], muscles = b.commanded.muscles;
    const yawChannels = trace ? muscles.channels.flatMap((channel, i) =>
      channel.name.includes("hip.") && channel.name.includes("internal rotation") ? [i] : []) : [];
    const was = { left: true, right: true }, widths = [];
    const run = (seconds) => {
      for (let i = 0; i < stand.seconds(seconds); i++) {
        stand.step(1);
        watch?.(b.built, stand.world.time);
        const s = b.view.stance;
        // The sink is read over the lower sole: the stance's support is raised with a sole that swings high, as a run's does.
        if (goal) low = Math.max(low, goal.height - (s.centre.y - Math.min(s.ends[footOn(b.built.spec, "left")].middle.y, s.ends[footOn(b.built.spec, "right")].middle.y)));
        down ||= b.view.down;
        facing = Math.max(facing, Math.abs(s.facing));
        if (trace) {
          const step = b.state.mind.layers.motor.stance.step;
          samples.push(structuredClone({ time: stand.world.time, facing: s.facing, phase: s.phase,
            velocity: s.velocity, centre: s.centre, ends: s.ends,
            catching: step.catching, recovering: step.recovering, stepFacing: step.facing,
            yaw: yawChannels.map(i => ({ channel: muscles.channels[i].name, angle: muscles.angle(i),
              speed: muscles.speed(i), torque: muscles.pulled[i], ceiling: muscles.ceiling[i] })) }));
        }
        // The soles' distance apart across the way walked as each lands, over the walk measured.
        for (const side of SIDES) {
          if (measuring && s.ends[footOn(b.built.spec, side)].touching && !was[side]) widths.push(Math.abs((s.ends[footOn(b.built.spec, "left")].middle.x - s.ends[footOn(b.built.spec, "right")].middle.x) * uz - (s.ends[footOn(b.built.spec, "left")].middle.z - s.ends[footOn(b.built.spec, "right")].middle.z) * ux));
          was[side] = s.ends[footOn(b.built.spec, side)].touching;
        }
      }
    };
    const soles = Object.fromEntries(SIDES.map(side => [side, b.view.stance.ends[footOn(b.built.spec, side)].middle])), stood = Math.abs((soles.left.x - soles.right.x) * uz - (soles.left.z - soles.right.z) * ux);
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
    const asked = b.view.stance.centre.clone(), going = b.view.stance.velocity, on = going.x * ux + going.z * uz;
    pace = null;
    run(rest - 2);
    const settled = b.view.stance.strides;
    run(2);
    const s = b.view.stance;
    return { strides, capped, fell: low > 0.25 || down || !Number.isFinite(low), facing, ...(trace ? { samples } : {}), along, across: sideways, speed: s.velocity.length(), phase: s.phase,
      stop: { on, went: (s.centre.x - asked.x) * ux + (s.centre.z - asked.z) * uz },
      stepped: s.strides - settled, off: across(s.centre, s.place), stood, width: widths.length ? widths.reduce((a, w) => a + w, 0) / widths.length : null };
  } finally { blowing?.dispose(); b.dispose(); stand.dispose(); }
}

/**
 * Walk forward at `speed` m/s for `after` s after 1 s, then turn the heading half round at `rate`
 * rad/s (`sense` 1 to the right, -1 to the left) still walking, walk on 3 s and stop for 2: whether
 * it fell, and how far the walk's direction was off the new heading over the last second of walking,
 * rad. At an `after` of 0 the heading turns as the walk sets off. As a fight plays the body with
 * `held` (`body`), walking by the stance's own walk or by the locomotion skill `legs` names (`skillOf`).
 *
 * Given `onto` (`{ side }`), the turn is a walk onto a way, as a fight asks one: from the turn's
 * start the walk is asked along the heading it ends on, a quarter round, and the heading turns a
 * quarter round onto it; the walk off the heading goes no faster than the ellipse through `speed`
 * along it and `side` m/s across it (`heldPace`'s, the side way's fastest walk).
 */
export async function turn({ model, speed, rate, sense, stance, hz = 120, after = 3, held = null, actuation, physique, legs = null, steadiness = null, onto = null, stride }) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("a turn rate must be finite and positive");
  const { stand, body: b, guard } = await body(model, stance, hz, held, actuation, physique, { steadiness });
  const skill = skillOf(legs, b, stride);
  const round = onto ? Math.PI / 2 : Math.PI;
  let goal = null, heading = 0, turning = false, walking = false, turned = 0;
  b.drive((view, dt) => {
    if (turning && turned < round) {
      const d = Math.min(rate * dt, round - turned);
      turned += d;
      heading += sense * d;
    }
    const posture = held === null ? {} : guard;
    // The way walked, and how fast: along the heading at `speed`; onto a way, that way from the turn's start, within the ellipse.
    const way = onto && turning ? sense * round : heading, f = Math.cos(way - heading), r = Math.sin(way - heading);
    const across = onto ? (onto.side > 0 ? r / onto.side : r === 0 ? 0 : Infinity) : 0, pace = Math.min(speed, 1 / Math.sqrt((f / speed) ** 2 + across ** 2));
    if (skill) return skillCommand(skill, view, walking ? [pace * f, pace * r] : null, heading, dt, posture, (next) => { goal = next ?? goal; return goal; });
    if (!goal && view.time > 0) goal = { feet: SIDES.map(side => footOn(b.built.spec, side)), centre: null, height: view.standing - 0.03 };
    const walk = walking ? [pace * Math.sin(way), pace * Math.cos(way)] : null;
    return { posture, pushes: [], stance: goal && { ...goal, heading, walk } };
  });
  try {
    let low = -Infinity, down = false;
    const run = (seconds, each) => {
      for (let i = 0; i < stand.seconds(seconds); i++) {
        stand.step(1);
        const s = b.view.stance;
        // The sink is read over the lower sole: the stance's support is raised with a sole that swings high, as a run's does.
        if (goal) low = Math.max(low, goal.height - (s.centre.y - Math.min(s.ends[footOn(b.built.spec, "left")].middle.y, s.ends[footOn(b.built.spec, "right")].middle.y)));
        down ||= b.view.down;
        each?.(s);
      }
    };
    run(1);
    walking = true;
    run(after);
    turning = true;
    run(round / rate);
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
 * (`skillOf`): whether it fell, when, and the catch steps it took. With `envelope`, the body reads
 * its stance's measured envelope as a game's does (`body`).
 */
export async function orders({ model, speed, seed, seconds = 30, stance, hz = 120, held = null, actuation, physique, legs = null, steadiness = null, envelope = false, shoves = 0, stride }) {
  const { stand, body: b, guard } = await body(model, stance, hz, held, actuation, physique, { steadiness, envelope });
  const skill = skillOf(legs, b, stride);
  if (!skill) throw new Error("orders are given to a locomotion skill");
  let state = (seed * 2654435761) % 4294967296;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  // The shoves' own stream, so that the orders are the seed's with or without them.
  let pushes = (seed * 2246822519 + 1) % 4294967296;
  const push = () => { pushes = (pushes * 1664525 + 1013904223) % 4294967296; return pushes / 4294967296; };
  let goal = null, walk = null, heading = 0;
  b.drive((view, dt) => skillCommand(skill, view, walk, heading, dt, held === null ? {} : guard, (next) => { goal = next ?? goal; return goal; }));
  try {
    stand.step(stand.seconds(1));
    let low = -Infinity, next = 0, shoved = 0, last = null;
    for (let i = 0; i < stand.seconds(seconds); i++) {
      if (i >= next) {
        next = i + stand.seconds(ORDERS.least + (ORDERS.most - ORDERS.least) * random());
        const kind = random(), way = 2 * Math.PI * random();
        if (kind < 1 / 6) walk = null;
        else if (kind < 2 / 3) { walk = [speed, 0]; heading = way; }
        else { heading = skill.heading; walk = [speed * Math.cos(way), speed * Math.sin(way)]; }
        if (shoves && push() < ORDERS.shoved) {
          const way = 2 * Math.PI * push(), facing = b.view.stance.facing;
          shoveTrunk(stand, shoves, way); shoved++;
          last = { at: b.view.time, way: Math.atan2(Math.sin(way - facing), Math.cos(way - facing)), phase: b.view.stance.phase };
        }
      }
      stand.step(1);
      const s = b.view.stance;
      if (goal) low = Math.max(low, goal.height - (s.centre.y - s.support.y));
      if (low > 0.25 || !Number.isFinite(low)) return { fell: true, at: b.view.time, catches: b.view.stance.recoveries, shoved, last };
    }
    return { fell: false, at: null, catches: b.view.stance.recoveries, shoved };
  } finally { b.dispose(); stand.dispose(); }
}

/**
 * How long each of `orders`' orders is held, s: from about a step to a few strides; and the share
 * of its orders that come with a shove, where it is shoved.
 */
const ORDERS = { least: 0.3, most: 2, shoved: 1 / 3 };

/**
 * Sent to a place `distance` m straight ahead by the locomotion skill `legs` names, from a stand
 * or, given `walking` (m/s), from a walk ahead at that pace for 2 s, the walk each step asked by
 * the speed rule (`travelSpeed`) on the skill's own limits with one stretch of its stops
 * (`Locomotion.stops`) braked at `rate` m/s² in place of its own: `stretch` "below", its first
 * stretch alone, its pace held under that stretch's top; "above", its last, past the ones before
 * it as the skill has them (each braked for a place within `near` m); "whole", its last as the
 * only one, at every speed. For `seconds` s: how far past the place its centre went at most
 * (`past`, m), where it stood at the end against it (`off`, m, + past it), when it first came
 * within `ARRIVED.within` m of it below `ARRIVED.speed` m/s (`arrived`, s from the order, null if
 * it never did), whether it fell, whether the rule could stop it there at all (`reachable`: as
 * the order is given, it asks at least the speed the body has), and the stretch braked (its `lag`
 * and the top of the first stretch, `below`). With `envelope`, the body reads its stance's measured envelope as a game's
 * does (`body`). With `trace`, every `trace` s: the time from the order, the m left, the speed
 * asked, the legs' own pace (`Locomotion.pace`) and the centre's speed ahead (`samples`).
 */
export async function arrive({ model, distance, rate, stretch = "whole", near = 0.04, walking = 0, seconds = 20, trace = 0, stance = {}, hz = 120, held = null, actuation, physique, legs, steadiness = null, envelope = true, stride }) {
  const { stand, body: b, guard } = await body(model, stance, hz, held, actuation, physique, { steadiness, envelope });
  const skill = skillOf(legs, b, stride);
  if (!skill) throw new Error("a place is gone to by a locomotion skill");
  const own = skill.stops, first = own[0], last = own.at(-1), rates = [{ stopping: rate, past: 0 }];
  const stops = stretch === "below" ? [{ ...first, below: Infinity, rates }] : stretch === "above" ? [...own.slice(0, -1), { ...last, rates }] : [{ below: Infinity, lag: last.lag, rates }];
  const ceiling = stretch === "below" ? first.below : Infinity, braked = stretch === "below" ? first : last;
  let goal = null, walk = null;
  b.drive((view, dt) => skillCommand(skill, view, walk, 0, dt, held === null ? {} : guard, (next) => { goal = next ?? goal; return goal; }));
  try {
    stand.step(stand.seconds(1));
    if (walking > 0) { walk = [Math.min(walking, ceiling), 0]; stand.step(stand.seconds(2)); }
    const at = b.view.stance.centre.z + distance, x = b.view.stance.centre.x;
    let low = -Infinity, past = -Infinity, arrived = null;
    const limits = { envelope: skill.envelope, stops }, on = b.view.stance.velocity.z;
    const reachable = travelSpeed(limits, { way: [1, 0], left: distance, corners: [], gone: 0, on, ceiling: Infinity, near }) >= on, samples = [];
    for (let i = 0; i < stand.seconds(seconds); i++) {
      const s = b.view.stance, left = at - s.centre.z;
      // The place ahead, straight along the heading the body faces: the rule's way is forward.
      const speed = left > 0 ? travelSpeed(limits, { way: [1, 0], left, corners: [], gone: 0, on: s.velocity.z, ceiling, near }) : 0;
      walk = speed > 0 ? [speed, 0] : null;
      if (trace && i % Math.max(1, Math.round(trace * hz)) === 0)
        samples.push({ t: +(i / hz).toFixed(2), left: +left.toFixed(2), asked: +speed.toFixed(2), pace: +(skill.pace ?? 0).toFixed(2), speed: +s.velocity.z.toFixed(2) });
      stand.step(1);
      if (goal) low = Math.max(low, goal.height - (s.centre.y - s.support.y));
      const reading = { lag: braked.lag, below: first.below, reachable, ...(trace ? { samples } : {}) };
      if (low > 0.25 || !Number.isFinite(low) || b.view.down) return { fell: true, at: b.view.time, past, arrived, ...reading };
      const off = b.view.stance.centre.z - at;
      past = Math.max(past, off);
      if (arrived === null && Math.hypot(off, b.view.stance.centre.x - x) <= ARRIVED.within && b.view.stance.velocity.length() < ARRIVED.speed) arrived = i / hz;
      if (i === stand.seconds(seconds) - 1) return { fell: false, past, off, arrived, ...reading };
    }
    return { fell: false, past, off: null, arrived, lag: braked.lag, below: first.below, reachable };
  } finally { b.dispose(); stand.dispose(); }
}

/** When a body sent to a place has come to it (`arrive`): within `within` m of it, going slower than `speed` m/s. */
const ARRIVED = { within: 0.1, speed: 0.1 };

export const TRIALS = { stand, edge, step, shove, walk, turn, orders, arrive };
