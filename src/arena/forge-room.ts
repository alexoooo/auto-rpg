import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { PointLight } from "@babylonjs/core/Lights/pointLight.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { ARENA_POSTS, ROOM, ROOM_GROUPS, validateRoomPlacements, validateVisualColliderPairs } from "./room.ts";
import type { ForgeStyle } from "./forge-style.ts";
import "../render/fire.ts";

/**
 * The walls' masonry, set by eye (`docs/reference/look.md#forge`): the courses up a wall, the
 * blocks along it, and the joint left round each block across, up and through the wall, m.
 */
const FORGE_MASONRY = Object.freeze({ courses: 3, columns: 4, joint: [.008, .006, .008] } as const);

/** The posts' fire, set by eye (`docs/reference/look.md#forge`). */
const FORGE_FIRE = Object.freeze({
  /** A flame burns on every post of this stride round the ring, and a light with it on the posts named. */
  every: 1, lit: [1, 5],
  /** A flame's plane, m, and how far above its post's centre it stands. */
  width: 1.05, height: 1.6, lift: 1.35,
  /** A light's colour and its range, m. */
  colour: [1, .42, .12], range: 16,
  /** The flicker: about `mean`, by `swing` either way, at `rate` rad/s, a radian apart from one light to the next. */
  mean: 13, swing: .8, rate: 8,
  /** The most one frame burns the flames, ms. */
  frameCap: 50,
} as const);

/** The forge's fire: its flames and their lights, at a time of their own that only `burn` moves. */
export interface ForgeFire {
  /** Burns the fire the `seconds` a frame took: the flames move on and each light flickers. A page that is paused does not call it. */
  burn(seconds: number): void;
}

/** Masonry fills the circular parapet's colliders; each pedestal carries a brazier flame. */
export function dressForgeRoom(scene: Scene, forge: ForgeStyle): ForgeFire {
  const wall = scene.getMeshByName("room.wall.0");
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
        0);
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
    for (let index = 0; index < ROOM.wallCount; index++) {
      const mesh = scene.getMeshByName(`room.wall.${index}`)!;
      mesh.metadata = { ...mesh.metadata, forgeOpaqueWall: true,
        roomPlacement: { ...mesh.metadata?.roomPlacement, solid: true } };
    }
    const failures = validateVisualColliderPairs(scene, Array.from({ length: ROOM.wallCount }, (_, index) =>
      ({ visual: `room.wall.${index}`, collider: `room.wall.${index}.collider` })));
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
    // The bronze bands stay inside the pedestal's physical envelope (docs/art/arena.md).
    post.material = forge.materials.basalt ?? post.material;
    const bowl = MeshBuilder.CreateCylinder(`forge.bowl.${i}`, {
      diameterTop: 1.08, diameterBottom: .7, height: .28, tessellation: ARENA_POSTS.sides,
    }, scene);
    bowl.position.set(post.position.x, 1.55, post.position.z);
    bowl.material = forge.materials.brazierBronze;
    bowl.metadata = { roomPlacement: { role: "brazier", solid: true, collider: post.name } };
    for (const y of [.12, 1.35, 1.65]) {
      const band = MeshBuilder.CreateCylinder(`forge.brazier.${i}.${y}`, {
        diameter: ARENA_POSTS.diameter, height: .09, tessellation: ARENA_POSTS.sides,
      }, scene);
      band.position.set(post.position.x, y, post.position.z);
      band.material = forge.materials.brazierBronze;
      band.metadata = { roomPlacement: { role: "brazier", solid: true, collider: post.name } };
    }
    const flame = MeshBuilder.CreatePlane(`forge.torch.${i}`, { width: FORGE_FIRE.width, height: FORGE_FIRE.height }, scene);
    flame.position.copyFrom(post.position.add(new Vector3(0, FORGE_FIRE.lift, 0)));
    flame.material = fire; flame.billboardMode = Mesh.BILLBOARDMODE_Y; flame.isPickable = false;
    if (lit.includes(i)) {
      const light = new PointLight(`forge.torchlight.${i}`, flame.position, scene);
      light.diffuse = new Color3(...FORGE_FIRE.colour); light.intensity = FORGE_FIRE.mean; light.range = FORGE_FIRE.range;
      lights.push(light);
    }
  }
  let time = 0;
  return {
    burn(seconds) {
      time += Math.min(seconds * 1000, FORGE_FIRE.frameCap) / 1000;
      fire.setFloat("time", time);
      lights.forEach((light, i) => light.intensity = FORGE_FIRE.mean + Math.sin(time * FORGE_FIRE.rate + i) * FORGE_FIRE.swing);
    },
  };
}

/** The banners' painted seal, a circle crossed by a spear (docs/art/arena.md). */
export function paintArenaBanners(scene: Scene, forge: ForgeStyle): void {
  const texture = new DynamicTexture("arena banner seal", { width: 256, height: 512 }, scene, true);
  const ctx = texture.getContext();
  ctx.fillStyle = "#641914"; ctx.fillRect(0, 0, 256, 512);
  const shade = ctx.createLinearGradient(0, 0, 256, 0);
  shade.addColorStop(0, "#110806aa"); shade.addColorStop(.45, "#a0472622"); shade.addColorStop(1, "#0b0606bb");
  ctx.fillStyle = shade; ctx.fillRect(0, 0, 256, 512);
  ctx.strokeStyle = "#b69a61"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(128, 206, 70, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(128, 83); ctx.lineTo(128, 357);
  ctx.moveTo(107, 111); ctx.lineTo(128, 80); ctx.lineTo(149, 111);
  ctx.moveTo(45, 206); ctx.lineTo(211, 206); ctx.stroke();
  ctx.globalAlpha = .17;
  for (let index = 0; index < 900; index++) {
    ctx.fillStyle = index % 2 ? "#170907" : "#c49167";
    ctx.fillRect((index * 79) % 256, (index * 137) % 512, 1 + index % 4, 2 + index % 9);
  }
  texture.update();
  forge.materials.banner.albedoTexture = texture;
  forge.materials.banner.albedoColor = Color3.White();
}
