import type { Body, BodyView } from "../body.ts";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { swingProgressToRef, type StanceGoal, type SwingGoal } from "../control/stance.ts";
import { strideEnvelope } from "../control/stance-envelope.ts";
import { footStatesOf } from "../control/support.ts";
import type { Pose } from "../control/motor.ts";
import type { Side } from "../spec/body.ts";
import { GUARD } from "./guard.ts";
import { exp, sin, cos, hypot } from "../math/real.ts";
import { personStep } from "../human/gait.ts";
import { locomotion, type Locomotion } from "./locomotion.ts";

/** **A stride's settings**: how its steps are timed, placed and lifted, and how fast its walk changes and turns. */
export interface StrideSettings {
  /** Each step's swing, s, and the double support before a steady step's lift, s. */
  readonly swing: number;
  readonly transfer: number;
  /** How high the sole's middle is lifted at the swing's middle, m. */
  readonly lift: number;
  /** The constant the swinging foot takes up its errors from its path at, s (`SwingGoal.settle`). */
  readonly settle: number;
  /** The soles' middles' distance apart across the heading in a steady walk, m. */
  readonly width: number;
  /** The longest step, from the bearing sole's middle, as a fraction of the leg (thigh and shank). */
  readonly longest: number;
  /** How fast the walk's pace goes toward the one asked, m/s². */
  readonly accel: number;
  /** The heading's fastest turn, rad/s. */
  readonly turn: number;
  /**
   * Whether a forward step's time is a person's at the walk's pace (`personStep`, of forward
   * walking), shared between the swing and the double support as `swing` and `transfer` share
   * theirs; a step to the side or back takes theirs, and one between, between the two by the
   * cosine of the walk's angle from the heading. None, theirs.
   */
  readonly paced?: boolean;
  /** Whether a swing ends as its sole meets the ground (`SwingGoal.lands`); none, on its time. */
  readonly lands?: boolean;
  /** The trailing ankle's push-off through the double support, rad of plantarflexion (`SwingGoal.push`); none or 0, no push. */
  readonly push?: number;
  /**
   * The push-off as a torque (`SwingGoal.launch`): the share of its plantarflexion's strength the
   * ankle of the foot that lifts next gives at least, from `lead` s before the swing before it
   * lands to its lift. None or 0, the ankle is the stance's.
   */
  readonly launch?: number;
  readonly lead?: number;
  /** Whether a swing goes on from the sole's velocity as it lifts (`SwingGoal.momentum`); none, from rest. */
  readonly momentum?: boolean;
  /** The lever a swing's missed moment is weighed at, m (`SwingGoal.lever`); none or 0, the stance's. */
  readonly lever?: number;
  /**
   * The arms' swing against the legs (`Locomotion.arms`): rad of each shoulder's flexion for every
   * metre the other side's sole is ahead of the centre of mass along the heading. None or 0, the
   * arms keep the guard.
   */
  readonly arms?: number;
  /** The swing's acceleration ramped over this share of each half of its time (`SwingGoal.ramp`), at most 1/4; none or 0, minimum jerk. */
  readonly ramp?: number;
  /**
   * The walk's pace held to, s: the capture point asked at a landing ahead of the steady walk's by
   * this times the measured velocity's shortfall of the pace, so that the stance's pivot moves back
   * while the body walks slower than it is asked. None or 0, the steady walk's alone.
   */
  readonly drive?: number;
  /**
   * How much longer than its time a swing may take, as a fraction of it, while its landing falls
   * short of a steady step (Khadiv et al. 2016): the capture point runs on further before the foot
   * lands. None or 0, a swing is only ever shortened.
   */
  readonly lengthen?: number;
}

/**
 * The stride as a fighter takes it unless told otherwise: the best of a search of its settings
 * (`research/locomotion-search.mjs`: the fastest pace each body holds on each line, forward
 * counted twice), the heading turning at up to 4 rad/s, the stance walk's turn at a slow pace. A
 * swing of 0.283 s after 0.043 s on both feet, lifted 3 cm, the soles 0.286 m apart, no step longer
 * than 0.856 of the leg, the foot held to its path at 0.052 s, the swing's acceleration ramped over
 * 0.009 of each half, a pace that changes at 1.53 m/s² and is driven 0.206 s a m/s short, the
 * trailing ankle pushing 0.152 rad, and the arms swinging 1.77 rad a metre the feet are apart.
 */
export const STRIDE: StrideSettings = Object.freeze({
  swing: 0.283, transfer: 0.043, lift: 0.03, settle: 0.052, width: 0.286, longest: 0.856, accel: 1.53, turn: 4,
  push: 0.152, arms: 1.77, ramp: 0.009, drive: 0.206,
});

/** Whether `settings` are a stride's: each finite, the double support not negative, the rest positive, a launch's share at most 1. */
export function validStride(settings: StrideSettings): boolean {
  const { swing, transfer, lift, settle, width, longest, accel, turn, paced, lands, push, arms, ramp, drive, lengthen, launch, lead, momentum, lever } = settings;
  return [swing, transfer, lift, settle, width, longest, accel, turn].every(Number.isFinite) && transfer >= 0
    && swing > 0 && lift > 0 && settle > 0 && width > 0 && longest > 0 && accel > 0 && turn > 0
    && [paced, lands, momentum].every((x) => x === undefined || typeof x === "boolean")
    && [push, arms, drive, lengthen, lead, lever].every((x) => x === undefined || Number.isFinite(x) && x >= 0)
    && (launch === undefined || Number.isFinite(launch) && launch >= 0 && launch <= 1)
    && (ramp === undefined || Number.isFinite(ramp) && ramp >= 0 && ramp <= 0.25);
}

/**
 * With its capture point within this distance, m, of the line between the soles' middles, a body
 * that has stopped walking stands: its last step was its last, and the stance holds it there.
 */
const STILL = 0.06;

/** How far apart the two soles' edges stay across the heading at a landing, m: room for the swinging foot to pass the bearing one. */
const PASS = 0.05;

/** The shortest a swing is cut to when its landing would be past the longest step, as a fraction of its time: the foot needs the time to get there. */
const SOONEST = 0.75;

/** The pendulum's least height, m: a numeric floor, for a body that has fallen flat. */
const HEIGHT_FLOOR = 0.1;

/**
 * **The arms swinging**, each from the guard (`GUARD`): the upper arm hanging, turned forward by
 * the swing and no further than `ARM_REACH` rad either way, the elbow bent as the guard bends it.
 * An arm reaches a posture that moves at a walk's cadence about `ARM_LEAD` s late (the servo's
 * lag), so each arm is asked where the other side's sole will be then: a swinging sole along its
 * minimum-jerk way to its landing, a bearing one where it is, from the centre of mass run on.
 */
const ARM_REACH = 0.8, ARM_LEAD = 0.15;

/** Whether every number of `step` is finite: a body read in a state no step can be planned from asks none. */
function finite(step: SwingGoal): boolean {
  return [step.to[0], step.to[1], step.seconds, ...(step.capture ?? []), ...(step.handover ?? [])].every(Number.isFinite);
}

/** How far (x, z) is from the segment from (ax, az) to (bx, bz). */
function offSegment(x: number, z: number, ax: number, az: number, bx: number, bz: number): number {
  const ux = bx - ax, uz = bz - az, n = ux * ux + uz * uz;
  const t = n > 0 ? Math.min(Math.max(((x - ax) * ux + (z - az) * uz) / n, 0), 1) : 0;
  return hypot(x - ax - t * ux, z - az - t * uz);
}

/** **What a stride remembers**, besides the legs' own (`locomotion`). */
interface StrideMemory {
  /** The step handed to the stance while it is under way, as last aimed; null between steps. */
  step: SwingGoal | null;
  /** Whether the stance has lifted the step's foot, and for how long it has swung, s. */
  lifted: boolean;
  swung: number;
  /** The foot of the last step that landed; null standing. */
  last: Side | null;
  /** The walk's velocity reached, world (x, z), m/s. */
  pace: [number, number];
  /** How far apart the soles' middles stood at the body's first view, m: where a walk stops; null before. */
  width: number | null;
}

/**
 * **The walk and run**: a locomotion skill (`Locomotion`) that plans its own steps and hands the
 * stance one at a time, as the goal's `swing` over both feet; it never asks the stance to walk
 * (`StanceGoal.walk`), so the stance's own gait is not its. Its heading, height, footing and
 * resume are the locomotion skill's, under the stride's own envelope (`strideEnvelope`) where the
 * body has one (`Body.envelope`: none while it is measured or under an experiment's stance), its
 * heading turning no faster than `settings.turn`.
 *
 * Each step is placed from the body's capture point xi = c + v / w, w = sqrt(g / height) of the height the stance holds (Pratt et
 * al. 2006), about the bearing sole's middle b. In a steady walk at velocity V with steps of time T
 * (the swing and its double support), the foot lands at b + V T, out to its own side by the width,
 * with the capture point ahead of it by V T / (exp(w T) - 1) and in from it by the width over
 * exp(w T) + 1 (Englsberger et al. 2011, "Bipedal walking control based on Capture Point
 * dynamics", IROS): that is where the stance is asked to bring the capture point by the landing
 * (`SwingGoal.capture`), and where the double support hands it over (`SwingGoal.handover`).
 *
 * Under way, each control step re-aims the landing (`SwingGoal.follows`): the capture point,
 * measured, run about the bearing sole's middle for the swing's time left, less that offset. Where that landing is past the longest step, the swing is shortened to the time
 * at which the capture point is still within reach (Khadiv et al. 2016, "Step timing adjustment: a
 * step toward generating robust gaits", Humanoids), and the foot lands no further than the longest
 * step in any case. A walk starts with a step that shifts the weight first, and ends with steps
 * that bring the capture point between the feet, the feet as far apart as the body stood.
 */
export function stride(body: Body, settings: StrideSettings = STRIDE): Locomotion {
  if (!validStride(settings)) throw new Error("a stride needs every setting finite and positive, its double support not negative");
  const envelope = body.envelope ? strideEnvelope(body.built.spec) : null;
  const legs = locomotion(envelope, settings.turn);
  const [foot] = footStatesOf(body.built), leg = foot!.lengths[0] + foot!.lengths[1], clear = foot!.width;
  const reach = settings.longest * leg, g = -body.built.physics.gravity[1];
  // How far behind the hip a straight leg reaches, m: at the hip's extension, the lesser end of the
  // range of its freedom about the axis across the body.
  const flexion = foot!.chain[0]!.dofs.reduce((a, d) => Math.abs(d.spec.axis.value[0]) > Math.abs(a.spec.axis.value[0]) ? d : a);
  const behind = leg * sin(Math.min(Math.abs(flexion.spec.min.value), Math.abs(flexion.spec.max.value)));
  const memory: StrideMemory = { step: null, lifted: false, swung: 0, last: null, pace: [0, 0], width: null };
  const state = { legs: legs.state, stride: memory };
  /** A step's swing and its double support, s, walking at `walk` (world, m/s) facing `heading`: a person's forward at that pace, or the settings'. */
  const timing = (walk: readonly [number, number], heading: number): readonly [number, number] => {
    const pace = hypot(walk[0], walk[1]);
    if (!settings.paced || pace === 0) return [settings.swing, settings.transfer];
    // Forward along the heading is (sin, cos).
    const ahead = Math.max((walk[0] * sin(heading) + walk[1] * cos(heading)) / pace, 0), fixed = settings.swing + settings.transfer;
    const whole = fixed + (1 / personStep(pace).rate - fixed) * ahead, share = settings.swing / fixed;
    return [whole * share, whole * (1 - share)];
  };
  /** The pendulum's rate, 1/s: of the height the stance holds the centre of mass at over its soles. */
  const omega = (view: BodyView): number => Math.sqrt(g / Math.max(view.stance.plan.y, HEIGHT_FLOOR));
  const forget = (): void => {
    memory.step = null;
    memory.lifted = false;
    memory.swung = 0;
    memory.last = null;
    memory.pace[0] = 0;
    memory.pace[1] = 0;
  };

  /**
   * The step of `side`, the other foot bearing, facing the goal's heading and walking at `walk`
   * (world), as the body is in `view`: the first of a walk, which shifts the weight first, or a
   * steady one, after its double support.
   */
  const plan = (view: BodyView, goal: StanceGoal, side: Side, walk: readonly [number, number], first: boolean): SwingGoal => {
    const s = view.stance, b = s.soles[side === "left" ? "right" : "left"], sign = side === "right" ? 1 : -1;
    const rx = cos(goal.heading), rz = -sin(goal.heading), w = omega(view), [swing, transfer] = timing(walk, goal.heading);
    const T = first ? swing : swing + transfer, grow = exp(w * T);
    const moving = walk[0] !== 0 || walk[1] !== 0;
    const width = Math.max(settings.width, clear + PASS + Math.abs(walk[0] * rx + walk[1] * rz) * T);
    const to = moving ? within(view, T, b.x, b.z, b.x + walk[0] * T + sign * width * rx, b.z + walk[1] * T + sign * width * rz, sign, rx, rz)
      : halt(view, goal, sign, T);
    const capture: [number, number] = moving ? [to[0] + walk[0] * T / (grow - 1) - sign * width * rx / (grow + 1),
      to[1] + walk[1] * T / (grow - 1) - sign * width * rz / (grow + 1)] : [(b.x + to[0]) / 2, (b.z + to[1]) / 2];
    const extra = { ...settings.lands ? { lands: true } : {}, ...settings.push ? { push: settings.push } : {}, ...settings.ramp ? { ramp: settings.ramp } : {},
      ...settings.launch ? { launch: { share: settings.launch, lead: settings.lead ?? 0 } } : {}, ...settings.momentum ? { momentum: true } : {},
      ...settings.lever ? { lever: settings.lever } : {} };
    if (first) return { foot: side, to, seconds: swing, lift: settings.lift, shift: true, capture, settle: settings.settle, ...extra };
    const E = exp(-w * swing);
    return { foot: side, to, seconds: swing, lift: settings.lift, transfer, capture, settle: settings.settle,
      handover: [b.x + E * (capture[0] - b.x), b.z + E * (capture[1] - b.z)], ...extra };
  };

  /**
   * The last step's landing, of the foot on side `sign` (1 the right), the capture point run about
   * the stance's pivot for `t`: where the soles' middles have it halfway between them, the feet at
   * least as far apart across the heading as the body stood.
   */
  const halt = (view: BodyView, goal: StanceGoal, sign: number, t: number): [number, number] => {
    const s = view.stance, b = s.soles[sign > 0 ? "left" : "right"], w = omega(view), k = exp(w * t);
    const rx = cos(goal.heading), rz = -sin(goal.heading);
    const x = b.x + (s.centre.x + s.velocity.x / w - b.x) * k, z = b.z + (s.centre.z + s.velocity.z / w - b.z) * k;
    // Twice the capture point's way from the bearing sole, out at least the width the body stood at.
    const dx = 2 * (x - b.x), dz = 2 * (z - b.z), out = sign * (dx * rx + dz * rz), more = Math.max((memory.width ?? settings.width) - out, 0);
    return within(view, t, b.x, b.z, b.x + dx + sign * more * rx, b.z + dz + sign * more * rz, sign, rx, rz);
  };

  /**
   * A landing at (x, z), `t` from now, from a bearing sole's middle at (bx, bz): no further than the
   * longest step, no further behind the centre of mass as it will be then (run on at its velocity)
   * than a straight leg reaches behind the hip, and a sole's width and `PASS` out to its own side.
   */
  const within = (view: BodyView, t: number, bx: number, bz: number, x: number, z: number, sign: number, rx: number, rz: number): [number, number] => {
    const far = hypot(x - bx, z - bz);
    if (far > reach) {
      x = bx + (x - bx) * reach / far;
      z = bz + (z - bz) * reach / far;
    }
    // Forward along the heading is (-rz, rx).
    const s = view.stance, back = -((x - s.centre.x - s.velocity.x * t) * -rz + (z - s.centre.z - s.velocity.z * t) * rx);
    if (back > behind) {
      x += (back - behind) * -rz;
      z += (back - behind) * rx;
    }
    const out = sign * ((x - bx) * rx + (z - bz) * rz);
    if (out < clear + PASS) {
      x += sign * (clear + PASS - out) * rx;
      z += sign * (clear + PASS - out) * rz;
    }
    return [x, z];
  };

  /**
   * The step under way re-aimed: where the measured capture point, run about the bearing sole's
   * middle for the swing's time left, says the foot lands, sooner if that is past the longest step
   * (but no sooner than `SOONEST` of the swing). The capture point is asked to its steady place
   * from the landing chosen: where that landing is clipped, the stance's pivot makes up the rest.
   */
  const reaim = (view: BodyView, goal: StanceGoal, step: SwingGoal, walk: readonly [number, number]): SwingGoal => {
    const s = view.stance, b = s.soles[step.foot === "left" ? "right" : "left"], sign = step.foot === "right" ? 1 : -1;
    const rx = cos(goal.heading), rz = -sin(goal.heading), w = omega(view), [swing, transfer] = timing(walk, goal.heading);
    const T = swing + transfer, grow = exp(w * T);
    if (walk[0] === 0 && walk[1] === 0) {
      const t = Math.max(step.seconds - memory.swung, 0), to = halt(view, goal, sign, t);
      return { ...step, to, capture: [(b.x + to[0]) / 2, (b.z + to[1]) / 2], follows: true };
    }
    const width = Math.max(settings.width, clear + PASS + Math.abs(walk[0] * rx + walk[1] * rz) * T);
    // The capture point's offset from the landing foot as a steady walk lands.
    const nx = walk[0] * T / (grow - 1) - sign * width * rx / (grow + 1), nz = walk[1] * T / (grow - 1) - sign * width * rz / (grow + 1);
    const px = b.x, pz = b.z, xi = s.centre.x + s.velocity.x / w - px, zi = s.centre.z + s.velocity.z / w - pz;
    const landing = (t: number): [number, number] => { const k = exp(w * t); return [px + xi * k - nx, pz + zi * k - nz]; };
    const left = Math.max(step.seconds - memory.swung, 0), least = Math.min(Math.max(SOONEST * swing - memory.swung, 0), left);
    let t = left;
    const off = (time: number): number => { const [x, z] = landing(time); return hypot(x - b.x, z - b.z); };
    if (settings.lengthen) {
      // A steady step's way along the walk, and the landing's: the swing runs on, by bisection
      // within what it may lengthen to, until the landing is as far along as the steady step.
      const pace = hypot(walk[0], walk[1]), ux = walk[0] / pace, uz = walk[1] / pace;
      const along = (time: number): number => { const [x, z] = landing(time); return (x - b.x) * ux + (z - b.z) * uz; };
      const natural = Math.max(swing - memory.swung, 0), most = Math.max((1 + settings.lengthen) * swing - memory.swung, 0), steady = pace * T;
      if (along(natural) < steady) {
        let lo = natural, hi = most;
        if (along(hi) < steady) lo = hi;
        else for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (along(mid) < steady) lo = mid; else hi = mid; }
        t = lo;
      } else t = natural;
    }
    if (off(t) > reach) {
      // The time at which the landing is the longest step away, by bisection; a numeric setting, 16 halvings.
      let lo = least, hi = t;
      for (let i = 0; i < 16; i++) { const mid = (lo + hi) / 2; if (off(mid) > reach) hi = mid; else lo = mid; }
      t = lo;
    }
    const [x, z] = landing(t), to = within(view, t, b.x, b.z, x, z, sign, rx, rz);
    // Ahead of the steady walk's by the drive on the velocity's shortfall of the pace.
    const drive = settings.drive ?? 0, ax = drive * (walk[0] - s.velocity.x), az = drive * (walk[1] - s.velocity.z);
    return { ...step, to, seconds: memory.swung + t, capture: [to[0] + nx + ax, to[1] + nz + az], follows: true };
  };

  const progress = new Vector3();
  /** Each arm's posture swinging: its shoulder's flexion the swing's for the other side's sole's lead. */
  const swungArms = (view: BodyView): Pose => {
    const s = view.stance, h = legs.heading, fx = sin(h), fz = cos(h), gain = settings.arms!, step = memory.step;
    const eased = (t: number): number => swingProgressToRef(t, step?.ramp, progress).x;
    const lead = (side: Side): number => {
      let x = s.soles[side].x, z = s.soles[side].z;
      if (step && step.foot === side && s.phase === "swing") {
        const from = eased(Math.min(memory.swung / step.seconds, 1)), to = eased(Math.min((memory.swung + ARM_LEAD) / step.seconds, 1));
        const k = from < 1 ? (to - from) / (1 - from) : 0;
        x += (step.to[0] - x) * k;
        z += (step.to[1] - z) * k;
      }
      return (x - s.centre.x - s.velocity.x * ARM_LEAD) * fx + (z - s.centre.z - s.velocity.z * ARM_LEAD) * fz;
    };
    const flexion = (side: Side): number => Math.min(ARM_REACH, Math.max(-ARM_REACH, gain * lead(side === "left" ? "right" : "left")));
    return {
      "shoulder.left flexion": flexion("left"), "shoulder.left abduction": GUARD["shoulder.left abduction"]!, "elbow.left flexion": GUARD["elbow.left flexion"]!,
      "shoulder.right flexion": flexion("right"), "shoulder.right abduction": GUARD["shoulder.right abduction"]!, "elbow.right flexion": GUARD["elbow.right flexion"]!,
    };
  };

  return {
    state, envelope,
    ...(settings.arms ? { arms: swungArms } : {}),
    get heading() { return legs.heading; },
    get pace() { return legs.pace; },
    get reference() { return legs.reference; },
    get placed() { return legs.placed; },
    resume(view) {
      forget();
      legs.resume(view);
    },
    place(view, footing, lower) {
      forget();
      return legs.place(view, footing, lower);
    },
    goal(view, walk, face, dt, lower) {
      const base = legs.goal(view, walk, face, dt, lower);
      if (!base) return null;
      const s = view.stance;
      memory.width ??= hypot(s.soles.left.x - s.soles.right.x, s.soles.left.z - s.soles.right.z);
      // Squaring the feet after a resume: the locomotion skill's step.
      if (base.swing) { forget(); return base; }
      // The pace toward the one asked.
      const asked = base.walk ?? [0, 0], pace = memory.pace, dx = asked[0] - pace[0], dz = asked[1] - pace[1];
      const most = settings.accel * dt, d = hypot(dx, dz), k = d > most ? most / d : 1;
      pace[0] += dx * k;
      pace[1] += dz * k;
      const stand: StanceGoal = { ...base, walk: null };
      // A step the stance takes of itself, to catch a push, ends the one under way; the walk goes on from its foot.
      if (s.own) {
        if (memory.step) { memory.step = null; memory.lifted = false; }
        memory.last = s.own.foot;
        return stand;
      }
      if (memory.step) {
        if (s.phase === "swing") {
          memory.lifted = true;
          memory.swung += dt;
          const aimed = reaim(view, base, memory.step, pace);
          if (finite(aimed)) memory.step = aimed;
          return { ...stand, swing: memory.step };
        }
        if (s.phase !== "stand" || !memory.lifted) return { ...stand, swing: memory.step };
        // Landed.
        memory.last = memory.step.foot;
        memory.step = null;
        memory.lifted = false;
        memory.swung = 0;
      }
      const moving = pace[0] !== 0 || pace[1] !== 0;
      if (!moving) {
        if (memory.last === null) return stand;
        const w = omega(view), l = s.soles.left, r = s.soles.right;
        if (offSegment(s.centre.x + s.velocity.x / w, s.centre.z + s.velocity.z / w, l.x, l.z, r.x, r.z) < STILL) { memory.last = null; return stand; }
      }
      // Starting, the foot on the side the walk goes steps first (the right, going straight).
      const rx = cos(base.heading), rz = -sin(base.heading);
      const side: Side = memory.last ? (memory.last === "left" ? "right" : "left") : pace[0] * rx + pace[1] * rz < 0 ? "left" : "right";
      const planned = plan(view, base, side, pace, memory.last === null);
      if (!finite(planned)) return stand;
      memory.step = planned;
      return { ...stand, swing: memory.step };
    },
  };
}
