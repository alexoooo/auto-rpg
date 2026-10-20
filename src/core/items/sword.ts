import type { ItemSpec } from "../spec/body.ts";
import { sourced, type Quantity, type Vec3 } from "../spec/quantity.ts";

const q = <T extends number | Vec3>(value: T, unit: Quantity["unit"], where: string) => sourced(value, unit, "owner-arena-items", where);
const point = (value: Vec3) => q(value, "m", "short sword: item-frame collider and named-point coordinates");
const hull = (points: readonly Vec3[]) => ({ kind: "hull" as const, points: points.map(point) });

/** A one-handed short sword whose edge, flat, tip and hilt are physical contact regions. */
export function shortSword(): ItemSpec {
  const stiffness = q(10e9, "N/m", "short sword: hard equipment surface"), alignment = q(.8, "1", "short sword: edge and tip normal cones");
  const surface = (mechanism?: "point" | "edge", direction?: Vec3) => ({ stiffness,
    ...(mechanism && direction ? { directed: { mechanism, direction: q(direction, "1", "short sword: region direction"), alignment } } : {}) });
  return {
    name: "short sword", mass: q(.75, "kg", "short sword: mass"), centreOfMass: point([0, .29, 0]),
    inertia: q([.018, .0001, .018], "kg m2", "short sword: principal moments about its centre"),
    shapes: [{ kind: "capsule", from: point([0, .014, 0]), to: point([0, .106, 0]), radius: q(.014, "m", "short sword: grip radius") }],
    contacts: [
      { name: "hilt", shape: hull([[-.07, .12, -.006], [-.07, .12, .006], [.07, .12, -.006], [.07, .12, .006],
        [-.07, .145, -.006], [-.07, .145, .006], [.07, .145, -.006], [.07, .145, .006]]), surface: surface() },
      { name: "flat", shape: hull([[-.014, .145, -.003], [-.014, .145, .003], [.014, .145, -.003], [.014, .145, .003],
        [-.014, .58, -.003], [-.014, .58, .003], [.014, .58, -.003], [.014, .58, .003]]), surface: surface() },
      { name: "edge.right", shape: hull([[.014, .145, -.003], [.014, .145, .003], [.02, .145, 0],
        [.014, .58, -.003], [.014, .58, .003], [.02, .58, 0]]), surface: surface("edge", [1, 0, 0]) },
      { name: "edge.left", shape: hull([[-.014, .145, -.003], [-.014, .145, .003], [-.02, .145, 0],
        [-.014, .58, -.003], [-.014, .58, .003], [-.02, .58, 0]]), surface: surface("edge", [-1, 0, 0]) },
      { name: "tip", shape: hull([[-.02, .58, -.003], [-.02, .58, .003], [.02, .58, -.003], [.02, .58, .003], [0, .62, 0]]),
        surface: surface("point", [0, 1, 0]) },
    ],
    points: { "edge.right": point([.02, .3625, 0]), "edge.left": point([-.02, .3625, 0]), tip: point([0, .62, 0]),
      bladeBase: point([0, .145, 0]), bladeEnd: point([0, .58, 0]) },
    aim: "edge.right", cover: ["bladeBase", "bladeEnd"], substance: "metal", grip: q(.014, "m", "short sword: grip radius"),
  };
}
