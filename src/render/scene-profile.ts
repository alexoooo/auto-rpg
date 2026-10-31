import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { ViewMode } from "./view.ts";

interface Presentation { setEnabled(enabled: boolean): void }
const profiles = new WeakMap<Scene, { view: ViewMode }>();
export const isTactical = (scene: Scene): boolean => profiles.get(scene)?.view === "tactical";

/** One scene's presentation policy; registrations own their resources, never simulation nodes. */
export function sceneProfile(scene: Scene, initial: ViewMode = "world") {
  const state = { view: "world" as ViewMode };
  profiles.set(scene, state);
  const flags = { texturesEnabled: scene.texturesEnabled, shadowsEnabled: scene.shadowsEnabled,
    postProcessesEnabled: scene.postProcessesEnabled, renderTargetsEnabled: scene.renderTargetsEnabled,
    particlesEnabled: scene.particlesEnabled, spritesEnabled: scene.spritesEnabled,
    lensFlaresEnabled: scene.lensFlaresEnabled, fogEnabled: scene.fogEnabled, skeletonsEnabled: scene.skeletonsEnabled };
  const clear = scene.clearColor.clone(), ambient = scene.ambientColor.clone();
  let imageProcessing = scene.imageProcessingConfiguration.isEnabled;
  const entries = new Map<Presentation, ViewMode | "both">();
  const lights = new Map(scene.lights.map(light => [light, light.isEnabled()]));
  const layers = new Map<NonNullable<Scene["effectLayers"]>[number], boolean>();
  const fill = new HemisphericLight("tactical.fill", new Vector3(.3, 1, -.4), scene);
  fill.intensity = 1; fill.groundColor = new Color3(.4, .4, .4); fill.setEnabled(false);
  const applyLayers = () => {
    for (const layer of scene.effectLayers ?? []) {
      if (!layers.has(layer)) layers.set(layer, layer.isEnabled);
      layer.isEnabled = state.view === "world" && layers.get(layer)!;
    }
  };
  const newLight = scene.onNewLightAddedObservable.add(light => {
    if (light === fill) return;
    if (!lights.has(light)) lights.set(light, light.isEnabled());
    if (state.view === "tactical") light.setEnabled(false);
  });
  const before = scene.onBeforeRenderObservable.add(applyLayers);
  const setView = (view: ViewMode) => {
    if (view === state.view) return;
    if (state.view === "world" && view === "tactical") {
      imageProcessing = scene.imageProcessingConfiguration.isEnabled;
      for (const light of lights.keys()) lights.set(light, light.isEnabled());
      for (const layer of layers.keys()) layers.set(layer, layer.isEnabled);
    }
    state.view = view;
    const world = view === "world";
    if (world) scene.imageProcessingConfiguration.isEnabled = imageProcessing;
    for (const key of Object.keys(flags) as (keyof typeof flags)[]) scene[key] = world && flags[key];
    scene.clearColor = world ? clear : new Color4(.08, .095, .11, 1);
    scene.ambientColor = world ? ambient : Color3.Black();
    for (const [light, enabled] of lights) if (!light.isDisposed()) light.setEnabled(world && enabled);
    fill.setEnabled(!world);
    applyLayers();
    for (const [part, mode] of entries) part.setEnabled(mode === "both" || mode === view);
    // A disposed post pipeline can leave its grade running inside materials.
    if (!world) scene.imageProcessingConfiguration.isEnabled = false;
  };
  setView(initial);
  return {
    get view() { return state.view; }, setView,
    register(mode: ViewMode | "both", part: Presentation) {
      entries.set(part, mode); part.setEnabled(mode === "both" || mode === state.view);
      return () => { entries.delete(part); };
    },
    dispose() {
      setView("world"); entries.clear(); profiles.delete(scene);
      scene.onNewLightAddedObservable.remove(newLight); scene.onBeforeRenderObservable.remove(before); fill.dispose();
    },
  };
}

/** A fixed set of visual meshes, preserving source meshes that start disabled. */
export function visualGroup(meshes: readonly { isEnabled(): boolean; setEnabled(enabled: boolean): void }[]): Presentation {
  const enabled = meshes.map(mesh => mesh.isEnabled());
  return { setEnabled(on) { meshes.forEach((mesh, i) => mesh.setEnabled(on && enabled[i]!)); } };
}
