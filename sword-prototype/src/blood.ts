import { Color4 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture.js";
import { ParticleSystem } from "@babylonjs/core/Particles/particleSystem.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";
import type { Texture } from "@babylonjs/core/Materials/Textures/texture.js";

// Side effect, and the tenth of its family in this directory. Babylon's
// tree-shakeable build does not put the particle hooks on Scene until this
// registers them, and without it a `ParticleSystem` constructs cleanly, accepts
// every setting, takes `start()` without complaint, and emits nothing at all.
// The same failure shape as the physics, shadow, depth, post-process, outline,
// ray, edges and glTF imports: it works in the playground and not here.
import "@babylonjs/core/Particles/particleSystemComponent.js";

import { CONFIG } from "./config.ts";

/** An emitter and the two moments it has left: stop feeding, then collect. */
interface Wound {
  system: ParticleSystem;
  /** Seconds until `stop()`. Already stopped when this is at or below zero. */
  stopIn: number;
  /** Seconds until `dispose()`. Always the longer of the two. */
  killIn: number;
}

/**
 * Blood, which is a cosmetic and therefore knows nothing.
 *
 * It is driven entirely from the reports `Combat` already files -- the contact
 * point, the blade's velocity there, the damage, and whether the blow took the
 * limb off. Those were already being kept: `HitReport`'s own comment says the
 * world-space triple is held "because the log is the only record of a blow that
 * survives it". This is the second reader of that record, and it needed no
 * change to the first.
 *
 * That is worth more than it sounds. The house rule is that cosmetics never
 * carry authority, and the cheapest way to break it here would have been to hang
 * an emitter off `Fighter.sever` -- one line, and from then on the simulation
 * half imports a renderer, `fighter.ts` stops loading under Node, and the
 * headless bench and four test files go with it. So the whole of this sits on
 * the presentation side of the directory and reads a log.
 *
 * It adds no nodes to the scene at all. A burst emits from a bare world point
 * and a stump emits from the severed limb's own mesh, so there is nothing of
 * ours that can outlive the body it was hanging on, nothing for
 * `refreshShadowCasters` to sweep up, and nothing to make the mesh count in the
 * readout wander during a fight. Everything it does name is prefixed `blood.`,
 * alongside `aim.`, `target.`, `takeover.` and `rig.`.
 */
export class Blood {
  private readonly scene: Scene;
  private readonly texture: Texture;
  private readonly wounds: Wound[] = [];

  constructor(scene: Scene, texture: Texture = droplet(scene)) {
    this.scene = scene;
    this.texture = texture;
  }

  /**
   * A blow that drew blood.
   *
   * `weight` is the damage the blow scored, which is already speed multiplied by
   * edge alignment through the scoring rule -- so a clean cut at pace sprays and
   * a flat slap does not, without this having to know why. Below `minSpray`
   * nothing happens at all: a blade that merely touches somebody should not
   * paint the arena.
   */
  spray(point: Vector3, direction: Vector3, weight: number): void {
    const B = CONFIG.blood;
    if (weight < B.minSpray) return;

    const strength = Math.min(weight / B.fullSpray, 1);
    const system = this.make(Math.round(B.sprayCount * (0.35 + 0.65 * strength)));
    // A bare world point, and it must be a copy: `HitReport.point` is owned by
    // the report, but nothing here should depend on that staying true, and a
    // shared vector under a live emitter is the sort of thing that goes wrong
    // once, silently, in a fight nobody is recording.
    system.emitter = point.clone();

    // Out along the cut, mostly. The cone is wide because a wound does not aim.
    const along = direction.lengthSquared() > 1e-6 ? direction.normalizeToNew() : Vector3.Up();
    const speed = B.spraySpeed * (0.4 + 0.6 * strength);
    const spread = speed * 0.5;
    system.direction1 = along.scale(speed).add(new Vector3(-spread, spread * 0.4, -spread));
    system.direction2 = along.scale(speed).add(new Vector3(spread, spread * 1.8, spread));

    system.minSize = B.dropSize * 0.4;
    system.maxSize = B.dropSize * (0.7 + 0.9 * strength);
    system.minLifeTime = B.sprayLife * 0.4;
    system.maxLifeTime = B.sprayLife;
    // One burst, not a rate. `manualEmitCount` empties the whole capacity on the
    // next frame and then the system idles until it is collected.
    system.manualEmitCount = system.getCapacity();

    system.start();
    this.wounds.push({ system, stopIn: 0, killIn: B.sprayLife + 0.25 });
  }

  /**
   * A limb that has just come off, and goes on bleeding as it falls.
   *
   * The severed part's own mesh *is* the emitter, so the wound travels with the
   * limb -- the same arrangement the costume already relies on, where every piece
   * is a Babylon child of the bone it covers and boots and helms fall with the
   * limbs they were on rather than being collected separately. No node of our
   * own is created, which means nothing of ours can outlive the body it was
   * hanging on.
   */
  stump(part: AbstractMesh, at: Vector3): void {
    const B = CONFIG.blood;

    const system = this.make(B.stumpCount);
    system.emitter = part;

    // Where on the limb the cut was. The default emitter is a box, and its two
    // corners are taken through the emitter's world matrix -- so a single point
    // in the part's local frame puts the wound at the cut rather than at the
    // middle of the capsule.
    //
    // `at` is a world point and `part` is a scene-root mesh, so the local offset
    // is the difference of the two positions. Read `position`, never
    // `absolutePosition`: the second is a `computeWorldMatrix()` in disguise and
    // stamps the scene's render id, which is a trap this directory has already
    // paid a session for.
    const offset = at.subtract(part.position);
    system.minEmitBox = offset;
    system.maxEmitBox = offset.clone();

    system.emitRate = B.stumpRate;
    system.direction1 = new Vector3(-0.35, -0.1, -0.35);
    system.direction2 = new Vector3(0.35, 0.5, 0.35);
    system.minSize = B.dropSize * 0.3;
    system.maxSize = B.dropSize * 0.8;
    system.minLifeTime = B.stumpLife * 0.5;
    system.maxLifeTime = B.stumpLife;

    system.start();
    this.wounds.push({
      system,
      stopIn: B.stumpSeconds,
      killIn: B.stumpSeconds + B.stumpLife + 0.25,
    });
  }

  /**
   * Stop what is finished feeding, collect what is finished drawing.
   *
   * Two moments rather than one, and the gap between them is a full particle
   * lifetime: a stopped system goes on drawing what is already in the air, and
   * disposing at the stop makes a severed arm's trail vanish in mid-fall.
   */
  update(dt: number): void {
    for (let i = this.wounds.length - 1; i >= 0; i -= 1) {
      const wound = this.wounds[i];
      if (wound.stopIn > 0) {
        wound.stopIn -= dt;
        if (wound.stopIn <= 0) wound.system.stop();
      }
      wound.killIn -= dt;
      if (wound.killIn > 0) continue;
      this.collect(wound);
      this.wounds.splice(i, 1);
    }
  }

  /**
   * Take every emitter out of the world at once.
   *
   * Called on a rebuild, and it must run *before* the fighters are disposed: a
   * stump's emitter is a limb, and a system left pointing at a disposed mesh goes
   * on being updated every frame against a transform nobody owns any more.
   */
  clear(): void {
    for (const wound of this.wounds) this.collect(wound);
    this.wounds.length = 0;
  }

  dispose(): void {
    this.clear();
    this.texture.dispose();
  }

  /** How many emitters are alive. For `__sword` and for a leak test. */
  get count(): number {
    return this.wounds.length;
  }

  /** One emitter, with everything the two callers agree about already set. */
  private make(capacity: number): ParticleSystem {
    const B = CONFIG.blood;
    const system = new ParticleSystem("blood.particles", capacity, this.scene);
    system.particleTexture = this.texture;
    system.color1 = new Color4(B.red[0], B.red[1], B.red[2], 1);
    system.color2 = new Color4(B.dark[0], B.dark[1], B.dark[2], 1);
    // Where a particle ends up. Alpha zero here is what makes a droplet fade
    // instead of blinking out at the end of its life.
    system.colorDead = new Color4(B.dark[0], B.dark[1], B.dark[2], 0);
    system.gravity = new Vector3(0, CONFIG.world.gravity, 0);
    system.minEmitPower = 1;
    system.maxEmitPower = 1;
    system.emitRate = 0;
    system.blendMode = ParticleSystem.BLENDMODE_STANDARD;
    return system;
  }

  private collect(wound: Wound): void {
    // The system only, never its emitter: for a stump that is the severed limb
    // itself, which belongs to the fighter and outlives the bleeding.
    wound.system.dispose();
  }
}

/**
 * The one texture, drawn rather than fetched.
 *
 * A particle system with no texture draws nothing, and the alternative to this
 * is a PNG in `public/assets` -- which means a fetch script, a digest pin, a
 * licence line and one more thing that can be missing on a fresh clone, all for
 * a white dot with soft edges. Sixteen pixels square is plenty: it is never seen
 * more than a few centimetres across and the sampler blurs it anyway.
 */
function droplet(scene: Scene): Texture {
  const size = 16;
  const texture = new DynamicTexture("blood.droplet", { width: size, height: size }, scene, false);
  const context = texture.getContext() as unknown as CanvasRenderingContext2D;
  const half = size / 2;
  const gradient = context.createRadialGradient(half, half, 0, half, half, half);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.85)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  texture.update();
  texture.hasAlpha = true;
  return texture;
}
