import { SEGMENT_DENSITY, type DensitySegment } from "../core/human/tables/densities.ts";
import type { BodySpec } from "../core/spec/body.ts";
import { ballMoment, ballRadius } from "../core/spec/geometry.ts";
import { derive, si, type Quantity, type Vec3 } from "../core/spec/quantity.ts";
import { segmentOf } from "../core/spec/body.ts";

const densityOf = (part: string) => {
  const kind = part.split(".")[0]!;
  return Object.hasOwn(SEGMENT_DENSITY, kind) ? SEGMENT_DENSITY[kind as DensitySegment] : null;
};

/** Parts whose radius or sourced density can construct a dummy, in anatomical order. */
export const dummyParts = (spec: BodySpec): readonly string[] => spec.down.kind === "low" ? [] : spec.segments
  .filter(part => part.shape.kind === "sphere" || part.shape.kind === "capsule" || densityOf(part.name) !== null)
  .map(part => part.name);

/** An available target part, or the body's default high part when a linked part is unavailable. */
export const dummyPart = (spec: BodySpec, requested?: string | null): string =>
  requested && dummyParts(spec).includes(requested) ? requested : spec.marks.high;

/**
 * A ball of the attacker's named part, its radius or the radius holding its mass at its sourced
 * density. Its middle and leg membership follow the source anatomy; its high point and base are
 * the ball itself. The body's frame origin is its centre.
 */
export function dummySpec(attacker: BodySpec, part: string = attacker.marks.high): BodySpec {
  const made = segmentOf(attacker, part);
  if (!made) throw new Error(`${attacker.model} has no ${part} a ball is made of`);
  const mass = derive("kg", `the attacker's ${part}'s mass`, [made.mass], m => m);
  const radius = ((): Quantity<number> => {
    if (made.shape.kind === "capsule" || made.shape.kind === "sphere") return derive("m", `the attacker's ${part}'s ${made.shape.kind}'s radius`, [made.shape.radius], r => r);
    const density = densityOf(part);
    if (!density) throw new Error(`${attacker.model}'s ${part} has no radius and no density a ball is made by`);
    return derive("m", `the ball that holds the attacker's ${part}'s mass at its density`, [made.mass, si(density)], (m, rho) => ballRadius(m / rho));
  })();
  const centre = derive("m", "the ball's centre, its frame's origin", [], (): Vec3 => [0, 0, 0]);
  if (attacker.down.kind === "low") throw new Error(`a dummy is down by its attacker's fall bar, and ${attacker.model} has none`);
  return {
    model: `${attacker.model}.dummy`, substance: attacker.substance, mass,
    stature: derive("m", "the ball's height, twice its radius", [radius], r => 2 * r),
    segments: [{
      name: part, proximal: centre, mass, centreOfMass: centre,
      distal: derive("m", "the ball's top, its radius over its centre", [radius], (r): Vec3 => [0, r, 0]),
      inertia: derive("kg m2", "a solid ball's moment about each axis", [mass, radius], (m, r): Vec3 => [ballMoment(m, r), ballMoment(m, r), ballMoment(m, r)]),
      shape: { kind: "sphere", centre, radius },
      surface: { stiffness: derive("N/m", `the attacker's ${part}'s surface`, [made.surface.stiffness], k => k) },
    }],
    joints: [],
    wounds: { hp: derive("HP", "the attacker's hit points", [attacker.wounds.hp], hp => hp), vital: [], whole: [part] },
    attributes: { balance: derive("%", "the attacker's balance", [attacker.attributes.balance], percent => percent),
      haste: derive("%", "the attacker's haste", [attacker.attributes.haste], percent => percent) },
    down: { kind: "asked", fallen: derive("m", "the attacker's fall bar", [attacker.down.fallen], fallen => fallen) },
    marks: { high: part, middle: attacker.marks.middle.includes(part) ? [part] : [], base: part,
      legs: attacker.marks.legs.includes(part) ? [part] : [], guards: [] },
  };
}
