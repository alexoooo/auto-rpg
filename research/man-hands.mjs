/**
 * **The Warrior with Man's hands**: workshop-fighter's spec with each hand's open pose the palm
 * hull and its fist the fist hull of `assets/humanoid/man-contact-geometry.json`, at the fit scale,
 * with the fist's strike point the artifact's. The grip keeps the spec's capsule fist, so a held
 * item would seat as it does today; the feet keep the boot. Empty hands only: with a held item
 * the core's grip collider is the segment's own shape (`handShapeAt`), which here is the palm.
 * Research only: the posture trials' `envelopeSpec` puts the same hulls on every pose and changes
 * the feet.
 */
import { FIT_SCALE } from "../src/core/human/model.ts";
import { derive, sourced } from "../src/core/spec/quantity.ts";
import { scale } from "../src/core/spec/vec.ts";
import MAN from "../assets/humanoid/man-contact-geometry.json" with { type: "json" };

export const HAND_GEOMETRIES = Object.freeze(["capsule", "hull"]);

const atFit = (side, path, point) => derive("m", "Man's contact geometry at the fit scale",
  [sourced(point, "m", "man-contact-geometry", `/${side}/${path}`), FIT_SCALE], (q, s) => scale(q, s));

const hull = (side, piece) => ({
  kind: "hull",
  points: MAN[side][piece].hull.map((point, i) => atFit(side, `${piece}/hull/${i}`, point)),
});

/** The spec with Man's hands (`hull`), or unchanged (`capsule`). */
export function handsSpec(spec, hands = "capsule") {
  switch (hands) {
    case "capsule": return spec;
    case "hull": break;
    default: throw new Error(`no hand geometry ${hands}`);
  }
  if (spec.held?.length) throw new Error("Man's hands are measured empty");
  return {
    ...spec,
    segments: spec.segments.map((segment) => {
      const [part, side] = segment.name.split(".");
      if (part !== "hand") return segment;
      if (!segment.handPoses || !segment.points?.knuckles) throw new Error(`${segment.name} has no hand poses`);
      const open = hull(side, "palm"), fist = hull(side, "fist");
      return {
        ...segment, shape: open,
        points: { ...segment.points, strike: atFit(side, "fist/strike", MAN[side].fist.strike) },
        handPoses: { open, fist, grip: segment.handPoses.grip },
      };
    }),
  };
}
