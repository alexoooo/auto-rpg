
/** The controller settings of a body on paws, independent of its anatomy, one record per controller. */

/** The floating-base support solve the paws are held by (`supportedMotor`), and what a paw's contact is read as: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_MOTOR = Object.freeze({
  centre: .12, endpoint: .08, turn: .12, posture: .15, lever: .3, damping: .005, rootMotion: .05, supportNormal: .5, contactMargin: .01,
});

/** Brisk paw cycling and travel response: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_TRAVEL = Object.freeze({ centre: .06, endpoint: .04, turn: .06, posture: .06 });
