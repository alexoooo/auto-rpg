import type { MusclePush } from "../../../../control/motor.ts";
import type { Pose } from "../../../../core/bodies/spec/pose.ts";
import type { Goal, Stroke, StrokeAt } from "../../shared/straight-drive.ts";

/**
 * **`moving`'s stroke**: a punch that meets its target fast and held. Read on a target that stands,
 * the drive's stroke met it either fast (5 to 6 m/s) with about a kilogram behind the fist, its
 * muscles a torque source that gives the arm no strength against the blow, or held (15 to 24 kg)
 * at the end of its travel, slowed to 3 m/s: never both, a clean blow under half a hit point.
 *
 * - **Driven**: the trunk turns and leans toward its contact goals from the fire. The fist is
 *   steered along the line from the shoulder to the target: each step the arm's pose is solved for
 *   the fist `SPEED` × `AHEAD` m further along that line than it stands (no further than `THROUGH`
 *   m past the target), with the trunk as it stands, and each of the arm's freedoms is pushed at
 *   full level toward the speed that would reach that pose in `AHEAD` s (no faster than
 *   `ARM_SPEED`), the elbow flat out toward its pose, never braked short of it. So the fist goes
 *   straight at the target as fast as the muscles take it toward `SPEED`, and every freedom holds
 *   at its full strength either way rather than giving.
 * - **Held**: from the fist's first touch every freedom of the arm and the trunk is held where it
 *   is at full strength, speed nought, for `HOLD` s, so the blow meets the arm as a strut with the
 *   turned trunk behind it.
 * - **Done** `HOLD` s after its first touch, or `LONGEST` s after the fire with none.
 *
 * Its blow is as heavy as the arm is straight at the touch, so it is thrown from where the
 * straight arm just reaches: on a Warrior at a target that stands, 0.68 to 0.70 m trunk to trunk,
 * 23 to 29 kg at 4 m/s, 0.55 to 0.86 hp. Nearer, the elbow is still bent at the touch (60 to 90
 * degrees) and a kilogram or so is behind the fist; further, the arm comes straight short of the
 * target and the fist has stopped.
 */
export const MOVING_STROKE: Stroke = { drive, done: (since, touched) => touched !== null ? touched >= HOLD : since >= LONGEST };

/** How far past the target the fist is steered toward, m. */
const THROUGH = 0.2;
/** The fist's speed along the line it is steered toward, m/s, and how far ahead of it, s, its pose is solved. */
const SPEED = 10, AHEAD = 0.02;
/** The fastest an arm's freedom is driven, rad/s; the speed the trunk's are. */
const ARM_SPEED = 40, TRUNK_SPEED = 8;
/** Within this of its goal a trunk freedom is held there, rad. */
const NEAR = 0.02;
/** How long the stroke holds from its first touch, s; and the longest it runs touching nothing. */
const HOLD = 0.08, LONGEST = 0.35;

function drive(at: StrokeAt, pushes: MusclePush[]): Pose {
  const { view, touched } = at, posture: Record<string, number> = { ...at.guard };
  const { trunk, pose } = at.reach((apart, along) => Math.min(apart + THROUGH, Math.max(0, along) + SPEED * AHEAD), false);
  const held = (channel: string) => pushes.push({ channel, sense: 1, level: 1, speed: 0 });
  for (const goal of [...trunk, ...pose]) posture[goal.channel] = goal.angle;
  if (touched !== null) {
    for (const goal of [...trunk, ...pose]) held(goal.channel);
    return posture;
  }
  const toward = (goal: Goal, speed: number) => {
    const error = goal.angle - (view.angles[goal.channel] ?? 0), v = Math.max(-speed, Math.min(speed, error / AHEAD));
    pushes.push({ channel: goal.channel, sense: v >= 0 ? 1 : -1, level: 1, speed: v });
  };
  for (const goal of trunk) {
    if (Math.abs(goal.angle - (view.angles[goal.channel] ?? 0)) <= NEAR) held(goal.channel);
    else toward(goal, TRUNK_SPEED);
  }
  for (const goal of pose) {
    if (/^elbow\.\w+ flexion$/.test(goal.channel)) {
      const sense = goal.angle >= (view.angles[goal.channel] ?? 0) ? 1 : -1;
      pushes.push({ channel: goal.channel, sense, level: 1, speed: sense * ARM_SPEED });
    } else toward(goal, ARM_SPEED);
  }
  return posture;
}
