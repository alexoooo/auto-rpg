import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { SegmentFrame, ShapeSpec } from "../core/spec/body.ts";
import { convexHull } from "../core/spec/hull.ts";
import type { Vec3 } from "../core/spec/quantity.ts";
import { dot, length, normalize, sub } from "../core/spec/vec.ts";

/**
 * **The core body as the solver sees it**: each segment's collision shape, drawn on its node.
 * Nothing drawn here collides or decides anything; it is the shapes the spec gave the engine, so what
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

/** A flat disc on the ground at height `y`, for a mark drawn over the floor; it collides with nothing. */
export function groundDisc(scene: Scene, name: string, radius: number, colour: Color3, alpha: number, y: number): Mesh {
  const disc = MeshBuilder.CreateDisc(name, { radius, tessellation: 32 }, scene);
  disc.rotation.x = Math.PI / 2;
  disc.position.y = y;
  const material = new StandardMaterial(name, scene);
  material.diffuseColor = colour;
  material.emissiveColor = colour.scale(0.5);
  material.specularColor = Color3.Black();
  material.alpha = alpha;
  disc.material = material;
  return disc;
}
