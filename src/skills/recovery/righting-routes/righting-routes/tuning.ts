
/**
 * Righting by routes, placing the paws and rising (`rightingByRoutes`). Times are seconds, lengths
 * metres, angles radians, heights relative to the reference centre of mass.
 * - `rightingGain`, `rightingDamping`, `rightingEpsilon`: the upright-error moment projected onto
 *   loaded hips, bounded by their muscles.
 * - `foldHip`, `foldKnee`, `plantedKnee`, `sweepYaw`, `wrappedHip`, `unwindHip`: a wrapped paw
 *   moved around a trunk end before unfolding.
 * - `recoveryServo`, `placementServo`, `placementError`, `foldWait`: holding and moving legs
 *   tracked apart; actual joint arrival and paw clearance required. The placing leg's response,
 *   8 ms, is one 120 Hz step; the servo's step is exact (`damping`), so it is 8 ms at every rate.
 * - `pressWait`, `pressLever`, `pressDepth`: a bounded joint servo lowers a paw; the lever is a
 *   controller approximation, not anatomy.
 * - `routeLimit`, `recoveryLimit`: try the other trunk end; time out.
 * - `recoveryPath`, `recoveryHeight`, `recoveredSpeed`, `recovered`: done on quiet four-sole
 *   support at height.
 */
export const REPTILE_RECOVERY = Object.freeze({
  recoveryPath: .5, recovered: .5, recoveredSpeed: .1, recoveryHeight: .8,
  rightingGain: 8, rightingDamping: 4, rightingEpsilon: .000001,
  foldHip: 1.2, foldKnee: 2.6, plantedKnee: 1.4, sweepYaw: 1.2, wrappedHip: .5, unwindHip: 2,
  placementError: .15, foldWait: .5, pressWait: .3, pressLever: .15, pressDepth: .002, recoveryLimit: 30, routeLimit: 10,
  recoveryServo: .06, placementServo: .008,
});
