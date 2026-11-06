import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import { Texture } from "@babylonjs/core/Materials/Textures/texture.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import "@babylonjs/core/Rendering/depthRendererSceneComponent.js";
import "@babylonjs/core/Shaders/ShadersInclude/packingFunctions.js";

/** A small world-aligned volume above the basket, m, set by eye. */
const FLAME_VOLUME = Object.freeze({ width: .48, height: .82, depth: .48 });

Effect.ShadersStore.volumeFireVertexShader = `precision highp float;
attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 flamePosition;
void main(){flamePosition=position;gl_Position=worldViewProjection*vec4(position,1.0);}`;
/** Integrate emission through a 3D density field. Noise advects upward in the torch's space, never in screen space. */
Effect.ShadersStore.volumeFireFragmentShader = `precision highp float;
varying vec3 flamePosition;
uniform vec3 rayDirection, eyePosition, tint; uniform float time, phase, fade, orthographic;
uniform sampler2D sceneDepth; uniform vec2 screenSize;
uniform mat4 worldViewProjection; uniform vec3 depthValues;
#ifdef PACKED_DEPTH
#include<packingFunctions>
#endif
float fireHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float fireNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(fireHash(i),fireHash(i+vec3(1,0,0)),f.x),
    mix(fireHash(i+vec3(0,1,0)),fireHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(fireHash(i+vec3(0,0,1)),fireHash(i+vec3(1,0,1)),f.x),
    mix(fireHash(i+vec3(0,1,1)),fireHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void main(){
  vec3 ray=normalize(mix(flamePosition-eyePosition,rayDirection,orthographic));
  vec3 bounds=vec3(${FLAME_VOLUME.width/2},${FLAME_VOLUME.height/2},${FLAME_VOLUME.depth/2});
  // The rasterized front face is the ray's entry. The slab intersection gives its exit.
  vec3 safeRay=(step(vec3(0),ray)*2.0-1.0)*max(abs(ray),vec3(.00001));
  vec3 farPlane=max((-bounds-flamePosition)/safeRay,(bounds-flamePosition)/safeRay);
  vec4 depthSample=texture2D(sceneDepth,gl_FragCoord.xy/screenSize);
#ifdef PACKED_DEPTH
  float solidDepth=unpack(depthSample);
#else
  float solidDepth=depthSample.r;
#endif
  // Babylon's linear depth is projected Z, offset and scaled by its depth range.
  float entryDepth=((worldViewProjection*vec4(flamePosition,1.0)).z*depthValues.z+depthValues.x)/depthValues.y;
  float rayDepth=(worldViewProjection*vec4(ray,0.0)).z*depthValues.z/depthValues.y;
  float solidDistance=(solidDepth-entryDepth)/rayDepth;
  float stepLength=max(0.0,min(solidDistance,min(farPlane.x,min(farPlane.y,farPlane.z))))/32.0;
  vec3 radiance=vec3(0);float opacity=0.0;
  float clock=time+phase;
  for(int i=0;i<32;i++){
    vec3 p=flamePosition+ray*(float(i)+.5)*stepLength;
    float height=(p.y+bounds.y)/${FLAME_VOLUME.height};
    vec2 bend=vec2(sin(height*7.0-clock*2.1),sin(height*5.0+clock*1.7))*.045*height;
    vec3 flow=vec3((p.xz-bend)*11.0,height*5.5-clock*2.2);
    float turbulence=fireNoise(flow)*.7+fireNoise(flow*2.1+11.7)*.3;
    float radius=.18*pow(max(0.0,1.0-height),.75);
    float field=radius*(.45+turbulence)-length(p.xz-bend)+(turbulence-.5)*.12;
    float density=smoothstep(-.015,.055,field)*smoothstep(0.0,.06,height)*(1.0-smoothstep(.78,1.0,height));
    float hot=smoothstep(.055,.15,field)*(1.0-smoothstep(.12,.55,height));
    vec3 emission=mix(vec3(2.0,.45,.02)*tint,vec3(4.0,3.0,1.5),hot);
    float absorb=1.0-exp(-density*stepLength*17.0);
    radiance+=(1.0-opacity)*absorb*emission;
    opacity+=(1.0-opacity)*absorb;
  }
  if(opacity<.002)discard;
  // Alpha blending expects straight colour; fade also dims HDR emission at the cutaway.
  gl_FragColor=vec4(radiance/max(opacity,.001)*fade,opacity*fade);
}`;

const VOLUME_FIRE = Object.freeze({ vertex: "volumeFire", fragment: "volumeFire" });

/**
 * The one material every torch's flame draws with, and each flame's own fade. The fade is written as a flame binds:
 * `ShaderMaterial.bind` always ends by notifying `onBindObservable` with the mesh, even when it skipped re-uploading
 * the material's own uniforms. It is never written through `material.setFloat`, whose value would be re-bound over
 * the flame's whenever the material rebinds. A flame with no fade set is drawn whole.
 */
export function flames(scene: Scene) {
  // Full-precision depth keeps a volume's intersection with nearby stone stable.
  const depth = scene.enableDepthRenderer(undefined, false, true, Texture.NEAREST_SAMPLINGMODE);
  const material = new ShaderMaterial("volume.fire", scene, VOLUME_FIRE, {
    attributes: ["position"], uniforms: ["worldViewProjection", "rayDirection", "eyePosition", "orthographic", "time", "phase", "fade", "tint", "screenSize", "depthValues"],
    samplers: ["sceneDepth"], defines: depth.isPacked ? ["#define PACKED_DEPTH"] : [], needAlphaBlending: true,
  });
  material.setTexture("sceneDepth", depth.getDepthMap());
  material.disableDepthWrite = true;
  material.setFloat("time",0);
  const fades = new Map<AbstractMesh, number>();
  const tints = new Map<AbstractMesh, Color3>(), white=Color3.White();
  const state = { time: 0 };
  const direction=new Vector3(),eye=new Vector3(),forward=Vector3.Forward();
  const binding = material.onBindObservable.add(mesh => {
    const camera = scene.activeCamera;
    if (!camera) return;
    const engine = scene.getEngine(), ortho = camera.mode === Camera.ORTHOGRAPHIC_CAMERA;
    // Match the depth renderer's range in perspective and orthographic projections.
    const near = ortho ? (!engine.useReverseDepthBuffer && engine.isNDCHalfZRange ? 0 : 1)
      : (engine.useReverseDepthBuffer || !engine.isNDCHalfZRange ? camera.minZ : 0);
    const far = engine.useReverseDepthBuffer && engine.isNDCHalfZRange ? 0 : ortho ? 1 : camera.maxZ;
    material.getEffect()?.setFloat3("depthValues", near, near + far, engine.useReverseDepthBuffer ? -1 : 1);
    material.getEffect()?.setFloat2("screenSize", engine.getRenderWidth(), engine.getRenderHeight());
    camera.getDirectionToRef(forward,direction); direction.divideInPlace(mesh.scaling);
    eye.copyFrom(camera.globalPosition).subtractInPlace(mesh.position).divideInPlace(mesh.scaling);
    material.getEffect()?.setVector3("rayDirection",direction);
    material.getEffect()?.setVector3("eyePosition",eye);
    material.getEffect()?.setFloat("orthographic",ortho ? 1 : 0);
    material.getEffect()?.setFloat("phase",mesh.position.x*1.37+mesh.position.z*2.19);
    material.getEffect()?.setFloat("fade", fades.get(mesh) ?? 1);
    material.getEffect()?.setColor3("tint", tints.get(mesh) ?? white);
  });
  return {
    /** A world-aligned flame volume, scaled in metres independently of its density field. */
    create(name: string, at: Vector3, size: Readonly<{ width: number; height: number; depth: number }> = FLAME_VOLUME) {
      const flame = MeshBuilder.CreateBox(name, { ...FLAME_VOLUME }, scene);
      flame.position.copyFrom(at);
      flame.scaling.set(size.width / FLAME_VOLUME.width, size.height / FLAME_VOLUME.height, size.depth / FLAME_VOLUME.depth);
      flame.material = material; flame.isPickable = false;
      return flame;
    },
    burn(seconds: number): number {
      state.time += Math.min(seconds, .05);
      material.setFloat("time", state.time);
      return state.time;
    },
    setTint(flame: AbstractMesh, color: Color3): void { tints.set(flame,color); },
    setFade(flame: AbstractMesh, fade: number): void { fades.set(flame, fade); },
    dispose(): void { material.onBindObservable.remove(binding); },
  };
}
