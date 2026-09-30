import type { WorkshopModel } from "../core/human/rig.ts";
import type { FistPose } from "./fist.ts";

/**
 * **A hand closed on the club's haft**, built by `fist.ts` as the fist is: finger angles are the
 * joints' flexion from a straight finger, degrees, and the thumb's phalanges point along the palm's
 * axes. Fitted on the skin by `scripts/core-lab/haft-fit.mjs` (its header gives the rule) around
 * the haft where the core's grip puts it (`inHand`, `src/core/human/grip.ts`): each finger wraps
 * it, its phalanges as near it as they lie without sinking in, and the thumb's pad rests on it.
 * One pose for both hands. The fit's gaps: `docs/reference/lab.md#club-grip`.
 *
 * It is the wooden club's grip (`woodenClub`, an 18 mm haft), not a grip on anything held: the fit
 * reads the haft's radius and place. The skin is a costume; the hand's collision shape and the
 * club's are the core's, whatever the fingers show.
 */
export const CLUB_GRIP: Readonly<Record<WorkshopModel, FistPose>> = {
  "workshop-fighter": {
    fingers: {
      index: { mcp: 25, pip: 55, dip: 35.8 },
      middle: { mcp: 45, pip: 50, dip: 32.5 },
      ring: { mcp: 45, pip: 45, dip: 29.3 },
      pinky: { mcp: 50, pip: 10, dip: 6.5 },
    },
    thumb: [
      { forward: 0.419, palmar: 0.576, radial: 0.702 },
      { forward: 0.665, palmar: 0.724, radial: -0.184 },
      { forward: 0.083, palmar: 0.539, radial: -0.838 },
    ],
  },
  "workshop-rogue": {
    fingers: {
      index: { mcp: 35, pip: 30, dip: 19.5 },
      middle: { mcp: 35, pip: 60, dip: 39 },
      ring: { mcp: 50, pip: 25, dip: 16.3 },
      pinky: { mcp: 60, pip: 5, dip: 3.3 },
    },
    thumb: [
      { forward: 0.446, palmar: 0.722, radial: 0.529 },
      { forward: 0.54, palmar: 0.701, radial: -0.465 },
      { forward: -0.275, palmar: 0.247, radial: -0.929 },
    ],
  },
};
