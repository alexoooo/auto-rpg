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
import { bearingOf, landingHeading, withinSupport, type FootState } from "./support.ts";
import { sin, cos, exp, hypot } from "../math/real.ts";
import type { Side } from "../spec/body.ts";

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
 * outside the region both soles hold (drawn in by `inset`), or null if it is not. The capture point
 * xi = c + v / w (w = sqrt(g / height)), the body falling about the bearing sole's nearest point p,
 * runs to p + (xi - p) exp(w T) by the swing's end T (Kajita et al. 2001); the foot lands past that
 * by `tuning.reach` of its distance from the bearing sole's middle, and at least a sole's width out
 * from the bearing foot. The foot nearer the capture point bears the body: the far one would fling
 * it across.
 *
 * Pushed sideways past the nearer foot, the far foot can only step in beside it, and stepping in
 * again and again the body falls off that foot's outer edge. So once the far foot has stepped in
 * (its step would move it less than a sole's width), the nearer foot steps out instead, no further
 * from the far sole than `longest` of the leg: the sideways catch people make (Maki and McIlroy
 * 1997). Not before, since a step out whenever within reach would replace the far foot's short
 * steps, which hold more.
 */
function recoveryStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, tuning: RecoveryTuning, longest: number, inset: number): SwingGoal | null {
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  // The height's floor, 1 mm, is a numeric setting: a centre at its feet has no pendulum.
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  const [hx, hz] = withinSupport(feet, xi, zi, inset);
  if (hypot(xi - hx, zi - hz) <= tuning.margin) return null;
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

/** How far the capture point of a body at `centre` moving at `velocity` is outside the region `feet`'s soles hold, m. */
function outside(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, inset: number): number {
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  // The height's floor, 1 mm, is a numeric setting.
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  const [hx, hz] = withinSupport(feet, xi, zi, inset);
  return hypot(xi - hx, zi - hz);
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
 * The width is the gait's, or a sole's width plus the walk's distance across the heading over a
 * swing if that is more; the step is no further from the bearing sole than `longest` of the leg,
 * and at least a sole's width out to its own side. Walking nowhere, the steps stop a walk under
 * way. `under` re-aims a step under way: its foot, the pivot the body falls about, and the swing's
 * time left.
 */
function walkStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, walk: readonly [number, number], heading: number,
  tuning: GaitTuning, last: Side | null, under?: { readonly foot: Side; readonly pivot: Vector3; readonly remaining: number }, inset = SUPPORT_INSET): SwingGoal {
  const side: Side = under?.foot ?? (last ? (last === "left" ? "right" : "left") : walk[0] * cos(heading) - walk[1] * sin(heading) < 0 ? "left" : "right");
  const foot = feet.find((f) => f.side === side)!, bearer = feet.find((f) => f !== foot)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  // The pelvis's right across the ground at the heading the step lands facing: +x at heading 0.
  const facing = landingHeading(bearer, heading), rx = cos(facing), rz = -sin(facing);
  // The height's floor, 1 mm, is a numeric setting.
  const T = tuning.seconds, w = Math.sqrt(g / Math.max(centre.y - b.y, 1e-3)), grow = exp(w * T);
  const clear = foot.width, W = Math.max(tuning.width, clear + Math.abs(walk[0] * rx + walk[1] * rz) * T);
  // Under way, the capture point runs from the pivot the body falls about for what is left of the swing.
  const run = under ? exp(w * Math.max(under.remaining, 0)) : grow, xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  // Ahead of the new foot by the walk's distance over a swing over exp(w T) - 1, and in from it by
  // the width over exp(w T) + 1: along the walk each step goes the same way, across it they alternate.
  const nx = walk[0] * T / (grow - 1) - sign * W * rx / (grow + 1), nz = walk[1] * T / (grow - 1) - sign * W * rz / (grow + 1);
  // The steady landing.
  const sx = b.x + walk[0] * T + sign * W * rx, sz = b.z + walk[1] * T + sign * W * rz;
  let px = under ? under.pivot.x : b.x, pz = under ? under.pivot.z : b.z;
  // (At the swing's end the capture point is where it is, wherever the pivot; how near the end, 1e-6
  // of the run, is a numeric setting.)
  if (run > 1 + 1e-6) [px, pz] = withinSupport([bearingOf(bearer)], (sx + nx - xi * run) / (1 - run), (sz + nz - zi * run) / (1 - run), inset);
  const ex = px + (xi - px) * run, ez = pz + (zi - pz) * run;
  // Starting from a stand, the weight is shifted first and the foot lands where a steady walk puts it.
  const steady = last || under;
  let tx = steady ? ex - nx : sx, tz = steady ? ez - nz : sz;
  const longest = tuning.longest * (foot.lengths[0] + foot.lengths[1]), far = hypot(tx - b.x, tz - b.z);
  if (far > longest) {
    tx = b.x + (tx - b.x) * longest / far;
    tz = b.z + (tz - b.z) * longest / far;
  }
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
  tuning: GaitTuning, last: Side | null, under?: { readonly foot: Side; readonly pivot: Vector3; readonly remaining: number }, inset = SUPPORT_INSET): SwingGoal {
  const side: Side = under?.foot ?? (last === "left" ? "right" : "left");
  const foot = feet.find((f) => f.side === side)!, bearer = feet.find((f) => f !== foot)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  const facing = landingHeading(bearer, heading), rx = cos(facing), rz = -sin(facing);
  // The height's floor, 1 mm, is a numeric setting.
  const Tss = tuning.seconds, Tds = tuning.transfer!, T = Tss + Tds, w = Math.sqrt(g / Math.max(centre.y - b.y, 1e-3));
  const clear = foot.width, W = Math.max(tuning.width, clear + Math.abs(walk[0] * rx + walk[1] * rz) * T);
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
    const [cx, cz] = reference(tx, tz), run = exp(w * Math.max(under.remaining, 0));
    const xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
    let px = under.pivot.x, pz = under.pivot.z;
    // At the swing's end the pivot is kept: how near the end, 1e-6 of the run, is a numeric setting.
    if (run > 1 + 1e-6) [px, pz] = withinSupport([bearingOf(bearer)], (cx - xi * run) / (1 - run), (cz - zi * run) / (1 - run), inset);
    const ex = px + (xi - px) * run, ez = pz + (zi - pz) * run;
    tx += (ex - cx) / (F + G);
    tz += (ez - cz) / (F + G);
  }
  const longest = tuning.longest * (foot.lengths[0] + foot.lengths[1]), far = hypot(tx - b.x, tz - b.z);
  if (far > longest) {
    tx = b.x + (tx - b.x) * longest / far;
    tz = b.z + (tz - b.z) * longest / far;
  }
  const out = sign * ((tx - b.x) * rx + (tz - b.z) * rz);
  if (out < clear) {
    tx += sign * (clear - out) * rx;
    tz += sign * (clear - out) * rz;
  }
  const capture = reference(tx, tz);
  return { foot: side, to: [tx, tz], seconds: Tss, lift: tuning.lift, transfer: Tds,
    capture, handover: [b.x + E * (capture[0] - b.x), b.z + E * (capture[1] - b.z)] };
}

/** The walk's pace toward `walk` (none: toward standing) at the gait's acceleration. */
export function paceToward(s: Stance, walk: readonly [number, number] | null | undefined, dt: number): void {
  const { pace } = s.state, { gait } = s.tuning;
  const wx = walk?.[0] || 0, wz = walk?.[1] || 0, dx = wx - pace[0], dz = wz - pace[1];
  const most = gait.accel * dt, d = hypot(dx, dz), k = d > most ? most / d : 1;
  pace[0] += dx * k;
  pace[1] += dz * k;
}

/**
 * The step a stance on both feet takes of itself (`reading.own`), facing `heading`. Standing, it
 * steps to walk, each foot in turn; to settle a walk's end at its own stance; or, walking nowhere,
 * once its capture point has left what its soles hold, to catch it. A walk's step under way is
 * re-aimed each step. Each step runs to its landing unless the goal asks for one of its own.
 */
export function ownStep(s: Stance, heading: number): void {
  const { feet, rest, state } = s, { reading, pace, step } = state, { recovery, gait, inset } = s.tuning;
  if (!reading.own && reading.phase === "stand") {
    const walk = pace[0] !== 0 || pace[1] !== 0 ? pace : null;
    if (walk || (state.stride && recovery && outside(feet, reading.centre, reading.velocity, gravityOf(s), inset) > recovery.margin)) {
      // Walking, or stopping a walk still under way: its steps keep their alternation.
      state.striding = pace;
      reading.own = gait.transfer && state.stride
        ? transferStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, state.stride, undefined, inset)
        : walkStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, state.stride, undefined, inset);
      reading.strides += 1;
    } else if (state.stride && across(feet, heading) < rest) {
      // A walk has ended on the gait's width, narrower than the body's own stance: one step
      // puts the feet back at the width it was built standing at.
      state.striding = null;
      reading.own = settleStep(feet, state.stride, heading, rest, gait);
    } else if (recovery) {
      state.striding = null;
      reading.own = recoveryStep(feet, reading.centre, reading.velocity, gravityOf(s), recovery, gait.longest, inset);
      if (reading.own) reading.recoveries += 1;
    }
    state.stride = state.striding && reading.own ? reading.own.foot : null;
  } else if (reading.own && state.striding && reading.phase === "swing" && step.lifted && step.swing === reading.own) {
    // A walk's step under way lands where the body's capture point, measured, says it must: the
    // body lags its plan, and a landing fixed at lift carries the lag into the next step.
    const under = { foot: reading.own.foot, pivot: reading.place, remaining: reading.own.seconds - step.time };
    // (`state.striding` is the pace, read as it is now.)
    if (reading.own.transfer) {
      const aimed = transferStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, null, under, inset);
      reading.own = step.swing = { ...reading.own, to: aimed.to, capture: aimed.capture! };
    } else {
      const aimed = walkStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, null, under, inset);
      reading.own = step.swing = { ...reading.own, to: aimed.to };
    }
  }
}
