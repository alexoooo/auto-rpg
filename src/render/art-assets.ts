import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";
import { MeshoptCompression } from "@babylonjs/core/Meshes/Compression/meshoptCompression.js";
import "@babylonjs/core/Materials/Textures/Loaders/ktxTextureLoader.js";
import { publicAssetUrl } from "../asset-url.ts";

interface ArtManifest {
  characters: Record<string, { model: { uri: string }; workshop: { uri: string } }>;
  models: Record<string, { uri: string }>;
  textures: Record<string, { uri: string }>;
  decoders: Record<string, string> & { meshopt: string };
}

export interface ArtAssets {
  model(id: string): string;
  texture(id: string): string;
}

let loading: Promise<ArtManifest> | null = null;

/** Hashed resources share URLs across consumers; decoder dependencies stay on this origin. */
async function manifest(): Promise<ArtManifest> {
  loading ??= fetch(publicAssetUrl("/assets/generated/manifest.json")).then(async response => {
    if (!response.ok) throw new Error(`Art manifest could not load (${response.status})`);
    const value = await response.json() as ArtManifest;
    const { meshopt, ...ktx } = value.decoders;
    Object.assign(KhronosTextureContainer2.URLConfig, Object.fromEntries(Object.entries(ktx).map(([key, uri]) => [key, publicAssetUrl(`/assets/generated/${uri}`)])));
    MeshoptCompression.Configuration.decoder.url = publicAssetUrl(`/assets/generated/${meshopt}`);
    return value;
  }).catch(error => { loading = null; throw error; });
  return loading;
}

const url = (asset: { uri: string } | undefined, id: string): string => {
  if (!asset) throw new Error(`Unknown art: ${id}`);
  return publicAssetUrl(`/assets/generated/${asset.uri}`);
};

/** A ready resolver also guarantees decoder configuration before any resource is opened. */
export async function loadArtAssets(): Promise<ArtAssets> {
  const value = await manifest();
  return { model: id => url(value.models[id], id), texture: id => url(value.textures[id], id) };
}

export async function characterAssetUrl(model: string, workshop = false): Promise<string> {
  const value = await manifest(), id = model.replace(/^workshop-/, ""), asset = value.characters[id];
  if (!asset) throw new Error(`Unknown character art: ${model}`);
  return publicAssetUrl(`/assets/generated/${(workshop ? asset.workshop : asset.model).uri}`);
}
