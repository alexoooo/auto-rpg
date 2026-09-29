import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { SegmentFrame, ShapeSpec } from "../core/spec/body.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { dot, length, normalize, sub } from "../core/spec/vec.ts";

/**
 * **The core body as the solver sees it**: each segment's collision shape, drawn on its node.
 * Nothing drawn here collides or decides anything; it is the shapes the spec gave Havok, so what
 * the page shows is what moves.
 */
export interface BodyView {
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
    default: {
      const never: never = shape;
      throw new Error(`unknown shape ${JSON.stringify(never)}`);
    }
  }
}

/** Draw `built`'s shapes; `tint` colours the body, and the right side is drawn a shade warmer. */
export function drawBody(built: BuiltBody, scene: Scene, tint: Color3): BodyView {
  const left = new StandardMaterial(`${built.spec.model}.view.left`, scene);
  left.diffuseColor = tint;
  left.specularColor = new Color3(0.08, 0.08, 0.08);
  const right = new StandardMaterial(`${built.spec.model}.view.right`, scene);
  right.diffuseColor = Color3.Lerp(tint, new Color3(0.85, 0.45, 0.25), 0.35);
  right.specularColor = left.specularColor;
  const meshes: Mesh[] = [];
  for (const segment of built.segments.values()) {
    const mesh = shapeMesh(`${segment.node.name}.view`, segment.frame, segment.spec.shape, scene);
    mesh.parent = segment.node;
    mesh.material = segment.spec.name.endsWith(".right") ? right : left;
    meshes.push(mesh);
  }
  return {
    meshes,
    dispose() {
      for (const mesh of meshes) mesh.dispose(false, false);
      left.dispose();
      right.dispose();
    },
  };
}
