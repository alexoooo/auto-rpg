import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";

import type { CombatRefusalEvent, Striking } from "../../combat.ts";
import type { HandName } from "../../mind.ts";
import type { Striker } from "../../scoring.ts";
import type { Part } from "../../rig.ts";

/**
 * A rigid body offered to `Combat` as something that hits.
 *
 * One implementation for every golem terminal, because the four geometric questions a
 * `Striking` answers -- where the tip is, which way the edge faces, which way the length runs,
 * how fast a point on it is moving -- have exactly one right answer for a rigid body, and what
 * differs between a blade, a cap and Session 04's plate and mace is the *bite kind* and the
 * *tip offset*, not the arithmetic. The Warrior grew two hand-written copies of the same four
 * answers (`FistStrike` and `Weapon`) and they have drifted apart once already.
 *
 * **The frame convention is the Warrior sword's**, unchanged: local **+Y runs base to point**
 * and local **+X is the edge**. `src/scoring.ts` is written against that frame, so a golem's
 * cut is scored by the same `edgeAlignment` arithmetic without a second convention anywhere.
 *
 * **Every reader goes through `mesh.position` and `mesh.rotationQuaternion` and nothing else.**
 * Not `getWorldMatrix()`, not `absolutePosition`, not `absoluteRotationQuaternion`: the world
 * matrix short-circuits on the render id and *reading* it stamps that id, silently converting
 * every later reader in the frame -- including a person measuring from the console -- into a
 * reader of this sample. Every golem body is a scene-root node and Havok's `syncTransform`
 * writes those two fields at the end of every solver step, so those two fields *are* the world
 * transform. `AGENTS.md` records the nine per cent phantom regression that came of getting
 * this wrong, and `tests/view.test.mjs` pins the Warrior's half of the same rule.
 */
export class RigidStrike implements Striking {
  readonly kind: Striker;
  readonly effectorId: string;
  readonly hand: HandName | null;
  readonly body: Part["body"];
  readonly impactMassKg: number | undefined;
  private readonly gate: {
    readonly refusal: (body: PhysicsBody) => CombatRefusalEvent["reason"] | null;
    readonly claim: (body: PhysicsBody) => boolean;
  } | null;

  private readonly part: Part;
  /** How far the business end is from the body's own centre, along local +Y. */
  private readonly tipAlong: number;
  private severed = false;
  private readonly scratch = {
    rel: new Vector3(),
    velocity: new Vector3(),
    tip: new Vector3(),
    edge: new Vector3(),
    blade: new Vector3(),
    basis: new Matrix(),
  };

  constructor(part: Part, options: {
    readonly kind: Striker;
    readonly effectorId: string;
    readonly hand: HandName | null;
    readonly tipAlong: number;
    /**
     * What arrives behind the contact, kilograms, for a kind scored on an `impulse` row.
     *
     * The terminal's number and not the body's: a body handle knows its own mass and nothing
     * about what is welded, hinged or leaning behind it, and a striker that guessed would score
     * a ram plate as 21 kg of bronze with nothing pushing it. Omitted, the row scores at its own
     * reference mass, which is the Warrior's fist and the first day's ram.
     */
    readonly impactMassKg?: number;
    /**
     * Which contacts are blows, for a striker that is only sometimes striking.
     *
     * A blade on an arm is a weapon every moment it is in a hand, and every contact above its
     * floor is a cut or a slap; the four geometric answers are all it needs. A ram plate is a
     * body part that is a weapon for the length of a lunge and a brow the rest of the time, and
     * without this it scored the other fighter's blade for hitting it, and scored a guard it
     * was leaning on once every `hitCooldown` for as long as the carrier pushed. `refusal` says
     * whether the striker is armed at all, in `Combat`'s own vocabulary; `claim` is asked once
     * per admitted contact and is where "one blow per lunge per body" lives. Both are the
     * owning module's, because only it knows when its stroke is in flight.
     */
    readonly gate?: {
      readonly refusal: (body: PhysicsBody) => CombatRefusalEvent["reason"] | null;
      readonly claim: (body: PhysicsBody) => boolean;
    };
  }) {
    this.part = part;
    this.kind = options.kind;
    this.effectorId = options.effectorId;
    this.hand = options.hand;
    this.impactMassKg = options.impactMassKg;
    this.gate = options.gate ?? null;
    this.tipAlong = options.tipAlong;
    this.body = part.body;
    // Havok emits no per-body contacts until this is enabled. `Combat` scores from them and
    // the bench's contact census -- which owns both tip-speed exclusion windows -- counts them.
    this.body.setCollisionCallbackEnabled(true);
  }

  get spent(): boolean {
    return this.severed;
  }

  refusalForContact(body: PhysicsBody): CombatRefusalEvent["reason"] | null {
    return this.gate ? this.gate.refusal(body) : null;
  }

  claimContact(body: PhysicsBody): boolean {
    return this.gate ? this.gate.claim(body) : true;
  }

  /** A severed terminal is debris: it stops scoring, exactly as a dropped weapon does. */
  sever(): void {
    this.severed = true;
  }

  velocityAt(world: Vector3): Vector3 {
    const linear = this.body.getLinearVelocity();
    const angular = this.body.getAngularVelocity();
    this.scratch.rel.copyFrom(world).subtractInPlace(this.body.getObjectCenterWorld());
    Vector3.CrossToRef(angular, this.scratch.rel, this.scratch.velocity);
    return this.scratch.velocity.addInPlace(linear);
  }

  edgeDirection(): Vector3 {
    this.basis();
    return this.scratch.edge.set(
      this.scratch.basis.m[0], this.scratch.basis.m[1], this.scratch.basis.m[2],
    );
  }

  bladeDirection(): Vector3 {
    this.basis();
    return this.scratch.blade.set(
      this.scratch.basis.m[4], this.scratch.basis.m[5], this.scratch.basis.m[6],
    );
  }

  tipPosition(): Vector3 {
    return this.scratch.tip
      .copyFrom(this.bladeDirection())
      .scaleInPlace(this.tipAlong)
      .addInPlace(this.part.mesh.position);
  }

  private basis(): void {
    Matrix.FromQuaternionToRef(
      this.part.mesh.rotationQuaternion ?? Quaternion.Identity(), this.scratch.basis,
    );
  }
}
