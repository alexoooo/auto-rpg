
/** Righting by routes, placing the paws and rising (`rightingByRoutes`): `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_RECOVERY = Object.freeze({
  recoveryPath: .5, recovered: .5, recoveredSpeed: .1, recoveryHeight: .8,
  rightingGain: 8, rightingDamping: 4, rightingEpsilon: .000001,
  foldHip: 1.2, foldKnee: 2.6, plantedKnee: 1.4, sweepYaw: 1.2, wrappedHip: .5, unwindHip: 2,
  placementError: .15, foldWait: .5, pressWait: .3, pressLever: .15, pressDepth: .002, recoveryLimit: 30, routeLimit: 10,
  recoveryServo: .06, placementServo: .008,
});
