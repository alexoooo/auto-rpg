/**
 * The steps a stance takes of itself: a walk's (`walkStep`, `transferStep`), the one that ends a
 * walk (`settleStep`) and the one that catches a push (`recoveryStep`), each placed from the
 * body's capture point; and which of them a stance takes, and when (`ownStep`), at the pace its
 * walk has reached (`paceToward`).
 */
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SwingGoal } from "./stance.ts";
import { gravityOf, type Stance } from "./stance-state.ts";
import { SUPPORT_INSET, type GaitTuning, type RecoveryTuning } from "./stance-tuning.ts";
import { bearingOf, landingHeading, legLength, withinSupport, type FootState } from "./support.ts";
import { swingSeconds, withinReach } from "./swing-leg.ts";
import { sin, cos, cosh, exp, hypot, sinh } from "../math/real.ts";
import type { Side } from "../spec/body.ts";

/**
 * A walk's step under way, for its re-aim: its foot, the pivot the body falls about, the swing's
 * time left, and the swing leg's reaction folded over it (`SwingShift.capture`).
 */
interface Underway { readonly foot: Side; readonly pivot: Vector3; readonly remaining: number; readonly shift: readonly [number, number] }

/** What planning a step tells besides the step: the share of its landing the leg reaches (`stepShare`), 1 for all of it. */
interface StepPlan { share: number }

/** The soles' middles' distance apart across `heading` (rad about up, 0 facing +z), m. */
function across(feet: readonly FootState[], heading: number): number {
  const [a, b] = feet;
  return Math.abs((b!.middle.x - a!.middle.x) * cos(heading) - (b!.middle.z - a!.middle.z) * sin(heading));
}

/**
 * The step that ends a walk at the body's own stance: the foot that did not take the walk's last
 * step (`last`) lands `width` from the other's sole's middle across the heading, beside it, after
 * the weight has shifted off it, as a walk's first step does.
 */
function settleStep(feet: readonly FootState[], last: Side, heading: number, width: number, tuning: GaitTuning): SwingGoal {
  const side: Side = last === "left" ? "right" : "left", bearer = feet.find((f) => f.side === last)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  const facing = landingHeading(bearer, heading), rx = cos(facing), rz = -sin(facing);
  return { foot: side, to: [b.x + sign * width * rx, b.z + sign * width * rz], seconds: tuning.seconds, lift: tuning.lift, shift: true };
}

/**
 * The step that catches a body whose capture point (Pratt et al. 2006) is more than `tuning.margin`
 * and `held` (what its assist holds it through, `assistReach`) outside the region both soles hold
 * (drawn in by `inset`), or null if it is not. The capture point
 * xi = c + v / w (w = sqrt(g / height)), the body falling about the bearing sole's nearest point p,
 * runs to p + (xi - p) exp(w T) by the swing's end T (Kajita et al. 2001); the foot lands past that
 * by `tuning.reach` of its distance from the bearing sole's middle, and at least a sole's width and
 * the swing's clearance out from the bearing foot. The foot nearer the capture point bears the body: the far one would fling
 * it across.
 *
 * Pushed sideways past the nearer foot, the far foot can only step in beside it, and stepping in
 * again and again the body falls off that foot's outer edge. So once the far foot has stepped in
 * (its step would move it less than a sole's width), the nearer foot steps out instead, no further
 * from the far sole than `longest` of the leg: the sideways catch people make (Maki and McIlroy
 * 1997). Not before, since a step out whenever within reach would replace the far foot's short
 * steps, which hold more.
 */
function recoveryStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, tuning: RecoveryTuning, longest: number, inset: number,
  held: number): SwingGoal | null {
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  // The height's floor, 1 mm, is a numeric setting: a centre at its feet has no pendulum.
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  const [hx, hz] = withinSupport(feet, xi, zi, inset);
  if (hypot(xi - hx, zi - hz) <= tuning.margin + held) return null;
  const grow = exp(w * tuning.seconds);
  // Where a step of the foot other than `bearer` lands, the capture point run about the bearing sole.
  const landing = (bearer: FootState): [number, number] => {
    const b = bearer.middle, [px, pz] = withinSupport([bearer], xi, zi, inset);
    const tx = px + (xi - px) * grow, tz = pz + (zi - pz) * grow;
    return [tx + (tx - b.x) * tuning.reach, tz + (tz - b.z) * tuning.reach];
  };
  // The foot nearer the capture point bears the body; the other steps.
  const off = (foot: FootState) => { const [qx, qz] = withinSupport([foot], xi, zi, inset); return hypot(xi - qx, zi - qz); };
  const near = off(feet[0]!) <= off(feet[1]!) ? feet[0]! : feet[1]!, far = feet.find((other) => other !== near)!, b = near.middle;
  let [tx, tz] = landing(near);
  // Not onto or across the bearing foot: a sole's width out from it, along the line between the soles.
  const ox = far.middle.x - b.x, oz = far.middle.z - b.z, wide = hypot(ox, oz), out = ((tx - b.x) * ox + (tz - b.z) * oz) / wide;
  if (out < far.width) {
    tx += (far.width - out) * ox / wide;
    tz += (far.width - out) * oz / wide;
    // Beyond the nearer foot: it steps out, if the far one can bear the body there.
    let [ux, uz] = landing(far);
    const reach = longest * (near.lengths[0] + near.lengths[1]), long = hypot(ux - far.middle.x, uz - far.middle.z);
    if (hypot(tx - far.middle.x, tz - far.middle.z) < far.width) {
      if (long > reach) {
        ux = far.middle.x + (ux - far.middle.x) * reach / long;
        uz = far.middle.z + (uz - far.middle.z) * reach / long;
      }
      return { foot: near.side, to: [ux, uz], seconds: tuning.seconds, lift: tuning.lift, shift: false };
    }
  }
  return { foot: far.side, to: [tx, tz], seconds: tuning.seconds, lift: tuning.lift, shift: false };
}

/**
 * How far the capture point of a body at `centre` moving at `velocity`, standing on `feet`, is
 * outside the region the soles of `of` (all of `feet` unless asked) hold, m.
 */
function outside(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, inset: number, of = feet): number {
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  // The height's floor, 1 mm, is a numeric setting.
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  const [hx, hz] = withinSupport(of, xi, zi, inset);
  return hypot(xi - hx, zi - hz);
}

/**
 * How far outside what the soles hold a body's capture point may be and its assist hold it there
 * with no step, m: the share `RecoveryTuning.assisted` of what the assist's ceiling (`Assist.most`)
 * holds against the fall of a pendulum of the centre of mass's height h over the soles, a force F
 * at the centre of mass F h / (m g) and a moment M about it M / (m g), each as the pendulum's pivot
 * moved against the fall. None with no assist, or none on: the step is the soles' own.
 */
function assistReach(s: Stance): number {
  const { assist, total, feet } = s, { recovery } = s.tuning, c = s.state.reading.centre;
  if (!assist || !assist.on || !recovery || recovery.assisted <= 0) return 0;
  // The height's floor, 1 mm, is a numeric setting.
  const height = Math.max(c.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2, 1e-3);
  return recovery.assisted * (assist.most.force * height + assist.most.moment) / (total * gravityOf(s));
}

/** A step's swing time, s: the gait's, or longer if the swing hip needs it at the walk's `pace`, m/s (`swingSeconds`). */
function stepSeconds(foot: FootState, pace: number, tuning: GaitTuning): number {
  return Math.max(tuning.seconds, swingSeconds(foot.leg, pace, tuning.transfer ?? 0, tuning.effort));
}

/**
 * The soles' middles' distance apart across the heading in a walk going `across` it, m/s, m: the
 * gait's width, or a sole's width, the swing's clearance and the walk's distance across the heading
 * over `T` if that is more, so that the feet do not cross and the swing clears the bearing foot.
 */
function stepWidth(foot: FootState, across: number, T: number, tuning: GaitTuning): number {
  return Math.max(tuning.width, foot.width + tuning.clearance + across * T);
}

/**
 * The share of a step of (`dx`, `dz`) from the bearing sole's middle that `foot` can take, 1 if all
 * of it: no further than `longest` of the leg, and within `reserve` of its reach (`withinReach`,
 * `GaitTuning.reserve`) from the body's centre at (`cx`, `cz`) from that middle as the foot lands,
 * with its hip `hip` over the landing sole's middle and its knee bent no less than `bend` (null,
 * straight).
 */
function stepShare(foot: FootState, dx: number, dz: number, cx: number, cz: number, rx: number, rz: number, sign: number, tuning: GaitTuning, hip: number, bend: number | null, reserve: number): number {
  const longest = tuning.longest * (foot.lengths[0] + foot.lengths[1]), far = hypot(dx, dz);
  // Within `reserve` of the reach: the step scaled up by it is within the whole, and its share is the step's own.
  return Math.min(far > longest ? longest / far : 1, withinReach(foot.leg, dx / reserve, dz / reserve, cx, cz, rx, rz, sign, hip - foot.ankle, legLength(foot, bend)));
}

/**
 * Where the body's centre comes to as a step under way lands, from the bearing sole's middle `b`:
 * the pendulum about `under`'s pivot from `centre` at `velocity` over the swing's time left; or,
 * with no step under way, midway to the landing (`dx`, `dz`), as a steady walk has it.
 */
function centreAtLanding(b: Vector3, centre: Vector3, velocity: Vector3, w: number, dx: number, dz: number, under: Underway | undefined): [number, number] {
  if (!under) return [dx / 2, dz / 2];
  const t = Math.max(under.remaining, 0), ch = cosh(w * t), sh = sinh(w * t), p = under.pivot;
  return [p.x + (centre.x - p.x) * ch + velocity.x / w * sh - b.x, p.z + (centre.z - p.z) * ch + velocity.z / w * sh - b.z];
}

/**
 * Whether the legs, their hips `hip` over the soles, can take whole (`stepShare`) a walk's steady
 * steps at `v` m/s the way (`ux`, `uz`), unit, facing `heading`: `transferStep`'s, each the pace
 * over the swing's own time (`stepSeconds`) and the transfer, the width (`stepWidth`) across.
 */
function stepsWithin(feet: readonly FootState[], v: number, ux: number, uz: number, heading: number, tuning: GaitTuning, hip: number, bend: number | null): boolean {
  const rx = cos(heading), rz = -sin(heading), Tds = tuning.transfer ?? 0;
  for (let k = 0; k < feet.length; k++) {
    const foot = feet[k]!, sign = foot.side === "right" ? 1 : -1, T = stepSeconds(foot, v, tuning) + Tds;
    const W = stepWidth(foot, v * Math.abs(ux * rx + uz * rz), T, tuning), dx = v * ux * T + sign * W * rx, dz = v * uz * T + sign * W * rz;
    if (stepShare(foot, dx, dz, dx / 2, dz / 2, rx, rz, sign, tuning, hip, bend, tuning.reserve) < 1) return false;
  }
  return true;
}

/** The fastest pace `fastestPace` tries, m/s, and how finely it and `walkHeight` are found: numeric settings. */
const PACE_MOST = 10, PACE_STEP = 0.01, HEIGHT_STEP = 0.001;

/**
 * The fastest walk the legs can step the way (`ux`, `uz`), unit, facing `heading`, with their hips
 * `hip` over the soles, m/s (`stepsWithin`); by bisection.
 */
function fastestPace(feet: readonly FootState[], ux: number, uz: number, heading: number, tuning: GaitTuning, hip: number, bend: number | null): number {
  let low = 0, high = PACE_MOST;
  while (high - low > PACE_STEP) {
    const v = (low + high) / 2;
    if (stepsWithin(feet, v, ux, uz, heading, tuning, hip, bend)) low = v; else high = v;
  }
  return low;
}

/**
 * The highest the hips may stand over the soles, m, from `low` to `high`, for the legs to take a
 * walk's steady steps at `v` m/s the way (`ux`, `uz`), unit, facing `heading` (`stepsWithin`); `low`
 * if they cannot there either. By bisection.
 */
function walkHeight(feet: readonly FootState[], ux: number, uz: number, v: number, heading: number, tuning: GaitTuning, bend: number | null, low: number, high: number): number {
  if (stepsWithin(feet, v, ux, uz, heading, tuning, high, bend)) return high;
  if (!stepsWithin(feet, v, ux, uz, heading, tuning, low, bend)) return low;
  while (high - low > HEIGHT_STEP) {
    const hip = (low + high) / 2;
    if (stepsWithin(feet, v, ux, uz, heading, tuning, hip, bend)) low = hip; else high = hip;
  }
  return low;
}

/**
 * A walk's next step at the velocity `walk`, world (x, z), m/s: the foot other than `last`'s steps,
 * or, starting, the one on the side the walk goes (the right, going straight).
 *
 * The capture point xi = c + v / w, the body falling about a point p of the bearing sole, runs to
 * e = p + (xi - p) exp(w T) by the swing's end T (Kajita et al. 2001). In a steady walk, each step
 * about its sole's middle b, e is ahead of the new foot by the walk's distance over a swing over
 * exp(w T) - 1 and in from it by the width over exp(w T) + 1 (Englsberger et al. 2011). The pivot p
 * is chosen, within what the bearing sole holds (drawn in by `inset`), to bring e to where the
 * steady landing wants it, and the foot lands at e less that offset. A pivot fixed at b would let a
 * landing's miss grow by exp(w T) each step, until the feet cannot reach.
 *
 * The swing's time is the step's own (`stepSeconds`) and the width the walk's (`stepWidth`); the
 * step is what the leg can take (`stepShare`), and at least a sole's width and the swing's clearance
 * out to its own side.
 * Walking nowhere, the steps stop a walk under
 * way. `under` re-aims a step under way: its foot, the pivot the body falls about, and the swing's
 * time left.
 */
function walkStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, walk: readonly [number, number], heading: number,
  tuning: GaitTuning, hip: number, bend: number | null, last: Side | null, under?: Underway, inset = SUPPORT_INSET, plan?: StepPlan): SwingGoal {
  const side: Side = under?.foot ?? (last ? (last === "left" ? "right" : "left") : walk[0] * cos(heading) - walk[1] * sin(heading) < 0 ? "left" : "right");
  const foot = feet.find((f) => f.side === side)!, bearer = feet.find((f) => f !== foot)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  // The pelvis's right across the ground at the heading the step lands facing: +x at heading 0.
  const facing = landingHeading(bearer, heading), rx = cos(facing), rz = -sin(facing);
  // The height's floor, 1 mm, is a numeric setting.
  const T = stepSeconds(foot, hypot(walk[0], walk[1]), tuning), w = Math.sqrt(g / Math.max(centre.y - b.y, 1e-3)), grow = exp(w * T);
  const clear = foot.width + tuning.clearance, W = stepWidth(foot, Math.abs(walk[0] * rx + walk[1] * rz), T, tuning);
  // Under way, the capture point runs from the pivot the body falls about for what is left of the
  // swing; the pivot is chosen while no less than the horizon is left, and held after
  // (`GaitTuning.horizon`, as `planAcross` chooses it).
  const run = under ? exp(w * Math.max(under.remaining, 0)) : grow;
  const xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  // Ahead of the new foot by the walk's distance over a swing over exp(w T) - 1, and in from it by
  // the width over exp(w T) + 1: along the walk each step goes the same way, across it they alternate.
  const nx = walk[0] * T / (grow - 1) - sign * W * rx / (grow + 1), nz = walk[1] * T / (grow - 1) - sign * W * rz / (grow + 1);
  // The steady landing.
  const sx = b.x + walk[0] * T + sign * W * rx, sz = b.z + walk[1] * T + sign * W * rz;
  const shx = under?.shift[0] ?? 0, shz = under?.shift[1] ?? 0;
  const [px, pz] = under && under.remaining < tuning.horizon ? [under.pivot.x, under.pivot.z]
    : withinSupport([bearingOf(bearer)], (sx + nx + shx - xi * run) / (1 - run), (sz + nz + shz - zi * run) / (1 - run), inset);
  const ex = px + (xi - px) * run - shx, ez = pz + (zi - pz) * run - shz;
  // Starting from a stand, the weight is shifted first and the foot lands where a steady walk puts it.
  const steady = last || under;
  let tx = steady ? ex - nx : sx, tz = steady ? ez - nz : sz;
  const [cx0, cz0] = centreAtLanding(b, centre, velocity, w, tx - b.x, tz - b.z, under);
  // A step is planned within the gait's reserve of the reach; under way it is re-aimed within the whole.
  const share = stepShare(foot, tx - b.x, tz - b.z, cx0, cz0, rx, rz, sign, tuning, hip, bend, under ? 1 : tuning.reserve);
  if (plan) plan.share = share;
  tx = b.x + (tx - b.x) * share;
  tz = b.z + (tz - b.z) * share;
  const out = sign * ((tx - b.x) * rx + (tz - b.z) * rz);
  if (out < clear) {
    tx += sign * (clear - out) * rx;
    tz += sign * (clear - out) * rz;
  }
  return { foot: side, to: [tx, tz], seconds: T, lift: tuning.lift, shift: !steady, capture: steady ? [ex, ez] : [tx + nx, tz + nz] };
}


/**
 * How many footsteps past the step under way a walk with a double support plans (`transferStep`):
 * the capture point's reference assumes the body at rest over the last, and each step back shrinks
 * what that assumption moves by exp(-w T), about a quarter at 0.4 s steps; over eight, by 1e-4.
 * A numeric setting: where the series is cut off.
 */
const PREVIEW_STEPS = 8;

/**
 * **A walk's steady step with a double support** (`GaitTuning.transfer`): the foot that trails
 * lifts after both soles have borne the body for the transfer's time, and swings for the gait's.
 * Its landing and the capture point's reference are planned with the steps after it (Englsberger
 * et al. 2015, "Three-dimensional bipedal walking control based on Divergent Component of Motion",
 * IEEE T-RO): the footsteps go along the walk by its distance over a step's whole time and alternate
 * across by the width; the capture point comes to rest over the last of `PREVIEW_STEPS` and is run
 * back from there, on one sole about its middle, on both about a point going from the trailing
 * sole's middle to the leading one's. `capture` is where it is as the foot lands and `handover`
 * where it is as the foot lifts. Under way, the landing moves by what the body's measured capture
 * point, falling about the pivot for the swing's time left, misses the reference by, over the
 * share of the landing the reference moves with.
 */
function transferStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, walk: readonly [number, number], heading: number,
  tuning: GaitTuning, hip: number, bend: number | null, last: Side | null, under?: Underway, inset = SUPPORT_INSET, plan?: StepPlan): SwingGoal {
  const side: Side = under?.foot ?? (last === "left" ? "right" : "left");
  const foot = feet.find((f) => f.side === side)!, bearer = feet.find((f) => f !== foot)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  const facing = landingHeading(bearer, heading), rx = cos(facing), rz = -sin(facing);
  // The height's floor, 1 mm, is a numeric setting.
  const Tss = stepSeconds(foot, hypot(walk[0], walk[1]), tuning), Tds = tuning.transfer!, T = Tss + Tds, w = Math.sqrt(g / Math.max(centre.y - b.y, 1e-3));
  const clear = foot.width + tuning.clearance, W = stepWidth(foot, Math.abs(walk[0] * rx + walk[1] * rz), T, tuning);
  const E = exp(-w * Tss), F = exp(-w * Tds), G = (1 - F) / (w * Tds) - F;
  /** The capture point's reference as the foot lands at (x, z): at the end of the swing, on the bearing sole. */
  const reference = (x: number, z: number): [number, number] => {
    const fx = [x], fz = [z];
    for (let k = 1; k < PREVIEW_STEPS; k++) {
      const across = (k % 2 === 1 ? -sign : sign) * W;
      fx.push(fx[k - 1]! + walk[0] * T + across * rx);
      fz.push(fz[k - 1]! + walk[1] * T + across * rz);
    }
    // At rest over the last footstep; back through each double support and single support.
    let xi = fx[PREVIEW_STEPS - 1]!, zi = fz[PREVIEW_STEPS - 1]!;
    for (let k = PREVIEW_STEPS - 1; k >= 1; k--) {
      const ax = F * xi + fx[k - 1]! * (1 - F) + (fx[k]! - fx[k - 1]!) * G, az = F * zi + fz[k - 1]! * (1 - F) + (fz[k]! - fz[k - 1]!) * G;
      xi = fx[k - 1]! + E * (ax - fx[k - 1]!);
      zi = fz[k - 1]! + E * (az - fz[k - 1]!);
    }
    return [F * xi + b.x * (1 - F) + (x - b.x) * G, F * zi + b.z * (1 - F) + (z - b.z) * G];
  };
  // The steady landing, and the reference there; the reference moves with the landing by F + G.
  let tx = b.x + walk[0] * T + sign * W * rx, tz = b.z + walk[1] * T + sign * W * rz;
  if (under) {
    // The pivot is chosen while no less than the horizon is left, and held after (`GaitTuning.horizon`); the capture point runs from it for what is left.
    const [cx, cz] = reference(tx, tz), run = exp(w * Math.max(under.remaining, 0));
    const xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
    const [shx, shz] = under.shift;
    const [px, pz] = under.remaining < tuning.horizon ? [under.pivot.x, under.pivot.z]
      : withinSupport([bearingOf(bearer)], (cx + shx - xi * run) / (1 - run), (cz + shz - zi * run) / (1 - run), inset);
    const ex = px + (xi - px) * run - shx, ez = pz + (zi - pz) * run - shz;
    tx += (ex - cx) / (F + G);
    tz += (ez - cz) / (F + G);
  }
  const [cx0, cz0] = centreAtLanding(b, centre, velocity, w, tx - b.x, tz - b.z, under);
  // A step is planned within the gait's reserve of the reach; under way it is re-aimed within the whole.
  const share = stepShare(foot, tx - b.x, tz - b.z, cx0, cz0, rx, rz, sign, tuning, hip, bend, under ? 1 : tuning.reserve);
  if (plan) plan.share = share;
  tx = b.x + (tx - b.x) * share;
  tz = b.z + (tz - b.z) * share;
  const out = sign * ((tx - b.x) * rx + (tz - b.z) * rz);
  if (out < clear) {
    tx += sign * (clear - out) * rx;
    tz += sign * (clear - out) * rz;
  }
  const capture = reference(tx, tz);
  return { foot: side, to: [tx, tz], seconds: Tss, lift: tuning.lift, transfer: Tds,
    capture, handover: [b.x + E * (capture[0] - b.x), b.z + E * (capture[1] - b.z)] };
}

/**
 * The pace a stance on both feet plans its next step at, world (x, z), m/s: the walk's `pace`, if
 * the step planned at it from the body as it is lands within the leg's reach (`stepShare`); else
 * the pace nearest it, between it and the body's own (`velocity` over the ground), whose step
 * does. A step that slows the walk lands further out than a steady step, on the capture point to
 * stop it, and the leg reaches only so far: planned past that, the step lands short, the body
 * falls on past its plan by exp(w T) a step and the steps after cannot catch it. So a walk slows
 * only as fast as its steps can, and goes on from the pace planned. By bisection, to `PACE_STEP`.
 */
function reachablePace(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, pace: readonly [number, number], heading: number,
  tuning: GaitTuning, hip: number, bend: number | null, last: Side | null, inset: number): [number, number] {
  const plan: StepPlan = { share: 1 };
  const reaches = (x: number, z: number): boolean => {
    if (tuning.transfer && last) transferStep(feet, centre, velocity, g, [x, z], heading, tuning, hip, bend, last, undefined, inset, plan);
    else walkStep(feet, centre, velocity, g, [x, z], heading, tuning, hip, bend, last, undefined, inset, plan);
    return plan.share >= 1;
  };
  if (reaches(pace[0], pace[1])) return [pace[0], pace[1]];
  const dx = velocity.x - pace[0], dz = velocity.z - pace[1], d = hypot(dx, dz);
  let low = 0, high = 1;
  while ((high - low) * d > PACE_STEP) {
    const k = (low + high) / 2;
    if (reaches(pace[0] + dx * k, pace[1] + dz * k)) high = k; else low = k;
  }
  return [pace[0] + dx * high, pace[1] + dz * high];
}

/**
 * The walk's pace toward `walk` (none: toward standing) at the gait's acceleration, and no faster
 * than the legs can step its way facing `heading` with their hips lowered by the gait's `crouch`
 * from `hip`, the goal's height over the soles (`fastestPace`): a pace asked past that is taken at
 * that, and the steps planned are steps the legs can take. The hips are lowered no further than the
 * steps at the pace need (`walkHeight`, into `StanceState.crouch`): a longer step lands further from
 * a lower hip, and a walk crouches for its pace, not for the pace asked.
 */
export function paceToward(s: Stance, walk: readonly [number, number] | null | undefined, heading: number, hip: number, dt: number): void {
  const { state } = s, { pace } = state, { gait, bend } = s.tuning;
  const wx = walk?.[0] || 0, wz = walk?.[1] || 0, dx = wx - pace[0], dz = wz - pace[1];
  const most = gait.accel * dt, d = hypot(dx, dz), k = d > most ? most / d : 1;
  pace[0] += dx * k;
  pace[1] += dz * k;
  const p = hypot(pace[0], pace[1]);
  state.crouch = 0;
  if (p > 0) {
    const ux = pace[0] / p, uz = pace[1] / p, low = hip - gait.crouch;
    const fastest = fastestPace(s.feet, ux, uz, heading, gait, low, bend);
    if (p > fastest) {
      pace[0] *= fastest / p;
      pace[1] *= fastest / p;
    }
    state.crouch = hip - walkHeight(s.feet, ux, uz, Math.min(p, fastest), heading, gait, bend, low, hip);
  }
}

/**
 * The catch of a body pushed during a weight shift (`SwingGoal.shift`), its own step's or the
 * goal's, if it is pushed: the step it takes instead (`recoveryStep`), into `reading.own`, and
 * whether it took one. A shift carries the capture point toward the bearing sole, past what both
 * soles hold if need be; one that has left them and goes on away from that sole would not end,
 * and the body falls with both feet down. A walk of the stance's own goes on from the catch, the
 * other foot next.
 */
export function catchStep(s: Stance): boolean {
  const { feet, state } = s, { reading, step } = state, { recovery, gait, inset } = s.tuning, swing = step.swing;
  if (!recovery || reading.phase !== "shift" || !swing || swing.transfer) return false;
  const g = gravityOf(s), bearer = feet.find((f) => f.side !== swing.foot)!, off = outside(feet, reading.centre, reading.velocity, g, inset, [bearer]);
  const away = off > step.off;
  step.off = off;
  const held = assistReach(s);
  if (!away || outside(feet, reading.centre, reading.velocity, g, inset) <= recovery.margin + held) return false;
  reading.own = recoveryStep(feet, reading.centre, reading.velocity, g, recovery, gait.longest, inset, held)!;
  state.stride = state.striding ? reading.own.foot : null;
  reading.recoveries += 1;
  return true;
}

/**
 * The step a stance on both feet takes of itself (`reading.own`), facing `heading`, its hips `hip`
 * over the soles by the goal's height, less the walk's crouch (`paceToward`). Standing, it steps to
 * walk, each foot in turn; to settle a walk's end at its own stance; or, walking nowhere, once its
 * capture point has left what its soles hold, to catch it. A walk's step under way is re-aimed each
 * step. Each step runs to its landing unless the goal asks for one of its own.
 */
export function ownStep(s: Stance, heading: number, hip: number): void {
  const { feet, rest, state } = s, { reading, pace, step } = state, { recovery, gait, inset, bend } = s.tuning, hips = hip - state.crouch;
  if (!reading.own && reading.phase === "stand") {
    const walk = pace[0] !== 0 || pace[1] !== 0 ? pace : null, held = assistReach(s);
    if (walk || (state.stride && recovery && outside(feet, reading.centre, reading.velocity, gravityOf(s), inset) > recovery.margin + held)) {
      // Walking, or stopping a walk still under way: its steps keep their alternation, each at the
      // pace the leg can take it (`reachablePace`), which the walk's pace goes on from.
      const [px, pz] = reachablePace(feet, reading.centre, reading.velocity, gravityOf(s), pace, heading, gait, hips, bend, state.stride, inset);
      pace[0] = px;
      pace[1] = pz;
      state.striding = [px, pz];
      reading.own = gait.transfer && state.stride
        ? transferStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, bend, state.stride, undefined, inset)
        : walkStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, bend, state.stride, undefined, inset);
      reading.strides += 1;
    } else if (state.stride && across(feet, heading) < rest) {
      // A walk has ended on the gait's width, narrower than the body's own stance: one step
      // puts the feet back at the width it was built standing at.
      state.striding = null;
      reading.own = settleStep(feet, state.stride, heading, rest, gait);
    } else if (recovery) {
      state.striding = null;
      reading.own = recoveryStep(feet, reading.centre, reading.velocity, gravityOf(s), recovery, gait.longest, inset, held);
      if (reading.own) reading.recoveries += 1;
    }
    state.stride = state.striding && reading.own ? reading.own.foot : null;
  } else if (reading.own && state.striding && reading.phase === "swing" && step.lifted && step.swing === reading.own) {
    // A walk's step under way lands where the body's capture point, measured, says it must: the
    // body lags its plan, and a landing fixed at lift carries the lag into the next step.
    const under: Underway = { foot: reading.own.foot, pivot: reading.place, remaining: reading.own.seconds - step.time, shift: step.shift.capture };
    // (`state.striding` is the pace the step was planned at.)
    if (reading.own.transfer) {
      const aimed = transferStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, bend, null, under, inset);
      reading.own = step.swing = { ...reading.own, to: aimed.to, capture: aimed.capture! };
    } else {
      const aimed = walkStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, bend, null, under, inset);
      reading.own = step.swing = { ...reading.own, to: aimed.to };
    }
  }
}
