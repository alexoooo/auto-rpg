import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { Camera } from "@babylonjs/core/Cameras/camera.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { Effect } from "@babylonjs/core/Materials/effect.js";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { DamageCue } from "../../worker/damage-cues.ts";

/** A tight contact burst, m across, held long enough to read a hit at real speed. */
const DIAMETER = .28, SECONDS = .18;

/** Light contacts are half-size translucent strokes, briefly held before fading, s, without a number below this HP. */
const SPARK_SCALE = .5, SPARK_OPACITY = .45, SPARK_SECONDS = .2, SPARK_HOLD = .05, NUMBER_MINIMUM = .1;

/** Minimum burst diameter in CSS pixels; the half-size spark retains visible strokes when zoomed out. */
const MIN_DIAMETER_PIXELS = 20;

/** A number lingers above the contact long enough to read, s. */
const NUMBER_SECONDS = .7;

Effect.ShadersStore.contactMarkerVertexShader = `precision highp float;
attribute vec3 position; attribute vec2 uv; uniform mat4 worldViewProjection; varying vec2 markerUv;
void main(){markerUv=uv;gl_Position=worldViewProjection*vec4(position,1.0);}`;
/** The marker's picture as drawn, faded by its mesh. The post pipeline grades linear colour, so the picture is made linear for it. */
Effect.ShadersStore.contactMarkerFragmentShader = `precision highp float;
varying vec2 markerUv; uniform sampler2D marker; uniform float visibility, graded;
void main(){
  vec4 colour=texture2D(marker,markerUv);
  gl_FragColor=vec4(mix(colour.rgb,pow(colour.rgb,vec3(2.2)),graded),colour.a*visibility);
}`;

const CONTACT_MARKER = Object.freeze({ vertex: "contactMarker", fragment: "contactMarker" });

/**
 * A transparent contact marker that leaves depth and character silhouette masks untouched.
 * A marker is nothing but its picture, so it is drawn by its own shader: a standard material loses its
 * textures in the Tactical view, which turns the scene's textures off, and would draw a black quad.
 */
function markerMaterial(name: string, texture: DynamicTexture, scene: Scene): ShaderMaterial {
  const material = new ShaderMaterial(name, scene, CONTACT_MARKER, {
    attributes: ["position", "uv"], uniforms: ["worldViewProjection", "visibility", "graded"],
    samplers: ["marker"], needAlphaBlending: true,
  });
  material.setTexture("marker", texture);
  material.backFaceCulling = false; material.disableDepthWrite = true;
  // Skins may cover the physical contact point; the small marker stays readable over them.
  material.depthFunction = Constants.ALWAYS;
  material.stencil.enabled = true; material.stencil.mask = 0;
  // Markers share a material, so each one's fade is written as it binds.
  material.onBindObservable.add(mesh => {
    const effect = material.getEffect(), grade = scene.imageProcessingConfiguration;
    effect?.setFloat("visibility", mesh.visibility);
    effect?.setFloat("graded", grade.isEnabled && grade.applyByPostProcess ? 1 : 0);
  });
  return material;
}

/** One readable HP total for repeated wounds at a contact. */
function damageNumber(scene: Scene) {
  const canvas = document.createElement("canvas");
  canvas.width = 256; canvas.height = 96;
  const context = canvas.getContext("2d")!;
  context.font = "bold 64px sans-serif"; context.textAlign = "center"; context.textBaseline = "middle";
  context.lineWidth = 8; context.lineJoin = "round"; context.strokeStyle = "#21100d"; context.fillStyle = "#fff2cb";
  const texture = new DynamicTexture("damage number", canvas, scene, false);
  texture.hasAlpha = true;
  const material = markerMaterial("damage number", texture, scene);
  const mesh = CreatePlane("damage number", { width: .64, height: .24 }, scene);
  mesh.material = material; mesh.billboardMode = Mesh.BILLBOARDMODE_ALL; mesh.isPickable = false;
  return {
    mesh,
    show(damage: number): void {
      const text = String(Number(damage.toFixed(1)));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.strokeText(text, 128, 48, 240); context.fillText(text, 128, 48, 240);
      texture.update();
    },
    dispose(): void { mesh.dispose(false, false); material.dispose(); texture.dispose(); },
  };
}

/** Contact flashes shared by every body and weapon, animated only by the displayed frame clock. */
export function damageFlashes(scene: Scene) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const context = canvas.getContext("2d")!;
  const colour = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  colour.addColorStop(0, "#fffbe4"); colour.addColorStop(.25, "#ffe6b5");
  colour.addColorStop(.55, "#ef7963"); colour.addColorStop(1, "rgba(210,65,50,0)");
  context.fillStyle = colour;
  context.beginPath();
  for (let i = 0; i < 16; i++) {
    const angle = i * Math.PI / 8, radius = i % 2 ? 20 : 64;
    const x = 64 + Math.cos(angle) * radius, y = 64 + Math.sin(angle) * radius;
    if (i === 0) context.moveTo(x, y); else context.lineTo(x, y);
  }
  context.closePath(); context.fill();
  const texture = new DynamicTexture("damage burst", canvas, scene, false);
  texture.hasAlpha = true; texture.update();
  const material = markerMaterial("damage flash", texture, scene);
  const sparkCanvas = document.createElement("canvas");
  sparkCanvas.width = sparkCanvas.height = 128;
  const sparkContext = sparkCanvas.getContext("2d")!;
  sparkContext.lineCap = "round";
  sparkContext.beginPath();
  sparkContext.moveTo(47, 62); sparkContext.lineTo(18, 32);
  sparkContext.moveTo(64, 48); sparkContext.lineTo(64, 10);
  sparkContext.moveTo(81, 62); sparkContext.lineTo(113, 36);
  sparkContext.strokeStyle = "#302214"; sparkContext.lineWidth = 20; sparkContext.stroke();
  sparkContext.strokeStyle = "#ffe1a3"; sparkContext.lineWidth = 16; sparkContext.stroke();
  const sparkTexture = new DynamicTexture("damage spark", sparkCanvas, scene, false);
  sparkTexture.hasAlpha = true; sparkTexture.update();
  const sparkMaterial = markerMaterial("damage spark", sparkTexture, scene);
  const cameraPoint = new Vector3();
  const state = { pending: [] as DamageCue[], flashes: new Map<string, {
    mesh: Mesh; number: ReturnType<typeof damageNumber> | null; damage: number; time: number;
  }>() };
  const clear = () => {
    state.pending.length = 0;
    for (const { mesh, number } of state.flashes.values()) { mesh.dispose(false, false); number?.dispose(); }
    state.flashes.clear();
  };
  return {
    add(cues: readonly DamageCue[]): void { state.pending.push(...cues); },
    update(time: number): void {
      state.pending = state.pending.filter(cue => {
        if (cue.time > time) return true;
        if (time - cue.time >= NUMBER_SECONDS) return false;
        const key = JSON.stringify([cue.fighter, cue.segment]);
        let flash = state.flashes.get(key);
        if (!flash) {
          const mesh = CreatePlane("damage flash", { size: DIAMETER }, scene);
          mesh.material = material; mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
          mesh.isPickable = false;
          flash = { mesh, number: null, damage: 0, time: cue.time }; state.flashes.set(key, flash);
        }
        if (cue.time - flash.time >= NUMBER_SECONDS) flash.damage = 0;
        flash.damage += cue.damage;
        const numbered = flash.damage >= NUMBER_MINIMUM;
        flash.mesh.material = numbered ? material : sparkMaterial;
        if (numbered) {
          flash.number ??= damageNumber(scene);
          flash.number.show(flash.damage);
        }
        flash.number?.mesh.setEnabled(numbered);
        flash.time = cue.time;
        flash.mesh.position.set(cue.point[0], cue.point[1], cue.point[2]);
        return false;
      });
      const camera = scene.activeCamera, engine = scene.getEngine();
      const height = engine.getRenderingCanvas()?.clientHeight || engine.getRenderHeight();
      const pixelsAtUnitDepth = camera ? height * camera.viewport.height * camera.getProjectionMatrix().m[5]! / 2 : 0;
      for (const [key, { mesh, number, damage, time: began }] of state.flashes) {
        const elapsed = time - began, age = elapsed / NUMBER_SECONDS;
        if (age >= 1) { mesh.dispose(false, false); number?.dispose(); state.flashes.delete(key); continue; }
        const light = damage < NUMBER_MINIMUM, seconds = light ? SPARK_SECONDS : SECONDS;
        mesh.setEnabled(elapsed < seconds);
        mesh.visibility = Math.max(0, light ? SPARK_OPACITY * (1 - Math.max(0, elapsed - SPARK_HOLD) / (seconds - SPARK_HOLD)) : 1 - elapsed / seconds);
        if (camera) Vector3.TransformCoordinatesToRef(mesh.position, camera.getViewMatrix(), cameraPoint);
        const depth = camera?.mode === Camera.PERSPECTIVE_CAMERA ? Math.abs(cameraPoint.z) : 1;
        const minimum = pixelsAtUnitDepth > 0 ? MIN_DIAMETER_PIXELS * depth / (DIAMETER * pixelsAtUnitDepth) : 0;
        mesh.scaling.setAll((light ? SPARK_SCALE : 1) * Math.max(minimum, .7 + .3 * Math.min(1, elapsed / seconds)));
        if (number) {
          number.mesh.position.copyFrom(mesh.position); number.mesh.position.y += .18 + .3 * age;
          number.mesh.visibility = Math.min(1, (1 - age) / .35);
        }
      }
    },
    clear,
    dispose(): void { clear(); material.dispose(); texture.dispose(); sparkMaterial.dispose(); sparkTexture.dispose(); },
  };
}
