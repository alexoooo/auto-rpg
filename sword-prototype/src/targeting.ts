import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Mesh } from "@babylonjs/core/Meshes/mesh.js";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial.js";
import { Color3 } from "@babylonjs/core/Maths/math.color.js";
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Scene } from "@babylonjs/core/scene.js";

// Side effects, both load-bearing. `renderOutline` is a module augmentation
// rather than a built-in property, and the mesh silently draws no outline at all
// if it never registers. `Ray` is worse: `scene.pick` throws "Ray needs to be
// imported before as it contains a side-effect required by your code" -- once
// per frame, from inside the render loop, where it is easy to miss.
import "@babylonjs/core/Rendering/outlineRenderer.js";
import "@babylonjs/core/Culling/ray.js";

import { CONFIG } from "./config";
import type { Dummy } from "./dummy";
import type { Hero } from "./hero";

export type TargetMode = "free" | "selecting" | "locked";

/**
 * Knowing what you are about to hit, and choosing what to face.
 *
 * Two separate jobs that share one ray. The first is feedback: sweep the cursor
 * over a body and the limb under it lights up, so the connection between where
 * the mouse is and what the sword will meet is never a guess. The second is
 * lock-on, which exists because absolute-cursor aiming and free turning fight
 * each other -- the mouse is spent entirely on the blade, so keeping an enemy in
 * front of you while you circle is otherwise a job for a hand you do not have.
 *
 * Lock is a two-step on purpose. `L` arms the choice, a click makes it, and
 * touching the turn keys drops it. A lock you cannot see yourself entering, or
 * cannot get out of by simply steering, is a trap rather than a convenience.
 */
export class Targeting {
  private readonly hoverRing: Mesh;
  private readonly lockRing: Mesh;
  private readonly lockPip: Mesh;

  private dummy: Dummy | null = null;
  private hovered: AbstractMesh | null = null;
  private outlined: AbstractMesh | null = null;
  private mode: TargetMode = "free";
  private pulse = 0;

  private readonly ground = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly hero: Hero,
  ) {
    const unlit = (name: string, colour: Color3): StandardMaterial => {
      const material = new StandardMaterial(name, scene);
      material.emissiveColor = colour;
      material.diffuseColor = Color3.Black();
      material.specularColor = Color3.Black();
      material.disableLighting = true;
      return material;
    };

    const T = CONFIG.targeting;
    const dim = unlit("target.hover", new Color3(0.82, 0.80, 0.72));
    const hot = unlit("target.lock", new Color3(0.94, 0.32, 0.24));

    this.hoverRing = MeshBuilder.CreateTorus(
      "target.hoverRing",
      { diameter: T.ringRadius * 2, thickness: 0.018, tessellation: 40 },
      scene,
    );
    this.hoverRing.material = dim;
    this.hoverRing.alphaIndex = 1;

    this.lockRing = MeshBuilder.CreateTorus(
      "target.lockRing",
      { diameter: T.ringRadius * 2.32, thickness: 0.026, tessellation: 44 },
      scene,
    );
    this.lockRing.material = hot;

    // A cone pointing down at whatever is locked, because a ring on the ground
    // disappears the moment anything stands between you and it.
    this.lockPip = MeshBuilder.CreateCylinder(
      "target.lockPip",
      { height: 0.17, diameterTop: 0.15, diameterBottom: 0, tessellation: 4 },
      scene,
    );
    this.lockPip.material = hot;

    for (const mesh of [this.hoverRing, this.lockRing, this.lockPip]) {
      mesh.isPickable = false;
      mesh.isVisible = false;
      mesh.receiveShadows = false;
    }
  }

  attach(dummy: Dummy): void {
    this.dummy = dummy;
    this.clearOutline();
    this.hovered = null;
    // A new dummy is not the one that was locked.
    if (this.mode === "locked") this.mode = "free";
    this.hero.lockTarget = null;
  }

  get status(): TargetMode {
    return this.mode;
  }

  /** True when the cursor is over something hittable. */
  get hasHover(): boolean {
    return this.hovered !== null;
  }

  /** `L`. Arms a choice, or drops the lock you already have. */
  toggle(): void {
    if (this.mode === "locked") {
      this.mode = "free";
      this.hero.lockTarget = null;
      return;
    }
    this.mode = this.mode === "selecting" ? "free" : "selecting";
  }

  /** A click. True means it was spent choosing a target, not starting a thrust. */
  primaryDown(): boolean {
    if (this.mode !== "selecting") return false;
    if (!this.hovered || !this.dummy) return false;
    this.mode = "locked";
    return true;
  }

  /** Touching the turn keys means you are steering, which outranks the lock. */
  releaseIfSteering(turn: number): void {
    if (turn !== 0 && this.mode === "locked") {
      this.mode = "free";
      this.hero.lockTarget = null;
    }
  }

  update(dt: number): void {
    this.pulse += dt;

    this.hovered = null;
    if (this.dummy) {
      const hit = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        (mesh) => mesh.isPickable && mesh.isVisible && mesh.name.startsWith("dummy."),
      );
      if (hit?.hit && hit.pickedMesh) this.hovered = hit.pickedMesh;
    }

    if (this.outlined !== this.hovered) {
      this.clearOutline();
      if (this.hovered) {
        this.hovered.renderOutline = true;
        this.hovered.outlineColor = this.mode === "selecting"
          ? new Color3(0.96, 0.42, 0.28)
          : new Color3(0.98, 0.92, 0.74);
        this.hovered.outlineWidth = CONFIG.targeting.outlineWidth;
        this.outlined = this.hovered;
      }
    }

    const centre = this.dummy ? this.dummy.centre() : null;
    if (centre) this.ground.set(centre.x, 0.025, centre.z);

    // The ring under the enemy: faint when the cursor is merely over it, and
    // always up while a target is being chosen so there is something to aim at.
    const showHover = Boolean(centre) && (this.hovered !== null || this.mode === "selecting");
    this.hoverRing.isVisible = showHover && this.mode !== "locked";
    if (this.hoverRing.isVisible) {
      this.hoverRing.position.copyFrom(this.ground);
      const breathe = this.mode === "selecting" ? 1 + Math.sin(this.pulse * 5) * 0.05 : 1;
      this.hoverRing.scaling.set(breathe, 1, breathe);
    }

    const locked = this.mode === "locked" && centre !== null;
    this.lockRing.isVisible = locked;
    this.lockPip.isVisible = locked;
    if (locked && centre) {
      this.lockRing.position.copyFrom(this.ground);
      this.lockRing.rotation.y = this.pulse * 0.7;
      this.lockPip.position.set(centre.x, centre.y + 0.72 + Math.sin(this.pulse * 3) * 0.03, centre.z);
      this.hero.lockTarget = centre;
    } else if (this.mode === "locked") {
      this.hero.lockTarget = null;
    }
  }

  private clearOutline(): void {
    if (this.outlined) this.outlined.renderOutline = false;
    this.outlined = null;
  }

  dispose(): void {
    this.clearOutline();
    this.hoverRing.dispose();
    this.lockRing.dispose();
    this.lockPip.dispose();
  }
}
