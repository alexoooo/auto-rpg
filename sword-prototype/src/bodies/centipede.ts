import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";

import type { Striking } from "../combat.ts";
import type { Limb } from "../fighter.ts";
import type { HandName, HandView, BodyView, FighterView, Intent, Mind, NaturalAttackView, ProjectileView } from "../mind.ts";
import { LAYER, COLLIDES, layersFor, type Side } from "../physics.ts";
import { capsulePart, joint, type Part } from "../rig.ts";
import type { WeaponKind } from "../hands.ts";
import type { Combatant, CombatantBuild } from "../units.ts";
import { HumanoidControlEndpoint } from "../humanoid-control.ts";

export const CENTIPEDE_SEGMENTS = 8;
export const CENTIPEDE_LENGTH = 2.1;
export const CENTIPEDE_CROWN = 0.38;
export const CENTIPEDE_RADIUS = 0.17;
export const CENTIPEDE_BITE_REACH = 0.42;

type BitePhase = "ready" | "chamber" | "lunge" | "recover";
const NO_HANDS = Object.freeze({}) as Record<HandName, HandView>;
const blankHand = (outboard: number): HandView => ({
  weapon: "empty", shoulder: new Vector3(), tip: new Vector3(), tipSpeed: 0,
  tipVelocity: new Vector3(), reach: 0, lost: false, outboard,
});
const HUMANOID_HANDS = (): Record<HandName, HandView> => ({
  primary: blankHand(1), secondary: blankHand(-1),
});

class BiteStrike implements Striking {
  readonly kind = "bite" as const;
  readonly effectorId = "natural-bite";
  // Combat reports identify a hand. This source label is not published as a
  // HandView and does not fabricate an arm on the creature.
  //
  // It is the **last** place the alias survives, and it survives on purpose:
  // session 17 Stage B moved the command side onto `Intent.natural`, so nothing
  // *drives* jaws through a hand slot any more, but `Striking.hand` feeds
  // `CombatReportEvent.hand` and from there `BehaviourRecord.contacts`, which is
  // keyed by `HandName` and is Stage C's to widen. Widening it here would leave
  // a record with a key nothing counts.
  readonly hand = "primary" as const;
  readonly body: PhysicsBody;
  private readonly head: Part;
  private readonly active: () => boolean;
  private readonly forward: () => Vector3;
  private readonly velocity = new Vector3();
  private readonly direction = new Vector3();

  constructor(head: Part, active: () => boolean, forward: () => Vector3) {
    this.head = head;
    this.body = head.body;
    this.active = active;
    this.forward = forward;
    this.body.setCollisionCallbackEnabled(true);
  }

  get spent(): boolean { return !this.active(); }
  velocityAt(): Vector3 { return this.velocity.copyFrom(this.body.getLinearVelocity()); }
  edgeDirection(): Vector3 { return this.direction.set(1, 0, 0); }
  bladeDirection(): Vector3 {
    return this.direction.copyFrom(this.forward());
  }
  tipPosition(): Vector3 {
    return this.bladeDirection().scaleInPlace(CENTIPEDE_RADIUS).addInPlace(this.head.mesh.position);
  }
}

const blankBody = (hands: Record<HandName, HandView> = NO_HANDS): BodyView => ({
  unit: "centipede",
  reach: CENTIPEDE_BITE_REACH,
  crownHeight: CENTIPEDE_CROWN,
  vitalHeight: CENTIPEDE_CROWN * 0.55,
  collisionRadius: CENTIPEDE_RADIUS,
  naturalAttacks: Object.freeze({ bite: { reach: CENTIPEDE_BITE_REACH, ready: true, active: false } }),
  ground: new Vector3(), facing: 0, shoulder: new Vector3(), tip: new Vector3(), tipSpeed: 0,
  hands, crouch: 0, trunkLean: 0, trunkTwist: 0, vitality: 1, health: {},
});

/** A low, authoritative nine-part chain. It owns no hands and accepts no gear. */
export class Centipede implements Combatant {
  readonly articulated = null;
  readonly control: HumanoidControlEndpoint;
  readonly kind = "centipede";
  readonly side: Side;
  get mind(): Mind { return this.control.mind; }
  set mind(value: Mind) { this.control.installMind(value); }
  get intentObserver(): ((view: FighterView, intent: Intent) => void) | null { return this.control.observer; }
  set intentObserver(value: ((view: FighterView, intent: Intent) => void) | null) { this.control.observer = value; }
  readonly limbs: Limb[] = [];
  readonly costume: AbstractMesh[] = [];
  readonly view: FighterView = {
    self: blankBody(), opponent: blankBody(HUMANOID_HANDS()), projectiles: [],
    measure: Number.POSITIVE_INFINITY, clock: 0,
  };
  readonly strikers: Striking[];
  lockTarget: Vector3 | null = null;

  private readonly parts: Part[] = [];
  private readonly constraints: Physics6DoFConstraint[] = [];
  private readonly occlusion: Vector3[] = [];
  private readonly byBody = new Map<PhysicsBody, Limb>();
  private readonly owned = new Set<AbstractMesh>();
  private readonly facingVector = new Vector3();
  private readonly middle = new Vector3();
  /**
   * The published bite, rewritten in place rather than rebuilt.
   *
   * `describe` used to hand back a fresh `{ bite: { ... } }` -- two objects --
   * on every call, and it is called twice per control step per bout, once into
   * this creature's own view and once into whatever is fighting it. That is
   * garbage at 240 Hz from a body that publishes no projectiles at all, and it
   * is exactly the sort of thing that makes a steady-state allocation assertion
   * land red for a reason the session that wrote the assertion did not cause.
   */
  private readonly bite = { reach: CENTIPEDE_BITE_REACH, ready: true, active: false };
  private readonly natural: Record<string, NaturalAttackView> = { bite: this.bite };
  /** Held so `update` can command an angular velocity without allocating one. */
  private readonly spin = new Vector3();
  /**
   * And a second one for `describe`, kept apart from every scratch `update`
   * touches for the reason `Fighter`'s `viewBasis` is kept apart from the rest
   * of its block: a reading taken for a view must never be able to overwrite a
   * frame something else is mid-way through commanding.
   */
  private readonly reading = new Vector3();
  private phase: BitePhase = "ready";
  private phaseClock = 0;
  private dead = false;
  private fighting = true;
  private heading: number;

  constructor(ctx: CombatantBuild) {
    this.side = ctx.side;
    const initialMind = ctx.mind ?? crawlerMind();
    this.heading = ctx.facing;
    const layers = layersFor(ctx.side);
    const segmentLength = CENTIPEDE_LENGTH / (CENTIPEDE_SEGMENTS + 1);
    const yaw = Quaternion.RotationAxis(Vector3.Up(), ctx.facing);
    const horizontal = Quaternion.RotationAxis(Vector3.Right(), Math.PI / 2).multiply(yaw);
    const local = new Vector3();
    const world = new Vector3();
    const turn = Matrix.Identity();
    Matrix.FromQuaternionToRef(yaw, turn);

    for (let index = 0; index <= CENTIPEDE_SEGMENTS; index += 1) {
      local.set(0, CENTIPEDE_CROWN / 2, -index * segmentLength);
      Vector3.TransformCoordinatesToRef(local, turn, world);
      world.addInPlace(ctx.origin);
      const part = capsulePart(ctx.scene, {
        name: `${ctx.side}.centipede.${index === 0 ? "head" : `segment${index}`}`,
        position: world.clone(), rotation: horizontal, height: segmentLength * 1.08,
        radius: index === 0 ? CENTIPEDE_RADIUS : CENTIPEDE_RADIUS * 0.88,
        mass: index === 0 ? 7 : 5, layer: layers.trunk, collidesWith: layers.trunkCollides,
        material: ctx.materials.hide, visible: false,
        motionType: index === 0 ? PhysicsMotionType.ANIMATED : PhysicsMotionType.DYNAMIC,
      });
      this.parts.push(part);
      this.occlusion.push(part.mesh.position);
      const art = MeshBuilder.CreateCapsule(`${part.name}.costume`, {
        height: segmentLength * 1.08,
        radius: index === 0 ? CENTIPEDE_RADIUS : CENTIPEDE_RADIUS * 0.88,
        tessellation: 12,
      }, ctx.scene);
      art.parent = part.mesh;
      art.material = index === 0 ? ctx.materials.brass : ctx.materials.leather;
      art.isPickable = true;
      this.costume.push(art);
      this.owned.add(art);

      const health = index === 0 ? 90 : 48;
      const limb: Limb = {
        key: index === 0 ? "head" : `segment${index}`,
        label: index === 0 ? "Head" : `Segment ${index}`,
        part, attachment: null, health, maxHealth: health, severed: false, lastHitAt: -999,
        vitalityWeight: index === 0 ? 0 : 0.125,
        fatal: index === 0,
      };
      this.limbs.push(limb);
      this.byBody.set(part.body, limb);
      if (index > 0) {
        const attachment = joint(ctx.scene, this.parts[index - 1], part, {
          pivotParent: new Vector3(0, -segmentLength / 2, 0),
          pivotChild: new Vector3(0, segmentLength / 2, 0),
          swing: {
            x: { min: -0.30, max: 0.30 },
            y: { min: -0.55, max: 0.55 },
          },
        });
        this.constraints.push(attachment);
        (limb as { attachment: Physics6DoFConstraint }).attachment = attachment;
      }
    }
    const bite = new BiteStrike(
      this.parts[0],
      () => this.fighting && !this.dead && this.phase === "lunge",
      () => this.facingVector.set(Math.sin(this.heading), 0, Math.cos(this.heading)),
    );
    this.strikers = [bite];
    this.control = new HumanoidControlEndpoint({
      initialMind,
      view: this.view,
      canStep: () => !this.dead && this.fighting,
      apply: (dt, intent) => this.applyIntent(dt, intent),
      stopBody: () => this.stopBody(),
      policies: [{ name: "crawler", label: "Crawler" }],
      human: ctx.human,
    });
  }

  // Damage is applied outside update(), so fatal head damage must be visible on
  // the same combat-resolution edge rather than one simulation tick later.
  get alive(): boolean { return !this.dead && this.vitality > 0; }
  get vitality(): number {
    if (this.limbs[0].health <= 0) return 0;
    const body = this.limbs.slice(1);
    return body.reduce((sum, limb) => sum + Math.max(0, limb.health / limb.maxHealth) * 0.125, 0);
  }

  observe(opponent: Combatant, clock: number): void {
    this.describe(this.view.self);
    opponent.describe(this.view.opponent);
    this.view.measure = opponent.nearestPartTo(this.parts[0].mesh.position);
    this.view.clock = clock;
    // Nothing of this creature's is ever in the air, so the whole list is
    // whatever the other side has loosed. Same clear/overwrite/trim as
    // `Fighter.observe`; the cursor starts at zero because this body writes
    // nothing of its own.
    this.view.projectiles.length = opponent.publishProjectiles(this.view.projectiles, 0, "opponent");
  }

  /**
   * A centipede looses nothing, so it writes no record and hands the cursor
   * straight back. Returning zero instead would truncate whatever the *other*
   * body had already written, which is the one way this signature can be got
   * wrong quietly.
   */
  publishProjectiles(_into: ProjectileView[], at: number): number { return at; }

  describe(into: BodyView): void {
    const head = this.parts[0];
    into.unit = this.kind;
    into.reach = CENTIPEDE_BITE_REACH;
    into.crownHeight = CENTIPEDE_CROWN;
    into.vitalHeight = CENTIPEDE_CROWN * 0.55;
    into.collisionRadius = CENTIPEDE_RADIUS;
    this.bite.ready = this.phase === "ready";
    this.bite.active = this.phase === "lunge";
    into.naturalAttacks = this.natural;
    into.ground.set(head.mesh.position.x, 0, head.mesh.position.z);
    into.facing = this.heading;
    into.shoulder.copyFrom(head.mesh.position);
    into.tip.copyFrom(this.strikers[0].tipPosition());
    // `...ToRef`, because `getLinearVelocity` hands back a fresh `Vector3` and
    // this is on the control step. Same reason `Weapon.speedAt` exists.
    head.body.getLinearVelocityToRef(this.reading);
    into.tipSpeed = this.reading.length();
    into.hands = NO_HANDS;
    into.crouch = 0; into.trunkLean = 0; into.trunkTwist = 0;
    into.vitality = this.vitality;
    for (const limb of this.limbs) into.health[limb.key] = limb.severed ? 0 : Math.max(0, limb.health / limb.maxHealth);
  }

  nearestPartTo(point: Vector3): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const limb of this.limbs) if (!limb.severed) nearest = Math.min(nearest, Vector3.Distance(point, limb.part.mesh.position));
    return nearest;
  }

  update(dt: number): void {
    this.control.driver.step(dt);
  }

  private applyIntent(dt: number, input: Intent): void {
    this.phaseClock += dt;
    // The natural channel. This read `input.primary.thrust` on a body whose
    // published `hands` is an empty object, so the creature's whole control
    // surface was a hand slot it does not have -- and every reader downstream
    // had to carry the exception.
    if (this.phase === "ready" && input.natural.thrust) { this.phase = "chamber"; this.phaseClock = 0; }
    else if (this.phase === "chamber" && this.phaseClock >= 0.12) { this.phase = "lunge"; this.phaseClock = 0; }
    else if (this.phase === "lunge" && this.phaseClock >= 0.16) { this.phase = "recover"; this.phaseClock = 0; }
    else if (this.phase === "recover" && this.phaseClock >= 0.34) { this.phase = "ready"; this.phaseClock = 0; }

    const head = this.parts[0];
    const turnRate = input.turn * 2.2 + input.strafe * 1.1;
    this.heading += turnRate * dt;
    this.facingVector.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    const speed = input.natural.guard ? 0.7 : 2.2;
    if (this.phase === "lunge") this.facingVector.scaleInPlace(4.8);
    else this.facingVector.scaleInPlace(input.forward * speed);
    head.body.setLinearVelocity(this.facingVector);
    head.body.setAngularVelocity(this.spin.set(0, turnRate, 0));
    if (this.vitality <= 0) this.die();
  }

  stepProjectiles(): void {}
  feetPosition(): Vector3 { return this.middle.set(this.parts[0].mesh.position.x, 0, this.parts[0].mesh.position.z); }
  centre(): Vector3 { return this.middle.copyFrom(this.parts[Math.floor(this.parts.length / 2)].mesh.position); }
  aimPoint(): Vector3 { return this.strikers[0].tipPosition(); }
  owns(mesh: AbstractMesh): boolean { return this.owned.has(mesh); }
  limbFor(body: PhysicsBody): Limb | undefined { return this.byBody.get(body); }
  parriedBy(): { readonly kind: WeaponKind } | null { return null; }

  sever(limb: Limb, direction: Vector3): void {
    const start = this.limbs.indexOf(limb);
    if (start <= 0) { limb.health = 0; this.die(); return; }
    for (let index = start; index < this.limbs.length; index += 1) {
      const tail = this.limbs[index];
      if (tail.severed) continue;
      tail.severed = true;
      tail.health = 0;
      if (tail.attachment) {
        tail.attachment.dispose();
        const constraint = this.constraints.indexOf(tail.attachment);
        if (constraint >= 0) this.constraints.splice(constraint, 1);
      }
      tail.part.shape.filterMembershipMask = LAYER.DEBRIS;
      tail.part.shape.filterCollideMask = COLLIDES.DEBRIS;
      tail.part.body.setLinearVelocity(direction);
    }
    if (this.vitality <= 0) this.die();
  }

  stopFighting(): void { this.control.stopFighting(); }
  private stopBody(): void { this.fighting = false; this.phase = "ready"; }
  occlusionPoints(): readonly Vector3[] { return this.occlusion; }
  dispose(): void {
    this.control.dispose();
    for (const constraint of this.constraints) constraint.dispose();
    for (const art of this.costume) art.dispose(false, false);
    for (const part of this.parts) part.mesh.dispose();
    this.limbs.length = 0; this.constraints.length = 0; this.parts.length = 0; this.occlusion.length = 0;
    this.byBody.clear(); this.owned.clear();
  }

  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.fighting = false;
    this.parts[0].body.setMotionType(PhysicsMotionType.DYNAMIC);
  }
}

/** Close, turn, and commit the one natural attack the body declares. */
export function crawlerMind(): Mind {
  const intent = (): Intent => ({
    // No hand acts, because there is no hand. Both hand slots stay at their
    // blanks -- a command carries them whatever the body is -- and the two
    // buttons this creature is actually driven by are on `natural`.
    forward: 0, strafe: 0, turn: 0, actingHand: null,
    natural: { thrust: false, guard: false },
    posture: { crouch: 0, trunkLean: 0, trunkTwist: 0 },
    primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
    secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0, thrust: false, guard: false },
  });
  const out = intent();
  return { name: "crawler", decide(view) {
    const dx = view.opponent.ground.x - view.self.ground.x;
    const dz = view.opponent.ground.z - view.self.ground.z;
    let delta = Math.atan2(dx, dz) - view.self.facing;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    out.turn = Math.max(-1, Math.min(1, delta * 2.2));
    out.forward = view.measure > CENTIPEDE_BITE_REACH * 0.82 ? 1 : 0;
    out.natural.thrust = view.measure <= CENTIPEDE_BITE_REACH && view.self.naturalAttacks?.bite?.ready === true;
    out.natural.guard = view.measure < 0.25 && !out.natural.thrust;
    return out;
  } };
}
