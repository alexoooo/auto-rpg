import { DefaultRenderingPipeline } from "@babylonjs/core/PostProcesses/RenderPipeline/Pipelines/defaultRenderingPipeline.js";
import { ImageProcessingConfiguration } from "@babylonjs/core/Materials/imageProcessingConfiguration.js";
import type { Camera } from "@babylonjs/core/Cameras/camera.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/PostProcesses/RenderPipeline/postProcessRenderPipelineManagerSceneComponent.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";

/**
 * A grade's strengths, set by eye: the image's contrast and exposure, the vignette's weight, and
 * the brightness a pixel blooms from with the bloom's weight.
 */
export interface Grade { readonly contrast: number; readonly exposure: number; readonly vignetteWeight: number; readonly bloomThreshold: number; readonly bloomWeight: number }

/** The game's grade. */
export const GRADE: Grade = Object.freeze({ contrast: 1.12, exposure: 1.15, vignetteWeight: 1.35, bloomThreshold: 1.1, bloomWeight: .16 });
/** The crypt's: warm torch cores bloom against cool stone without darkening the room's edges heavily. */
export const CRYPT_GRADE: Grade = Object.freeze({ contrast: 1.18, exposure: 1.28, vignetteWeight: 0.85, bloomThreshold: 0.95, bloomWeight: .22 });

/**
 * Anti-aliasing, ACES tone mapping, vignette and bloom, in `grade`.
 * A leaf, so that the crypt takes it without loading the arena's room.
 */
export function postPipeline(scene: Scene, camera: Camera, grade: Grade): DefaultRenderingPipeline {
  const post = new DefaultRenderingPipeline("post", true, scene, [camera]);
  // Sample geometry edges before post-processing; canvas MSAA does not cover these render targets.
  post.samples = Math.min(4, scene.getEngine().getCaps().maxMSAASamples);
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