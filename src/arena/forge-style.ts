import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { loadTemplates, forgeMaterials } from "./forge-assets.ts";
// These materials are always on screen. Register their shaders with the initial
// module graph instead of discovering a second import waterfall on first render.
import "@babylonjs/core/Shaders/pbr.vertex.js";
import "@babylonjs/core/Shaders/pbr.fragment.js";
import "@babylonjs/core/Shaders/default.vertex.js";
import "@babylonjs/core/Shaders/default.fragment.js";

/** The forge's look: its kit of models (`forge-kit.glb`) and its materials. */
export async function loadForgeStyle(scene: Scene) {
  // Hold the render budget at a 1920x1080 viewport. High-DPI displays otherwise silently quadruple the
  // shaded pixels (3840×2160 for a 1920×1080 CSS viewport), including every post-process.
  const engine = scene.getEngine();
  // Decode image maps to bitmaps before upload: an HTMLImageElement upload converts its
  // pixels synchronously, which costs seconds at startup on an integrated GPU.
  if (typeof createImageBitmap === "function") engine._features.forceBitmapOverHTMLImageElement = true;
  const resize = () => {
    const canvas = engine.getRenderingCanvas();
    if (!canvas) return;
    engine.setHardwareScalingLevel(Math.max(1, canvas.clientWidth / 1920, canvas.clientHeight / 1080));
    engine.resize();
  };
  resize();
  window.addEventListener("resize", resize);
  scene.onDisposeObservable.addOnce(() => window.removeEventListener("resize", resize));
  const [kit, materials] = await Promise.all([loadTemplates(scene, "forge-kit.glb"), forgeMaterials(scene)]);
  return { materials, kit };
}
export type ForgeStyle = Awaited<ReturnType<typeof loadForgeStyle>>;

/** Concentric stone courses and bronze inlay, flush with the collision slab (docs/art/arena.md). */
export function paveForge(scene: Scene, material: PBRMaterial, bronze: PBRMaterial, ember: PBRMaterial): void {
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const radii = [.06, 3.4, 6.4, 9.5, 13.2], counts = [12, 24, 36, 48];
  for (let ring = 0; ring < counts.length; ring++) {
    const inner = radii[ring] + .04, outer = radii[ring + 1] - .04, count = counts[ring];
    for (let stone = 0; stone < count; stone++) {
      const start = (stone + (ring % 2) / 2) * Math.PI * 2 / count;
      for (let arc = 0; arc < 4; arc++) {
        const offset = positions.length / 3;
        for (const [radius, step] of [[inner, arc], [outer, arc], [inner, arc + 1], [outer, arc + 1]]) {
          const angle = start + .04 / radius + (Math.PI * 2 / count - .08 / radius) * step / 4;
          const x = Math.sin(angle) * radius, z = Math.cos(angle) * radius;
          positions.push(x, .006, z); normals.push(0, 1, 0); uvs.push(x / 2.4, z / 2.4);
        }
        indices.push(offset, offset + 2, offset + 1, offset + 1, offset + 2, offset + 3);
      }
    }
  }
  const mesh = new Mesh("forge.circular-paving", scene), data = new VertexData();
  data.positions = positions; data.normals = normals; data.uvs = uvs; data.indices = indices; data.applyToMesh(mesh);
  mesh.material = material; mesh.receiveShadows = true;
  mesh.metadata = { roomPlacement: { role: "floor", solid: true, collider: "ground" } };
  const ring = (name: string, radius: number, thickness: number, surface: PBRMaterial) => {
    const line = MeshBuilder.CreateTorus(name, { diameter: radius * 2, thickness, tessellation: 128 }, scene);
    line.position.y = .009; line.scaling.y = .12; line.material = surface; line.isPickable = false;
  };
  for (const radius of [1.25, 3.4, 6.4, 9.5, 12.8]) ring(`forge.inlay.${radius}`, radius, .055, bronze);
  ring("forge.ember-ring", 12.87, .025, ember);
  const rays: number[] = [], faces: number[] = [];
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4, length = i % 2 ? 2.4 : 4.5;
    const offset = rays.length / 3;
    for (const [radius, turn] of [[.75, angle - .18], [length, angle], [.75, angle + .18], [1.4, angle]]) {
      rays.push(Math.sin(turn) * radius, .014, Math.cos(turn) * radius);
    }
    faces.push(offset, offset + 3, offset + 1, offset + 1, offset + 3, offset + 2);
  }
  const sigil = new Mesh("forge.compass", scene), carved = new VertexData();
  carved.positions = rays; carved.indices = faces; carved.normals = rays.map((_, i) => i % 3 === 1 ? 1 : 0);
  carved.applyToMesh(sigil); sigil.material = bronze; sigil.isPickable = false;
  const skirt = MeshBuilder.CreateCylinder("forge.foundation", { diameter: 27, height: 2.4, tessellation: 96 }, scene);
  skirt.position.y = -1.21; skirt.material = material;
  const floor = scene.getMeshByName("room.floor");
  if (floor) {
    floor.position.y = -.01;
    const mortar = new StandardMaterial("forge.mortar", scene);
    mortar.diffuseColor = Color3.FromHexString("#171313"); mortar.specularColor = Color3.Black();
    floor.material = mortar;
  }
}
