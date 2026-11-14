import manHands from "../../../../assets/humanoid/man-hands.json" with { type: "json" };
import womanHands from "../../../../assets/humanoid/woman-hands.json" with { type: "json" };
import type { SourceKey } from "../../sources.ts";

import { sourced, type Quantity, type Vec3 } from "../../quantity.ts";
import type { HandFigure } from "./figure.ts";
import type { HumanModel } from "./rig.ts";
import type { Side } from "../bilateral.ts";

/**
 * **A human model's hands**, as `scripts/humanoid/hand-envelope.mjs` measures them from its skin
 * and writes them to `assets/humanoid/<model>-hands.json` (the script's header gives the rules): each
 * side's open hull and palm centre, and its fist's hull and strike, body frame, authored size.
 */
interface HandsFile {
  readonly left: SideFile;
  readonly right: SideFile;
}
interface SideFile {
  readonly palm: { readonly hull: readonly number[][]; readonly patch: { readonly centre: readonly number[] } };
  readonly fist: { readonly hull: readonly number[][]; readonly strike: readonly number[] };
}

const FILES: Readonly<Record<HumanModel, { readonly file: HandsFile; readonly source: SourceKey }>> = {
  man: { file: manHands, source: "man-hands" },
  woman: { file: womanHands, source: "woman-hands" },
};

export function humanHands(model: HumanModel): Readonly<Record<Side, HandFigure>> {
  const { file, source } = FILES[model];
  const hand = (side: Side): HandFigure => {
    const at = (point: readonly number[], path: string): Quantity<Vec3> => sourced(point as unknown as Vec3, "m", source, `/${side}/${path}`);
    const { palm, fist } = file[side];
    return Object.freeze({
      palm: Object.freeze({ hull: Object.freeze(palm.hull.map((p, i) => at(p, `palm/hull/${i}`))), centre: at(palm.patch.centre, "palm/patch/centre") }),
      fist: Object.freeze({ hull: Object.freeze(fist.hull.map((p, i) => at(p, `fist/hull/${i}`))), strike: at(fist.strike, "fist/strike") }),
    });
  };
  return Object.freeze({ left: hand("left"), right: hand("right") });
}
