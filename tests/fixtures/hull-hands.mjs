/**
 * **A workshop human with its measured hands** (`assets/humanoid/<model>-hands.json`): each empty
 * hand's open pose the palm hull and its fist the fist hull, at the fit scale, with the fist's
 * strike point the artifact's; the grip pose and the hand's own shape keep the spec's capsules.
 * A fixture for the core's hull poses while the game's specs carry capsules.
 */
import { readFileSync } from "node:fs";
import { FIT_SCALE } from "../../src/core/human/model.ts";
import { derive, sourced } from "../../src/core/spec/quantity.ts";
import { scale } from "../../src/core/spec/vec.ts";

const handsOf = (model) => JSON.parse(readFileSync(new URL(`../../assets/humanoid/${model}-hands.json`, import.meta.url), "utf8"));

/** `spec` with its hands' open and fist poses its model's measured hulls. */
export function hullHands(spec) {
  const hands = handsOf(spec.model), source = `${spec.model}-hands`;
  const atFit = (side, path, point) => derive("m", "the hand's geometry at the fit scale",
    [sourced(point, "m", source, `/${side}/${path}`), FIT_SCALE], (q, s) => scale(q, s));
  const hull = (side, piece) => ({ kind: "hull", points: hands[side][piece].hull.map((point, i) => atFit(side, `${piece}/hull/${i}`, point)) });
  return {
    ...spec,
    segments: spec.segments.map((segment) => {
      const [part, side] = segment.name.split(".");
      if (part !== "hand" || !segment.handPoses) return segment;
      return {
        ...segment,
        points: { ...segment.points, strike: atFit(side, "fist/strike", hands[side].fist.strike) },
        handPoses: { open: hull(side, "palm"), fist: hull(side, "fist"), grip: segment.handPoses.grip },
      };
    }),
  };
}
