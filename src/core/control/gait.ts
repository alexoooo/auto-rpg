/**
 * The steps a stance takes of itself: a walk's (`walkStep`, `transferStep`), the one that ends a
 * walk (`settleStep`) and the one that catches a push (`recoveryStep`), each placed from the
 * body's capture point; and which of them a stance takes, and when (`ownStep`), at the pace its
 * walk has reached (`paceToward`).
 */
import type { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { SwingGoal } from "./stance.ts";
import { gravityOf, type Stance } from "./stance-state.ts";
import type { GaitTuning, RecoveryTuning } from "./stance-tuning.ts";
import { DOWN, bearingOf, clearAcross, clearAlong, heldBy, landingHeading, legLength, pivotWithin, soleHeight, withinSupport, type FootState } from "./support.ts";
import { swingSeconds, swingWaySeconds, withinReach, reachableSole, landingLean } from "./swing-leg.ts";
import { sin, cos, cosh, exp, hypot, sinh } from "../math/real.ts";

/** The feet of a stance that hold it (`holding`): a scratch, read before the next call. */
const HOLDING: FootState[] = [];
import type { Side } from "../spec/body.ts";

/**
 * A walk's step under way, for its re-aim: its foot, the pivot the body falls about, the swing's
 * time left, and the swing leg's reaction folded over it (`SwingShift.capture`).
 */
interface Underway { readonly foot: Side; readonly pivot: Vector3; readonly remaining: number; readonly shift: readonly [number, number]; readonly from: Vector3 }

/** What planning a step tells besides the step: whether the leg lands the whole of its landing (`reachableStep`). */
interface StepPlan { within: boolean }

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
 * (what their ankles hold, `bearingOf`), or null if it is not. The capture point
 * xi = c + v / w (w = sqrt(g / height)), the body falling about the bearing sole's nearest point p,
 * runs to p + (xi - p) exp(w T) by the swing's end T (Kajita et al. 2001); the foot lands past that
 * by `tuning.reach` of its distance from the bearing sole's middle, and at least a sole's width and
 * the swing's clearance out from the bearing foot. The foot nearer the capture point bears the body: the far one would fling
 * it across.
 *
 * Pushed sideways past the nearer foot, the far foot can only step in beside it, and stepping in
 * again and again the body falls off that foot's outer edge. So on both feet, the nearer foot
 * steps out from the far one instead where its landing ends nearer where the capture point will
 * be as it lands, each run about its own bearer: the sideways catch people make (Maki and McIlroy
 * 1997). With one foot holding, the other steps. No catch is longer than `tuning.longest` of the
 * leg, if it is set, in place of the walk's `longest`.
 *
 * `under` re-aims the step under way, as a walk's is (`walkStep`): its foot steps on, and lands
 * where the body's measured capture point, run about the pivot the plan holds for the swing's time
 * left, says it must, past it by `tuning.reach` as at the start. The body lags its plan where the
 * plan's pivot asks of an ankle more than the body gives it, and a landing fixed at the lift is
 * then short of the capture point by the lag, grown by the swing's end: the next step lands shorter
 * still, and the body is not caught. Each landing is kept off the bearing sole (`clearOfBearer`)
 * and within the leg's reach from its hip where the body carries it as the foot lands
 * (`reachableStep`, the body facing `facing`, its hips `hip` over the soles): the leg lands as far
 * as it can, and the step after goes on.
 * A landing the leg cannot reach over the recovery's time is planned over its `fast` time instead:
 * a quicker step lands nearer where the capture point will be.
 * `holding` are the feet that hold the body (`holding`): the one nearer the capture point bears
 * the step; with one, that one, and the other steps, wherever it is: the body has tipped off that
 * foot, and the leg left hanging would land as a strut that throws the body on.
 */
function recoveryStep(feet: readonly FootState[], holding: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, tuning: RecoveryTuning, gait: GaitTuning,
  facing: number, hip: number, held: number, under?: Underway): SwingGoal | null {
  if (tuning.longest !== undefined) gait = { ...gait, longest: tuning.longest };
  const { clearance, effort } = gait, rx = cos(facing), rz = -sin(facing);
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  // The height's floor, 1 mm, is a numeric setting: a centre at its feet has no pendulum.
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  // Where a step of `foot`, swinging from (`fx`, `fz`), lands from `bearer` over `seconds`: the
  // capture point run about the pivot (`px`, `pz`) of the bearing sole, past by the reach; kept
  // off the bearer's sole (`clearOfBearer`). A landing kept off as a crossover is stepped where
  // the leg reaches the whole of it as the foot lands (`reachableStep`); else the foot steps to
  // its own side of the bearer, within its reach and kept off again, and the next step goes on
  // from there: a crossover the hip cannot reach lands on the bearing leg.
  // Whether the last landing found was cut to what the leg reaches (`reachableStep`).
  let short = false;
  const landing = (bearer: FootState, foot: FootState, fx: number, fz: number, px: number, pz: number, seconds: number, reserve: number): [number, number] => {
    const b = bearer.middle, grow = exp(w * seconds), ex = px + (xi - px) * grow, ez = pz + (zi - pz) * grow, ax = ex + (ex - b.x) * tuning.reach, az = ez + (ez - b.z) * tuning.reach;
    const [cx, cz] = centreAtLanding(b, centre, velocity, w, px, pz, 0, px, pz, seconds), side = foot.side === "right" ? 1 : -1;
    const reach = (x: number, z: number) => reachableStep(foot, x - b.x, z - b.z, cx, cz, rx, rz, side, gait, hip, null, reserve, true);
    let [lx, lz] = clearOfBearer(bearer, foot, fx, fz, ax, az, clearance, false);
    const kept = lx !== ax || lz !== az;
    if (kept) {
      const [kx, kz] = clearOfBearer(bearer, foot, fx, fz, ax, az, clearance, true);
      if ((kx !== lx || kz !== lz) && reach(kx, kz)[2]) return [kx, kz];
    }
    const [sx, sz, whole] = reach(lx, lz);
    if (!whole) { short = true; [lx, lz] = clearOfBearer(bearer, foot, fx, fz, b.x + sx, b.z + sz, clearance, false); }
    return [lx, lz];
  };
  if (under) {
    const foot = feet.find((f) => f.side === under.foot)!, bearer = feet.find((f) => f !== foot)!, p = under.pivot;
    const [tx, tz] = landing(bearer, foot, under.from.x, under.from.z, p.x, p.z, Math.max(under.remaining, 0), 1);
    return { foot: foot.side, to: [tx, tz], seconds: tuning.seconds, lift: tuning.lift, shift: false, lands: true };
  }
  const [hx, hz] = withinSupport(heldBy(holding), xi, zi, 0);
  if (holding.length === feet.length && hypot(xi - hx, zi - hz) <= tuning.margin + held) return null;
  // The step of `foot` from `bearer`, about the point of the bearing sole nearest the capture
  // point: over the recovery's time, or longer if the swing hip needs it for the way
  // (`swingWaySeconds`), the landing then where the capture point will be by then. It ends as the
  // sole meets the ground: a foot that steps from the air comes down to it.
  const planned = (bearer: FootState, foot: FootState, seconds: number): [number, number] => {
    const [px, pz] = withinSupport([bearingOf(bearer)], xi, zi, 0);
    return landing(bearer, foot, foot.middle.x, foot.middle.z, px, pz, seconds, gait.reserve);
  };
  const stepOf = (bearer: FootState, foot: FootState): SwingGoal => {
    short = false;
    let seconds = tuning.seconds, [tx, tz] = planned(bearer, foot, seconds);
    // A landing the leg cannot reach by then lands nearer, sooner.
    if (short && tuning.fast !== undefined) { seconds = tuning.fast; [tx, tz] = planned(bearer, foot, seconds); }
    const need = swingWaySeconds(foot.leg, hypot(tx - foot.middle.x, tz - foot.middle.z), effort);
    if (need > seconds) { seconds = need; [tx, tz] = planned(bearer, foot, seconds); }
    return { foot: foot.side, to: [tx, tz], seconds, lift: tuning.lift, shift: false, lands: true };
  };
  // How far a step's landing is from where the capture point will be as it lands, run about the
  // point of its bearer's sole nearest it, m.
  const missed = (bearer: FootState, goal: SwingGoal): number => {
    const [px, pz] = withinSupport([bearingOf(bearer)], xi, zi, 0), grow = exp(w * goal.seconds);
    return hypot(px + (xi - px) * grow - goal.to[0], pz + (zi - pz) * grow - goal.to[1]);
  };
  // The holding foot nearer the capture point bears the body; the other steps.
  const off = (foot: FootState) => { const [qx, qz] = withinSupport([bearingOf(foot)], xi, zi, 0); return hypot(xi - qx, zi - qz); };
  const near = holding.length < 2 || off(holding[0]!) <= off(holding[1]!) ? holding[0]! : holding[1]!, far = feet.find((other) => other !== near)!;
  const step = stepOf(near, far);
  if (holding.length < feet.length) return step;
  // On both feet either may bear: the nearer stepping out from the far one is taken where its
  // landing ends nearer where the capture point will be.
  const out = stepOf(far, near);
  return missed(far, out) < missed(near, step) ? out : step;
}

/**
 * A landing (x, z) of `foot`, swinging from (`fx`, `fz`), kept off `bearer`'s sole: out of the box
 * about it the swing's path keeps out of (`clearAcross`, `clearAlong`). A landing within the box
 * is moved out across to the foot's own side; `cross`, one beyond what the bearer's ankle holds
 * across (`bearingOf`) is moved along the bearer's sole past its end instead, the foot crossed
 * over the bearing leg: the crossover step catches a push toward the bearing side, where a step
 * in beside the bearer never reaches. It crosses ahead of the bearer or behind by which way the
 * hip's range leans the thigh further (`SwingLeg.range`): a human hip flexes far and extends
 * little, and crosses in front. The foot's side is read from where it swings from, not where it
 * is: a crossover under way has the foot past the bearer, and is still a crossover.
 */
function clearOfBearer(bearer: FootState, foot: FootState, fx: number, fz: number, x: number, z: number, clearance: number, cross: boolean): [number, number] {
  const b = bearer.middle, { front, heel } = bearer.ends;
  const lx = front.middle.x - heel.middle.x, lz = front.middle.z - heel.middle.z, long = hypot(lx, lz), ax = lx / long, az = lz / long;
  // Across the bearer's sole, toward the swinging foot's start.
  let cx = az, cz = -ax;
  if ((fx - b.x) * cx + (fz - b.z) * cz < 0) { cx = -cx; cz = -cz; }
  const out = (x - b.x) * cx + (z - b.z) * cz, along = (x - b.x) * ax + (z - b.z) * az, across = clearAcross(foot, clearance), need = clearAlong(bearer, foot, clearance);
  if (out >= across || Math.abs(along) >= need) return [x, z];
  let hold = 0;
  if (cross) for (const corner of bearingOf(bearer).corners) hold = Math.max(hold, (b.x - corner.x) * cx + (b.z - corner.z) * cz);
  if (!cross || out >= -hold) return [x + (across - out) * cx, z + (across - out) * cz];
  const end = foot.leg.range.ahead >= foot.leg.range.behind ? need : -need;
  return [x + (end - along) * ax, z + (end - along) * az];
}

/**
 * The body's velocity with what its angular momentum about its centre of mass brings it as it
 * returns (`StanceReading.momentum`), into the scratch's `carried`. A trunk swung toward a push
 * slows the centre of mass while it swings (the hip strategy), and brings it on again as it is
 * brought back, by the momentum over the mass and the centre's height; a recovery reads its
 * capture point by this velocity, so a push the trunk has taken up for the moment reads as the
 * push it is, and the step it needs is taken then and lands where it will be needed.
 */
function carriedVelocity(s: Stance): Vector3 {
  const { reading } = s.state, { carried } = s.scratch, { feet } = s, L = reading.momentum, c = reading.centre, v = reading.velocity;
  // The height's floor, 1 mm, is a numeric setting.
  const over = s.total * Math.max(c.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2, 1e-3);
  return carried.set(v.x - L.z / over, v.y, v.z + L.x / over);
}

/**
 * How far the capture point of a body at `centre` moving at `velocity`, standing on `feet`, is
 * outside the region the ankles of `of` (all of `feet` unless asked) hold (`bearingOf`), m.
 */
function outside(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, of = feet): number {
  const height = centre.y - (feet[0]!.middle.y + feet[1]!.middle.y) / 2;
  // The height's floor, 1 mm, is a numeric setting.
  const w = Math.sqrt(g / Math.max(height, 1e-3)), xi = centre.x + velocity.x / w, zi = centre.z + velocity.z / w;
  const [hx, hz] = withinSupport(heldBy(of), xi, zi, 0);
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

/** The hips' height over the soles, m, as read: the centre's over the support and the hips' over the centre (`FootMemory.hip`). */
function hipHeight(s: Stance): number {
  const { feet } = s, { reading } = s.state;
  return reading.centre.y - reading.support.y + (feet[0]!.memory.hip.y + feet[1]!.memory.hip.y) / 2;
}

/**
 * The feet that hold a stance on both feet: those the ground has pressed within the height's
 * constant (`FootMemory.lifted`, `seconds.height`) whose sole is still down on the ground it
 * stood on (`soleHeight`, `DOWN`), but never the foot a step is swinging (`step.lifted`,
 * `reading.own`); all of them if neither holds. A landed sole that bounces holds; a foot the
 * body has tipped off, or lifts as it falls, holds nothing: the capture point is read against
 * the other's, and it is the one that steps. Into `HOLDING`.
 */
function holding(s: Stance): readonly FootState[] {
  const { feet } = s, { height } = s.tuning.seconds, { step, reading } = s.state;
  const swung = step.lifted && reading.own ? reading.own.foot : null;
  HOLDING.length = 0;
  for (const foot of feet) if (foot.side !== swung && foot.memory.lifted <= height && soleHeight(foot) <= DOWN) HOLDING.push(foot);
  if (HOLDING.length === 0) for (const foot of feet) HOLDING.push(foot);
  return HOLDING;
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
 * A walk's landing (`x`, `z`) on `foot`'s own side of the bearing sole's middle `b`, across the
 * heading whose right is (`rx`, `rz`) (`sign` +1 the right): no less than the swing's clearance
 * out from the bearing sole (`clearAcross`). A walk does not cross its feet: a capture point that
 * asks it to is caught by the steps after, each foot on its side. Only a catch crosses over
 * (`clearOfBearer`), and a walk's foot that swings from the far side, as a turn leaves it, lands
 * on its own.
 */
function ownSide(foot: FootState, b: Vector3, x: number, z: number, rx: number, rz: number, sign: number, clearance: number): [number, number] {
  const out = ((x - b.x) * rx + (z - b.z) * rz) * sign, least = clearAcross(foot, clearance);
  return out >= least ? [x, z] : [x + (least - out) * sign * rx, z + (least - out) * sign * rz];
}

/**
 * Where `foot` lands a step asked at (`dx`, `dz`) from the bearing sole's middle, and whether it
 * lands it there: within `reserve` of its leg's reach from its hip where the body carries it
 * (`reachableSole`, `FootMemory.hip`, `GaitTuning.reserve`), from the body's centre at (`cx`,
 * `cz`) from that middle as the foot lands, `hip` over the landing sole's middle, its knee bent no
 * less than `bend` (null, straight) and bending further behind for it if it `bends`; and no
 * further than `longest` of the leg, drawn toward the bearing sole for that.
 */
function reachableStep(foot: FootState, dx: number, dz: number, cx: number, cz: number, rx: number, rz: number, sign: number, tuning: GaitTuning, hip: number, bend: number | null, reserve: number, bends: boolean): [number, number, boolean] {
  const [sx, sz, within] = reachableSole(foot.leg, dx, dz, cx, cz, foot.memory.hip, rx, rz, sign, hip - foot.ankle, legLength(foot, bend), foot.back, reserve, bends);
  const longest = tuning.longest * (foot.lengths[0] + foot.lengths[1]), far = hypot(sx, sz);
  return far > longest ? [sx * longest / far, sz * longest / far, false] : [sx, sz, within];
}

/**
 * How `foot`'s leg leans as it lands a step of (`dx`, `dz`) from the bearing sole's middle, the
 * body's centre at (`cx`, `cz`) from it then and the hips `hip` over the soles, rad, ahead and out
 * (`landingLean`): what the foot lands turned by (`SwingGoal.lean`).
 */
function landingLeanOf(foot: FootState, dx: number, dz: number, cx: number, cz: number, rx: number, rz: number, sign: number, hip: number): [number, number] {
  return landingLean(foot.leg, dx, dz, cx, cz, foot.memory.hip, rx, rz, sign, hip - foot.ankle, foot.back);
}

/**
 * The share of the body's centre's way to (`cx`, `cz`) from the bearing sole's middle, as the other
 * foot lands, that the bearing leg of `foot` (`sign` +1 the right) keeps its sole over, 1 if all
 * of it: its hip `hip` over the sole and its knee bent no less than `bend`, within `reserve` of its
 * reach (`withinReach`), the knee bending for it. At the end of a step the trailing leg is the one
 * stretched: its hip has gone ahead of its ankle by the body's way and the ankle's set behind the
 * sole's middle.
 */
function bearingShare(foot: FootState, cx: number, cz: number, rx: number, rz: number, sign: number, hip: number, bend: number | null, reserve: number): number {
  return withinReach(foot.leg, 0, 0, cx / reserve, cz / reserve, foot.memory.hip, rx, rz, sign, hip - foot.ankle, legLength(foot, bend), foot.back);
}

/**
 * Where the body's centre comes to as a step lands, from the bearing sole's middle `b`: the
 * pendulum from `centre` at `velocity`, about the double support's pivot (`qx`, `qz`) for `shift` s,
 * then about the swing's (`px`, `pz`) for `swing` s.
 */
function centreAtLanding(b: Vector3, centre: Vector3, velocity: Vector3, w: number, qx: number, qz: number, shift: number, px: number, pz: number, swing: number): [number, number] {
  let x = centre.x, z = centre.z, vx = velocity.x, vz = velocity.z;
  for (const [ox, oz, t] of [[qx, qz, shift], [px, pz, swing]] as const) {
    const ch = cosh(w * t), sh = sinh(w * t), dx = x - ox, dz = z - oz;
    x = ox + dx * ch + vx / w * sh;
    z = oz + dz * ch + vz / w * sh;
    vx = dx * w * sh + vx * ch;
    vz = dz * w * sh + vz * ch;
  }
  return [x - b.x, z - b.z];
}

/**
 * Whether the legs, their hips `hip` over the soles, can take whole a walk's steady steps at `v`
 * m/s the way (`ux`, `uz`), unit, facing `heading`: `transferStep`'s, each the pace over the swing's
 * own time (`stepSeconds`) and the transfer, the width (`stepWidth`) across, the body midway
 * between the soles as the foot lands; the landing leg reaching the step straight (`reachableStep`)
 * and the bearing leg keeping its sole (`bearingShare`). A steady step back is not taken further by
 * the knee's bend, which a catch or a stop may take: a swing reaching behind past the hip's range on
 * a bent knee rides the ankle's dorsiflexion stop with its toes hung under the sole, and at a pace
 * that needs it they meet the ground short of the landing step after step.
 */
function stepsWithin(feet: readonly FootState[], v: number, ux: number, uz: number, heading: number, tuning: GaitTuning, hip: number, bend: number | null): boolean {
  const rx = cos(heading), rz = -sin(heading), Tds = tuning.transfer ?? 0;
  for (let k = 0; k < feet.length; k++) {
    const foot = feet[k]!, bearer = feet[1 - k]!, sign = foot.side === "right" ? 1 : -1, T = stepSeconds(foot, v, tuning) + Tds;
    const W = stepWidth(foot, v * Math.abs(ux * rx + uz * rz), T, tuning), dx = v * ux * T + sign * W * rx, dz = v * uz * T + sign * W * rz;
    if (!reachableStep(foot, dx, dz, dx / 2, dz / 2, rx, rz, sign, tuning, hip, bend, tuning.reserve, false)[2]) return false;
    if (bearingShare(bearer, dx / 2, dz / 2, rx, rz, -sign, hip, bend, tuning.reserve) < 1) return false;
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
 * The foot a walk at `walk`, world (x, z), m/s, facing `heading`, starts with: the one behind, if
 * the feet stand split fore and aft by more than a sole's length and the walk goes ahead or back;
 * else the one on the side the walk goes (the right, going straight). From a split stance the walk
 * goes on from the foot ahead the way it goes: started on its side, the foot ahead steps back
 * beside the other, and a leg reaching ahead with its heel down drags back on it, the knee straight
 * under the body's weight.
 */
function startingSide(feet: readonly FootState[], walk: readonly [number, number], heading: number): Side {
  const left = feet.find((f) => f.side === "left")!, right = feet.find((f) => f.side === "right")!, { front, heel } = right.ends;
  const fx = sin(heading), fz = cos(heading), sole = hypot(front.middle.x - heel.middle.x, front.middle.z - heel.middle.z);
  const split = (right.middle.x - left.middle.x) * fx + (right.middle.z - left.middle.z) * fz, ahead = walk[0] * fx + walk[1] * fz;
  if (ahead !== 0 && Math.abs(split) > sole) return split * ahead > 0 ? "left" : "right";
  return walk[0] * cos(heading) - walk[1] * sin(heading) < 0 ? "left" : "right";
}

/**
 * A walk's next step at the velocity `walk`, world (x, z), m/s: the foot other than `last`'s steps,
 * or, starting, the one `startingSide` gives.
 *
 * The capture point xi = c + v / w, the body falling about a point p of the bearing sole, runs to
 * e = p + (xi - p) exp(w T) by the swing's end T (Kajita et al. 2001). In a steady walk, each step
 * about its sole's middle b, e is ahead of the new foot by the walk's distance over a swing over
 * exp(w T) - 1 and in from it by the width over exp(w T) + 1 (Englsberger et al. 2011). The pivot p
 * is chosen, within what the bearing ankle holds (`bearingOf`), to bring e to where the
 * steady landing wants it, and the foot lands at e less that offset. A pivot fixed at b would let a
 * landing's miss grow by exp(w T) each step, until the feet cannot reach.
 *
 * The swing's time is the step's own (`stepSeconds`) and the width the walk's (`stepWidth`); the
 * step is what the leg can take (`reachableStep`), and at least a sole's width and the swing's
 * clearance out to its own side.
 * Walking nowhere, the steps stop a walk under
 * way. `under` re-aims a step under way: its foot, the pivot the body falls about, and the swing's
 * time left. The step is planned with the hips `hip` over the soles, the walk's crouch; the foot
 * lands leaning from `held`, the height the plan holds them at (`landingLeanOf`).
 */
function walkStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, walk: readonly [number, number], heading: number,
  tuning: GaitTuning, hip: number, held: number, bend: number | null, last: Side | null, under?: Underway, plan?: StepPlan): SwingGoal {
  const side: Side = under?.foot ?? (last ? (last === "left" ? "right" : "left") : startingSide(feet, walk, heading));
  const foot = feet.find((f) => f.side === side)!, bearer = feet.find((f) => f !== foot)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  // The pelvis's right across the ground at the heading the step lands facing: +x at heading 0.
  const from = under ? under.from : foot.middle, facing = landingHeading(bearer, heading), rx = cos(facing), rz = -sin(facing);
  // The height's floor, 1 mm, is a numeric setting.
  const T = stepSeconds(foot, hypot(walk[0], walk[1]), tuning), w = Math.sqrt(g / Math.max(centre.y - b.y, 1e-3)), grow = exp(w * T);
  const W = stepWidth(foot, Math.abs(walk[0] * rx + walk[1] * rz), T, tuning);
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
    : pivotWithin([bearingOf(bearer)], xi, zi, (sx + nx + shx - xi * run) / (1 - run), (sz + nz + shz - zi * run) / (1 - run), 0);
  const ex = px + (xi - px) * run - shx, ez = pz + (zi - pz) * run - shz;
  // Starting from a stand, the weight is shifted first and the foot lands where a steady walk puts it.
  const steady = last || under;
  let tx = steady ? ex - nx : sx, tz = steady ? ez - nz : sz;
  // The body's centre as the foot lands: about the pivot from the body as it is; starting from a stand, midway to the landing, as a steady walk has it.
  const at = (dx: number, dz: number): [number, number] => steady ? centreAtLanding(b, centre, velocity, w, px, pz, 0, px, pz, under ? Math.max(under.remaining, 0) : T) : [dx / 2, dz / 2];
  [tx, tz] = ownSide(foot, b, tx, tz, rx, rz, sign, tuning.clearance);
  const [cx0, cz0] = at(tx - b.x, tz - b.z);
  // A step lands within the whole of the leg's reach: the gait's reserve is the steady walk's (`stepsWithin`), left for this step's corrections.
  const [wx, wz, within] = reachableStep(foot, tx - b.x, tz - b.z, cx0, cz0, rx, rz, sign, tuning, hip, bend, 1, true);
  if (plan) plan.within = within;
  [tx, tz] = clearOfBearer(bearer, foot, from.x, from.z, b.x + wx, b.z + wz, tuning.clearance, false);
  const [lx, lz] = at(tx - b.x, tz - b.z);
  return { foot: side, to: [tx, tz], seconds: T, lift: tuning.lift, shift: !steady, capture: steady ? [ex, ez] : [tx + nx, tz + nz],
    lean: landingLeanOf(foot, tx - b.x, tz - b.z, lx, lz, rx, rz, sign, held) };
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
 * where it is as the foot lifts. The landing moves by what the body's measured capture point,
 * run as the stance will run it (`planAcross`: through the double support about the point of both
 * soles that brings it to the handover, then through the swing about the point of the bearing sole
 * that brings it to the reference, each within what the ankles hold; under way, about the swing's
 * pivot for its time left), misses the reference by, over the share of the landing the reference
 * moves with. A body on its plan moves nothing; a step planned as if it were, when it is not,
 * lands short of catching it, and the steps after cannot. `hip` and `held` are as `walkStep`'s.
 */
function transferStep(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, walk: readonly [number, number], heading: number,
  tuning: GaitTuning, hip: number, held: number, bend: number | null, last: Side | null, under?: Underway, plan?: StepPlan): SwingGoal {
  const side: Side = under?.foot ?? (last === "left" ? "right" : "left");
  const foot = feet.find((f) => f.side === side)!, bearer = feet.find((f) => f !== foot)!, b = bearer.middle, sign = side === "right" ? 1 : -1;
  const from = under ? under.from : foot.middle, facing = landingHeading(bearer, heading), rx = cos(facing), rz = -sin(facing);
  // The height's floor, 1 mm, is a numeric setting.
  const Tss = stepSeconds(foot, hypot(walk[0], walk[1]), tuning), Tds = tuning.transfer!, T = Tss + Tds, w = Math.sqrt(g / Math.max(centre.y - b.y, 1e-3));
  const W = stepWidth(foot, Math.abs(walk[0] * rx + walk[1] * rz), T, tuning);
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
  const [cx, cz] = reference(tx, tz);
  // The measured capture point as the swing begins: now, under way; else run through the double support about its pivot, chosen as the stance chooses it, to bring it to the handover.
  const xi0 = centre.x + velocity.x / w, zi0 = centre.z + velocity.z / w, Fi = 1 / F;
  const hx = b.x + E * (cx - b.x), hz = b.z + E * (cz - b.z);
  const [qx, qz] = under ? [b.x, b.z] : pivotWithin(heldBy(feet), xi0, zi0, (hx - xi0 * Fi) / (1 - Fi), (hz - zi0 * Fi) / (1 - Fi), 0);
  const xi = under ? xi0 : qx + (xi0 - qx) * Fi, zi = under ? zi0 : qz + (zi0 - qz) * Fi;
  const swing = under ? Math.max(under.remaining, 0) : Tss, run = exp(w * swing), [shx, shz] = under?.shift ?? [0, 0];
  // The pivot is chosen while no less than the horizon is left, and held after (`GaitTuning.horizon`); the capture point runs from it for what is left.
  const [px, pz] = under && under.remaining < tuning.horizon ? [under.pivot.x, under.pivot.z]
    : pivotWithin([bearingOf(bearer)], xi, zi, (cx + shx - xi * run) / (1 - run), (cz + shz - zi * run) / (1 - run), 0);
  const ex = px + (xi - px) * run - shx, ez = pz + (zi - pz) * run - shz;
  tx += (ex - cx) / (F + G);
  tz += (ez - cz) / (F + G);
  [tx, tz] = ownSide(foot, b, tx, tz, rx, rz, sign, tuning.clearance);
  const [cx0, cz0] = centreAtLanding(b, centre, velocity, w, qx, qz, under ? 0 : Tds, px, pz, swing);
  // A step lands within the whole of the leg's reach: the gait's reserve is the steady walk's (`stepsWithin`), left for this step's corrections.
  const [wx, wz, within] = reachableStep(foot, tx - b.x, tz - b.z, cx0, cz0, rx, rz, sign, tuning, hip, bend, 1, true);
  if (plan) plan.within = within;
  [tx, tz] = clearOfBearer(bearer, foot, from.x, from.z, b.x + wx, b.z + wz, tuning.clearance, false);
  const capture = reference(tx, tz), [lx, lz] = [cx0, cz0];
  return { foot: side, to: [tx, tz], seconds: Tss, lift: tuning.lift, transfer: Tds,
    capture, handover: [b.x + E * (capture[0] - b.x), b.z + E * (capture[1] - b.z)], lean: landingLeanOf(foot, tx - b.x, tz - b.z, lx, lz, rx, rz, sign, held) };
}

/**
 * The pace a stance on both feet plans its next step at, world (x, z), m/s: the walk's `pace`, if
 * the step planned at it from the body as it is lands within the leg's reach (`reachableStep`); else
 * the pace nearest it, between it and the body's own (`velocity` over the ground), whose step
 * does; null if none does, the body's own among them. A step that slows the walk lands further
 * out than a steady step, on the capture point to stop it, and the leg reaches only so far:
 * planned past that, the step lands short, the body falls on past its plan by exp(w T) a step
 * and the steps after cannot catch it. So a walk slows only as fast as its steps can, and goes
 * on from the pace planned; and where no pace has a step that holds the body, a walk's step
 * cannot, and a recovery's catches it (`ownStep`). By bisection, to `PACE_STEP`.
 */
function reachablePace(feet: readonly FootState[], centre: Vector3, velocity: Vector3, g: number, pace: readonly [number, number], heading: number,
  tuning: GaitTuning, hip: number, bend: number | null, last: Side | null): [number, number] | null {
  const plan: StepPlan = { within: true };
  const reaches = (x: number, z: number): boolean => {
    if (tuning.transfer && last) transferStep(feet, centre, velocity, g, [x, z], heading, tuning, hip, hip, bend, last, undefined, plan);
    else walkStep(feet, centre, velocity, g, [x, z], heading, tuning, hip, hip, bend, last, undefined, plan);
    return plan.within;
  };
  if (reaches(pace[0], pace[1])) return [pace[0], pace[1]];
  if (!reaches(velocity.x, velocity.z)) return null;
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
  const { feet, state } = s, { reading, step } = state, { recovery, gait } = s.tuning, swing = step.swing;
  if (!recovery || reading.phase !== "shift" || !swing || swing.transfer) return false;
  const g = gravityOf(s), bearer = feet.find((f) => f.side !== swing.foot)!, off = outside(feet, reading.centre, reading.velocity, g, [bearer]);
  const away = off > step.off;
  step.off = off;
  const held = assistReach(s), hold = holding(s), carried = carriedVelocity(s);
  if (!away || outside(feet, reading.centre, carried, g, hold) <= recovery.margin + held) return false;
  reading.own = recoveryStep(feet, hold, reading.centre, carried, g, recovery, gait, reading.facing, hipHeight(s) - gait.crouch, held)!;
  step.recovering = true;
  state.stride = state.striding ? reading.own.foot : null;
  reading.recoveries += 1;
  return true;
}

/**
 * A recovery step under way (`step.recovering`), re-aimed each control step from the body's
 * measured capture point (`recoveryStep`'s `under`), as a walk's step is (`ownStep`); the catch of
 * a weight shift (`catchStep`) among them, which runs to its landing before any step the goal asks.
 */
export function aimRecovery(s: Stance): void {
  const { feet, state } = s, { reading, step } = state, { recovery, gait } = s.tuning;
  if (!recovery || !reading.own || !step.recovering || reading.phase !== "swing" || !step.lifted || step.swing !== reading.own) return;
  const under: Underway = { foot: reading.own.foot, pivot: reading.place, remaining: reading.own.seconds - step.time, shift: step.shift.capture, from: step.from };
  const aimed = recoveryStep(feet, feet, reading.centre, carriedVelocity(s), gravityOf(s), recovery, gait, reading.facing, hipHeight(s) - gait.crouch, 0, under)!;
  reading.own = step.swing = { ...reading.own, to: aimed.to };
}

/**
 * The step a stance on both feet takes of itself (`reading.own`), facing `heading`, its hips `hip`
 * over the soles by the goal's height, less the walk's crouch (`paceToward`). Standing, it steps to
 * walk, each foot in turn, or to catch the body where no walk's step holds it (`reachablePace`);
 * to settle a walk's end at its own stance; or, walking nowhere, once its capture point has left
 * what both its soles hold, to catch it: a foot the body's own motion lifts, a strike's, with the
 * capture point within, is pressed back down where it stood (`holdStance`), not stepped. A catch is planned with the hips lowered by the gait's crouch,
 * as a walk's longest steps are (`paceToward`): a step that catches a body crouches for its reach.
 * A walk's or a recovery's step under way is re-aimed each step. Each step runs to its landing
 * unless the goal asks for one of its own.
 */
export function ownStep(s: Stance, heading: number, hip: number): void {
  const { feet, rest, state } = s, { reading, pace, step } = state, { recovery, gait, bend } = s.tuning, hips = hip - state.crouch;
  // The height the plan holds the hips at: its own less the centre of mass's rise over them, or the goal's before it has one.
  const hipHeld = state.plan.on ? state.plan.at.y - s.rise : hip;
  if (!reading.own && reading.phase === "stand") {
    const walk = pace[0] !== 0 || pace[1] !== 0 ? pace : null, held = assistReach(s), hold = holding(s), carried = carriedVelocity(s);
    if (walk || (state.stride && recovery && outside(feet, reading.centre, carried, gravityOf(s), hold) > recovery.margin + held)) {
      // Walking, or stopping a walk still under way: its steps keep their alternation, each at the
      // pace the leg can take it (`reachablePace`), which the walk's pace goes on from.
      const reach = reachablePace(feet, reading.centre, reading.velocity, gravityOf(s), pace, heading, gait, hips, bend, state.stride);
      if (reach) {
        pace[0] = reach[0];
        pace[1] = reach[1];
      }
      state.striding = [pace[0], pace[1]];
      const caught = reach || !recovery ? null : recoveryStep(feet, hold, reading.centre, carried, gravityOf(s), recovery, gait, reading.facing, hipHeight(s) - gait.crouch, held);
      if (caught) {
        // No pace between the walk's and the body's own has a step the legs reach: no walk's step
        // holds the body, and a recovery's catches it, which the walk goes on from.
        reading.own = caught;
        step.recovering = true;
        reading.recoveries += 1;
      } else {
        reading.own = gait.transfer && state.stride
          ? transferStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, hipHeld, bend, state.stride)
          : walkStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, hipHeld, bend, state.stride);
        step.recovering = false;
        reading.strides += 1;
      }
    } else if (state.stride && across(feet, heading) < rest) {
      // A walk has ended on the gait's width, narrower than the body's own stance: one step
      // puts the feet back at the width it was built standing at.
      state.striding = null;
      reading.own = settleStep(feet, state.stride, heading, rest, gait);
      step.recovering = false;
    } else if (recovery && outside(feet, reading.centre, carried, gravityOf(s)) > recovery.margin + held) {
      state.striding = null;
      reading.own = recoveryStep(feet, hold, reading.centre, carried, gravityOf(s), recovery, gait, reading.facing, hipHeight(s) - gait.crouch, held);
      step.recovering = reading.own !== null;
      if (reading.own) reading.recoveries += 1;
    }
    state.stride = state.striding && reading.own ? reading.own.foot : null;
  } else if (reading.own && step.recovering) {
    aimRecovery(s);
  } else if (reading.own && state.striding && reading.phase === "swing" && step.lifted && step.swing === reading.own) {
    // A walk's step under way lands where the body's capture point, measured, says it must: the
    // body lags its plan, and a landing fixed at lift carries the lag into the next step.
    const under: Underway = { foot: reading.own.foot, pivot: reading.place, remaining: reading.own.seconds - step.time, shift: step.shift.capture, from: step.from };
    // (`state.striding` is the pace the step was planned at.)
    if (reading.own.transfer) {
      const aimed = transferStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, hipHeld, bend, null, under);
      reading.own = step.swing = { ...reading.own, to: aimed.to, capture: aimed.capture!, lean: aimed.lean };
    } else {
      const aimed = walkStep(feet, reading.centre, reading.velocity, gravityOf(s), state.striding, heading, gait, hips, hipHeld, bend, null, under);
      reading.own = step.swing = { ...reading.own, to: aimed.to, lean: aimed.lean };
    }
  }
}
