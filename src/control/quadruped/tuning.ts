
/**
 * The controller settings of a body on paws, independent of its anatomy, one record per controller.
 * They are choices, not a measured optimum or evidence of a real animal's locomotion. Times are
 * seconds, lengths metres, angles radians, heights relative to the reference centre of mass.
 */

/**
 * The floating-base support solve the paws are held by (`supportedMotor`), and what a paw's contact is read as.
 * - `centre`, `endpoint`, `turn`, `posture`: damped support and pose tracking of the floating base.
 * - `lever`, `damping`, `rootMotion`: the support solve's wrench weighting, regularization and
 *   observed root-acceleration filtering.
 * - `supportNormal`, `contactMargin`: positive fixed-ground impulses, and sole versus edge contact.
 */
export const PAW_SUPPORT = Object.freeze({
  centre: .12, endpoint: .08, turn: .12, posture: .15, lever: .3, damping: .005, rootMotion: .05, supportNormal: .5, contactMargin: .01,
});

/** Brisk paw cycling and travel response: faster support and free-paw tracking during the trot. */
export const PAW_TRAVEL = Object.freeze({ centre: .06, endpoint: .04, turn: .06, posture: .06 });
