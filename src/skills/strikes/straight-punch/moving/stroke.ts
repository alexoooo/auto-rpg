import type { MusclePush } from "../../../../control/motor.ts";
import type { Pose } from "../../../../core/bodies/spec/pose.ts";
import type { Goal, Stroke, StrokeAt } from "../../shared/straight-drive.ts";

/**
 * **`moving`'s stroke**: a punch that meets its target fast and held. Read on a target that stands,
 * the drive's stroke met it either fast (5 to 6 m/s) with about a kilogram behind the fist, its
 * muscles a torque source that gives the arm no strength against the blow, or held (15 to 24 kg)
 * at the end of its travel, slowed to 3 m/s: never both, a clean blow under half a hit point.
 *
 * - **The trunk** turns, chest and waist driven to their stops the way that brings the striking
 *   shoulder forward, and leans to the drive's lean, from the fire and on through the touch.
 * - **The arm**, at the fire, is thrown at once where the straight arm already reaches the target
 *   (the target no further from the shoulder than the arm less `NEARER`); else it is held while
 *   the trunk brings the shoulder in, and thrown `TRUNK_FIRST` s after the fire, the turn done. An
 *   arm thrown while the trunk still turns stalls the turn and pushes the shoulder back (the turn's
 *   muscles are weaker than the throw), and its fist ends short.
 * - **Thrown**, the fist is steered along the line from the shoulder to the target: each step the
 *   arm's pose is solved for the fist `SPEED` × `AHEAD` m further along that line than it stands
 *   (no further than `THROUGH` m past the target), with the trunk as it stands, and each of the
 *   arm's freedoms is pushed at full level toward the speed that would reach that pose in `AHEAD`
 *   s (no faster than `ARM_SPEED`), the elbow flat out toward its pose, never braked short of it.
 * - **Held**: from the fist's first touch of the body (a guard it drives through), the arm is held
 *   where it is at full strength, speed nought, for `HOLD` s, a strut with the turning trunk behind
 *   it.
 * - **Done** `HOLD` s after its first touch, or `LONGEST` s after the fire with none.
 *
 * On a Warrior at a target that stands, swept from 0.45 to 1.2 m trunk to trunk: thrown at once it
 * lands 0.6 to 0.9 hp from 0.67 to 0.70 m; trunk first, 0.5 to 1.5 hp from 0.75 to 0.87 m, the fist
 * at 5 to 7 m/s, the elbow bent 30 to 60 degrees; between and beside them blows of 0.3 to 0.5 hp.
 */
export const MOVING_STROKE: Stroke = { drive, done: (since, touched) => touched !== null ? touched >= HOLD : since >= LONGEST };

/** How far past the target the fist is steered toward, m. */
const THROUGH = 0.2;
/** The fist's speed along the line it is steered toward, m/s, and how far ahead of it, s, its pose is solved. */
const SPEED = 10, AHEAD = 0.02;
/** The fastest an arm's freedom is driven, rad/s; the trunk's. */
const ARM_SPEED = 40, TRUNK_SPEED = 20;
/** The chest's and the waist's turn asked, rad: past either's range, so each is driven to its stop. */
const TURN = 1;
/** How much nearer than the straight arm the target must be at the fire to throw the arm at once, m; else how long the trunk goes first, s. */
const NEARER = 0.03, TRUNK_FIRST = 0.14;
/** Within this of its goal a trunk freedom is held there, rad. */
const NEAR = 0.02;
/** How long the stroke holds from its first touch, s; and the longest it runs touching nothing. */
const HOLD = 0.08, LONGEST = 0.35;

function drive(at: StrokeAt, pushes: MusclePush[]): Pose {
  const { view, touched, kept } = at, posture: Record<string, number> = { ...at.guard };
  const reached = at.reach((apart, along) => Math.min(apart + THROUGH, Math.max(0, along) + SPEED * AHEAD), false), pose = reached.pose;
  const trunk: Goal[] = [];
  for (const goal of reached.trunk) {
    if (!/rotation/.test(goal.channel)) { trunk.push(goal); continue; }
    const sense = Math.sign(goal.angle) || 1;
    trunk.push({ channel: goal.channel, angle: sense * TURN }, { channel: goal.channel.replace(/^thoracic/, "lumbar"), angle: sense * TURN });
  }
  const held = (channel: string) => pushes.push({ channel, sense: 1, level: 1, speed: 0 });
  const toward = (goal: Goal, speed: number) => {
    const error = goal.angle - (view.angles[goal.channel] ?? 0), v = Math.max(-speed, Math.min(speed, error / AHEAD));
    pushes.push({ channel: goal.channel, sense: v >= 0 ? 1 : -1, level: 1, speed: v });
  };
  for (const goal of [...trunk, ...pose]) posture[goal.channel] = goal.angle;
  for (const goal of trunk) {
    if (Math.abs(goal.angle - (view.angles[goal.channel] ?? 0)) <= NEAR) held(goal.channel);
    else toward(goal, TRUNK_SPEED);
  }
  if (touched !== null) {
    for (const goal of pose) held(goal.channel);
    return posture;
  }
  kept.near ??= reached.apart <= reached.arm - NEARER ? 1 : 0;
  if (!kept.near && at.since < TRUNK_FIRST) {
    for (const goal of pose) held(goal.channel);
    return posture;
  }
  for (const goal of pose) {
    if (/^elbow\.\w+ flexion$/.test(goal.channel)) {
      const sense = goal.angle >= (view.angles[goal.channel] ?? 0) ? 1 : -1;
      pushes.push({ channel: goal.channel, sense, level: 1, speed: sense * ARM_SPEED });
    } else toward(goal, ARM_SPEED);
  }
  return posture;
}
