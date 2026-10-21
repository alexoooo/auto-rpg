import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";
import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";
import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader.js";
import { publicAssetUrl } from "../asset-url.ts";

interface ArtManifest {
  characters: Record<string, { model: { uri: string }; workshop: { uri: string } }>;
  decoders: Record<string, string> & { meshopt: string };
}

let loading: Promise<ArtManifest> | null = null;

/** Hashed resources share URLs across consumers; decoder dependencies stay on this origin. */
export async function characterAssetUrl(model: string, workshop = false): Promise<string> {
  loading ??= fetch(publicAssetUrl("/assets/generated/manifest.json")).then(async response => {
    if (!response.ok) throw new Error(`Art manifest could not load (${response.status})`);
    const manifest = await response.json() as ArtManifest;
    const { meshopt, ...ktx } = manifest.decoders;
    Object.assign(KhronosTextureContainer2.URLConfig, Object.fromEntries(Object.entries(ktx).map(([key, uri]) => [key, publicAssetUrl(`/assets/generated/${uri}`)])));
    MeshoptCompression.Configuration.decoder.url = publicAssetUrl(`/assets/generated/${meshopt}`);
    return manifest;
  }).catch(error => { loading = null; throw error; });
  const manifest = await loading, id = model.replace(/^workshop-/, ""), asset = manifest.characters[id];
  if (!asset) throw new Error(`Unknown character art: ${model}`);
  return publicAssetUrl(`/assets/generated/${(workshop ? asset.workshop : asset.model).uri}`);
}
