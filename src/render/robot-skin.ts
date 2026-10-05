import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { CreateCylinderVertexData } from "@babylonjs/core/Meshes/Builders/cylinderBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import type { SkinOptions, SkinView } from "./skin-view.ts";
import type { Appearance } from "./appearance.ts";

type Finish = "frame" | "plate" | "edge" | "light";
type Robot = Exclude<Appearance, "default">;

/** Art proportions and finishes, chosen for the Warrior's envelope (docs/art/robots.md#design-choices). */
const DESIGNS = Object.freeze({
  industrial: Object.freeze({ plate: "#9c7439", edge: "#70797c", light: "#ffb64b", taper: .90, coverage: .84, bevel: .12, head: "sensor", roughness: .48 }),
  relic: Object.freeze({ plate: "#393e42", edge: "#a9844e", light: "#ffc26b", taper: .78, coverage: .90, bevel: .22, head: "helm", roughness: .40 }),
  duelist: Object.freeze({ plate: "#bbc5c5", edge: "#71828c", light: "#9de1e3", taper: .66, coverage: .69, bevel: .28, head: "mask", roughness: .32 }),
});

/** A bevelled, tapered housing, length along y; each face keeps its own normal. */
function housing(w: number, h: number, d: number, bevel: number, taper = 1): VertexData {
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

function local(segment: BuiltSegment, point: Vec3): Vector3 {
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

/** Rigid shells ride the simulated segments; only cosmetic finger articulation needs a render callback. */
export function dressRobot(built: BuiltBody, scene: Scene, appearance: Robot, options: SkinOptions): SkinView {
  const design = DESIGNS[appearance], prefix = `${built.spec.model}.${appearance}.${scene.getUniqueId()}`;
  const materials = {} as Record<Finish, PBRMaterial>;
  for (const finish of ["frame", "plate", "edge", "light"] as const) {
    const material = new PBRMaterial(`${prefix}.${finish}`, scene);
    material.albedoColor = Color3.FromHexString(finish === "frame" ? "#242d33" : design[finish]);
    material.metallic = finish === "plate" && appearance !== "relic" ? .22 : .78;
    material.roughness = finish === "frame" ? .58 : design.roughness;
    if (finish === "light") { material.emissiveColor = material.albedoColor.scale(.75); material.metallic = .1; material.unlit = true; }
    materials[finish] = material;
  }
  const meshes: Mesh[] = [];
  const fingers: { mesh: Mesh; hand: "left" | "right"; base: Vector3; lengths: number[]; index: number; holding: boolean }[] = [];
  for (const [name, segment] of built.segments) {
    const { centre: c, size } = envelope(segment), length = Vector3.Distance(Vector3.FromArray(segment.spec.proximal.value), Vector3.FromArray(segment.spec.distal.value));
    const buckets = new Map<Finish, { positions: number[]; normals: number[]; indices: number[] }>();
    const add = (finish: Finish, data: VertexData, at: Vector3, rotation = Quaternion.Identity()) => {
      data.transform(Matrix.Compose(Vector3.One(), rotation, at));
      let bucket = buckets.get(finish);
      if (!bucket) { bucket = { positions: [], normals: [], indices: [] }; buckets.set(finish, bucket); }
      const base = bucket.positions.length / 3;
      for (const n of data.positions!) bucket.positions.push(n);
      for (const n of data.normals!) bucket.normals.push(n);
      for (const n of data.indices!) bucket.indices.push(base + n);
    };
    const plate = (finish: Finish, w: number, h: number, d: number, at: Vector3, taper = 1) =>
      add(finish, housing(w, h, d, design.bevel, taper), at);
    const bearing = (at: Vector3, radius: number, width: number, axis: "x" | "y" | "z" = "x", finish: Finish = "edge") => {
      const rotation = axis === "x" ? Quaternion.RotationAxis(Vector3.Forward(), Math.PI / 2)
        : axis === "z" ? Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2) : Quaternion.Identity();
      add(finish, CreateCylinderVertexData({ diameter: radius * 2, height: width, tessellation: 16 }), at, rotation);
    };
    const front = segment.frame.z[2] < 0 ? -1 : 1;
    if (name === "head") {
      const w = size.x * .85, h = length * .72, d = size.z * .72, at = new Vector3(0, length * .57, 0);
      bearing(new Vector3(0, length * .1, 0), w * .25, length * .22, "y", "frame");
      plate("plate", w, h, d, at, design.head === "helm" ? .88 : design.taper);
      if (design.head === "helm") {
        bearing(at.add(new Vector3(0, h * .28, 0)), h * .40, w * .93, "x", "plate");
        plate("edge", w * .065, h * .88, d * 1.01, at);
      }
      if (design.head === "mask") plate("plate", w * .76, h * .77, d * .14, at.add(new Vector3(0, -h * .06, d * .47)), .55);
      bearing(at, h * .22, w * 1.03);
      if (design.head === "sensor") {
        bearing(at.add(new Vector3(0, .015, d * .51)), w * .29, d * .13, "z", "frame");
        bearing(at.add(new Vector3(0, .015, d * .60)), w * .18, d * .025, "z", "light");
        plate("edge", w * .50, h * .12, d * .09, at.add(new Vector3(0, -h * .28, d * .51)));
      } else {
        plate("frame", w * .78, h * .15, d * .12, at.add(new Vector3(0, h * .12, d * .46)));
        plate("light", w * (design.head === "helm" ? .68 : .38), h * .038, d * .13, at.add(new Vector3(0, h * .12, d * .49)));
        plate("edge", w * .12, h * .44, d * .11, at.add(new Vector3(0, -h * .16, d * .48)));
      }
    } else if (name.endsWith("Trunk")) {
      const w = size.x * .86, h = length * .84, d = size.z * .80;
      plate("frame", w * .52, length * 1.04, d * .62, new Vector3(0, length * .5, c.z));
      for (const side of [-1, 1]) bearing(new Vector3(side * w * .21, length * .50, c.z), w * .055, length * .97, "y");
      add("plate", housing(w, h, d, design.bevel, design.taper), c,
        name === "lowerTrunk" ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI));
      for (const side of [-1, 1]) {
        plate("edge", w * .055, h * .68, d * .08, c.add(new Vector3(side * w * .38, 0, front * d * .49)));
      }
      if (name === "upperTrunk") {
        plate("frame", w * .44, h * .34, d * .09, c.add(new Vector3(0, 0, front * d * .49)));
        plate("light", w * .23, h * .05, d * .1, c.add(new Vector3(0, 0, front * d * .5)));
        for (let row = 0; row < 3; row++) plate("edge", w * .24, h * .034, d * .07,
          c.add(new Vector3(0, h * (.23 + row * .09), -front * d * .5)));
      } else if (name === "middleTrunk") {
        for (let row = 0; row < 3; row++) plate("edge", w * .40, h * .08, d * .10,
          c.add(new Vector3(0, h * (row - 1) * .23, front * d * .49)));
      } else {
        plate("edge", w * .80, h * .15, d * .90, c.add(new Vector3(0, -h * .25, 0)));
      }
    } else if (name.startsWith("foot.")) {
      plate("frame", size.x * .97, size.y * .98, size.z * .32, c.add(new Vector3(0, 0, size.z * .32)));
      plate("plate", size.x * .91, size.y * .92, size.z * .72, c.add(new Vector3(0, 0, -size.z * .10)), .78);
      for (let i = 0; i < 3; i++) plate("edge", size.x * .80, size.y * .045, size.z * .04,
        c.add(new Vector3(0, size.y * (.13 + .10 * i), -size.z * .47)));
    } else if (name.startsWith("hand.")) {
      const hand = name.endsWith("right") ? "right" : "left", k = local(segment, segment.spec.points!.knuckles.value);
      const little = local(segment, segment.spec.points!.little.value), halfWidth = Math.abs(little.x - k.x) * 1.20;
      const radius = segment.spec.shape.kind === "capsule" ? segment.spec.shape.radius.value : size.z / 2;
      const held = built.spec.held?.find(item => item.segment === name), holding = held !== undefined;
      const grip = held ? local(segment, held.origin.value) : null;
      const bendRadius = held?.item.grip ? held.item.grip.value + radius * .25 : radius * .90;
      plate("plate", halfWidth * 2.2, k.y * .78, radius * 1.5, new Vector3(k.x, k.y * .51, k.z));
      bearing(new Vector3(0, .005, 0), radius * .75, radius * 1.9, "y");
      for (let digit = 0; digit < 4; digit++) {
        const base = new Vector3(k.x + (digit - 1.5) * halfWidth * .53, grip?.y ?? k.y, grip ? grip.z + bendRadius : k.z);
        const lengths = [bendRadius, bendRadius, bendRadius];
        for (let i = 0; i < 3; i++) {
          const mesh = new Mesh(`${prefix}.${name}.finger.${digit}.${i}`, scene);
          housing(halfWidth * .39, lengths[i], radius * .50, .24).applyToMesh(mesh);
          mesh.parent = segment.node; mesh.material = materials[i === 1 ? "edge" : "frame"];
          mesh.rotationQuaternion = Quaternion.Identity(); meshes.push(mesh);
          fingers.push({ mesh, hand, base, lengths, index: i, holding });
        }
      }
      const thumbSide = hand === "right" ? 1 : -1;
      plate("edge", radius * .70, k.y * .60, radius * .60,
        new Vector3(k.x + thumbSide * halfWidth, k.y * .74, k.z - radius * .85));
    } else {
      const r = Math.min(size.x, size.z) / 2;
      bearing(new Vector3(0, length * .02, 0), r * .68, r * 1.82);
      bearing(new Vector3(0, length * .94, 0), r * .51, r * 1.42, "x", "frame");
      plate("frame", r * .82, length * .86, r * .84, new Vector3(0, length * .50, 0));
      add("plate", housing(r * 1.76, length * design.coverage, r * 1.65, design.bevel, design.taper),
        new Vector3(0, length * .50, 0), Quaternion.RotationAxis(Vector3.Right(), Math.PI));
      plate("edge", r * .46, length * design.coverage * .66, r * .15, new Vector3(0, length * .49, front * r * .83));
      for (const side of [-1, 1]) bearing(new Vector3(side * r * .85, length * .20, 0), r * .16, r * .11);
    }
    for (const [finish, geometry] of buckets) {
      const mesh = new Mesh(`${prefix}.${name}.${finish}`, scene), data = new VertexData();
      Object.assign(data, geometry); data.applyToMesh(mesh);
      mesh.parent = segment.node; mesh.material = materials[finish]; meshes.push(mesh);
    }
  }
  for (const mesh of meshes) { mesh.isPickable = false; mesh.receiveShadows = true; }
  const update = () => {
    for (const finger of fingers) {
      const closed = finger.holding ? 1 : Math.max(0, Math.min(1, options.closure?.(finger.hand) ?? 0));
      let y = finger.base.y, z = finger.base.z;
      for (let i = 0; i <= finger.index; i++) {
        const open = .12 + i * .10, angle = open + closed * (Math.PI / 6 + i * Math.PI / 3 - open);
        const distance = finger.lengths[i] * (i === finger.index ? .5 : 1);
        y += Math.cos(angle) * distance; z -= Math.sin(angle) * distance;
        if (i === finger.index) Quaternion.RotationAxisToRef(Vector3.RightReadOnly, -angle, finger.mesh.rotationQuaternion!);
      }
      finger.mesh.position.set(finger.base.x, y, z);
    }
  };
  update();
  const observer = scene.onBeforeRenderObservable.add(update);
  return {
    meshes,
    setEnabled(enabled) { for (const mesh of meshes) mesh.setEnabled(enabled); },
    wear() { /* Shell panels are the appearance; human clothing does not cover them. */ },
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const mesh of meshes) mesh.dispose(false, false);
      for (const material of Object.values(materials)) material.dispose();
    },
  };
}
