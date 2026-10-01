import { publicAssetUrl } from "../asset-url.ts";
import { PBRMaterial } from "@babylonjs/core/Materials/PBR/pbrMaterial.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { SurfaceDescriptor, TextureChannel, TextureDescriptor } from "./materials";

export type TextureFactory = (
  scene: Scene,
  map: TextureDescriptor,
  ready: (texture: Texture) => void,
  failed: () => void,
) => Texture;

function attachMap(material: PBRMaterial, channel: TextureChannel, texture: Texture): void {
  switch (channel) {
    case "albedo": material.albedoTexture = texture; break;
    case "normal": material.bumpTexture = texture; break;
    case "orm": material.metallicTexture = texture; break;
    default: {
      const never: never = channel;
      throw new Error(`unknown texture channel ${JSON.stringify(never)}`);
    }
  }
}

/** Apply every sampling fact that is independent of image decoding. */
function configureTexture(texture: Texture, map: TextureDescriptor): Texture {
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
    publicAssetUrl(map.url),
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
  // How to read the maps is known before any of them decodes.
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

  for (const [channel, map] of Object.entries(descriptor.textures ?? {})) {
    const typed = channel as TextureChannel;
    textureFactory(scene, map, (texture) => {
      attachMap(material, typed, texture);
      // PBR multiplies the image by the albedo colour, which is only the fallback until the image decodes.
      if (typed === "albedo") material.albedoColor = Color3.White();
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
