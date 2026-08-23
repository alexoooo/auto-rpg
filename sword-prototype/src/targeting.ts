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
import type { Fighter } from "./fighter";

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
 *
 * It is written as "one fighter looking at another" rather than as "the player
 * looking at the enemy", so the pair it is given can be swapped when session 07
 * hands the player the other body. What it picks against is the opponent's own
 * costume, asked for by identity rather than matched by a name prefix: the
 * physics capsules are invisible now and an outline on an invisible mesh draws
 * nothing at all.
 */
export class Targeting {
  private readonly scene: Scene;
  private readonly hoverRing: Mesh;
  private readonly lockRing: Mesh;
  private readonly lockPip: Mesh;

  /** The fighter doing the looking, whose facing a lock steers. */
  private watcher: Fighter;
  private opponent: Fighter | null = null;
  private hovered: AbstractMesh | null = null;
  private outlined: AbstractMesh | null = null;
  private mode: TargetMode = "free";
  private pulse = 0;

  private readonly ground = new Vector3();

  constructor(scene: Scene, watcher: Fighter) {
    this.scene = scene;
    this.watcher = watcher;

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

  /** Point one fighter at another. A reset rebuilds both, so both are given. */
  attach(watcher: Fighter, opponent: Fighter): void {
    this.watcher = watcher;
    this.opponent = opponent;
    this.clearOutline();
    this.hovered = null;
    // A new fighter is not the one that was locked.
    if (this.mode === "locked") this.mode = "free";
    this.watcher.lockTarget = null;
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
      this.watcher.lockTarget = null;
      return;
    }
    this.mode = this.mode === "selecting" ? "free" : "selecting";
  }

  /** A click. True means it was spent choosing a target, not starting a thrust. */
  primaryDown(): boolean {
    if (this.mode !== "selecting") return false;
    if (!this.hovered || !this.opponent) return false;
    this.mode = "locked";
    return true;
  }

  /** Touching the turn keys means you are steering, which outranks the lock. */
  releaseIfSteering(turn: number): void {
    if (turn !== 0 && this.mode === "locked") {
      this.mode = "free";
      this.watcher.lockTarget = null;
    }
  }

  /**
   * @param hovering false while another mode owns the cursor.
   *
   * `Takeover` below picks with the same ray under a wider predicate and draws
   * the same kind of outline, so with both live the two take turns writing
   * `renderOutline` on one mesh -- and the moment the takeover disarms and
   * clears it, this one still believes the mesh is outlined and will not put it
   * back until the cursor moves to a different limb. One outline owner at a
   * time is the fix, and it belongs at the one call site rather than in a rule
   * about who wins. The lock is untouched: its ring, its pip and the fighter's
   * `lockTarget` all go on being maintained, because a lock that dropped itself
   * every time you thought about changing bodies would be a trap.
   */
  update(dt: number, hovering = true): void {
    this.pulse += dt;

    this.hovered = null;
    const opponent = hovering ? this.opponent : null;
    if (opponent) {
      // `owns` rather than a name prefix. A prefix test would also match the
      // opponent's blade, which is not a target, and would go quietly wrong the
      // first time anything else in the scene was named after a side.
      const hit = this.scene.pick(
        this.scene.pointerX,
        this.scene.pointerY,
        (mesh) => mesh.isPickable && mesh.isVisible && opponent.owns(mesh),
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

    const centre = this.opponent ? this.opponent.centre() : null;
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
      this.watcher.lockTarget = centre;
    } else if (this.mode === "locked") {
      this.watcher.lockTarget = null;
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

/**
 * Stepping into a body.
 *
 * The same two-step as the lock above, with the predicate widened from one
 * opponent to both fighters: `C` arms it, a click on a body takes it, a click on
 * nothing or `C` again drops it. Reusing the gesture is the point -- there is one
 * way to point at something in this prototype and it is worth it staying one --
 * and reusing the machinery is what makes the session small.
 *
 * **Both fighters are candidates, including the one already being driven**, and
 * that is deliberate rather than lazy. A mode that highlighted only the body you
 * could move to would be a mode you had to already understand to read; two rings
 * and an outline that follows the cursor over either of them says what the mode
 * is by showing you its whole choice. Taking the body you are already in is
 * accepted for the same reason, and costs nothing: the handover seeds from the
 * pose it finds, and the pose it finds is the one you are commanding.
 *
 * A separate object rather than a fourth `TargetMode`, because a lock and a
 * takeover are not alternatives -- you can be locked on and want to change
 * bodies, and folding them into one enum would have made that a state nobody had
 * thought about. What they do share is the cursor, and `Targeting.update`'s
 * `hovering` argument is how that is arbitrated: exactly one of them owns the
 * outline at a time.
 *
 * This object decides nothing about *what* taking a body means. It answers "which
 * body did that click land on", and `main.ts` does the rest -- which is the same
 * split `Targeting` keeps, where the ring is here and the turning is in
 * `Fighter`.
 */
export class Takeover {
  private readonly scene: Scene;
  /** One per candidate, and there are exactly two of those. */
  private readonly rings: readonly Mesh[];

  private left: Fighter | null = null;
  private right: Fighter | null = null;
  private hovered: AbstractMesh | null = null;
  private outlined: AbstractMesh | null = null;
  private under: Fighter | null = null;
  private armed = false;
  private pulse = 0;

  private readonly ground = new Vector3();

  constructor(scene: Scene) {
    this.scene = scene;

    const material = new StandardMaterial("takeover.ring", scene);
    // Cool, where the lock is hot. The two modes can be armed at once, so they
    // must not be told apart by shape alone.
    material.emissiveColor = new Color3(0.42, 0.78, 0.98);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    material.disableLighting = true;

    const T = CONFIG.targeting;
    const diameter = T.ringRadius * 2 * CONFIG.takeover.ringScale;
    this.rings = [0, 1].map((index) => {
      const ring = MeshBuilder.CreateTorus(
        `takeover.ring${index}`,
        { diameter, thickness: 0.022, tessellation: 44 },
        scene,
      );
      ring.material = material;
      ring.isPickable = false;
      ring.isVisible = false;
      ring.receiveShadows = false;
      return ring;
    });
  }

  /** The pair on offer. A reset rebuilds both, so both are given. */
  attach(left: Fighter, right: Fighter): void {
    this.left = left;
    this.right = right;
    // A mode left armed across a rebuild would be armed over bodies that no
    // longer exist, and the first click would pick a disposed mesh. `cancel`
    // also drops the outline and the hover, which are on those same meshes.
    this.cancel();
  }

  get isArmed(): boolean {
    return this.armed;
  }

  /** The body under the cursor right now, or null. */
  get candidate(): Fighter | null {
    return this.under;
  }

  /** `C`. */
  toggle(): void {
    if (this.armed) this.cancel();
    else this.armed = true;
  }

  cancel(): void {
    this.armed = false;
    this.clearOutline();
    this.hovered = null;
    this.under = null;
    for (const ring of this.rings) ring.isVisible = false;
  }

  /**
   * A click while the mode is armed: the body it landed on, or null if it
   * landed on nothing.
   *
   * Either way the mode drops and the click is spent -- the caller swallows it
   * on `isArmed` rather than on the answer -- because a click that both missed a
   * fighter and started a thrust would be a swing you did not ask for, delivered
   * at the exact moment you were thinking about something else.
   */
  pick(): Fighter | null {
    if (!this.armed) return null;
    const taken = this.under;
    this.cancel();
    return taken;
  }

  update(dt: number): void {
    this.pulse += dt;
    if (!this.armed || !this.left || !this.right) return;

    const left = this.left;
    const right = this.right;

    // `owns` on either side rather than a name prefix, for the reason
    // `Targeting` gives: both swords are named after their side and a sword is
    // not a body, and a prefix test goes quietly wrong the first time anything
    // else in the scene is named after one.
    const hit = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh.isPickable && mesh.isVisible && (left.owns(mesh) || right.owns(mesh)),
    );
    this.hovered = hit?.hit && hit.pickedMesh ? hit.pickedMesh : null;
    this.under = this.hovered
      ? left.owns(this.hovered)
        ? left
        : right
      : null;

    if (this.outlined !== this.hovered) {
      this.clearOutline();
      if (this.hovered) {
        this.hovered.renderOutline = true;
        this.hovered.outlineColor = new Color3(0.52, 0.86, 1.0);
        this.hovered.outlineWidth = CONFIG.targeting.outlineWidth;
        this.outlined = this.hovered;
      }
    }

    // Both rings breathe together, so the pair reads as one offer rather than as
    // two things happening to be lit.
    const breathe = 1 + Math.sin(this.pulse * 5) * 0.05;
    const fighters = [left, right];
    for (let index = 0; index < this.rings.length; index += 1) {
      const ring = this.rings[index];
      const centre = fighters[index].centre();
      this.ground.set(centre.x, 0.03, centre.z);
      ring.position.copyFrom(this.ground);
      ring.scaling.set(breathe, 1, breathe);
      ring.isVisible = true;
    }
  }

  private clearOutline(): void {
    if (this.outlined) this.outlined.renderOutline = false;
    this.outlined = null;
  }

  dispose(): void {
    this.clearOutline();
    for (const ring of this.rings) ring.dispose();
  }
}
