import { Constants } from "@babylonjs/core/Engines/constants.js";
import { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { CreatePlane } from "@babylonjs/core/Meshes/Builders/planeBuilder.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { DamageCue } from "../../worker/damage-cues.ts";

/** A tight contact burst, m across, held long enough to read a hit at real speed. */
const DIAMETER = .28, SECONDS = .18;

/** A number lingers above the contact long enough to read, s. */
const NUMBER_SECONDS = .7;

/** A transparent contact marker that leaves depth and character silhouette masks untouched. */
function markerMaterial(name: string, texture: DynamicTexture, scene: Scene): StandardMaterial {
  const material = new StandardMaterial(name, scene);
  material.disableLighting = true;
  material.emissiveTexture = texture; material.opacityTexture = texture;
  material.backFaceCulling = false; material.disableDepthWrite = true;
  // Skins may cover the physical contact point; the small marker stays readable over them.
  material.depthFunction = Constants.ALWAYS;
  material.stencil.enabled = true; material.stencil.mask = 0;
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
      const text = damage < .1 ? "<0.1" : String(Number(damage.toFixed(1)));
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
  const state = { pending: [] as DamageCue[], flashes: new Map<string, {
    mesh: Mesh; number: ReturnType<typeof damageNumber>; damage: number; time: number;
  }>() };
  const clear = () => {
    state.pending.length = 0;
    for (const { mesh, number } of state.flashes.values()) { mesh.dispose(false, false); number.dispose(); }
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
          flash = { mesh, number: damageNumber(scene), damage: 0, time: cue.time }; state.flashes.set(key, flash);
        }
        if (cue.time - flash.time >= NUMBER_SECONDS) flash.damage = 0;
        flash.damage += cue.damage;
        flash.number.show(flash.damage);
        flash.time = cue.time;
        flash.mesh.position.set(cue.point[0], cue.point[1], cue.point[2]);
        return false;
      });
      for (const [key, { mesh, number, time: began }] of state.flashes) {
        const elapsed = time - began, age = elapsed / NUMBER_SECONDS;
        if (age >= 1) { mesh.dispose(false, false); number.dispose(); state.flashes.delete(key); continue; }
        mesh.setEnabled(elapsed < SECONDS);
        mesh.visibility = Math.max(0, 1 - elapsed / SECONDS);
        mesh.scaling.setAll(.7 + .3 * Math.min(1, elapsed / SECONDS));
        number.mesh.position.copyFrom(mesh.position); number.mesh.position.y += .18 + .3 * age;
        number.mesh.visibility = Math.min(1, (1 - age) / .35);
      }
    },
    clear,
    dispose(): void { clear(); material.dispose(); texture.dispose(); },
  };
}
