import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body } from "../body.ts";
import type { BuiltSegment } from "../build/build-body.ts";
import { rigidPoints } from "../build/rigid.ts";
import type { MusclePush, Pose } from "../control/motor.ts";
import { centreOfToRef, pointOfToRef } from "../control/support.ts";
import type { MotionCommand } from "../control/tasks.ts";
import { wholeBodyTracking } from "../control/whole-body.ts";
import { hypot } from "../math/real.ts";
import { turnAboutToRef } from "../math/turn.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import type { Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";
import type { World } from "../world.ts";
import { ATTACK_PATH } from "./attack-path.ts";
import { guardPosture } from "./guard.ts";
import type { BlowSkill, LegsAsk } from "./skill.ts";
import { placedReach, type StrikeReport } from "./strike.ts";
import { aimOf } from "./strikes.ts";

/**
 * **The whole-body solve's settings** (`wholeBodyTracking`), the spike's own choices
 * (`docs/reference/whole-body-spike.md#settings`). The contact model is the support task's, as are
 * the joints' feedback and weights; the rest were set by the spike's prototypes.
 */
export const WHOLE_BODY = deepFreeze({
  contact: { maxPoints: 64, gap: 0.005, minUpNormal: 0.9, forceTolerance: 1e-5,
    iterations: 2048, absoluteTolerance: 1e-7, relativeTolerance: 1e-6 },
  effortCost: 1e-6, capacity: 5,
  /** The pelvis this far under its height over the soles in the reference pose, where a body is built, m, and the knees' bend, rad. */
  lower: 0.04, knee: 0.3,
  /** Joints toward the guard: their feedback, s, and weights, legs and the rest. */
  jointSeconds: 0.3, legWeight: 0.02, otherWeight: 0.1,
  /** The mass centre over the soles' middle and the pelvis's height and turn: feedback, s, and weights. */
  holdSeconds: 0.25, centreWeight: 10, rootWeight: 1,
  /** The timed punch: the fist's path, s; how far past the target it aims, m; the pelvis's and chest's turn, rad; each link's lead, s. */
  punch: { seconds: 0.12, through: 0.2, pelvis: 0.25, chest: 0.45, lead: 0.06,
    /** The fist's and the turns' feedback, s, and weights; the arm's joints' weight while the fist is driven. */
    fistSeconds: 0.05, fistWeight: 3, turnSeconds: 0.15, turnWeight: 1, armWeight: 0.001,
    /** How long after contact the fist is driven on, s; a blow and its return at most, s; returned within, m. */
    follow: 0.03, cycle: 2, returned: 0.05 },
});

/**
 * **The flat-out drive's settings**: the fist driven along the line from where its drive begins to
 * `through` m past the target at `push` m/s^2, beyond what any muscle gives, so the bounded solve
 * gives what it can; held to the line over `fistSeconds`. With `runup`, the fist is first drawn back
 * along the line to that far from the target, over `windSeconds` until within `wound` m. The
 * channels of `free` are let go of the guard (weight `armWeight`) while the fist is driven; `turns`
 * adds the timed punch's pelvis and chest turns. A drive lasts `longest` s at most. The grid's best
 * (`docs/reference/whole-body-spike.md#flat-out`).
 */
export const FLAT_OUT = deepFreeze({
  push: 240, through: 0.2, fistSeconds: 0.05, fistWeight: 3,
  runup: 0.25 as number | null, windSeconds: 0.06, wound: 0.03,
  free: "arm,trunk", armWeight: 0.001, turns: true,
  longest: 0.45, follow: 0.03, cycle: 2, returned: 0.05,
});

/** The channels each name in a flat-out drive's `free` lets go, for `hand`. */
const FREE: Readonly<Record<string, (hand: Side) => string>> = Object.freeze({
  arm: (hand: Side) => `(shoulder|elbow|wrist)\\.${hand}`, trunk: () => "thoracic|lumbar", hips: () => "hip\\.", legs: () => "hip\\.|knee\\.|ankle\\.",
});

/** The channels `free` names (`FlatOut.free`), for `hand`. */
export function freeChannels(free: string, hand: Side): RegExp {
  return new RegExp(free.split(",").map((name) => {
    const named = FREE[name];
    if (!named) throw new Error(`no channels named ${JSON.stringify(name)}`);
    return named(hand);
  }).join("|"));
}

/** How the whole-body strike drives its fist: on the timed punch's path, or flat out along the line. */
export type WholeBodyDrive = "timed" | "flat-out";

const ZERO: Vec3 = Object.freeze([0, 0, 0]) as unknown as Vec3;
const UP = new Vector3(0, 1, 0);

/** Minimum-jerk progress `s`, rate `v` and acceleration `a`, `t` s into a move of `span` s. */
export function minimumJerk(t: number, span: number): { s: number; v: number; a: number } {
  const u = Math.max(0, Math.min(1, t / span)), u2 = u * u, u3 = u2 * u;
  return { s: u3 * (10 - 15 * u + 6 * u2), v: (30 * u2 - 60 * u3 + 30 * u2 * u2) / span, a: (60 * u - 180 * u2 + 120 * u3) / (span * span) };
}

/** `point`, body frame, reference pose, in `segment`'s node frame: where a frame goal's `at` is read. */
export function localPoint(segment: Pick<BuiltSegment, "frame">, point: Vec3): Vec3 {
  const { origin, x, y, z } = segment.frame, d0 = point[0] - origin[0], d1 = point[1] - origin[1], d2 = point[2] - origin[2];
  return [d0 * x[0] + d1 * x[1] + d2 * x[2], d0 * y[0] + d1 * y[1] + d2 * y[2], d0 * z[0] + d1 * z[1] + d2 * z[2]];
}

/** Every channel of `model` toward `guard`, the knees bent, the channels `light` names at `lightWeight`. */
export function guardJoints(model: { readonly channels: readonly { readonly name: string; readonly min: number; readonly max: number }[] }, guard: Pose,
  light: RegExp | null = null, lightWeight: number = WHOLE_BODY.otherWeight): MotionCommand["joints"] {
  return model.channels.map((c) => ({ channel: c.name,
    angle: Math.max(c.min, Math.min(c.max, guard[c.name] ?? (/knee/.test(c.name) ? WHOLE_BODY.knee : 0))), rate: 0, acceleration: 0,
    seconds: WHOLE_BODY.jointSeconds, weight: /hip|knee|ankle/.test(c.name) ? WHOLE_BODY.legWeight : light?.test(c.name) ? lightWeight : WHOLE_BODY.otherWeight }));
}

type SegmentFrame = { readonly kind: "segment"; readonly name: string };

/** The goals the stance holds: the mass centre of `segments` over the soles' `middle` (x, z), and the pelvis at `height`. */
export function holdGoals(middle: Vec3, height: number, segments: readonly SegmentFrame[]) {
  return {
    frame: { id: "height", frame: { kind: "segment" as const, name: "lowerTrunk" }, at: ZERO, translation: { target: [0, height, 0] as Vec3,
      velocity: ZERO, acceleration: ZERO, seconds: WHOLE_BODY.holdSeconds, weight: WHOLE_BODY.rootWeight, axes: ["y" as const] } },
    centre: { id: "centre", frames: segments, translation: { target: middle, velocity: ZERO, acceleration: ZERO,
      seconds: WHOLE_BODY.holdSeconds, weight: WHOLE_BODY.centreWeight, axes: ["x" as const, "z" as const] } },
  };
}

/** The turn about up that brings `hand`'s shoulder forward: a turn of a positive angle about up carries a body's right (+x) back (-z). */
export const turnSense = (hand: Side): 1 | -1 => hand === "right" ? -1 : 1;

/** A minimum-jerk turn about up of `angle` rad the `sense` way, `t` s into `span` s, from the turn `from`: an orientation goal. */
export function trunkTurn(from: readonly [number, number, number, number], sense: number, angle: number, t: number, span: number, weight: number) {
  const m = minimumJerk(t, span), q = turnAboutToRef(UP, sense * angle * m.s, new Quaternion());
  q.multiplyToRef(new Quaternion(from[0], from[1], from[2], from[3]), q);
  return { target: [q.x, q.y, q.z, q.w] as [number, number, number, number], velocity: [0, sense * angle * m.v, 0] as Vec3,
    acceleration: [0, sense * angle * m.a, 0] as Vec3, seconds: WHOLE_BODY.punch.turnSeconds, weight };
}

/** The pelvis's turn held at `rotation`. */
const heldTurn = (rotation: readonly [number, number, number, number]) => ({ id: "turn", frame: { kind: "segment" as const, name: "lowerTrunk" }, at: ZERO,
  orientation: { target: [...rotation] as [number, number, number, number], velocity: ZERO, acceleration: ZERO, seconds: WHOLE_BODY.holdSeconds, weight: WHOLE_BODY.rootWeight } });

/** Whether a body of `spec` can take the whole-body strike: a pelvis and a chest it turns, a foot each side, and a hand with a strike point each side. */
export function wholeBodyFits(spec: BodySpec): boolean {
  const names = new Set(spec.segments.map((s) => s.name));
  return ["lowerTrunk", "upperTrunk", "foot.left", "foot.right", "hand.left", "hand.right"].every((name) => names.has(name));
}

const HOLD: LegsAsk = Object.freeze({ kind: "hold" });
const NO_HANDS = Object.freeze({ left: null, right: null });

/**
 * **The whole-body strike**: one bounded torque solve over the coupled dynamics, the ground's
 * contacts and the joints' stops (`wholeBodyTracking`), drives every freedom of `body` from the
 * blow's start to its return, given to the muscles as pushes (`Claim.whole`): the stance, the guard
 * and the posture stand aside, and the strike holds the legs, the trunk and both hands. Its goals
 * hold the mass centre over the soles' middle, the pelvis `lower` under its height in the reference
 * pose over where the feet stand and at its turn as the blow began, and every joint toward the
 * guard, the knees bent. Then, by `drive`:
 * - `timed`: the pelvis and then the chest turn the striking shoulder forward, and the fist goes
 *   along a minimum-jerk path from where it is to `through` past the target the way the body faces
 *   (`WHOLE_BODY.punch`);
 * - `flat-out`: the fist is drawn back to its run-up and then driven along the line to `through`
 *   past the target the way the body faces as hard as the muscles allow, the turns timed from the
 *   blow's start (`FLAT_OUT`).
 * The fist is driven until `follow` s after its hand first touches something, or its time is up;
 * then the solve brings it back toward where it began, and gives the body back once it is within
 * `returned` m of there or the blow's `cycle` is up. A blow begins as the path strike's does, not
 * before `startup` s on the clock and `hold` s after the last ended (`ATTACK_PATH`).
 */
export function wholeBodyStrike(body: Body, world: World, drive: WholeBodyDrive): BlowSkill {
  const built = body.built, spec = built.spec, muscles = body.muscles, guard = guardPosture(spec), { punch } = WHOLE_BODY;
  if (!wholeBodyFits(spec)) throw new Error(`${spec.model} cannot take the whole-body strike`);
  const tracking = wholeBodyTracking(built, muscles, world.physics.gravity, [], [], { capacity: WHOLE_BODY.capacity, effortCost: WHOLE_BODY.effortCost,
    contact: { physics: world.physics, settings: WHOLE_BODY.contact, dt: world.dt } });
  const model = deepFreeze({ channels: muscles.channels.map((c) => ({ name: c.name, min: c.dof.spec.min.value, max: c.dof.spec.max.value })),
    frames: [...built.segments.keys()].map((name) => ({ kind: "segment" as const, name })) });
  const segments = model.frames, pelvis = built.segments.get("lowerTrunk")!, chest = built.segments.get("upperTrunk")!;
  const feet = [built.segments.get("foot.left")!, built.segments.get("foot.right")!];
  /** The pelvis's height held over the soles, m: the reference pose's, less `lower`. */
  const standing = pelvis.frame.origin[1] - WHOLE_BODY.lower;
  const hands = { left: built.segments.get("hand.left")!, right: built.segments.get("hand.right")! };
  const aims = {
    left: rigidPoints(spec, hands.left.spec).get(aimOf(spec, "left"))!.value,
    right: rigidPoints(spec, hands.right.spec).get(aimOf(spec, "right"))!.value,
  };
  const at = { left: localPoint(hands.left, aims.left), right: localPoint(hands.right, aims.right) };
  const light = { left: new RegExp(`(shoulder|elbow|wrist)\\.left`), right: new RegExp(`(shoulder|elbow|wrist)\\.right`) };
  const free = { left: freeChannels(FLAT_OUT.free, "left"), right: freeChannels(FLAT_OUT.free, "right") };
  const state = {
    phase: null as "chamber" | "swing" | "return" | null, hand: null as Side | null,
    /** The clock as the last command read it; when the blow began, its drive began, its swing ended, and its hand first touched. */
    now: 0, began: 0, struck: 0, ended: 0, touched: null as number | null,
    /** The pelvis's height held, and its turn and the chest's as the blow began, world. */
    height: 0, pelvis: [0, 0, 0, 1] as [number, number, number, number], chest: [0, 0, 0, 1] as [number, number, number, number],
    /** Where the fist began, where its drive began, where it is driven to and the line's direction, and its run-up, world. */
    home: [0, 0, 0] as [number, number, number], from: [0, 0, 0] as [number, number, number], to: [0, 0, 0] as [number, number, number],
    unit: [0, 0, 0] as [number, number, number], back: [0, 0, 0] as [number, number, number],
    still: 0, thrown: { left: 0, right: 0 }, returned: { left: 0, right: 0 }, interrupted: 0,
    tracking: tracking.state,
  };
  const point = new Vector3(), centre = new Vector3(), work = new Vector3(), spin = new Vector3(), velocity = new Vector3(), facing = new Vector3();
  const fist = (hand: Side) => pointOfToRef(hands[hand], aims[hand], point);
  const copy = (out: number[], from: readonly number[]) => { for (let k = 0; k < out.length; k++) out[k] = from[k]!; };
  const aimAt = (from: Vec3) => {
    const d0 = state.to[0] - from[0], d1 = state.to[1] - from[1], d2 = state.to[2] - from[2], length = hypot(d0, d1, d2) || 1;
    copy(state.from, from); state.unit[0] = d0 / length; state.unit[1] = d1 / length; state.unit[2] = d2 / length;
  };
  const report: StrikeReport = {
    get impact() { return state.phase === "swing" && state.touched !== null; },
    get hand() { return state.hand; },
    get phase() { return state.phase; },
    get blow() { return state.phase ? "placed" : null; },
    get since() { return state.phase ? state.now - state.struck : -Infinity; },
    thrown: state.thrown,
    pointCycle: { returned: state.returned, get failed() { return 0; }, get interrupted() { return state.interrupted; } },
    get still() { return state.still; },
    rangeAt(hand, up) { return { reach: placedReach(spec, hand, up), along: [-ATTACK_PATH.near, ATTACK_PATH.near] }; },
  };
  /** The goals of the blow under way this step. */
  const goals = (t: number, hand: Side): MotionCommand => {
    const middle: [number, number, number] = [0, 0, 0];
    for (const foot of feet) { centreOfToRef(foot, work); middle[0] += work.x / 2; middle[2] += work.z / 2; }
    const hold = holdGoals(middle, state.height, segments), frames: MotionCommand["frames"][number][] = [hold.frame];
    const limb = { kind: "segment" as const, name: hands[hand].spec.name }, sense = turnSense(hand);
    // The turns go from the blow's start, its run-up's time included.
    const turns = (s: number) => {
      frames.push({ id: "pelvis", frame: { kind: "segment", name: "lowerTrunk" }, at: ZERO, orientation: trunkTurn(state.pelvis, sense, punch.pelvis, s, punch.seconds, punch.turnWeight) });
      frames.push({ id: "chest", frame: { kind: "segment", name: "upperTrunk" }, at: ZERO, orientation: trunkTurn(state.chest, sense, punch.chest, s - punch.lead, punch.seconds, punch.turnWeight) });
    };
    switch (state.phase) {
      case "chamber":
        frames.push({ id: "fist", frame: limb, at: at[hand], translation: { target: [...state.back] as Vec3, velocity: ZERO, acceleration: ZERO,
          seconds: FLAT_OUT.windSeconds, weight: FLAT_OUT.fistWeight } });
        return { joints: guardJoints(model, guard, free[hand], FLAT_OUT.armWeight), grips: [], centres: [hold.centre], frames };
      case "swing": {
        const s = t - state.struck, { from, to, unit } = state;
        if (drive === "timed") {
          const m = minimumJerk(s - 2 * punch.lead, punch.seconds);
          turns(t - state.began);
          frames.push({ id: "fist", frame: limb, at: at[hand], translation: { target: [from[0] + (to[0] - from[0]) * m.s, from[1] + (to[1] - from[1]) * m.s, from[2] + (to[2] - from[2]) * m.s],
            velocity: [(to[0] - from[0]) * m.v, (to[1] - from[1]) * m.v, (to[2] - from[2]) * m.v],
            acceleration: [(to[0] - from[0]) * m.a, (to[1] - from[1]) * m.a, (to[2] - from[2]) * m.a], seconds: punch.fistSeconds, weight: punch.fistWeight } });
          return { joints: guardJoints(model, guard, light[hand], punch.armWeight), grips: [], centres: [hold.centre], frames };
        }
        // The fist's strike point and its motion along the line.
        fist(hand); centreOfToRef(hands[hand], centre);
        hands[hand].body.angularVelocityToRef(spin); hands[hand].body.linearVelocityToRef(velocity);
        velocity.addInPlace(Vector3.CrossToRef(spin, point.subtractToRef(centre, work), work));
        const along = (point.x - from[0]) * unit[0] + (point.y - from[1]) * unit[1] + (point.z - from[2]) * unit[2];
        const speed = velocity.x * unit[0] + velocity.y * unit[1] + velocity.z * unit[2];
        if (FLAT_OUT.turns) turns(t - state.began);
        frames.push({ id: "fist", frame: limb, at: at[hand], translation: {
          target: [from[0] + unit[0] * along, from[1] + unit[1] * along, from[2] + unit[2] * along], velocity: [unit[0] * speed, unit[1] * speed, unit[2] * speed],
          acceleration: [unit[0] * FLAT_OUT.push, unit[1] * FLAT_OUT.push, unit[2] * FLAT_OUT.push], seconds: FLAT_OUT.fistSeconds, weight: FLAT_OUT.fistWeight } });
        return { joints: guardJoints(model, guard, free[hand], FLAT_OUT.armWeight), grips: [], centres: [hold.centre], frames };
      }
      case "return":
        frames.push(heldTurn(state.pelvis));
        return { joints: guardJoints(model, guard), grips: [], centres: [hold.centre], frames };
      case null: throw new Error("no blow under way");
      default: { const never: never = state.phase; throw new Error(`no phase ${JSON.stringify(never)}`); }
    }
  };
  /** The blow's phase moved on, as this step finds the body. */
  const advance = (t: number, hand: Side, touching: boolean) => {
    if (touching && state.touched === null) state.touched = t;
    switch (state.phase) {
      case "chamber": {
        const p = fist(hand), miss = hypot(p.x - state.back[0], p.y - state.back[1], p.z - state.back[2]);
        if (miss < FLAT_OUT.wound || t - state.began > FLAT_OUT.longest) { aimAt([p.x, p.y, p.z]); state.phase = "swing"; state.struck = t; state.touched = null; state.thrown[hand]++; }
        return;
      }
      case "swing": {
        const followed = state.touched !== null && t - state.touched >= (drive === "timed" ? punch.follow : FLAT_OUT.follow);
        const done = drive === "timed" ? t - state.struck > 2 * punch.lead + punch.seconds + punch.follow : t - state.struck > FLAT_OUT.longest;
        if (followed || done) { state.phase = "return"; state.ended = t; }
        return;
      }
      case "return": {
        const p = fist(hand), back = hypot(p.x - state.home[0], p.y - state.home[1], p.z - state.home[2]) < punch.returned;
        if (back) state.returned[hand]++;
        if (back || t - state.began >= punch.cycle) { state.phase = null; state.hand = null; state.still = 0; }
        return;
      }
      case null: return;
      default: { const never: never = state.phase; throw new Error(`no phase ${JSON.stringify(never)}`); }
    }
  };
  return {
    report, state, releases: true,
    get holds() { return state.hand; },
    get busy() { return state.phase !== null; },
    lower: null,
    accepts: () => true,
    resume() {
      if (state.phase !== null) state.interrupted++;
      state.phase = null; state.hand = null; state.touched = null; state.still = 0;
    },
    command(view, attack, _intent, _around, dt) {
      const t = view.time;
      state.now = t; state.still += dt;
      if (state.phase === null) {
        if (!attack || view.down || t < ATTACK_PATH.startup || state.still < ATTACK_PATH.hold) return null;
        const hand = attack.hand, p = fist(hand), home: Vec3 = [p.x, p.y, p.z];
        // The way the body faces, level: its root's forward.
        facing.set(0, 0, 1).applyRotationQuaternionToRef(view.root.rotation, facing);
        const level = hypot(facing.x, facing.z) || 1, through = drive === "timed" ? punch.through : FLAT_OUT.through;
        state.to[0] = attack.target[0] + facing.x / level * through; state.to[1] = attack.target[1]; state.to[2] = attack.target[2] + facing.z / level * through;
        copy(state.home, home); aimAt(home);
        state.hand = hand; state.began = t; state.struck = t; state.touched = null;
        // The soles' level: each foot's height over where the reference pose has it, flat on the ground there.
        state.height = standing + (feet[0]!.node.position.y - feet[0]!.frame.origin[1] + feet[1]!.node.position.y - feet[1]!.frame.origin[1]) / 2;
        const r = pelvis.node.rotationQuaternion!, c = chest.node.rotationQuaternion!;
        state.pelvis[0] = r.x; state.pelvis[1] = r.y; state.pelvis[2] = r.z; state.pelvis[3] = r.w;
        state.chest[0] = c.x; state.chest[1] = c.y; state.chest[2] = c.z; state.chest[3] = c.w;
        const runup = drive === "flat-out" ? FLAT_OUT.runup : null;
        if (runup === null) { state.phase = "swing"; state.thrown[hand]++; }
        else {
          state.phase = "chamber";
          for (let k = 0; k < 3; k++) state.back[k] = attack.target[k]! - state.unit[k]! * runup;
        }
      } else advance(t, state.hand!, (view.effectors[`hand.${state.hand!}`]?.feedback?.impulse ?? 0) > 0);
      const hand = state.hand;
      if (state.phase === null || hand === null) return null;
      const command = goals(t, hand);
      tracking.check(command);
      const torque = tracking.track(command), pushes: MusclePush[] = [];
      for (let i = 0; i < muscles.channels.length; i++) {
        const sense = torque[i]! >= 0 ? 1 : -1, strength = muscles.strength(i, sense);
        pushes.push({ channel: muscles.channels[i]!.name, sense, level: strength > 0 ? Math.min(1, Math.abs(torque[i]!) / strength) : 0 });
      }
      return { hands: NO_HANDS, posture: null, pushes, closed: { left: hand === "left", right: hand === "right" }, legs: HOLD, steer: 0, whole: true };
    },
  };
}
