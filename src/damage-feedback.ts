import { Color3, Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
import "@babylonjs/core/Particles/particleSystemComponent.js";
import "@babylonjs/core/Rendering/outlineRenderer.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { CombatReportEvent } from "./combat.ts";
import type { Combatant } from "./units.ts";
import { DamageCues } from "./damage-cues.ts";

interface Flash {
  age: number;
  mesh: AbstractMesh;
  color: Color3;
  alpha: number;
  enabled: boolean;
}

/** Scene-owned cosmetics. No colliders, damage rules, or changes to shared materials. */
export class DamageFeedback {
  readonly cues = new DamageCues();
  private readonly scene: Scene;
  private readonly root: HTMLDivElement;
  private readonly labels: HTMLDivElement[];
  private readonly texture: DynamicTexture;
  private readonly bursts: { system: ParticleSystem; age: number }[] = [];
  private readonly flashes = new Map<AbstractMesh, Flash>();
  private paused = false;
  private disposed = false;
  private nextBurst = 0;

  constructor(scene: Scene) {
    this.scene = scene;
    this.root = document.createElement("div");
    this.root.setAttribute("aria-hidden", "true");
    this.root.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:20;overflow:hidden";
    document.body.append(this.root);
    this.labels = Array.from({ length: 8 }, () => {
      const label = document.createElement("div");
      label.style.cssText = "position:absolute;display:none;white-space:nowrap;padding:5px 9px;border-left:3px solid #ffce70;background:rgba(15,12,10,.88);color:#fff0cb;font:bold 15px system-ui;text-shadow:0 1px 3px #000;box-shadow:0 2px 12px #0008;will-change:transform";
      this.root.append(label);
      return label;
    });
    this.texture = new DynamicTexture("stone-impact", 32, scene, false);
    const context = this.texture.getContext();
    const gradient = context.createRadialGradient(16, 16, 2, 16, 16, 16);
    gradient.addColorStop(0, "white"); gradient.addColorStop(.35, "#fff9"); gradient.addColorStop(1, "#fff0");
    context.fillStyle = gradient; context.fillRect(0, 0, 32, 32);
    context.fillStyle = "white"; context.beginPath();
    context.moveTo(9, 6); context.lineTo(24, 11); context.lineTo(21, 24);
    context.lineTo(7, 21); context.closePath(); context.fill();
    this.texture.update();
    // Scene updates its camera transform during rendering; project afterwards,
    // including while paused, so labels never use the previous camera frame.
    scene.onAfterRenderObservable.add(() => this.project());
    scene.onDisposeObservable.addOnce(() => this.dispose());
  }

  report(event: CombatReportEvent, target: Combatant): void {
    if (this.disposed) return;
    const { report } = event;
    const hurt = report.damage > 0;
    if (!hurt && !event.blocked) return;
    this.cues.add({ key: `${report.by}:${report.key}`, name: report.limb,
      damage: report.damage, severed: report.severed, blocked: !hurt,
      point: report.point });
    this.burst(report.point, report.velocity, hurt, report.severed, report.damage);
    if (!hurt) return;
    const limb = target.limbs.find(part => part.key === report.key);
    if (!limb) return;
    for (const mesh of [limb.part.mesh, ...limb.part.mesh.getChildMeshes()]) {
      const old = this.flashes.get(mesh);
      if (old) { old.age = 0; continue; }
      this.flashes.set(mesh, { mesh, age: 0, color: mesh.overlayColor.clone(),
        alpha: mesh.overlayAlpha, enabled: mesh.renderOverlay });
      mesh.overlayColor = new Color3(1, .72, .28);
      mesh.overlayAlpha = .8;
      mesh.renderOverlay = true;
    }
  }

  private burst(point: Vector3, velocity: Vector3, hurt: boolean, severed: boolean, damage: number): void {
    let slot = this.bursts[this.nextBurst];
    if (!slot) {
      const system = new ParticleSystem(`stone-burst-${this.nextBurst}`, 48, this.scene);
      system.particleTexture = this.texture;
      system.minEmitBox = new Vector3(-.025, -.025, -.025);
      system.maxEmitBox = new Vector3(.025, .025, .025);
      system.gravity = new Vector3(0, -6, 0);
      system.emitRate = 0;
      system.minLifeTime = .12; system.maxLifeTime = .48;
      system.minAngularSpeed = -8; system.maxAngularSpeed = 8;
      slot = { system, age: 0 };
      this.bursts.push(slot);
    }
    this.nextBurst = (this.nextBurst + 1) % 12;
    const { system } = slot;
    system.reset(); slot.age = 0;
    system.emitter = point.clone();
    const along = velocity.lengthSquared() > 1e-8 ? velocity.normalizeToNew().scale(.7) : Vector3.Zero();
    system.direction1 = along.add(new Vector3(-3, .8, -3));
    system.direction2 = along.add(new Vector3(3, 3.5, 3));
    system.minEmitPower = .7; system.maxEmitPower = severed ? 2 : 1.2;
    system.minSize = hurt ? .035 : .015; system.maxSize = severed ? .17 : hurt ? .14 : .045;
    system.color1 = hurt ? new Color4(2, 1.5, .7, 1) : new Color4(.7, .85, 1, 1);
    system.color2 = hurt ? new Color4(.65, .55, .4, 1) : new Color4(1, 1, 1, 1);
    system.colorDead = new Color4(.35, .3, .25, 0);
    system.blendMode = hurt ? ParticleSystem.BLENDMODE_STANDARD : ParticleSystem.BLENDMODE_ADD;
    system.manualEmitCount = severed ? 48 : hurt ? Math.min(40, 18 + Math.round(damage)) : 10;
    system.updateSpeed = this.paused ? 0 : .01;
    system.start();
  }

  update(dt: number): void {
    if (this.paused || this.disposed) return;
    this.cues.update(dt);
    for (const slot of this.bursts) { slot.age += dt; if (slot.age > .6) slot.system.stop(); }
    for (const [mesh, flash] of this.flashes) {
      flash.age += dt;
      if (mesh.isDisposed() || flash.age >= .15) {
        this.restore(flash); this.flashes.delete(mesh);
      } else mesh.overlayAlpha = .8 * (1 - flash.age / .15);
    }
  }

  private project(): void {
    if (this.disposed) return;
    const engine = this.scene.getEngine(), camera = this.scene.activeCamera;
    const rect = engine.getRenderingCanvas()?.getBoundingClientRect();
    if (!rect || !camera) return;
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const placed: { x: number; y: number }[] = [];
    this.labels.forEach((label, i) => {
      const cue = this.cues.labels[i];
      label.style.display = "none";
      if (!cue) return;
      const p = Vector3.Project(new Vector3(cue.point.x, cue.point.y + .15 + cue.age * .35, cue.point.z),
        Matrix.IdentityReadOnly, this.scene.getTransformMatrix(), viewport);
      if (p.z < 0 || p.z > 1) return;
      const x = rect.left + p.x / engine.getRenderWidth() * rect.width;
      let y = rect.top + p.y / engine.getRenderHeight() * rect.height;
      for (const old of placed) if (Math.abs(x - old.x) < 170 && Math.abs(y - old.y) < 34) y = old.y - 36;
      placed.push({ x, y });
      label.textContent = cue.blocked ? "BLOCKED" : `${cue.damage.toFixed(1)} · ${cue.name.toUpperCase()}${cue.severed ? " · SEVERED" : ""}`;
      label.style.borderColor = cue.blocked ? "#b8dafa" : "#ffce70";
      label.style.opacity = String(Math.min(1, (.8 - cue.age) / .2));
      label.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
      label.style.display = "block";
    });
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    for (const slot of this.bursts) slot.system.updateSpeed = paused ? 0 : .01;
  }
  private restore(flash: Flash): void {
    if (flash.mesh.isDisposed()) return;
    flash.mesh.overlayColor = flash.color; flash.mesh.overlayAlpha = flash.alpha;
    flash.mesh.renderOverlay = flash.enabled;
  }
  clear(): void {
    this.cues.clear();
    for (const flash of this.flashes.values()) this.restore(flash);
    this.flashes.clear();
    for (const slot of this.bursts) { slot.system.stop(); slot.system.reset(); }
    for (const label of this.labels) label.style.display = "none";
  }
  dispose(): void {
    if (this.disposed) return;
    this.clear(); this.disposed = true;
    for (const slot of this.bursts) slot.system.dispose(false);
    this.texture.dispose(); this.root.remove();
  }
}
