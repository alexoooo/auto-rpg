import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";

/**
 * The grade's strengths, set by eye (`docs/reference/look.md#grade`): the image's contrast and
 * exposure, the vignette's weight, and the brightness a pixel blooms from with the bloom's weight.
 */
const GRADE = Object.freeze({ contrast: 1.12, exposure: 1.15, vignetteWeight: 1.35, bloomThreshold: 1.1, bloomWeight: .16 });

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
  post.imageProcessing.contrast = GRADE.contrast;
  post.imageProcessing.exposure = GRADE.exposure;
  post.imageProcessing.vignetteEnabled = true;
  post.imageProcessing.vignetteWeight = GRADE.vignetteWeight;
  post.bloomEnabled = true;
  post.bloomThreshold = GRADE.bloomThreshold;
  post.bloomWeight = GRADE.bloomWeight;
  return post;
}