import type { AbstractEngine } from "@babylonjs/core/Engines/abstractEngine.js";
import { Scene } from "@babylonjs/core/scene.js";

export type RightHandedScene = { useRightHandedSystem: boolean };

export function createRightHandedScene<TEngine, TScene extends RightHandedScene, TContent>(
  engine: TEngine,
  sceneFactory: (engine: TEngine) => TScene,
  buildContent: (scene: TScene) => TContent,
): Readonly<{ scene: TScene; content: TContent }> {
  const scene = sceneFactory(engine);
  scene.useRightHandedSystem = true;
  const content = buildContent(scene);
  return Object.freeze({ scene, content });
}

export function createBabylonRightHandedScene<TContent>(
  engine: AbstractEngine,
  buildContent: (scene: Scene) => TContent,
): Readonly<{ scene: Scene; content: TContent }> {
  return createRightHandedScene(engine, (value) => new Scene(value), buildContent);
}
