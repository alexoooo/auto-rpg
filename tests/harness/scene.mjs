/**
 * **A headless scene**: a `NullEngine` and a `Scene`, with no physics, for tests that build and
 * read meshes (the crypt's look). A test that needs physics makes the core's world on the
 * scene (`createWorld`) or uses the core's stand (`core-stand.mjs`).
 */
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";

export function headlessScene() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  return Object.freeze({ scene, dispose: () => { scene.dispose(); engine.dispose(); } });
}
