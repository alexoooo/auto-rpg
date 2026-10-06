import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { SkinOptions, SkinView } from "./skin-view.ts";
import type { Appearance } from "./appearance.ts";
import { createRobotPart, housing, local, type Finish, type RobotDesign } from "./robot-geometry.ts";
import { industrialRobot } from "./robot-industrial.ts";
import { steampunkRobot } from "./robot-steampunk.ts";
import { futuristicRobot } from "./robot-futuristic.ts";

type Robot = Exclude<Appearance, "default">;
const DESIGNS: Readonly<Record<Robot, RobotDesign>> = { industrial: industrialRobot, relic: steampunkRobot, duelist: futuristicRobot };

/** Rigid shells ride the simulated segments; only cosmetic finger articulation needs a render callback. */
export function dressRobot(built: BuiltBody, scene: Scene, appearance: Robot, options: SkinOptions): SkinView {
  const design = DESIGNS[appearance], prefix = `${built.spec.model}.${appearance}.${scene.getUniqueId()}`;
  const materials = {} as Record<Finish, PBRMaterial>;
  for (const [finish, spec] of Object.entries(design.palette) as [Finish, NonNullable<RobotDesign["palette"][Finish]>][]) {
    const material = new PBRMaterial(`${prefix}.${finish}`, scene);
    material.albedoColor = Color3.FromHexString(spec.colour);
    material.metallic = spec.metallic;
    material.roughness = spec.roughness;
    if (spec.emission !== undefined) material.emissiveColor = material.albedoColor.scale(spec.emission);
    material.unlit = spec.unlit ?? false;
    materials[finish] = material;
  }
  const meshes: Mesh[] = [];
  const fingers: { mesh: Mesh; hand: "left" | "right"; base: Vector3; lengths: number[]; index: number; holding: boolean }[] = [];
  for (const [name, segment] of built.segments) {
    const { part, buckets } = createRobotPart(name, segment);
    design.build(part);
    if (name.startsWith("hand.")) {
      const { size } = part;
      const hand = name.endsWith("right") ? "right" : "left", k = local(segment, segment.spec.points!.knuckles.value);
      const little = local(segment, segment.spec.points!.little.value), halfWidth = Math.abs(little.x - k.x) * 1.20;
      const radius = segment.spec.shape.kind === "capsule" ? segment.spec.shape.radius.value : size.z / 2;
      const held = built.spec.held?.find(item => item.segment === name), holding = held !== undefined;
      const grip = held ? local(segment, held.origin.value) : null;
      const bendRadius = held?.item.grip ? held.item.grip.value + radius * .25 : radius * .90;
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
