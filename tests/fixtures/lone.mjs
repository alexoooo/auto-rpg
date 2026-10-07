/**
 * **A body of one ball**: the least spec a contact can be read on (`tests/core-blows.test.mjs`,
 * `tests/core-touches.test.mjs`, `tests/audio-bodies.test.mjs`). Its mass is its own, so the mass a
 * contact through its centre meets is the ball's.
 */
import { sourced } from "../../src/core/spec/quantity.ts";

const q = (value, unit = "m") => sourced(value, unit, "de-leva-1996", "a stand-in leaf for the contact tests");

/** The item a lone body holds, by name, and its mass, kg. */
export const ITEM = "held ball", ITEM_KG = 0.2;

/**
 * A body of one ball, `kg`, 5 cm in radius, named `name`, with `hp` in it and the parts `whole`
 * never come off; its centre is 5 cm over its node. Its surface is `stiffness`, in `unit`, or
 * none stated where that is null. `spare` pins a ball as heavy under it, its parent, which keeps
 * the body standing with the first one off. `held`, it holds an item of one ball as large,
 * `ITEM_KG`, its centre `held` metres to the first one's right, rigid unless `itemStiffness`
 * gives it a surface, in `itemUnit`. It is made of `substance`, and says nothing of what it is
 * made of if none is given: no rule of a fight asks, and a sound does.
 */
export function lone(model, name, kg, { hp = 1, whole = [], spare = false, held = null, stiffness = 100e3, unit = "N/m", itemStiffness = null, itemUnit = "N/m", substance } = {}) {
  const ball = (part, y) => ({ name: part, proximal: q([0, y - 0.05, 0]), distal: q([0, y + 0.05, 0]), mass: q(kg, "kg"),
    centreOfMass: q([0, y, 0]), inertia: q([0.001, 0.001, 0.001], "kg m2"), shape: { kind: "sphere", centre: q([0, y, 0]), radius: q(0.05) },
    ...(stiffness === null ? {} : { surface: { stiffness: q(stiffness, unit) } }) });
  const free = { unloadedSpeed: q(60, "rad/s"), curvature: q(0.25, "1"), eccentricCeiling: q(1.4, "1"), eccentricSlopeRatio: q(2, "1") };
  return {
    model, ...(substance ? { substance } : {}), mass: q(spare ? 2 * kg : kg, "kg"), stature: q(spare ? 0.2 : 0.1),
    segments: spare ? [ball("spare", -0.1), ball(name, 0)] : [ball(name, 0)],
    joints: spare ? [{ name: "pin", parent: "spare", child: name, centre: q([0, -0.05, 0]),
      dofs: [{ positive: "flexion", negative: "extension", axis: q([0, 0, 1], "1"), min: q(-3, "rad"), max: q(3, "rad"),
        muscle: { peakPositive: q(1, "N m"), peakNegative: q(1, "N m"), speedPositive: free, speedNegative: free } }] }] : [],
    wounds: { hp: q(hp, "HP"), vital: [], whole }, attributes: { balance: q(0, "%") }, down: { kind: "asked", fallen: q(0.25) },
    ...(held === null ? {} : { held: [{
      segment: name, origin: q([held, 0, 0]), along: q([0, 1, 0], "1"), across: q([1, 0, 0], "1"),
      item: { name: ITEM, mass: q(ITEM_KG, "kg"), centreOfMass: q([0, 0, 0]), inertia: q([0.0001, 0.0001, 0.0001], "kg m2"),
        shapes: [{ kind: "sphere", centre: q([0, 0, 0]), radius: q(0.05) }], points: {},
        ...(itemStiffness === null ? {} : { surface: { stiffness: q(itemStiffness, itemUnit) } }) },
    }] }),
  };
}
