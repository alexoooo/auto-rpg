import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { ARENA_POSTS, ROOM, ROOM_GROUPS, validateRoomPlacements, validateVisualColliderPairs } from "./room.ts";
import type { ForgeStyle } from "./forge-style.ts";
import "../render/fire.ts";

/**
 * The walls' masonry, set by eye (`docs/reference/look.md#forge`): the courses up a wall, the
 * blocks along it, and the joint left round each block across, up and through the wall, m.
 */
const FORGE_MASONRY = Object.freeze({ courses: 9, columns: 26, joint: [.008, .006, .008] } as const);

/** The posts' fire, set by eye (`docs/reference/look.md#forge`). */
const FORGE_FIRE = Object.freeze({
  /** A flame burns on every post of this stride round the ring, and a light with it on the posts named. */
  every: 2, lit: [2, 10],
  /** A flame's plane, m, and how far above its post's centre it stands. */
  width: .38, height: .72, lift: 1.07,
  /** A light's colour, the strength it is made with, which the flicker replaces at the first frame, and its range, m. */
  colour: [1, .42, .12], intensity: 14, range: 16,
  /** The flicker: about `mean`, by `swing` either way, at `rate` rad/s, a radian apart from one light to the next. */
  mean: 13, swing: .8, rate: 8,
  /** The most one frame advances the flames, ms. */
  frameCap: 50,
} as const);

/** Dress the arena as the forge: masonry fills the wall colliders' boxes, and flames burn on every other post. */
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
    const { courses, columns, joint } = FORGE_MASONRY;
    const spacing = ROOM.wallWidth / columns, height = ROOM.wallHeight / courses;
    // A column either side of the wall's own: every other course is shifted half a block, and its ends are cut.
    for (let row = 0; row < courses; row++) for (let column = -1; column <= columns; column++) {
      const left = Math.max(-ROOM.wallWidth / 2, -ROOM.wallWidth / 2 + (column + (row % 2) / 2) * spacing);
      const right = Math.min(ROOM.wallWidth / 2, -ROOM.wallWidth / 2 + (column + 1 + (row % 2) / 2) * spacing);
      if (right <= left) continue;
      const scale = new Vector3((right - left - joint[0]) / (box.extendSize.x * 2),
        (height - joint[1]) / (box.extendSize.y * 2), (ROOM.wallThickness - joint[2]) / (box.extendSize.z * 2));
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
      mesh.metadata = { ...mesh.metadata, forgeOpaqueWall: true,
        roomPlacement: { ...mesh.metadata?.roomPlacement, solid: true } };
    }
    const failures = validateVisualColliderPairs(scene, ["north", "south", "east", "west"].map(name =>
      ({ visual: `room.wall.${name}`, collider: `room.wall.${name}.collider` })));
    if (failures.length) throw new Error(failures.join("\n"));
  }

  const fire = new ShaderMaterial("forge.fire", scene, "flame", {
    attributes: ["position", "uv"], uniforms: ["worldViewProjection", "time"], needAlphaBlending: true,
  });
  fire.backFaceCulling = false; fire.disableDepthWrite = true;
  const lights: PointLight[] = [];
  const lit: readonly number[] = FORGE_FIRE.lit;
  for (let i = 0; i < ARENA_POSTS.count; i += FORGE_FIRE.every) {
    const post = scene.getMeshByName(`post${i}`);
    if (!post) continue;
    post.material = forge.materials.brazierBronze;
    const flame = MeshBuilder.CreatePlane(`forge.torch.${i}`, { width: FORGE_FIRE.width, height: FORGE_FIRE.height }, scene);
    flame.position.copyFrom(post.position.add(new Vector3(0, FORGE_FIRE.lift, 0)));
    flame.material = fire; flame.billboardMode = Mesh.BILLBOARDMODE_Y; flame.isPickable = false;
    if (lit.includes(i)) {
      const light = new PointLight(`forge.torchlight.${i}`, flame.position, scene);
      light.diffuse = new Color3(...FORGE_FIRE.colour); light.intensity = FORGE_FIRE.intensity; light.range = FORGE_FIRE.range;
      lights.push(light);
    }
  }
  let time = 0;
  scene.onBeforeRenderObservable.add(() => {
    time += Math.min(scene.getEngine().getDeltaTime(), FORGE_FIRE.frameCap) / 1000;
    fire.setFloat("time", time);
    lights.forEach((light, i) => light.intensity = FORGE_FIRE.mean + Math.sin(time * FORGE_FIRE.rate + i) * FORGE_FIRE.swing);
  });
}
