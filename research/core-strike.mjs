/**
 * One strike by a core human (`src/core/`), scored by how fast its fist closes on a target.
 *
 * The human stands on the core stand with its pelvis carried still (`startRoutine` in
 * `src/core-lab/routine.ts`): the legs cannot yet push on the ground (stage 4 of the plan), so this
 * is a strike of the arm and the trunk above the pelvis. It settles into the lab's guard, holds a
 * chamber pose, then pushes a chosen set of freedoms, each from a chosen moment for a chosen time
 * at a chosen activation; every other freedom is servoed to the guard. Every torque is its
 * muscles'.
 *
 * The target is an opponent's head: a sphere of the striker's own head capsule's radius, at its
 * own head's centre of mass moved straight ahead by a chosen distance. The reading is the fist's
 * forward speed, its knuckles' velocity along the line the target lies on, as it first enters the
 * sphere from outside after the chamber: a straight's speed as a punch's impact speed is measured
 * (Adamec 2021), so a blow chopped down from above scores only what it carries forward. No body
 * is struck, so nothing slows the fist before it arrives. A search's `score` is that speed, or,
 * for a fist that never arrives, minus how far it passed from the sphere, so any hit beats any
 * miss and a near miss beats a wide one.
 *
 * **The wrist is not pushed; it is servoed to the guard like every freedom not pushed.** A punch
 * lands on a fist held in line with the forearm. A first search that could push the wrist found a
 * flick of the hand, and a fault in the muscle driver with it: at 120 Hz the wrist went from rest
 * to 23 rad/s in one step (16 at 480 Hz at the same moment), and the best strike read 11.66 m/s at
 * 120 Hz and 6.60 at 480 (Node core stand). The driver read the force-velocity curve at the speed
 * a step began with, so a light segment crossed the whole curve in one step at its isometric
 * torque; it now holds each motor's target to the curve's tangent (`src/core/muscle/driver.ts`),
 * and a search runs at the game's 120 Hz.
 *
 * **One blow is chaotic; a search scores several.** Random strikes (Node core stand, the Warrior
 * from the guard, 24 of them, 480 Hz) read a peak fist speed 1.9 % apart (standard deviation of the
 * log ratio; up to 8 %) when every push's activation was scaled by 0.9999, and 0.7 % with the
 * body's self-contact switched off: an arm that meets its own body turns a small difference into a
 * large one. Strikes that met no joint stop scattered as much as those that did. The same strikes read 11-12 % apart between 1920 Hz and 3840 Hz and
 * 17-31 % between 120 Hz and 3840 Hz, with mean ratios of 0.97-0.99 at 120 Hz: one rate does not
 * reproduce another's single blow, but 120 Hz is not biased. A search that takes the best single
 * run of thousands takes the luckiest: ten searches at 120 Hz each read higher at 120 Hz than at
 * 1920 Hz, by up to 95 %. `perturbed` gives a strike the variation a mind cannot remove, and the
 * search scores a candidate by its mean over several.
 *
 * The figures above were read with the velocity servo the computed-torque one replaced on
 * 2026-09-29 (`src/core/control/servo.ts`); every freedom not pushed moves differently now.
 */
import { Logger } from "@babylonjs/core/Misc/logger.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { humanSpec } from "../src/core/human/spec.ts";
import { startRoutine } from "../src/core-lab/routine.ts";
import { coreStand } from "../tests/harness/core-stand.mjs";

Logger.LogLevels = Logger.ErrorLogLevel;

export const CORE_STRIKE_HARNESS = "Node core stand, pelvis carried still, ground on; a strike into a sphere at head height";

/** Seconds to settle into the guard, and to watch after the chamber. */
const SETTLE = 0.6, WINDOW = 0.5;

/** The freedoms a straight with `hand` may push, and those its chamber poses. */
export const pushed = (hand) => [
  "thoracic rotation right", "lumbar rotation right", "thoracic flexion", "thoracic lateral flexion right",
  `shoulder.${hand} flexion`, `shoulder.${hand} abduction`, `shoulder.${hand} internal rotation`,
  `elbow.${hand} flexion`,
];
export const chambered = (hand) => [
  "thoracic rotation right", `shoulder.${hand} flexion`, `shoulder.${hand} abduction`,
  `shoulder.${hand} internal rotation`, `elbow.${hand} flexion`,
];

/**
 * The search's bounds, each mapped from [-1, 1]. A chamber goal spans its freedom's range; a push's
 * level is its sense and activation together (under a tenth, no push).
 */
const BOUNDS = { chamberSeconds: [0.1, 0.6], from: [0, 0.3], length: [0, 0.3], distance: [0.3, 1] };
const OFF = 0.1;

/** How many numbers a strike takes: with a chamber, or (`guard`) thrown from the guard itself. */
export const dimensions = (hand, guard = false) => (guard ? 0 : 1 + chambered(hand).length) + 3 * pushed(hand).length + 1;

const map = (u, [lo, hi]) => lo + (Math.max(-1, Math.min(1, u)) + 1) / 2 * (hi - lo);

/**
 * The strike and the target distance that `unit` (numbers in [-1, 1]) stands for, on `spec`. With
 * `guard` the strike has no chamber: it is thrown from the lab's guard, as a straight is.
 */
export function decode(unit, spec, hand = "right", guard = false) {
  const ranges = new Map(spec.joints.flatMap((j) => j.dofs.map((d) => [`${j.name} ${d.positive}`, [d.min.value, d.max.value]])));
  let k = 0;
  const chamberSeconds = guard ? 0 : map(unit[k++], BOUNDS.chamberSeconds);
  const pose = guard ? {} : Object.fromEntries(chambered(hand).map((name) => [name, map(unit[k++], ranges.get(name))]));
  const pushes = [];
  for (const channel of pushed(hand)) {
    const level = Math.max(-1, Math.min(1, unit[k++])), from = map(unit[k++], BOUNDS.from), length = map(unit[k++], BOUNDS.length);
    if (Math.abs(level) >= OFF && length > 0) pushes.push({ channel, sense: level > 0 ? 1 : -1, from, to: from + length, level: Math.abs(level) });
  }
  const distance = map(unit[k++], BOUNDS.distance);
  const strike = guard ? { name: `searched ${hand} straight`, hand, pushes }
    : { name: `searched ${hand} blow`, hand, chamber: { seconds: chamberSeconds, pose }, pushes };
  return { strike, distance };
}

/**
 * `strike` with every push `shift` s later (none before the chamber's end) and its activation
 * times `scale` (at most 1): what a mind cannot hold exactly from one blow to the next.
 */
export function perturbed(strike, { shift = 0, scale = 1 }) {
  return { ...strike, pushes: strike.pushes.map((p) => ({ ...p, from: Math.max(0, p.from + shift), to: Math.max(0, p.to + shift),
    level: Math.min(1, (p.level ?? 1) * scale) })) };
}

/**
 * Run a strike on `model` at `hz`: the one `unit` stands for, or a given `strike` at `distance`.
 * Returns the forward speed at the target (0 if the fist never arrives), when it arrived after the
 * chamber, and the fist's peak speed before it.
 */
export async function evaluateStrike({ model = "workshop-fighter", unit, hz = 120, hand = "right", guard = false, perturbation, ...given }) {
  const spec = humanSpec(model);
  const decoded = unit ? decode(unit, spec, hand, guard) : given;
  const strike = perturbation ? perturbed(decoded.strike, perturbation) : decoded.strike, distance = decoded.distance;
  const chamber = strike.chamber ?? { seconds: 0 };
  const head = spec.segments.find((s) => s.name === "head");
  const radius = head.shape.radius.value;
  // `given.centre` places the sphere anywhere, for a control; a search places it straight ahead.
  const target = given.centre ? new Vector3(...given.centre) : new Vector3(...head.centreOfMass.value).addInPlaceFromFloats(0, 0, distance);
  const forward = new Vector3(0, 0, 1);
  const stand = await coreStand(spec, { ground: true, hz });
  const routine = startRoutine(stand.built, stand.world, [
    { kind: "settle", seconds: SETTLE },
    { kind: "strike", seconds: chamber.seconds + WINDOW, strike },
  ]);
  const fist = routine.fists[hand];
  const last = { position: new Vector3(), velocity: new Vector3() }, path = new Vector3(), from = new Vector3();
  let closing = 0, at = null, peak = 0, nearest = Infinity, watching = false;
  try {
    for (let i = 0; i < stand.seconds(SETTLE + chamber.seconds + WINDOW); i++) {
      stand.step(1);
      const s = routine.state();
      const live = s.stepIndex === 1 && s.into >= chamber.seconds;
      if (live && watching) {
        // The fist's path over the step, a straight segment from where it was: where it first
        // crosses the sphere, if it does, and its velocity there, interpolated along the step.
        fist.position.subtractToRef(last.position, path);
        last.position.subtractToRef(target, from);
        const a = path.lengthSquared(), b = Vector3.Dot(from, path), c = from.lengthSquared() - radius * radius;
        const root = b * b - a * c;
        const t = c <= 0 ? 0 : root >= 0 && a > 0 ? (-b - Math.sqrt(root)) / a : Infinity;
        const along = a > 0 ? Math.max(0, Math.min(1, -b / a)) : 0;
        nearest = Math.min(nearest, Math.sqrt(Math.max(0, from.lengthSquared() + 2 * along * b + along * along * a)));
        if (c > 0 && t >= 0 && t <= 1) {
          closing = Vector3.Dot(Vector3.Lerp(last.velocity, fist.velocity, t), forward);
          at = +(s.into - chamber.seconds - (1 - t) / stand.seconds(1)).toFixed(4);
          break;
        }
        peak = Math.max(peak, fist.velocity.length());
      }
      // A fist already in the sphere when the pushes begin has not arrived: wait for it to leave.
      if (live) watching = Vector3.Distance(fist.position, target) >= radius;
      last.position.copyFrom(fist.position);
      last.velocity.copyFrom(fist.velocity);
    }
  } finally { routine.dispose(); stand.dispose(); }
  const score = at !== null ? closing : -(nearest - radius);
  return { score, closing, at, peak, distance, strike };
}
