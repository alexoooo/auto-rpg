import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { ROOM, ROOM_GROUPS, validateRoomPlacements, validateVisualColliderPairs } from "./arena-room.ts";
import type { ForgeStyle } from "./forge-style.ts";
import "./forge-fire.ts";

/** Masonry fills the existing wall colliders; flames decorate existing posts. */
export function dressForgeRoom(scene: Scene, forge: ForgeStyle): void {
  const wall = scene.getMeshByName("room.wall.north");
  if (wall instanceof Mesh) {
    const placements = ROOM_GROUPS.filter(group => group.role === "wall").map(group => ({ ...group,
      placements: group.placements.map(placement => ({ ...placement, solid: true })),
    }));
    const refused = validateRoomPlacements(placements);
    if (refused.length) throw new Error(refused.join("\n"));
    const block = forge.kit.get("masonry")!;
    const box = block.getBoundingInfo().boundingBox;
    const p = block.getVerticesData("position")!, n = block.getVerticesData("normal")!;
    const uv = block.getVerticesData("uv")!, idx = block.getIndices()!;
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    const courses = 9, spacing = ROOM.wallWidth / 26, height = ROOM.wallHeight / courses;
    for (let row = 0; row < courses; row++) for (let column = -1; column < 27; column++) {
      const left = Math.max(-ROOM.wallWidth / 2, -ROOM.wallWidth / 2 + (column + (row % 2) / 2) * spacing);
      const right = Math.min(ROOM.wallWidth / 2, -ROOM.wallWidth / 2 + (column + 1 + (row % 2) / 2) * spacing);
      if (right <= left) continue;
      const scale = new Vector3((right - left - .008) / (box.extendSize.x * 2),
        (height - .006) / (box.extendSize.y * 2), (ROOM.wallThickness - .008) / (box.extendSize.z * 2));
      const centre = new Vector3((left + right) / 2, -ROOM.wallHeight / 2 + (row + .5) * height,
        ROOM.wallThickness / 2);
      const offset = positions.length / 3;
      for (let i = 0; i < p.length; i += 3) {
        positions.push(...Vector3.FromArray(p, i).subtract(box.center).multiply(scale).add(centre).asArray());
        normals.push(...Vector3.FromArray(n, i).divide(scale).normalize().asArray());
      }
      uvs.push(...uv); indices.push(...Array.from(idx, i => i + offset));
    }
    const geometry = new VertexData();
    geometry.positions = positions; geometry.normals = normals; geometry.uvs = uvs; geometry.indices = indices;
    geometry.applyToMesh(wall);
    for (const name of ["north", "south", "east", "west"]) {
      const mesh = scene.getMeshByName(`room.wall.${name}`)!;
      // The boundary uses ambient lighting; the fighter shadow map stays focused on combat.
      mesh.metadata = { ...mesh.metadata, forgeOpaqueWall: true, forgeNoShadow: true,
        roomPlacement: { ...mesh.metadata?.roomPlacement, solid: true } };
    }
    const failures = validateVisualColliderPairs(scene, ["north", "south", "east", "west"].map(name =>
      ({ visual: `room.wall.${name}`, collider: `room.wall.${name}.collider` })));
    if (failures.length) throw new Error(failures.join("\n"));
  }

  const fire = new ShaderMaterial("forge.fire", scene, "proofFire", {
    attributes: ["position", "uv"], uniforms: ["worldViewProjection", "time"], needAlphaBlending: true,
  });
  fire.backFaceCulling = false; fire.disableDepthWrite = true;
  const lights: PointLight[] = [];
  for (let i = 0; i < 14; i += 2) {
    const post = scene.getMeshByName(`post${i}`);
    if (!post) continue;
    post.material = forge.materials.brazierBronze;
    const flame = MeshBuilder.CreatePlane(`forge.torch.${i}`, { width: .38, height: .72 }, scene);
    flame.position.copyFrom(post.position.add(new Vector3(0, 1.07, 0)));
    flame.metadata = { forgeNoShadow: true };
    flame.material = fire; flame.billboardMode = Mesh.BILLBOARDMODE_Y; flame.isPickable = false;
    if (i === 2 || i === 10) {
      const light = new PointLight(`forge.torchlight.${i}`, flame.position, scene);
      light.diffuse = new Color3(1, .42, .12); light.intensity = 14; light.range = 16;
      lights.push(light);
    }
  }
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    if (scene.physicsEnabled) time += Math.min(scene.getEngine().getDeltaTime(), 50) / 1000;
    fire.setFloat("time", time);
    lights.forEach((light, i) => light.intensity = 13 + Math.sin(time * 8 + i) * .8);
  });
}
