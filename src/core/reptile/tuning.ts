/** Controller settings, independent of anatomy: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_CONTROL = Object.freeze({
  centre: .12, endpoint: .08, turn: .12, posture: .15, lever: .3, damping: .005, rootMotion: .05,
  crawlHeight: .85, stride: .07, lift: .06, liftConfirm: .001, swing: 1.2, shift: .45, settle: .3, plant: .2, plantSpeed: .05, placementLimit: 3,
  inset: .4, supportInset: .1, shiftError: .008, turnError: .05, yawStep: .18,
  minimumHeight: .6, minimumUp: .5, supportNormal: .5, contactMargin: .01,
  recoveryPath: .5, recovered: .5, recoveredSpeed: .1, recoveryHeight: .8, rollUpright: .95,
  rightingGain: 8, rightingDamping: 4, rightingEpsilon: .000001,
  foldHip: 1.2, foldKnee: 2.6, plantedKnee: 1.4, sweepYaw: 1.2, wrappedHip: .5, unwindHip: 2,
  placementError: .15, foldWait: .5, pressWait: .3, pressLever: .15, pressDepth: .002, recoveryLimit: 30, routeLimit: 10,
  recoveryServo: .06, placementServo: .008,
  recoveryTiming: Object.freeze({ centre: .12, endpoint: .08, turn: .12, posture: .15 }),
  prepare: .25, snap: .12, release: .2, open: .3, jawError: .03, jawClosed: .001, biteTimeout: 1.2, biteEntry: .008, bitePrepareNear: .12, biteElevation: .15, biteNear: .04, biteSlow: .2, biteHold: .03, biteReturnLimit: 3,
});
