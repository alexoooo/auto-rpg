import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { DamageCue } from "../../worker/damage-cues.ts";

/** A tight contact burst, m across, held long enough to read a hit at real speed. */
const DIAMETER = .28, SECONDS = .18;

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
  const material = new StandardMaterial("damage flash", scene);
  material.disableLighting = true;
  material.emissiveTexture = texture; material.opacityTexture = texture;
  material.backFaceCulling = false; material.disableDepthWrite = true;
  // Skins may cover the physical contact point; the small marker stays readable over them.
  material.depthFunction = Constants.ALWAYS;
  // The transparent quad must leave character silhouette masks untouched.
  material.stencil.enabled = true; material.stencil.mask = 0;
  const state = { pending: [] as DamageCue[], flashes: new Map<string, { mesh: Mesh; time: number }>() };
  const clear = () => {
    state.pending.length = 0;
    for (const { mesh } of state.flashes.values()) mesh.dispose(false, false);
    state.flashes.clear();
  };
  return {
    add(cues: readonly DamageCue[]): void { state.pending.push(...cues); },
    update(time: number): void {
      state.pending = state.pending.filter(cue => {
        if (cue.time > time) return true;
        if (time - cue.time >= SECONDS) return false;
        const key = JSON.stringify([cue.fighter, cue.segment]);
        let flash = state.flashes.get(key);
        if (!flash) {
          const mesh = CreatePlane("damage flash", { size: DIAMETER }, scene);
          mesh.material = material; mesh.billboardMode = Mesh.BILLBOARDMODE_ALL;
          mesh.isPickable = false;
          flash = { mesh, time: cue.time }; state.flashes.set(key, flash);
        }
        flash.time = cue.time;
        flash.mesh.position.set(cue.point[0], cue.point[1], cue.point[2]);
        return false;
      });
      for (const [key, { mesh, time: began }] of state.flashes) {
        const age = (time - began) / SECONDS;
        if (age >= 1) { mesh.dispose(false, false); state.flashes.delete(key); continue; }
        mesh.visibility = 1 - age;
        mesh.scaling.setAll(.7 + .3 * age);
      }
    },
    clear,
    dispose(): void { clear(); material.dispose(); texture.dispose(); },
  };
}
