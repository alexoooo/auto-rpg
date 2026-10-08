import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { createEquipment } from "../core/equipment.ts";
import { segmentFrame } from "../core/spec/body.ts";
import type { SegmentFrame, ShapeSpec } from "../core/spec/body.ts";
import { convexHull } from "../core/spec/hull.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { dot, length, normalize, sub } from "../core/spec/vec.ts";

/**
 * **The body as the solver sees it**: each segment's collision shape, drawn on its node.
 * Nothing drawn here collides or decides anything; it is the shapes the spec gave the engine, so what
 * the page shows is what moves.
 */
export interface BodyShapes {
  readonly meshes: readonly Mesh[];
  dispose(): void;
}

const local = (frame: SegmentFrame, point: Vec3): Vector3 => {
  const d = sub(point, frame.origin);
  return new Vector3(dot(d, frame.x), dot(d, frame.y), dot(d, frame.z));
};
const localDirection = (frame: SegmentFrame, direction: Vec3): Vec3 =>
  [dot(direction, frame.x), dot(direction, frame.y), dot(direction, frame.z)];

function shapeMesh(name: string, frame: SegmentFrame, shape: ShapeSpec, scene: Scene): Mesh {
  switch (shape.kind) {
    case "capsule": {
      const r = shape.radius.value, span = sub(shape.to.value, shape.from.value);
      const mesh = MeshBuilder.CreateCapsule(name, { radius: r, height: length(span) + 2 * r, tessellation: 16, subdivisions: 1 }, scene);
      mesh.position = local(frame, shape.from.value).add(local(frame, shape.to.value)).scaleInPlace(0.5);
      // The capsule is built along its y; turn y onto the span, in the segment's coordinates.
      const along = normalize(localDirection(frame, span));
      const axis = Vector3.Cross(Vector3.Up(), new Vector3(...along));
      const angle = Math.acos(Math.max(-1, Math.min(1, along[1])));
      mesh.rotationQuaternion = axis.lengthSquared() > 1e-12
        ? Quaternion.RotationAxis(axis.normalize(), angle)
        : along[1] > 0 ? Quaternion.Identity() : Quaternion.RotationAxis(Vector3.Right(), Math.PI);
      return mesh;
    }
    case "box": {
      const [w, h, d] = shape.size.value;
      const mesh = MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene);
      mesh.position = local(frame, shape.centre.value);
      return mesh;
    }
    case "sphere": {
      const mesh = MeshBuilder.CreateSphere(name, { diameter: 2 * shape.radius.value, segments: 16 }, scene);
      mesh.position = local(frame, shape.centre.value);
      return mesh;
    }
    case "hull": {
      // Each face with its own corners, so it is shaded flat, and its outward normal; laid down
      // in both windings, so one of them faces out whatever the scene's handedness.
      const points = shape.points.map((p) => local(frame, p.value));
      const { faces, planes } = convexHull(points.map((p) => [p.x, p.y, p.z] as const));
      const positions: number[] = [], normals: number[] = [], indices: number[] = [];
      faces.forEach((corners, f) => {
        for (const order of [[0, 1, 2], [0, 2, 1]]) {
          const at = positions.length / 3;
          for (const k of order) {
            const p = points[corners[k]!]!;
            positions.push(p.x, p.y, p.z);
            normals.push(...planes[f]!.normal);
          }
          indices.push(at, at + 1, at + 2);
        }
      });
      const data = new VertexData();
      Object.assign(data, { positions, indices, normals });
      const mesh = new Mesh(name, scene);
      data.applyToMesh(mesh);
      return mesh;
    }
    default: {
      const never: never = shape;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

/**
 * The plain shapes' colours, set by eye (`docs/reference/look.md#bodies`): the faint grey every shape
 * shines with, and the warm colour a body's right side is drawn toward, `warmShare` of the way, so
 * that its two sides tell apart.
 */
const SHAPE_TINT = Object.freeze({ sheen: 0.08, warm: [0.85, 0.45, 0.25], warmShare: 0.35 } as const);

/** Draw `built`'s shapes; `tint` colours the body, and the right side is drawn a shade warmer. */
export function drawBody(built: BuiltBody, scene: Scene, tint: Color3): BodyShapes {
  const left = new StandardMaterial(`${built.spec.model}.view.left`, scene);
  left.diffuseColor = tint;
  left.specularColor = new Color3(SHAPE_TINT.sheen, SHAPE_TINT.sheen, SHAPE_TINT.sheen);
  const right = new StandardMaterial(`${built.spec.model}.view.right`, scene);
  right.diffuseColor = Color3.Lerp(tint, new Color3(...SHAPE_TINT.warm), SHAPE_TINT.warmShare);
  right.specularColor = left.specularColor;
  const meshes: Mesh[] = [];
  const changing: { segment: import("../core/build/build-body.ts").BuiltSegment; mesh: Mesh; pose: string }[] = [];
  for (const segment of built.segments.values()) {
    // Its own shape, a hand's in the pose it is in; what it holds is `drawHeld`'s.
    const mesh = shapeMesh(`${segment.node.name}.view`, segment.frame, segment.rigid.shapes[0]!, scene);
    mesh.parent = segment.node;
    mesh.material = segment.spec.name.endsWith(".right") ? right : left;
    meshes.push(mesh);
    for (const contact of segment.spec.contacts ?? []) {
      const region = shapeMesh(`${segment.node.name}.contact.${contact.name}`, segment.frame, contact.shape, scene);
      region.parent = segment.node; region.material = mesh.material; meshes.push(region);
    }
    if (segment.handPose) changing.push({ segment, mesh, pose: segment.handPose.applied });
  }
  const observer = scene.onBeforeRenderObservable.add(() => {
    for (const item of changing) {
      const pose = item.segment.handPose!.applied;
      if (pose === item.pose) continue;
      const replacement = shapeMesh(`${item.mesh.name}.geometry`, item.segment.frame, item.segment.rigid.shapes[0]!, scene);
      replacement.geometry!.applyToMesh(item.mesh);
      item.mesh.position.copyFrom(replacement.position);
      // Only a capsule is turned in its segment's coordinates; a box, sphere or hull is not.
      item.mesh.rotationQuaternion = replacement.rotationQuaternion ? replacement.rotationQuaternion.clone() : Quaternion.Identity();
      replacement.dispose(false, false); item.pose = pose;
    }
  });
  return {
    meshes,
    dispose() {
      scene.onBeforeRenderObservable.remove(observer);
      for (const mesh of meshes) mesh.dispose(false, false);
      left.dispose();
      right.dispose();
    },
  };
}

/** Wood, for what a hand holds (`docs/reference/look.md#bodies`). */
const WOOD = new Color3(0.45, 0.3, 0.17);

/** One visual item follows its physical node through capture and release; meshes carry no authority. */
export function drawEquipment(item: ReturnType<typeof createEquipment>, scene: Scene): BodyShapes {
  const material = new StandardMaterial(`${item.id}.view`, scene);
  material.diffuseColor = WOOD;
  material.specularColor = new Color3(SHAPE_TINT.sheen, SHAPE_TINT.sheen, SHAPE_TINT.sheen);
  const frame = segmentFrame([0, 0, 0], [0, 1, 0]);
  const meshes = item.spec.shapes.map((shape, i) => {
    const mesh = shapeMesh(`${item.id}.view.${i}`, frame, shape, scene);
    mesh.parent = item.node; mesh.material = material;
    return mesh;
  });
  return { meshes, dispose() { for (const mesh of meshes) mesh.dispose(false, false); material.dispose(); } };
}

/**
 * Draw what `built`'s hands hold, as the solver has it: each segment's rigid body is its own shape
 * with its natural regions and held items (`rigidOf`); only the held owners are drawn here.
 * The skin has no mesh for a held item, so World shows these too.
 */
export function drawHeld(built: BuiltBody, scene: Scene): BodyShapes {
  const wood = new StandardMaterial(`${built.spec.model}.view.held`, scene);
  wood.diffuseColor = WOOD;
  wood.specularColor = new Color3(SHAPE_TINT.sheen, SHAPE_TINT.sheen, SHAPE_TINT.sheen);
  const meshes: Mesh[] = [];
  for (const segment of built.segments.values()) {
    segment.rigid.shapes.slice(1).forEach((shape, i) => {
      if (segment.rigid.owners[i + 1]!.kind !== "held") return;
      const mesh = shapeMesh(`${segment.node.name}.held.${i}`, segment.frame, shape, scene);
      mesh.parent = segment.node;
      mesh.material = wood;
      meshes.push(mesh);
    });
  }
  return {
    meshes,
    dispose() {
      for (const mesh of meshes) mesh.dispose(false, false);
      wood.dispose();
    },
  };
}
