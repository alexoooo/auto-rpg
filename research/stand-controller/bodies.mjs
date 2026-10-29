/** Body variants for the hand-off study: overrides of a model's spec, no spec file touched. */
import { derive } from "../../src/core/spec/quantity.ts";
import { modelSpec } from "../../src/core/models.ts";
import { frameOf } from "../../src/core/spec/body.ts";

/** `spec` with each ankle's dorsiflexion stop at `max` rad (the joint's own measure, as `DofSpec.max`). */
export function withDorsiflexion(spec, max) {
  return { ...spec, joints: spec.joints.map((joint) => !joint.name.startsWith("ankle.") ? joint : {
    ...joint, dofs: joint.dofs.map((dof) => dof.positive !== "dorsiflexion" ? dof : { ...dof, max: derive("rad", "hand-off study: dorsiflexion stop", [dof.max], () => max) }),
  }) };
}

/** `spec` with each foot's box lengthened `ahead` m forward (+z, body frame), its heel where it was; mass and points untouched. */
export function withLongerFoot(spec, ahead) {
  return { ...spec, segments: spec.segments.map((segment) => !segment.name.startsWith("foot.") ? segment : {
    ...segment, shape: { ...segment.shape,
      size: derive("m", "hand-off study: foot lengthened", [segment.shape.size], (s) => [s[0], s[1] + ahead, s[2]]),
      centre: derive("m", "hand-off study: foot lengthened", [segment.shape.centre], (c) => [c[0], c[1], c[2] + ahead / 2]) },
  }) };
}

/**
 * `spec` with each foot a wedge toe cap: the box's hull with its bottom front edge carried `ahead` m forward
 * and its top front edge left where it was, so the sole reaches further while the front slopes up to the
 * instep (the rigid foot's rocker form). Body-frame points; mass and named points untouched.
 */
export function withToeCap(spec, ahead) {
  return { ...spec, segments: spec.segments.map((segment) => {
    if (!segment.name.startsWith("foot.")) return segment;
    const { centre, size } = segment.shape, rule = "hand-off study: wedge toe cap";
    const corner = (sx, sy, sz) => derive("m", rule, [centre, size], (c, z) => [c[0] + sx * z[0] / 2, c[1] + sy * z[2] / 2, c[2] + sz * z[1] / 2 + (sz > 0 && sy < 0 ? ahead : 0)]);
    const points = [];
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) points.push(corner(sx, sy, sz));
    return { ...segment, shape: { kind: "hull", points } };
  }) };
}

/** `spec` with each thigh's capsule radius times `f`; mass and inertia untouched (only what collides changes). */
export function withThinnerThighs(spec, f) {
  return { ...spec, segments: spec.segments.map((segment) => !segment.name.startsWith("thigh.") ? segment : {
    ...segment, shape: { ...segment.shape, radius: derive("m", "hand-off study: thigh slimmed", [segment.shape.radius], (r) => r * f) } }) };
}

/** `spec` with each trunk hull's points drawn in toward its own middle, across and front to back, by `f`; height, mass and inertia untouched. */
export function withSlimmerTrunk(spec, f) {
  return { ...spec, segments: spec.segments.map((segment) => {
    if (!/Trunk$/.test(segment.name) || segment.shape.kind !== "hull") return segment;
    const pts = segment.shape.points, cx = pts.reduce((a, q) => a + q.value[0], 0) / pts.length, cz = pts.reduce((a, q) => a + q.value[2], 0) / pts.length;
    return { ...segment, shape: { ...segment.shape, points: pts.map((q) => derive("m", "hand-off study: trunk slimmed", [q], (v) => [cx + (v[0] - cx) * f, v[1], cz + (v[2] - cz) * f])) } };
  }) };
}

/**
 * `spec` with toes on each foot (`ToesSpec`): its box cut short at the ball by `length` m, the heel
 * where it was, and toes that long and `TOE_THICKNESS` thick ahead of it. Mass and points untouched.
 */
const TOE_THICKNESS = .025;
export function withToes(spec, length) {
  return { ...spec, segments: spec.segments.map((segment) => {
    if (!segment.name.startsWith("foot.")) return segment;
    const frame = frameOf(segment), rule = "hand-off study: the foot's box to the ball", old = segment.shape;
    return { ...segment,
      shape: { ...old, centre: derive("m", rule, [old.centre], (c) => [0, 1, 2].map((k) => c[k] - frame.y[k] * length / 2)), size: derive("m", rule, [old.size], (s) => [s[0], s[1] - length, s[2]]) },
      toes: { length: derive("m", "hand-off study: toes' length", [old.size], () => length), thickness: derive("m", "hand-off study: toes' thickness", [old.size], () => TOE_THICKNESS) } };
  }) };
}

/** A variant by name: `built`, `dorsi<rad>` (e.g. dorsi0.6), `foot<m>` (e.g. foot0.06), or both joined by `+`. */
export function variantSpec(model, name) {
  let spec = modelSpec(model);
  for (const part of name.split("+")) {
    if (part === "built") continue;
    else if (part.startsWith("dorsi")) spec = withDorsiflexion(spec, Number(part.slice(5)));
    else if (part.startsWith("foot")) spec = withLongerFoot(spec, Number(part.slice(4)));
    else if (part.startsWith("thigh")) spec = withThinnerThighs(spec, Number(part.slice(5)));
    else if (part.startsWith("trunk")) spec = withSlimmerTrunk(spec, Number(part.slice(5)));
    else if (part.startsWith("toe") && !part.startsWith("toecap")) spec = withToes(spec, Number(part.slice(3)));
    else if (part.startsWith("toecap")) spec = withToeCap(spec, Number(part.slice(6)));
    else throw new Error(`no variant ${part}`);
  }
  return spec;
}

/** `spec` with every stop past `most` rad put at `most`: the statics' angle measure reads within a half turn (`rotationOfToRef`). */
export function cappedSpec(spec, most = 3.1) {
  return { ...spec, joints: spec.joints.map((joint) => ({ ...joint, dofs: joint.dofs.map((dof) => ({ ...dof,
    max: dof.max.value > most ? derive("rad", "hand-off study: statics' half-turn cap", [dof.max], () => most) : dof.max,
    min: dof.min.value < -most ? derive("rad", "hand-off study: statics' half-turn cap", [dof.min], () => -most) : dof.min })) })) };
}
