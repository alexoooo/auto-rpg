/** The reptile's controller settings, independent of its anatomy, one record per controller. */

/** The floating-base support solve the paws are held by (`supportedMotor`), and what a paw's contact is read as: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_MOTOR = Object.freeze({
  centre: .12, endpoint: .08, turn: .12, posture: .15, lever: .3, damping: .005, rootMotion: .05, supportNormal: .5, contactMargin: .01,
});

/** Brisk paw cycling and travel response: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_TRAVEL = Object.freeze({ centre: .06, endpoint: .04, turn: .06, posture: .06 });

/** The crawl (`crawl`): its lowered support, its stride and its timing: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_CRAWL = Object.freeze({
  crawlHeight: .85, stride: .07, lift: .06, liftConfirm: .001, swing: 1.2, shift: .45, settle: .3, plant: .2, plantSpeed: .05, placementLimit: 3,
  inset: .4, supportInset: .1, shiftError: .008, turnError: .05, yawStep: .18,
});

/** Diagonal travel and measured landing settings: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_TROT = Object.freeze({
  crawlHeight: 1, lift: .025, liftConfirm: .001, swing: .22, settle: .025, plant: .2, plantSpeed: .2, placementLimit: 3, landingWait: .1, turnError: .05,
  speed: .3, acceleration: .5, lead: .3, turnRate: .25, sideways: .15, turnMoveAngle: .2, resumeSpeed: .1, resumeHold: .3, resumeAngle: .05,
});

/** Righting, placing the paws and rising (`recover`): `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_RECOVERY = Object.freeze({
  recoveryPath: .5, recovered: .5, recoveredSpeed: .1, recoveryHeight: .8, rollUpright: .95,
  rightingGain: 8, rightingDamping: 4, rightingEpsilon: .000001,
  foldHip: 1.2, foldKnee: 2.6, plantedKnee: 1.4, sweepYaw: 1.2, wrappedHip: .5, unwindHip: 2,
  placementError: .15, foldWait: .5, pressWait: .3, pressLever: .15, pressDepth: .002, recoveryLimit: 30, routeLimit: 10,
  recoveryServo: .06, placementServo: .008,
});

/** The bite (`bite`, `quadrupedTactics`): the jaw's path, its reach and the strike cycle's limits: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_BITE = Object.freeze({
  prepare: .25, snap: .12, release: .2, open: .3, jawError: .03, jawClosed: .001, biteTimeout: 1.2, biteEntry: .008, bitePrepareNear: .12, biteElevation: .15, biteNear: .04, biteSlow: .2, biteHold: .03, biteReturnLimit: 8,
  approach: .3, braking: .5, creepNear: .3,
});
