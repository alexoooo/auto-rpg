import data from "../../../assets/reptile/body.json" with { type: "json" };
import type { BodySpec, JointSpec, SegmentSpec, ShapeSpec } from "../spec/body.ts";
import { cuboidMoments, cylinderMoments, massShare } from "../spec/geometry.ts";
import { derive, sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";
import { deepFreeze } from "../state.ts";

/** Authored anatomical estimates and their derivations: `docs/reference/reptile.md`. */
const vector = (v: readonly number[]): Vec3 => [v[0]!, v[1]!, v[2]!];
const q = <V extends number | Vec3>(value: V, unit: Parameters<typeof sourced>[1], where: string): Quantity<V> =>
  sourced(value, unit, "reptile-anatomy", where);

/** The reptile's own segment tree; no other family's anatomical table participates. */
export function reptileSpec(): BodySpec {
  const mass = q(data.mass, "kg", "/mass");
  const weights = data.segments.map((s, i) => q(s.weight, "1", `/segments/${i}/weight`));
  const segments: SegmentSpec[] = data.segments.map((s, i) => {
    const at = `/segments/${i}`, a = q(vector(s.proximal), "m", `${at}/proximal`), b = q(vector(s.distal), "m", `${at}/distal`);
    const centre = derive("m", "midpoint of the declared segment", [a, b], (a, b): Vec3 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]);
    const own = derive("kg", "body mass distributed by declared segment weights", [mass, weights[i]!, ...weights],
      (mass, weight, ...all) => massShare(mass, weight, all));
    const { shape, inertia } = ((): { shape: ShapeSpec; inertia: Quantity<Vec3> } => {
      const kind = s.kind as "capsule" | "box";
      switch (kind) {
        case "capsule": {
          const radius = q(s.radius!, "m", `${at}/radius`);
          const span = derive("m", "capsule's full longitudinal extent", [a, b, radius], (a, b, r) => {
            const x = b[0] - a[0], y = b[1] - a[1], z = b[2] - a[2];
            return Math.sqrt(x * x + y * y + z * z) + 2 * r;
          });
          return { shape: { kind: "capsule", from: a, to: b, radius },
            inertia: derive("kg m2", "equivalent uniform cylinder principal moments", [own, span, radius], (m, l, r) => cylinderMoments(m, l, r)) };
        }
        case "box": {
          const size = q(vector(s.size!), "m", `${at}/size`);
          return { shape: { kind: "box", centre, size },
            inertia: derive("kg m2", "uniform cuboid principal moments", [own, size], (m, d) => cuboidMoments(m, d)) };
        }
        default: return unknownShape(kind);
      }
    })();
    return {
      name: s.name, proximal: a, distal: b, centreOfMass: centre, mass: own, inertia, shape,
      surface: { stiffness: q(data.stiffness, "N/m", "/stiffness") },
      ...(s.points ? { points: Object.fromEntries(Object.entries(s.points).map(([name, p]) => [name, q(vector(p!), "m", `${at}/points/${name}`)])) } : {}),
    };
  });
  const joints: JointSpec[] = data.joints.map((j, i) => {
    const at = `/joints/${i}`;
    const speed = { unloadedSpeed: q(j.speed, "rad/s", `${at}/speed`), curvature: q(data.curvature, "1", "/curvature"),
      eccentricCeiling: q(data.eccentricCeiling, "1", "/eccentricCeiling"), eccentricSlopeRatio: q(data.eccentricSlopeRatio, "1", "/eccentricSlopeRatio") };
    j.limits.forEach(([min, max], k) => {
      if (!(min! <= 0 && 0 <= max!)) throw new Error(`${j.name} axis${k}: the reference pose, 0 rad, lies outside ${min}..${max} rad`);
    });
    return { name: j.name, parent: j.parent, child: j.child, centre: q(vector(j.centre), "m", `${at}/centre`),
      dofs: j.axes.map((axis, k) => ({ positive: `axis${k}`, negative: `reverse${k}`, axis: q(vector(axis), "1", `${at}/axes/${k}`),
        min: q(j.limits[k]![0]!, "rad", `${at}/limits/${k}/0`), max: q(j.limits[k]![1]!, "rad", `${at}/limits/${k}/1`),
        bind: derive("rad", "reference joint angle", [], () => 0),
        muscle: { peakPositive: q(j.peak, "N m", `${at}/peak`), peakNegative: q(j.peak, "N m", `${at}/peak`), speedPositive: speed, speedNegative: speed } })) };
  });
  return deepFreeze({ model: "reptile", mass, stature: q(data.stature, "m", "/stature"), segments, joints,
    effectors: data.effectors.map(e => ({ segment: e.segment, base: e.base, point: e.point, ...(e.support ? { support: e.support as "sole" } : {}) })),
    wounds: { hp: sourced(1, "HP", "owner-hp-pool", "reptile 1"), vital: data.wounds.vital, whole: data.wounds.whole },
    attributes: { balance: q(data.balance, "%", "/balance") }, substance: "flesh",
    down: { kind: "low", root: data.down.root, height: q(data.down.height, "1", "/down/height"), up: q(data.down.up, "1", "/down/up") },
    marks: data.marks });
}

function unknownShape(kind: never): never {
  throw new Error(`no reptile segment of kind ${JSON.stringify(kind)}`);
}
