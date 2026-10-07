import type { ItemSpec } from "../spec/body.ts";
import { square } from "../math/real.ts";
import { cylinderMoments } from "../spec/geometry.ts";
import { derive, si, sourced, type Quantity } from "../spec/quantity.ts";
import { midpoint } from "../spec/vec.ts";

/**
 * **The wooden club** (`owner-club`): the strongest hit with it, one-handed, is the blow things
 * are priced against (`CLUB_BEST`, `src/core/rules/rulebook.ts`). A haft and a swell, each a solid
 * cylinder of ash, end to end.
 *
 * Its frame: the origin at the butt, y up the haft to the swell's end, x and z across. Its mass is
 * the two cylinders' volumes at ash's density; its inertia is each cylinder's principal moments
 * about its own centre (`cylinderMoments`), moved to the club's centre of mass. It collides as two capsules, each spanning its cylinder's length.
 *
 * Points: `swellFrom` and `swellTo`, the ends of the swell's capsule's axis, where a blow lands
 * and between which one is stopped (`ItemSpec.cover`), and `swell`, the middle of that axis, which
 * a blow is aimed by (`ItemSpec.aim`).
 */
const HAFT_LENGTH = sourced(0.45, "m", "owner-club", "a 0.45 m haft");
const HAFT_RADIUS = sourced(18, "mm", "owner-club", "of 18 mm radius");
const SWELL_LENGTH = sourced(0.25, "m", "owner-club", "a 0.25 m swell");
const SWELL_RADIUS = sourced(40, "mm", "owner-club", "of 40 mm radius");
const ASH = sourced(678, "kg/m3", "wood-handbook-2010", "white ash at 12 % moisture content, 678 kg m-3");

export function woodenClub(): ItemSpec {
  const haftRadius = si(HAFT_RADIUS), swellRadius = si(SWELL_RADIUS);
  const cylinder = (what: string, radius: Quantity<number>, length: Quantity<number>) =>
    derive("kg", `the ${what}: a solid cylinder's volume at the wood's density`, [radius, length, ASH], (r, l, rho) => rho * Math.PI * r * r * l);
  const haftMass = cylinder("haft", haftRadius, HAFT_LENGTH), swellMass = cylinder("swell", swellRadius, SWELL_LENGTH);
  const mass = derive("kg", "the haft and the swell", [haftMass, swellMass], (h, s) => h + s);
  const pieces = [haftMass, HAFT_LENGTH, haftRadius, swellMass, SWELL_LENGTH, swellRadius] as const;
  const centreOfMass = derive("m", "each cylinder's mass at its middle, the swell's beyond the haft", pieces,
    (mh, lh, _rh, ms, ls) => [0, (mh * lh / 2 + ms * (lh + ls / 2)) / (mh + ms), 0]);
  const inertia = derive("kg m2", "each solid cylinder's principal moments about its centre, moved to the club's centre",
    pieces, (mh, lh, rh, ms, ls, rs) => {
      const centre = (mh * lh / 2 + ms * (lh + ls / 2)) / (mh + ms);
      const haft = cylinderMoments(mh, lh, rh), swell = cylinderMoments(ms, ls, rs);
      const t = haft[0] + mh * square(lh / 2 - centre) + (swell[0] + ms * square(lh + ls / 2 - centre));
      return [t, haft[1] + swell[1], t];
    });
  const at = (rule: string, inputs: readonly Quantity<number>[], y: (...values: number[]) => number) =>
    derive("m", rule, inputs, (...values: number[]) => [0, y(...values), 0]);
  const swellFrom = at("the swell's capsule, in by its radius from the haft's end", [HAFT_LENGTH, swellRadius], (lh, rs) => lh + rs);
  const swellTo = at("the swell's capsule, in by its radius from the club's end", [HAFT_LENGTH, SWELL_LENGTH, swellRadius], (lh, ls, rs) => lh + ls - rs);
  return {
    name: "wooden club", mass, centreOfMass, inertia,
    shapes: [
      { kind: "capsule", radius: haftRadius,
        from: at("the haft's capsule, in by its radius from the butt", [haftRadius], (rh) => rh),
        to: at("the haft's capsule, in by its radius from the haft's end", [HAFT_LENGTH, haftRadius], (lh, rh) => lh - rh) },
      { kind: "capsule", radius: swellRadius, from: swellFrom, to: swellTo },
    ],
    points: { swellFrom, swellTo, swell: derive("m", "the middle of the swell's capsule's axis", [swellFrom, swellTo], midpoint) },
    aim: "swell",
    cover: ["swellFrom", "swellTo"],
    substance: "wood",
    grip: haftRadius,
  };
}
