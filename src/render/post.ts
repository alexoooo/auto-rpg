import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";

/**
 * The grade the arena and the crypt share: anti-aliasing, ACES tone mapping, a vignette and a light
 * bloom. A leaf, so that the crypt takes it without loading the arena's room.
 */
export function postPipeline(scene: Scene, camera: Camera): DefaultRenderingPipeline {
  const post = new DefaultRenderingPipeline("post", true, scene, [camera]);
  post.samples = 1;
  post.fxaaEnabled = true;
  post.imageProcessing.toneMappingEnabled = true;
  post.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  post.imageProcessing.contrast = 1.12;
  post.imageProcessing.exposure = 1.15;
  post.imageProcessing.vignetteEnabled = true;
  post.imageProcessing.vignetteWeight = 1.35;
  post.bloomEnabled = true;
  post.bloomThreshold = 1.1;
  post.bloomWeight = .16;
  return post;
}