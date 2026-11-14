

/** The crawl (`crawl`): its lowered support, its stride and its timing: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_CRAWL = Object.freeze({
  crawlHeight: .85, stride: .035, lift: .025, liftConfirm: .001, swing: 1.2, shift: .45, settle: .3, plant: .2, plantSpeed: .05, placementLimit: 3,
  inset: .4, supportInset: .1, shiftError: .008, turnError: .05, yawStep: .18, leanInset: .02,
});

/** Diagonal travel and measured landing settings: `docs/reference/reptile.md#controller-settings`. */
export const REPTILE_TROT = Object.freeze({
  crawlHeight: 1, lift: .025, liftConfirm: .001, swing: .175, settle: .025, plant: .03, plantSpeed: .2, placementLimit: 3, landingWait: .1, turnError: .05,
  speed: 1.15, acceleration: .5, turnRate: .6, turnLead: .2, sideways: .15, resumeSpeed: .1, resumeHold: .3,
  reach: .9, touch: .003, swingResponse: .025,
});
