import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
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

/** Lay the forge's paving and its glowing seams on the ground slab; they add no collider. */
export function paveForge(scene: Scene, kit: Map<string, Mesh>, material: PBRMaterial, ember: PBRMaterial): void {
  const template = kit.get("pavement")!;
  template.material = material;
  template.receiveShadows = true;
  const size = template.getBoundingInfo().boundingBox.extendSize.scale(2);
  for (const x of [-.5, .5]) for (const z of [-.5, .5]) {
    const pavement = template.createInstance(`forge.paving.${x}.${z}`);
    pavement.position.set(x * size.x, -.003, z * size.z);
    pavement.rotationQuaternion = Quaternion.Identity();
    pavement.scaling.copyFrom(Vector3.One());
    pavement.setEnabled(true); pavement.isVisible = true; pavement.isPickable = false;
    pavement.metadata = { roomPlacement: { role: "floor", solid: true, collider: "ground" } };
    const seams = kit.get("fissures")!;
    seams.material = ember;
    const glow = seams.createInstance(`forge.seams.${x}.${z}`);
    glow.position.copyFrom(pavement.position);
    glow.setEnabled(true); glow.isVisible = true; glow.isPickable = false;
    glow.metadata = { forgeNoShadow: true };
  }
  // The underlay reaches the slab's edge; it sits just below the paving and its modelled joints.
  const floor = scene.getMeshByName("room.floor") ?? scene.getMeshByName("bench.floor");
  if (floor) floor.position.y = -.015;
}

export { forgePost } from "./render/post.ts";

