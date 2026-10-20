import { LoadAssetContainerAsync } from "@babylonjs/core/Loading/sceneLoader.js";
import type { Scene } from "@babylonjs/core/scene.js";

const downloads = new Map<string, Promise<Uint8Array>>();

/** Immutable model bytes are shared by previews and scenes; a failed request can be retried. */
export function modelBytes(url: string): Promise<Uint8Array> {
  let loading = downloads.get(url);
  if (!loading) {
    loading = fetch(url).then(async response => {
      if (!response.ok) throw new Error(`Model could not load (${response.status}): ${url}`);
      return new Uint8Array(await response.arrayBuffer());
    }).catch(error => { downloads.delete(url); throw error; });
    downloads.set(url, loading);
  }
  return loading;
}

/** Decode shared bytes into objects owned exclusively by this scene. */
export async function sceneModel(url: string, scene: Scene) {
  const bytes = await modelBytes(url);
  if (scene.isDisposed) throw new DOMException("The screen was closed", "AbortError");
  const split = url.lastIndexOf("/");
  // Each decoder gets a private buffer so mesh edits cannot mutate the download cache.
  const container = await LoadAssetContainerAsync(bytes.slice(), scene, {
    pluginExtension: ".glb", name: url.slice(split + 1), rootUrl: url.slice(0, split + 1),
  });
  if (scene.isDisposed) { container.dispose(); throw new DOMException("The screen was closed", "AbortError"); }
  scene.onDisposeObservable.addOnce(() => container.dispose());
  return container;
}
