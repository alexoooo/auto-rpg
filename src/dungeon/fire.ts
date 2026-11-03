import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import { cutAway } from "./fog.ts";
import { CAMERA_AZIMUTH, cameraToward } from "./bearing.ts";
import type { Point } from "./map.ts";

/** A small world-aligned volume above the basket, m (`docs/reference/look.md#crypt-light`). */
export const FLAME_VOLUME = Object.freeze({ width: .48, height: .82, depth: .48 });

Effect.ShadersStore.dungeonFireVertexShader = `precision highp float;
attribute vec3 position; uniform mat4 worldViewProjection; varying vec3 flamePosition;
void main(){flamePosition=position;gl_Position=worldViewProjection*vec4(position,1.0);}`;
/** Integrate emission through a 3D density field. Noise advects upward in the torch's space, never in screen space. */
Effect.ShadersStore.dungeonFireFragmentShader = `precision highp float;
varying vec3 flamePosition;
uniform vec3 rayDirection, tint; uniform float time, phase, fade;
float fireHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float fireNoise(vec3 p){
  vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
  return mix(mix(mix(fireHash(i),fireHash(i+vec3(1,0,0)),f.x),
    mix(fireHash(i+vec3(0,1,0)),fireHash(i+vec3(1,1,0)),f.x),f.y),
    mix(mix(fireHash(i+vec3(0,0,1)),fireHash(i+vec3(1,0,1)),f.x),
    mix(fireHash(i+vec3(0,1,1)),fireHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void main(){
  vec3 ray=normalize(rayDirection);
  vec3 bounds=vec3(${FLAME_VOLUME.width/2},${FLAME_VOLUME.height/2},${FLAME_VOLUME.depth/2});
  // The rasterized front face is the ray's entry. The slab intersection gives its exit.
  vec3 safeRay=(step(vec3(0),ray)*2.0-1.0)*max(abs(ray),vec3(.00001));
  vec3 farPlane=max((-bounds-flamePosition)/safeRay,(bounds-flamePosition)/safeRay);
  float stepLength=max(0.0,min(farPlane.x,min(farPlane.y,farPlane.z)))/32.0;
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

const DUNGEON_FIRE = Object.freeze({ vertex: "dungeonFire", fragment: "dungeonFire" });

/**
 * The one material every torch's flame draws with, and each flame's own fade. The fade is written as a flame binds:
 * `ShaderMaterial.bind` always ends by notifying `onBindObservable` with the mesh, even when it skipped re-uploading
 * the material's own uniforms. It is never written through `material.setFloat`, whose value would be re-bound over
 * the flame's whenever the material rebinds. A flame with no fade set is drawn whole.
 */
export function flameMaterial(scene: Scene) {
  const material = new ShaderMaterial("dungeon.fire", scene, DUNGEON_FIRE, {
    attributes: ["position"], uniforms: ["worldViewProjection", "rayDirection", "time", "phase", "fade", "tint"], needAlphaBlending: true,
  });
  material.disableDepthWrite = true;
  material.setFloat("time",0);
  const fades = new Map<AbstractMesh, number>();
  const tints = new Map<AbstractMesh, Color3>(), white=Color3.White();
  const direction=new Vector3(),forward=Vector3.Forward();
  const binding = material.onBindObservable.add(mesh => {
    scene.activeCamera?.getDirectionToRef(forward,direction);
    material.getEffect()?.setVector3("rayDirection",direction);
    material.getEffect()?.setFloat("phase",mesh.position.x*1.37+mesh.position.z*2.19);
    material.getEffect()?.setFloat("fade", fades.get(mesh) ?? 1);
    material.getEffect()?.setColor3("tint", tints.get(mesh) ?? white);
  });
  return {
    material,
    setTint(flame: AbstractMesh, color: Color3): void { tints.set(flame,color); },
    setFade(flame: AbstractMesh, fade: number): void { fades.set(flame, fade); },
    dispose(): void { material.onBindObservable.remove(binding); },
  };
}

/** How much of a flame at `at` is drawn: what the cut-away leaves of a wall there. */
export const flameFade = (hero: Point, at: { x: number; y: number; z: number }, pitch: number,
  toward: Point = cameraToward(CAMERA_AZIMUTH)): number => 1 - cutAway(hero, at, pitch, toward);
