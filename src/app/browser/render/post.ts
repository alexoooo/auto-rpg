import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";

/**
 * The grade's strengths, set by eye: the image's contrast and
 * exposure, the vignette's weight, and the brightness a pixel blooms from with the bloom's weight.
 */
const GRADE = Object.freeze({ contrast: 1.12, exposure: 1.15, vignetteWeight: 1.35, bloomThreshold: 1.1, bloomWeight: .16 });
/** Warm torch cores bloom against cool stone without darkening the room's edges heavily. */
const CRYPT_GRADE = Object.freeze({ contrast: 1.18, exposure: 1.28, vignetteWeight: 0.85, bloomThreshold: 0.95, bloomWeight: .22 });

/**
 * Anti-aliasing, ACES tone mapping, vignette and bloom, with a grade selected at construction.
 * A leaf, so that the crypt takes it without loading the arena's room.
 */
export function postPipeline(scene: Scene, camera: Camera, options: { grade?: "default" | "crypt" } = {}): DefaultRenderingPipeline {
  const grade = options.grade === "crypt" ? CRYPT_GRADE : GRADE;
  const post = new DefaultRenderingPipeline("post", true, scene, [camera]);
  post.samples = 1;
  post.fxaaEnabled = true;
  post.imageProcessing.toneMappingEnabled = true;
  post.imageProcessing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES;
  post.imageProcessing.contrast = grade.contrast;
  post.imageProcessing.exposure = grade.exposure;
  post.imageProcessing.vignetteEnabled = true;
  post.imageProcessing.vignetteWeight = grade.vignetteWeight;
  post.bloomEnabled = true;
  post.bloomThreshold = grade.bloomThreshold;
  post.bloomWeight = grade.bloomWeight;
  return post;
}