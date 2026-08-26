// The viewer switches assets from the `asset` query parameter. This map is kept
// free of Babylon imports so the viewer can read it without pulling the engine
// into the initial bundle.
export const WARRIOR_ASSETS = {
  v1: "warrior.glb",
  v2: "warrior-v2.glb",
  v3: "warrior-v3.glb",
  basemesh: "warrior-basemesh.glb",
  harness: "warrior-harness.glb",
} as const;

export type WarriorAsset = keyof typeof WARRIOR_ASSETS;

export const DEFAULT_WARRIOR_ASSET: WarriorAsset = "v1";

export function warriorAsset(requested: string | null): WarriorAsset {
  if (requested !== null && Object.hasOwn(WARRIOR_ASSETS, requested)) {
    return requested as WarriorAsset;
  }
  return DEFAULT_WARRIOR_ASSET;
}
