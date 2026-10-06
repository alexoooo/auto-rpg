import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CreateCylinderVertexData } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import { CreateSphereVertexData } from "@babylonjs/core/Meshes/Builders/sphereBuilder.js";
import type { BuiltSegment } from "../core/build/build-body.ts";
import type { Vec3 } from "../core/spec/quantity.ts";

export type Finish = "frame" | "plate" | "edge" | "light" | "glass";
interface FinishSpec { readonly colour: string; readonly metallic: number; readonly roughness: number; readonly emission?: number; readonly unlit?: boolean }
export interface RobotDesign {
  readonly palette: Readonly<Record<Exclude<Finish, "glass">, FinishSpec> & Partial<Record<"glass", FinishSpec>>>;
  build(part: RobotPart): void;
}
interface RobotPart {
  readonly name: string;
  readonly segment: BuiltSegment;
  readonly c: Vector3;
  readonly size: Vector3;
  readonly length: number;
  readonly front: number;
  add(finish: Finish, data: VertexData, at: Vector3, rotation?: Quaternion): void;
  plate(finish: Finish, w: number, h: number, d: number, at: Vector3, taper?: number, bevel?: number): void;
  bearing(at: Vector3, radius: number, width: number, axis?: "x" | "y" | "z", finish?: Finish): void;
  orb(finish: Finish, size: Vector3, at: Vector3): void;
  profile(finish: Finish, rings: readonly (readonly [y: number, width: number, depth: number, z?: number])[], at: Vector3, rotation?: Quaternion): void;
  pipe(finish: Finish, points: readonly Vector3[], radius: number): void;
}

/** A bevelled, tapered housing, length along y; each face keeps its own normal. */
export function housing(w: number, h: number, d: number, bevel: number, taper = 1): VertexData {
  const positions: number[] = [], indices: number[] = [], normals: number[] = [];
  const outline = [[-1 + bevel, -1], [1 - bevel, -1], [1, -1 + bevel], [1, 1 - bevel],
    [1 - bevel, 1], [-1 + bevel, 1], [-1, 1 - bevel], [-1, -1 + bevel]];
  const lip = Math.min(w, h, d) * .10;
  const rings = [[-h / 2, .88 * taper], [-h / 2 + lip, taper], [h / 2 - lip, 1], [h / 2, .88]];
  const points = rings.map(([y, scale]) => outline.map(([x, z]) => [x * w / 2 * scale, y, z * d / 2 * scale]));
  const face = (corners: number[][]) => {
    const base = positions.length / 3;
    positions.push(...corners.flat());
    for (let i = 1; i + 1 < corners.length; i++) indices.push(base, base + i, base + i + 1);
  };
  face([...points[0]].reverse()); face(points[3]);
  for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8;
    face([points[r][i], points[r][j], points[r + 1][j], points[r + 1][i]]);
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData();
  Object.assign(data, { positions, indices, normals });
  return data;
}

export function local(segment: BuiltSegment, point: Vec3): Vector3 {
  const { frame } = segment, delta = Vector3.FromArray(point).subtract(Vector3.FromArray(frame.origin));
  return new Vector3(Vector3.Dot(delta, Vector3.FromArray(frame.x)), Vector3.Dot(delta, Vector3.FromArray(frame.y)),
    Vector3.Dot(delta, Vector3.FromArray(frame.z)));
}

/** Bounds of the physical shape in its segment frame, including capsule end caps. */
function envelope(segment: BuiltSegment): { centre: Vector3; size: Vector3 } {
  const shape = segment.spec.shape;
  let points: Vector3[];
  switch (shape.kind) {
    case "capsule": {
      const a = local(segment, shape.from.value), b = local(segment, shape.to.value), r = Vector3.One().scale(shape.radius.value);
      return { centre: a.add(b).scale(.5), size: Vector3.Maximize(a, b).subtract(Vector3.Minimize(a, b)).add(r.scale(2)) };
    }
    case "box": return { centre: local(segment, shape.centre.value), size: Vector3.FromArray(shape.size.value) };
    case "sphere": return { centre: local(segment, shape.centre.value), size: Vector3.One().scale(2 * shape.radius.value) };
    case "hull": points = shape.points.map(p => local(segment, p.value)); break;
    default: { const never: never = shape; throw new Error(`unknown robot envelope ${never}`); }
  }
  let low = points[0].clone(), high = low.clone();
  for (const p of points) { low = Vector3.Minimize(low, p); high = Vector3.Maximize(high, p); }
  return { centre: low.add(high).scale(.5), size: high.subtract(low) };
}

/** Smooth closed cross-sections along y; each ring supplies width, depth and a fore/aft offset. */
function profile(rings: readonly (readonly [number, number, number, number?])[]): VertexData {
  const positions: number[] = [], indices: number[] = [], normals: number[] = [], sides = 24;
  for (const [y, w, d, z = 0] of rings) for (let i = 0; i < sides; i++) {
    const angle = i * 2 * Math.PI / sides;
    positions.push(Math.cos(angle) * w / 2, y, z + Math.sin(angle) * d / 2);
  }
  for (let r = 0; r + 1 < rings.length; r++) for (let i = 0; i < sides; i++) {
    const a = r * sides + i, b = r * sides + (i + 1) % sides;
    indices.push(a, b, a + sides, b, b + sides, a + sides);
  }
  for (const end of [0, rings.length - 1]) {
    const [y, , , z = 0] = rings[end], centre = positions.length / 3;
    positions.push(0, y, z);
    for (let i = 0; i < sides; i++) {
      const a = end * sides + i, b = end * sides + (i + 1) % sides;
      indices.push(centre, end === 0 ? b : a, end === 0 ? a : b);
    }
  }
  VertexData.ComputeNormals(positions, indices, normals);
  const data = new VertexData(); Object.assign(data, { positions, indices, normals }); return data;
}

/** Designs submit local geometry; the skin owns the resulting meshes and materials. */
export function createRobotPart(name: string, segment: BuiltSegment): {
  part: RobotPart; buckets: Map<Finish, { positions: number[]; normals: number[]; indices: number[] }>;
} {
  const { centre: c, size } = envelope(segment);
  const length = Vector3.Distance(Vector3.FromArray(segment.spec.proximal.value), Vector3.FromArray(segment.spec.distal.value));
  const buckets = new Map<Finish, { positions: number[]; normals: number[]; indices: number[] }>();
  const add: RobotPart["add"] = (finish, data, at, rotation = Quaternion.Identity()) => {
    data.transform(Matrix.Compose(Vector3.One(), rotation, at));
    let bucket = buckets.get(finish);
    if (!bucket) { bucket = { positions: [], normals: [], indices: [] }; buckets.set(finish, bucket); }
    const base = bucket.positions.length / 3;
    for (const n of data.positions!) bucket.positions.push(n);
    for (const n of data.normals!) bucket.normals.push(n);
    for (const n of data.indices!) bucket.indices.push(base + n);
  };
  const orb: RobotPart["orb"] = (finish, dimensions, at) => add(finish,
    CreateSphereVertexData({ diameterX: dimensions.x, diameterY: dimensions.y, diameterZ: dimensions.z, segments: 12 }), at);
  return { buckets, part: {
    name, segment, c, size, length, front: segment.frame.z[2] < 0 ? -1 : 1, add, orb,
    plate: (finish, w, h, d, at, taper = 1, bevel = .12) => add(finish, housing(w, h, d, bevel, taper), at),
    bearing(at, radius, width, axis = "x", finish = "edge") {
      let rotation: Quaternion;
      switch (axis) {
        case "x": rotation = Quaternion.RotationAxis(Vector3.Forward(), Math.PI / 2); break;
        case "y": rotation = Quaternion.Identity(); break;
        case "z": rotation = Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2); break;
        default: { const never: never = axis; throw new Error(`unknown bearing axis ${never}`); }
      }
      add(finish, CreateCylinderVertexData({ diameter: radius * 2, height: width, tessellation: 16 }), at, rotation);
    },
    profile: (finish, rings, at, rotation) => add(finish, profile(rings), at, rotation),
    pipe(finish, points, radius) {
      for (let i = 1; i < points.length; i++) {
        const delta = points[i].subtract(points[i - 1]), rotation = Quaternion.Identity();
        Quaternion.FromUnitVectorsToRef(Vector3.UpReadOnly, delta.normalizeToNew(), rotation);
        add(finish, CreateCylinderVertexData({ diameter: radius * 2, height: delta.length(), tessellation: 12 }),
          points[i].add(points[i - 1]).scale(.5), rotation);
      }
      for (const point of points.slice(1, -1)) orb(finish, Vector3.One().scale(radius * 2), point);
    },
  } };
}
