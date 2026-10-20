import type { ItemSpec } from "../spec/body.ts";
import { derive, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { cylinderMoments } from "../spec/geometry.ts";

const RADIUS = sourced(.16, "m", "owner-arena-items", "buckler: disc radius"), THICKNESS = sourced(.012, "m", "owner-arena-items", "buckler: disc thickness");
const DISC_MASS = sourced(.8, "kg", "owner-arena-items", "buckler: disc mass"), GRIP_MASS = sourced(.1, "kg", "owner-arena-items", "buckler: handle mass");
const GRIP_LENGTH = sourced(.12, "m", "owner-arena-items", "buckler: handle length"), GRIP_RADIUS = sourced(.018, "m", "owner-arena-items", "buckler: handle radius");
const OFFSET = sourced(.065, "m", "owner-arena-items", "buckler: disc centre outward from the grip axis");
const NORMAL = sourced([0, 0, 1], "1", "owner-arena-items", "buckler: outward normal, item +z");

/** A centre-grip disc, its handle and face one rigid load on the hand. */
export function buckler(): ItemSpec {
  const mass = derive("kg", "the disc and handle masses", [DISC_MASS, GRIP_MASS], (d, h) => d + h);
  const boss = derive("m", "the disc centre, halfway along the grip and forward of its axis", [GRIP_LENGTH, OFFSET], (l, z) => [0, l / 2, z]);
  const centreOfMass = derive("m", "disc and handle centres weighted by their masses", [DISC_MASS, GRIP_MASS, GRIP_LENGTH, OFFSET],
    (d, h, l, z) => [0, l / 2, d * z / (d + h)]);
  const inertia = derive("kg m2", "the disc and handle cylinder moments about their joint centre, by the parallel-axis rule",
    [DISC_MASS, GRIP_MASS, RADIUS, THICKNESS, GRIP_LENGTH, GRIP_RADIUS, OFFSET], (d, h, r, t, l, g, z) => {
      const disc = cylinderMoments(d, t, r), handle = cylinderMoments(h, l, g), centre = d * z / (d + h);
      const offset = d * (z - centre) * (z - centre) + h * centre * centre;
      return [disc[0] + handle[0] + offset, disc[0] + handle[1] + offset, disc[1] + handle[2]];
    });
  const diagonal = Math.sqrt(1 / 2);
  const directions: readonly Vec3[] = [[1, 0, 0], [diagonal, diagonal, 0], [0, 1, 0], [-diagonal, diagonal, 0], [-1, 0, 0], [-diagonal, -diagonal, 0], [0, -1, 0], [diagonal, -diagonal, 0]];
  const rim = directions.flatMap((direction) => {
    const along = sourced(direction, "1", "owner-arena-items", "buckler: regular octagon in the face plane");
    return [-1, 1].map((side) => derive("m", "a rim vertex on one face of the octagonal disc", [along, RADIUS, boss, THICKNESS],
      (a, r, c, t) => [c[0] + a[0] * r, c[1] + a[1] * r, c[2] + side * t / 2]));
  });
  const alongGrip = (name: string, y: (length: number, radius: number) => number): Quantity<Vec3> =>
    derive("m", name, [GRIP_LENGTH, GRIP_RADIUS], (l, r) => [0, y(l, r), 0]);
  return {
    name: "buckler", mass, centreOfMass, inertia, grip: GRIP_RADIUS, substance: "metal",
    shapes: [{ kind: "hull", points: rim }, { kind: "capsule", radius: GRIP_RADIUS,
      from: alongGrip("the handle's lower capsule centre", (_l, r) => r), to: alongGrip("the handle's upper capsule centre", (l, r) => l - r) }],
    points: { boss }, cover: ["boss"], coverNormal: NORMAL,
  };
}
