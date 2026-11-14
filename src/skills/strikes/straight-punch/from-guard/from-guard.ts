import type { Body, BodyView } from "../../../../control/body.ts";
import { bodyEffectors } from "../../../../control/effectors.ts";
import type { Pose } from "../../../../core/bodies/spec/pose.ts";
import type { Side } from "../../../../core/bodies/bilateral.ts";

/** How far from what preparation asks the striking arm's freedoms may stand, rad, and how fast they may move, rad/s, for its drive to begin. */
export const FROM_GUARD_ANGLE = 0.05, FROM_GUARD_SPEED = 0.2;

/**
 * **The punch from guard** (`StraightDriveOptions.ready`): the straight drive begins only with every
 * freedom of the striking arm within `FROM_GUARD_ANGLE` of what preparation asks of it (the guard,
 * or the chamber where the punch sets one) and moving no faster than `FROM_GUARD_SPEED`: a punch
 * thrown from its guard, never by an arm still on its way there.
 */
export function fromGuard(body: Body): (view: BodyView, hand: Side, posture: Pose) => boolean {
  const arms = new Map(bodyEffectors(body.built).map((effector) => [effector.segment.spec.name, effector.model.channels]));
  return (view, hand, posture) => (arms.get(`hand.${hand}`) ?? []).every((channel) =>
    Math.abs((view.angles[channel] ?? 0) - (posture[channel] ?? 0)) <= FROM_GUARD_ANGLE
    && Math.abs(body.muscles.speed(body.muscles.channel(channel))) <= FROM_GUARD_SPEED);
}
