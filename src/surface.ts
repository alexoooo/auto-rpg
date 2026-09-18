import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { SurfaceDescriptor, TextureChannel, TextureDescriptor } from "./materials";

export type TextureFactory = (
  scene: Scene,
  map: TextureDescriptor,
  ready: (texture: Texture) => void,
  failed: () => void,
) => Texture;

type TextureListener = (channel: TextureChannel, texture: Texture) => void;
const textureListeners = new WeakMap<Material, Set<TextureListener>>();

function materialMap(material: Material, channel: TextureChannel): Texture | null {
  const mapped = material as unknown as {
    albedoTexture?: Texture | null;
    diffuseTexture?: Texture | null;
    bumpTexture?: Texture | null;
    metallicTexture?: Texture | null;
  };
  if (channel === "albedo") return mapped.albedoTexture ?? mapped.diffuseTexture ?? null;
  return channel === "normal" ? mapped.bumpTexture ?? null : mapped.metallicTexture ?? null;
}

function setMaterialMap(material: Material, channel: TextureChannel, texture: Texture): void {
  // Besides avoiding redundant dirtying, this closes an accidental cycle in
  // the listener graph at the first material that already owns this map.
  if (materialMap(material, channel) === texture) return;
  const mapped = material as unknown as {
    albedoTexture?: Texture | null;
    diffuseTexture?: Texture | null;
    bumpTexture?: Texture | null;
    metallicTexture?: Texture | null;
  };
  if (channel === "albedo") {
    if ("albedoTexture" in mapped) mapped.albedoTexture = texture;
    else mapped.diffuseTexture = texture;
  } else if (channel === "normal") mapped.bumpTexture = texture;
  else if ("metallicTexture" in mapped) mapped.metallicTexture = texture;
  // A variant may itself feed another variant. Every attachment, whether it
  // came from image decode or an upstream palette material, is an observable
  // attachment; otherwise a figure -> weapon -> edge chain stops in the middle.
  for (const listener of textureListeners.get(material) ?? []) listener(channel, texture);
}

/**
 * Share a palette material's map objects with a derived material, including
 * maps whose image decode finishes after the derived material was built.
 */
export function followSurfaceMaps(source: Material, target: Material): () => void {
  const copy: TextureListener = (channel, texture) => setMaterialMap(target, channel, texture);
  for (const channel of ["albedo", "normal", "orm"] as const) {
    const texture = materialMap(source, channel);
    if (texture) copy(channel, texture);
  }
  let listeners = textureListeners.get(source);
  if (!listeners) {
    listeners = new Set();
    textureListeners.set(source, listeners);
  }
  listeners.add(copy);
  return () => listeners?.delete(copy);
}

/** Apply every sampling fact that is independent of image decoding. */
export function configureTexture(texture: Texture, map: TextureDescriptor): Texture {
  if (texture.invertY !== map.invertY) {
    throw new Error(`${map.url} was constructed with invertY=${texture.invertY}, expected ${map.invertY}`);
  }
  texture.gammaSpace = map.colourSpace === "srgb";
  texture.updateSamplingMode(Texture.TRILINEAR_SAMPLINGMODE);
  texture.wrapU = Texture.WRAP_ADDRESSMODE;
  texture.wrapV = Texture.WRAP_ADDRESSMODE;
  texture.uScale = map.scale;
  texture.vScale = map.scale;
  return texture;
}

const browserTexture: TextureFactory = (scene, map, ready, failed) => {
  let loaded: Texture | null = null;
  const becameReady = () => loaded ? ready(loaded) : queueMicrotask(becameReady);
  loaded = new Texture(
    map.url,
    scene,
    false,
    map.invertY,
    Texture.TRILINEAR_SAMPLINGMODE,
    becameReady,
    () => {
      loaded?.dispose();
      failed();
    },
  );
  return configureTexture(loaded, map);
};

/**
 * Build the colour material immediately, and promote each texture only after
 * Babylon has decoded it. A failed or perpetually pending image is therefore
 * never attached to the material and can never make its meshes disappear.
 */
export function surface(
  scene: Scene,
  descriptor: SurfaceDescriptor,
  textureFactory: TextureFactory = browserTexture,
): PBRMaterial {
  const material = new PBRMaterial(descriptor.name, scene);
  material.albedoColor = Color3.FromArray(descriptor.albedo);
  material.metallic = descriptor.metallic;
  material.roughness = descriptor.roughness;
  if (descriptor.opacity !== undefined) {
    material.alpha = descriptor.opacity;
    material.transparencyMode = PBRMaterial.PBRMATERIAL_ALPHABLEND;
  }
  // These are channel semantics, not image state. Configure them before any
  // asynchronous decode so a side material derived while maps are pending
  // inherits the same tangent and packed-channel interpretation.
  if (descriptor.textures.normal) {
    material.invertNormalMapX = descriptor.textures.normal.tangentBasis === "gltf-rh-imported";
    material.invertNormalMapY = descriptor.textures.normal.tangentBasis === "babylon-lh";
  }
  if (descriptor.textures.orm) {
    material.useMetallnessFromMetallicTextureBlue = true;
    material.useRoughnessFromMetallicTextureAlpha = false;
    material.useRoughnessFromMetallicTextureGreen = true;
    material.useAmbientOcclusionFromMetallicTextureRed = true;
  }

  const attach: Record<TextureChannel, (texture: Texture) => void> = {
    albedo: (map) => {
      setMaterialMap(material, "albedo", map);
      // PBR multiplies the image by this colour. Keep the descriptor colour as
      // the exact fallback, but do not accidentally darken a decoded albedo.
      material.albedoColor = Color3.White();
    },
    normal: (map) => {
      setMaterialMap(material, "normal", map);
    },
    orm: (map) => {
      setMaterialMap(material, "orm", map);
    },
  };
  for (const [channel, map] of Object.entries(descriptor.textures ?? {})) {
    const typed = channel as TextureChannel;
    textureFactory(scene, map, (texture) => {
      attach[typed](texture);
    }, () => {});
  }
  return material;
}

const palettes = new WeakMap<Scene, Map<string, PBRMaterial>>();

/** One descriptor name means one palette material for the lifetime of a scene. */
export function sharedSurface(scene: Scene, descriptor: SurfaceDescriptor): PBRMaterial {
  let palette = palettes.get(scene);
  if (!palette) {
    palette = new Map();
    palettes.set(scene, palette);
  }
  const known = palette.get(descriptor.name);
  if (known) return known;
  const made = surface(scene, descriptor);
  palette.set(descriptor.name, made);
  return made;
}

/**
 * A tint/scalar variant of one shared map-bearing material. This is how brass,
 * polished edges and painted boards reuse steel or wood images without asking
 * Babylon to allocate another Texture wrapper for the same file.
 */
export function surfaceVariant(
  scene: Scene,
  descriptor: SurfaceDescriptor,
  source: PBRMaterial,
): PBRMaterial {
  const material = surface(scene, descriptor);
  material.invertNormalMapX = source.invertNormalMapX;
  material.invertNormalMapY = source.invertNormalMapY;
  material.useMetallnessFromMetallicTextureBlue = source.useMetallnessFromMetallicTextureBlue;
  material.useRoughnessFromMetallicTextureAlpha = source.useRoughnessFromMetallicTextureAlpha;
  material.useRoughnessFromMetallicTextureGreen = source.useRoughnessFromMetallicTextureGreen;
  material.useAmbientOcclusionFromMetallicTextureRed = source.useAmbientOcclusionFromMetallicTextureRed;
  const unfollow = followSurfaceMaps(source, material);
  material.onDisposeObservable.addOnce(unfollow);
  return material;
}
