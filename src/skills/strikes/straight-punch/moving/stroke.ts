import type { Body, BodyView } from "../../../../control/body.ts";
import type { MusclePush } from "../../../../control/motor.ts";
import type { Pose } from "../../../../core/bodies/spec/pose.ts";
import type { Side } from "../../../../core/bodies/bilateral.ts";
import { chainTo } from "../../../../control/kinematics.ts";
import { channelName } from "../../../../core/bodies/muscle/driver.ts";
import { segmentResource, TRUNK_RESOURCE } from "../../../framework/action.ts";
import type { Goal, StrokeReach, ThrowMaker, TrunkAt } from "../../shared/straight-drive.ts";

/** What `moving`'s stroke is given each step (`drive`). */
interface StrokeAt {
  readonly view: BodyView;
  readonly since: number;
  readonly touched: number | null;
  readonly guard: Pose;
  /** What the stroke keeps from step to step of one commit: whether its arm is thrown at once (`NEARER`), null until its first step says. */
  readonly kept: { near: boolean | null };
  /** How far past the target the fist is steered toward, m (`StraightDrive.through`, its record's). */
  readonly through: number;
  /** The arm's pose with its striking point `out(apart, along)` m from the shoulder on the line to the target, the `trunk` as it stands or turned (`StraightTechnique`'s `reach`). */
  reach(out: (apart: number, along: number) => number, trunk: TrunkAt): StrokeReach;
}

/** The channels of the limbs `body` bears on, `hand`'s own arm apart: each end's chain from the joint it begins at. */
const borneOf = (body: Body, hand: Side): ReadonlySet<string> => new Set((body.built.spec.ends ?? []).filter((end) => end.segment !== `hand.${hand}`).flatMap((end) => {
  const chain = chainTo(body.built, body.built.segments.get(end.segment)!), from = "from" in end ? chain.findIndex((joint) => joint.spec.name === end.from) : 0;
  return chain.slice(Math.max(0, from)).flatMap((joint) => joint.dofs.map((_dof, k) => channelName(joint, k)));
}));

/**
 * **`moving`'s throw** (`Throw`): its stroke (`drive`), steered as the drive is after it where
 * its settings are `steered`, on legs it leaves to whatever walks them. It holds its hand and the
 * trunk and no legs, gives the legs no goal (no stand, halt or height, no turn of the hips and no
 * shift of the weight), and begins its stroke `settle` s after it starts, whatever the stance
 * does under it; of the guard it returns to and of its pushes it asks its own arm's and the
 * trunk's channels, and none of a limb the body bears on (`BodySpec.ends`, `borneOf`). It is
 * touched by the body it is thrown at, not by a guard it drives through.
 */
export const MOVING_THROW: ThrowMaker = ({ body, guard, technique, settings, policy }) => {
  const sides = { left: [segmentResource("hand.left"), TRUNK_RESOURCE], right: [segmentResource("hand.right"), TRUNK_RESOURCE] };
  const borne = { left: borneOf(body, "left"), right: borneOf(body, "right") };
  const state: StrokeAt["kept"] = { near: null };
  return {
    state,
    holds: (hand) => sides[hand],
    quiet: () => true,
    begin() { state.near = null; },
    touches: (met) => !(met?.kind === "body" && met.guard),
    drive(view, hand, since, touched, pushes) {
      const posture = drive({ view, since, touched, guard, kept: state, through: settings.through, reach: (out, trunk) => technique.reach(view, hand, { out, trunk }) }, pushes);
      if (settings.steered) technique.steer(view, hand, since, pushes, policy);
      return posture;
    },
    done: (since, touched) => touched !== null ? touched >= settings.follow : since >= settings.longest,
    leaves: (hand) => borne[hand],
    legs: () => null,
  };
};

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
 *   (no further than its record's `through` m past the target), with the trunk as it stands, and each of the
 *   arm's freedoms is pushed at full level toward the speed that would reach that pose in `AHEAD`
 *   s (no faster than `ARM_SPEED`), the elbow flat out toward its pose, never braked short of it.
 * - **Held**: from the fist's first touch of the body (a guard it drives through), the arm is held
 *   where it is at full strength, speed nought, for its record's `follow` s, a strut with the
 *   turning trunk behind it.
 * - **Done** `follow` s after its first touch, or its record's `longest` s after the fire with none.
 * - **Its joints** as its reach names them (`StrokeReach`): the trunk's turns, chest and waist, and
 *   the elbow.
 *
 * On a Warrior at a target that stands, swept from 0.45 to 1.2 m trunk to trunk: thrown at once it
 * lands 0.6 to 0.9 hp from 0.67 to 0.70 m; trunk first, 0.5 to 1.5 hp from 0.75 to 0.87 m, the fist
 * at 5 to 7 m/s, the elbow bent 30 to 60 degrees; between and beside them blows of 0.3 to 0.5 hp.
 */
function drive(at: StrokeAt, pushes: MusclePush[]): Pose {
  const { view, touched, kept } = at, posture: Record<string, number> = { ...at.guard };
  const reached = at.reach((apart, along) => Math.min(apart + at.through, Math.max(0, along) + SPEED * AHEAD), "standing"), pose = reached.pose;
  const trunk: Goal[] = [];
  for (const goal of reached.trunk) {
    if (!reached.turns.includes(goal.channel)) { trunk.push(goal); continue; }
    const sense = Math.sign(goal.angle) || 1;
    for (const channel of reached.turns) trunk.push({ channel, angle: sense * TURN });
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
  kept.near ??= reached.apart <= reached.arm - NEARER;
  if (!kept.near && at.since < TRUNK_FIRST) {
    for (const goal of pose) held(goal.channel);
    return posture;
  }
  for (const goal of pose) {
    if (reached.elbow.has(goal.channel)) {
      const sense = goal.angle >= (view.angles[goal.channel] ?? 0) ? 1 : -1;
      pushes.push({ channel: goal.channel, sense, level: 1, speed: sense * ARM_SPEED });
    } else toward(goal, ARM_SPEED);
  }
  return posture;
}
