import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import type { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { ASSET_ROOT, loadTemplates, proofMaterials, type ProofManifest } from "./art-proof/assets.ts";
import { forgeAppearance } from "./forge-models.ts";
import { installGolemAppearance } from "./golem/appearance.ts";
import type { GolemMaterialPalette } from "./golem/materials.ts";
import { attachGolemProceduralSurface } from "./golem/procedural-surface.ts";
// These materials are always on screen. Register their shaders with the initial
// module graph instead of discovering a second import waterfall on first render.
import "@babylonjs/core/Shaders/pbr.vertex.js";
import "@babylonjs/core/Shaders/pbr.fragment.js";
import "@babylonjs/core/Shaders/default.vertex.js";
import "@babylonjs/core/Shaders/default.fragment.js";

/** Copy maps onto the game's own materials, preserving their live damage/wear plugins. */
function surface(target: PBRMaterial, source: PBRMaterial): void {
  target.albedoTexture = source.albedoTexture;
  target.bumpTexture = source.bumpTexture;
  target.metallicTexture = source.metallicTexture;
  target.albedoColor.copyFrom(source.albedoColor);
  target.emissiveColor.copyFrom(source.emissiveColor);
  target.metallic = source.metallic;
  target.roughness = source.roughness;
  target.useRoughnessFromMetallicTextureAlpha = false;
  target.useRoughnessFromMetallicTextureGreen = true;
  target.useMetallnessFromMetallicTextureBlue = true;
  target.useAmbientOcclusionFromMetallicTextureRed = source.useAmbientOcclusionFromMetallicTextureRed;
  target.maxSimultaneousLights = 4;
}

export async function loadForgeStyle(scene: Scene) {
  // Match the proof's render budget. High-DPI displays otherwise silently quadruple the
  // shaded pixels (3840×2160 for a 1920×1080 CSS viewport), including every post-process.
  const engine = scene.getEngine();
  // Decode image maps to bitmaps before upload. HTMLImageElement uploads forced
  // seconds of synchronous pixel conversion on the integrated GPU at startup.
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
  const [templates, kit, materials, response] = await Promise.all([
    loadTemplates(scene, "golem.glb"), loadTemplates(scene, "forge-kit.glb"), proofMaterials(scene),
    fetch(ASSET_ROOT + "manifest.json"),
  ]);
  if (!response.ok) throw new Error(`Forge manifest: ${response.status}`);
  const manifest = await response.json() as ProofManifest;
  const configured = new WeakSet<GolemMaterialPalette>();
  const configure = (palette: GolemMaterialPalette) => {
    if (configured.has(palette)) return;
    surface(palette.carvedStone, materials.stone);
    if (palette.faction === "right") palette.carvedStone.albedoColor = Color3.FromHexString("#a9bfd3").toLinearSpace();
    surface(palette.functionalMetal, materials.bronze);
    surface(palette.golemWood, materials.wood);
    surface(palette.rune, materials.rune);
    if (palette.faction === "right") palette.rune.emissiveColor.set(.06, 1.4, 3);
    configured.add(palette);
  };
  materials.steel.metadata = { golemSurfaceFamily: "functionalMetal" };
  attachGolemProceduralSurface(materials.steel, "bronze", "procedural-pbr");
  installGolemAppearance(scene, forgeAppearance(templates, manifest, configure, materials.steel));
  return { materials, kit, configure };
}
export type ForgeStyle = Awaited<ReturnType<typeof loadForgeStyle>>;

/** Shallow paving lies on the existing slab. No new solid obstacle or collision body. */
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
  // Existing underlay extends to the collision slab's perimeter, beneath the modeled joints.
  const floor = scene.getMeshByName("room.floor") ?? scene.getMeshByName("bench.floor");
  if (floor) floor.position.y = -.015;
}

export { forgePost } from "./forge-post.ts";

