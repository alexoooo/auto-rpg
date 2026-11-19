

/**
 * The crawl (`crawl`): its lowered support, its stride and its timing. Times are seconds, lengths
 * metres, angles radians, heights relative to the reference centre of mass.
 * - `height`, `stride`, `lift`: lowered three-paw support where no height is asked, and one-paw
 *   swing.
 * - `swing`, `shift`, `settle`, `plant`, `plantSpeed`: slow placement and continued downward
 *   acquisition.
 * - `inset`, `supportInset`, `shiftError`: desired support-centre inset and actual containment
 *   tolerance.
 * - `yawStep`, `turnError`: bounded heading advance, per four paws.
 * - `liftConfirm`, `placementLimit`: a step counts only for a paw that rose this far off the
 *   ground; a paw not landed in this long returns to its anchor.
 */
export const REPTILE_CRAWL = Object.freeze({
  height: .85, stride: .035, lift: .025, liftConfirm: .001, swing: 1.2, shift: .45, settle: .3, plant: .2, plantSpeed: .05, placementLimit: 3,
  inset: .4, supportInset: .1, shiftError: .008, turnError: .05, yawStep: .18,
});

/**
 * Diagonal travel and measured landing settings, in the crawl's units.
 * - `height`, `lift`, `reach`: standing height where no height is asked; each paw within `reach`
 *   of how far its sole reaches on the floor and at the swing's lift.
 * - `speed`, `acceleration`, `sideways`: bounded velocity changes and slower lateral travel; never
 *   faster than the paws' reach allows.
 * - `swing`, `settle`, `plant`, `plantSpeed`, `touch`: alternating diagonal pairs; a paw within
 *   `touch` of the floor is down and presses within `plant`, so a paw hovering a millimetre up
 *   still bears.
 * - `swingResponse`: a swinging paw's path kept on the ground and tracked firm.
 * - `turnRate`, `turnLead`, `turnError`: turning while travelling, the heading asked never
 *   further than `turnLead` ahead of the trunk's.
 * - `liftConfirm`, `landingWait`, `placementLimit`: a step counts only for a paw that lifted; a
 *   swing ends once its pair bears; a delayed landing brakes, and an unlanded pair returns to its
 *   anchors.
 */
export const REPTILE_TROT = Object.freeze({
  height: 1, lift: .025, liftConfirm: .001, swing: .175, settle: .025, plant: .03, plantSpeed: .2, placementLimit: 3, landingWait: .1, turnError: .05,
  speed: 1.15, acceleration: .5, turnRate: .6, turnLead: .2, sideways: .15,
  reach: .9, touch: .003, swingResponse: .025,
});

/**
 * The paw legs' own settings (`pawLegs`), whatever gaits they go by, in the crawl's units.
 * - `resumeSpeed`, `resumeHold`: a resumed body places each paw through its crawl, then holds
 *   quiet four-sole support before it goes on.
 * - `leanInset`: a centre asked kept within loaded paw support.
 */
export const PAW_LEGS = Object.freeze({ resumeSpeed: .1, resumeHold: .3, leanInset: .02 });
