import type { BodySpec, SegmentSpec, ShapeSpec } from "../spec/body.ts";
import { derive, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { add, dot, normalize, scale, sub } from "../spec/vec.ts";
import { cuboidMoments, cylinderMoments } from "../spec/geometry.ts";
import type { Physique } from "../human/physique.ts";

/** The reptile's own anatomy with the character's physique and leg-speed capability. */
export function reptilePhysique(spec: BodySpec, physique: Physique = {}, haste = 0): BodySpec {
  const s = physique.size ?? 1, w = physique.weight ?? 1, strength = physique.strength ?? 1, speed = physique.speed ?? 1;
  if (s === 1 && w === 1 && strength === 1 && speed === 1 && haste === 0) return spec;
  const size = sourced(s, "1", "owner-physique", "reptile size"), weight = sourced(w, "1", "owner-physique", "reptile weight");
  const torque = sourced(strength, "1", "owner-physique", "reptile strength"), velocity = sourced(speed, "1", "owner-physique", "reptile speed");
  const quick = sourced(haste, "%", "owner-haste", "the reptile's four legs");
  const breadth = derive("1", "the square root of the weight", [weight], Math.sqrt);
  const scaled = (p: Quantity<Vec3>) => s === 1 ? p : derive("m", "the point times size", [p, size], (p, k) => scale(p, k));
  const mass = (m: Quantity<number>) => derive("kg", "mass times size cubed and weight", [m, size, weight], (m, s, w) => m * s * s * s * w);
  const segments = spec.segments.map((segment): SegmentSpec => {
    const axis = derive("1", "the segment's longitudinal axis", [segment.proximal, segment.distal], (p, d) => normalize(sub(d, p)));
    const anchor = segment.points?.sole ?? segment.centreOfMass;
    const point = (p: Quantity<Vec3>) => w === 1 ? scaled(p) : derive("m", "the point broadened transverse to its segment, then sized",
      [p, anchor, axis, breadth, size], (p, a, y, b, s) => {
        const d = sub(p, a), along = scale(y, dot(d, y));
        return scale(add(a, add(along, scale(sub(d, along), b))), s);
      });
    const length = (r: Quantity<number>) => derive("m", "the radius times size and breadth", [r, size, breadth], (r, s, b) => r * s * b);
    const shape = (shape: ShapeSpec): ShapeSpec => {
      switch (shape.kind) {
        case "capsule": return { ...shape, from: scaled(shape.from), to: scaled(shape.to), radius: length(shape.radius) };
        case "sphere": return { ...shape, centre: point(shape.centre), radius: length(shape.radius) };
        case "box": return { ...shape, centre: point(shape.centre), size: derive("m", "the box sized, with transverse breadth", [shape.size, size, breadth],
          (d, s, b) => [d[0] * s * b, d[1] * s, d[2] * s * b]) };
        case "hull": return { ...shape, points: shape.points.map(point) };
        default: { const never: never = shape; throw new Error(`unknown shape ${String(never)}`); }
      }
    };
    const own = mass(segment.mass), collision = shape(segment.shape);
    let inertia: Quantity<Vec3>;
    if (collision.kind === "box") inertia = derive("kg m2", "the configured box's principal moments", [own, collision.size], (m, d) => cuboidMoments(m, d));
    else if (collision.kind === "capsule") inertia = derive("kg m2", "the configured capsule's equivalent cylinder moments",
      [own, collision.from, collision.to, collision.radius], (m, a, b, r) => {
        const d = sub(b, a); return cylinderMoments(m, Math.sqrt(dot(d, d)) + 2 * r, r);
      });
    else throw new Error("the reptile's mass-bearing shapes are boxes and capsules");
    return { ...segment, proximal: scaled(segment.proximal), distal: scaled(segment.distal), mass: own, centreOfMass: point(segment.centreOfMass), inertia,
      shape: collision,
      ...(segment.points && { points: Object.fromEntries(Object.entries(segment.points).map(([key, p]) => [key, point(p)])) }),
      ...(segment.contacts && { contacts: segment.contacts.map(c => ({ ...c, shape: shape(c.shape), surface: { ...c.surface,
        ...(c.surface.point && { point: { ...c.surface.point, direction: derive("1", "the piercing direction under transverse breadth",
          [c.surface.point.direction, axis, breadth], (d, y, b) => {
            const along = scale(y, dot(d, y)); return normalize(add(along, scale(sub(d, along), b)));
          }) } }),
      } })) }),
    };
  });
  return { ...spec, mass: mass(spec.mass), stature: derive("m", "stature times size", [spec.stature, size], (h, s) => h * s), segments,
    joints: spec.joints.map(j => ({ ...j, centre: scaled(j.centre), dofs: j.dofs.map(d => ({ ...d, muscle: { ...d.muscle,
      peakPositive: derive("N m", "torque times size cubed and strength", [d.muscle.peakPositive, size, torque], (t, s, k) => t * s * s * s * k),
      peakNegative: derive("N m", "torque times size cubed and strength", [d.muscle.peakNegative, size, torque], (t, s, k) => t * s * s * s * k),
      ...Object.fromEntries((["speedPositive", "speedNegative"] as const).map(key => [key, { ...d.muscle[key],
        unloadedSpeed: derive("rad/s", "muscle speed times speed and, on a leg, one plus haste", [d.muscle[key].unloadedSpeed, velocity,
          /^(girdle|bend|ankle)\./.test(j.name) ? quick : sourced(0, "%", "owner-haste", "a joint outside the legs"),
          sourced(100, "1", "owner-haste", "per cent denominator")], (v, speed, h, percent) => v * speed * (1 + h / percent)),
      }])),
    } })) })),
    attributes: { ...spec.attributes, haste: quick },
  };
}
