import { Vector3, Quaternion, Matrix } from "@babylonjs/core/Maths/math.vector.js";
import {
  PhysicsMotionType,
  PhysicsConstraintAxis,
  PhysicsConstraintMotorType,
} from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import { Physics6DoFConstraint } from "@babylonjs/core/Physics/v2/physicsConstraint.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Material } from "@babylonjs/core/Materials/material.js";
import type { Scene } from "@babylonjs/core/scene.js";

// Explicit `.ts` extensions, and they are load-bearing rather than a style. Node
// runs a TypeScript file by stripping its types, which is what lets `tests/`
// import `scoring.ts` and `config.ts` directly today and what will let session
// 06 run bouts of real `Fighter`s without a browser -- but Node's ESM resolver
// insists on the extension where Vite does not care. Everything a fighter pulls
// in at run time therefore carries one. The presentation half of the directory
// -- `main`, `hud`, `rigview`, `targeting`, `aim`, `setup` -- deliberately does
// not, and the line between the two is exactly the line a headless harness can
// reach. `input.ts` is on the far side of it, and a fighter reaches it only
// through `mind.ts`'s `Intent`, which is a type alias and erases.
import { CONFIG } from "./config.ts";
import { COLLIDES, LAYER, layersFor, supportedLayersFor, type Side } from "./physics.ts";
import { capsulePart, joint, type Part } from "./rig.ts";
import { Figure, type FigureController, type FigureMaterials } from "./figure.ts";
import { KayKitFigure } from "./kaykit-figure.ts";
import { Arm } from "./arm.ts";
import { handsFor, isShield, type Weapon, type WeaponKind } from "./weapon.ts";
import type { Striking } from "./combat.ts";
import type { Combatant, LocomotionMode } from "./units.ts";
import { HumanoidControlEndpoint, type HumanoidHumanSource } from "./humanoid-control.ts";
import { stepControlledPair } from "./control-host.ts";
import { vitality } from "./bout.ts";
import { PhysicalSupportedLocomotionPort } from "./supported-locomotion-production.ts";
import { deriveLocomotionFootprint, type StandableWorldRegistry } from "./supported-locomotion-runtime.ts";
import { fighterPostureIsSupported } from "./supported-locomotion-state.ts";
import {
  HANDS,
  NEUTRAL,
  idleMind,
  otherHand,
  type ArmPose,
  type ArmPoses,
  type BodyView,
  type FighterView,
  type HandName,
  type HandView,
  type Intent,
  type Mind,
  type ProjectileView,
} from "./mind.ts";

export type { Side };

export interface FighterMaterials {
  flesh: Material;
  cloth: Material;
  steel: Material;
  leather: Material;
  brass: Material;
  hide: Material;
  /** Shield boards and club hafts. The arena has had one all along. */
  wood: Material;
  arrowAccent: Material;
  /** Browser arena's textured costume family; headless/fallback palettes omit it. */
  figure?: FigureMaterials;
}

/** One severable piece of a fighter, and how close it is to coming off. */
export interface Limb {
  readonly key: string;
  readonly label: string;
  readonly part: Part;
  /**
   * The joint holding it to its parent, or null for a piece that cannot come
   * off. Cutting one of these is a dismemberment.
   */
  readonly attachment: Physics6DoFConstraint | null;
  health: number;
  readonly maxHealth: number;
  /** Per-body vitality metadata. Humanoids omit it and use CONFIG's table. */
  readonly vitalityWeight?: number;
  readonly fatal?: boolean;
  severed: boolean;
  /** Simulation time of the last billed hit, for the per-part cooldown. */
  lastHitAt: number;
}

export interface FighterOptions {
  side: Side;
  /** Where the feet stand, on the floor. */
  origin: Vector3;
  /**
   * Heading in radians, in the convention used everywhere here: zero looks down
   * +Z and turns toward +X, so it can be compared against
   * `Math.atan2(forward.x, forward.z)` with nothing in between.
   */
  facing: number;
  /**
   * Who drives it. Defaults to idle, so a fighter built by a harness that has
   * not thought about it stands still rather than reading undefined.
   */
  mind?: Mind;
  /** Page-only typed injection; headless callers deliberately omit it. */
  human?: HumanoidHumanSource;
  readonly controlPolicies?: readonly { readonly name: string; readonly label: string }[];
  readonly controlPolicyName?: string;
  readonly controlPolicyFactory?: (name: string, seed?: number) => Mind;
  /**
   * What is in each hand. Defaults to a sword in the primary and nothing in the
   * secondary, which is what every fighter held before there was a choice --
   * so a harness that has not thought about equipment measures the same body
   * that every number in `docs/measurements.md` was taken from.
   */
  loadout?: Partial<Record<HandName, WeaponKind>>;
  /** Per-body tuning. Omitted is the exact historical Warrior. */
  profile?: HumanoidProfile;
  readonly locomotionMode?: LocomotionMode;
  readonly locomotionWorld?: StandableWorldRegistry;
}

export interface HumanoidProfile {
  readonly kind: "warrior" | "broot" | "kaykit-knight";
  readonly scale: number;
  readonly massScale: number;
  readonly healthScale: number;
  readonly forceScale: number;
  readonly mobilityScale: number;
  readonly turnScale: number;
  /** Which visual contract dresses this body; it never changes collision. */
  readonly appearance: "warrior" | "primitive" | "kaykit-knight";
  /**
   * Measurements read from an imported body's bind pose, applied after the
   * broad mass/force tuning above. A native body is not a uniformly stretched
   * Warrior: shoulders, joints, capsules and reach have their own dimensions.
   */
  readonly values?: {
    readonly body?: Partial<BodyConfig>;
    readonly fighter?: Partial<FighterConfig>;
    readonly arm?: Partial<ArmConfig>;
  };
}

export const WARRIOR_PROFILE: HumanoidProfile = Object.freeze({
  kind: "warrior", scale: 1, massScale: 1, healthScale: 1, forceScale: 1,
  mobilityScale: 1, turnScale: 1, appearance: "warrior",
});

export const BROOT_PROFILE: HumanoidProfile = Object.freeze({
  kind: "broot", scale: 1.18, massScale: 1.64, healthScale: 1.30, forceScale: 1.35,
  mobilityScale: 0.88, turnScale: 0.88, appearance: "primitive",
});

type BodyConfig = typeof CONFIG.body;
type FighterConfig = typeof CONFIG.fighter;
type ArmConfig = typeof CONFIG.arm;

const BODY_LENGTHS = new Set([
  "torsoCentre", "torsoLength", "torsoRadius", "headCentre", "headLength", "headRadius",
  "pelvisCentre", "pelvisLength", "pelvisRadius", "hipSide", "thighCentre", "thighLength",
  "thighRadius", "shinCentre", "shinLength", "shinRadius", "neck", "waist", "hip", "knee",
  "crouchDepth",
]);
const BODY_MASSES = new Set(["torsoMass", "headMass", "pelvisMass", "thighMass", "shinMass"]);
const BODY_FORCES = new Set([
  "neckStrength", "waistStrength", "hipStrength", "kneeStrength", "jointStiffness",
  "trunkMotorForce",
]);
const ARM_LENGTHS = new Set([
  "upperLength", "upperRadius", "foreLength", "foreRadius", "handLength", "handRadius",
  "reachNeutral", "reachThrust", "reachGuard", "reachMax",
]);
const ARM_MASSES = new Set(["upperMass", "foreMass", "handMass"]);
const ARM_FORCES = new Set([
  "linearMotorForce", "wristMotorForce", "shoulderTone", "elbowTone", "elbowPoleForce",
]);

function scaledRecord<T extends Record<string, unknown>>(
  source: T,
  factorFor: (key: string) => number,
): T {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [
    key,
    typeof value === "number" ? value * factorFor(key) : value,
  ])) as T;
}

export function humanoidProfileValues(profile: HumanoidProfile): {
  body: BodyConfig; fighter: FighterConfig; arm: ArmConfig;
} {
  if ((profile === WARRIOR_PROFILE || profile.kind === "warrior") && !profile.values) {
    return { body: CONFIG.body, fighter: CONFIG.fighter, arm: CONFIG.arm };
  }
  const scaledBody = scaledRecord(CONFIG.body, (key) =>
    BODY_LENGTHS.has(key) ? profile.scale
      : BODY_MASSES.has(key) ? profile.massScale
        : BODY_FORCES.has(key) ? profile.forceScale
          : key === "partHealth" ? profile.healthScale : 1);
  const scaledFighter = scaledRecord(CONFIG.fighter, (key) =>
    key === "walkSpeed" || key === "backSpeed" || key === "strafeSpeed"
      ? profile.mobilityScale
      : key === "turnSpeed" ? profile.turnScale : key.includes("shoulder") ? profile.scale : 1);
  const scaledArm = scaledRecord(CONFIG.arm, (key) =>
    ARM_LENGTHS.has(key) ? profile.scale
      : ARM_MASSES.has(key) ? profile.massScale
        : ARM_FORCES.has(key) ? profile.forceScale : 1);
  const body = Object.assign({}, scaledBody, profile.values?.body) as BodyConfig;
  const fighter = Object.assign({}, scaledFighter, profile.values?.fighter) as FighterConfig;
  const arm = Object.assign({}, scaledArm, profile.values?.arm) as ArmConfig;
  return { body, fighter, arm };
}

/** Hip, knee and off-arm angles for one instant of the walk. */
export interface GaitPose {
  hipLeft: number;
  hipRight: number;
  kneeLeft: number;
  kneeRight: number;
  /** How far the animated hip reference follows the supporting leg down. */
  pelvisDrop: number;
}

const clamp = (value: number, min: number, max: number) =>
  value < min ? min : value > max ? max : value;

/** Shortest signed way round from `from` to `to`. */
const angleTo = (from: number, to: number): number => {
  let delta = (to - from) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
};

const ANGULAR = [
  PhysicsConstraintAxis.ANGULAR_X,
  PhysicsConstraintAxis.ANGULAR_Y,
  PhysicsConstraintAxis.ANGULAR_Z,
];

/**
 * The walk, as a pure function of where in the stride you are and how fast you
 * are going.
 *
 * It used to live in `figure.ts` and drive `TransformNode.rotation` on the
 * costume. It drives joint motors now, which is why it has moved: the legs are
 * bodies that can be cut off, and a leg lying on the ground must not still be
 * receiving a hip angle. `figure.ts` owns no motion at all any more, which is
 * the boundary the overview asks for -- cosmetics carry no authority.
 *
 * Cadence is proportional to speed rather than fixed, so the feet keep pace with
 * the ground instead of scuffing along it, and the swing amplitude fades with
 * speed so that standing still straightens the legs on its own -- no separate
 * idle pose, and no blend between the two to get wrong. That last property is
 * also what makes the resting-sag acceptance a static measurement: at zero speed
 * every target here is exactly zero.
 */
export function legPose(
  phase: number,
  speed: number,
  crouch: number,
  F: FighterConfig = CONFIG.fighter,
  B: BodyConfig = CONFIG.body,
): GaitPose {
  const amount = clamp(speed / F.walkSpeed, 0, 1);
  const swing = F.strideSwing * amount;
  const step = Math.sin(phase);
  const opposite = Math.sin(phase + Math.PI);

  // Solve the two-link leg for the requested vertical shortening rather than
  // animating the pelvis by an unrelated offset. The knee comes from the law
  // of cosines; the hip cancels the chain's forward displacement, leaving the
  // shin endpoint below the socket at exactly the requested height.
  const thigh = B.thighLength;
  const shin = B.shinLength;
  const standing = thigh + shin;
  const wanted = standing - clamp(crouch, 0, 1) * B.crouchDepth;
  const kneeCos = clamp(
    (wanted * wanted - thigh * thigh - shin * shin) / (2 * thigh * shin),
    -1,
    1,
  );
  const crouchKnee = Math.acos(kneeCos);
  const crouchHip = -Math.atan2(shin * Math.sin(crouchKnee), thigh + shin * kneeCos);

  const hipLeft = clamp(crouchHip + step * swing, B.hipTargetMin, B.hipTargetMax);
  const hipRight = clamp(crouchHip + opposite * swing, B.hipTargetMin, B.hipTargetMax);
  const kneeLeft = clamp(
    crouchKnee + Math.max(0, -Math.sin(phase + 0.7)) * swing * 1.5,
    B.kneeTargetMin,
    B.kneeTargetMax,
  );
  const kneeRight = clamp(
    crouchKnee + Math.max(0, -Math.sin(phase + 0.7 + Math.PI)) * swing * 1.5,
    B.kneeTargetMin,
    B.kneeTargetMax,
  );
  const extension = (hip: number, knee: number) =>
    thigh * Math.cos(hip) + shin * Math.cos(hip + knee);

  return {
    hipLeft,
    hipRight,
    kneeLeft,
    kneeRight,
    // The longer leg is the supporting one. Following that one keeps its foot
    // on the floor while the shorter alternating leg is allowed to swing free.
    pelvisDrop: standing - Math.max(extension(hipLeft, kneeLeft), extension(hipRight, kneeRight)),
  };
}

/** Kept as the public spelling for existing probes. */
export function gait(phase: number, speed: number): GaitPose {
  return legPose(phase, speed, 0);
}

/**
 * Which arm each arm-limb's key belongs to.
 *
 * A table rather than a chain of string comparisons, because there are six of
 * them now and the version with three was already the sort of line that gets
 * one case added and one forgotten.
 */
export type ArmLimbKey =
  | "upperArm" | "forearm" | "hand"
  | "offUpperArm" | "offForearm" | "offHand";

const ARM_KEYS = {
  upperArm: "primary",
  forearm: "primary",
  hand: "primary",
  offUpperArm: "secondary",
  offForearm: "secondary",
  offHand: "secondary",
} as const satisfies Record<ArmLimbKey, HandName>;

export function armForLimbKey(key: string): HandName | undefined {
  return Object.prototype.hasOwnProperty.call(ARM_KEYS, key)
    ? ARM_KEYS[key as ArmLimbKey]
    : undefined;
}

/**
 * A fighter: the one kind of body in the ring.
 *
 * This is the merge of what used to be `Hero` -- a driven torso with a
 * simulated sword arm -- and what used to be `Dummy`, a jointed figure that
 * could be cut apart. A fight needs both properties in one object, twice, and
 * nothing here knows or cares which of the two is being driven by a person.
 *
 * The pelvis is animated: it is the planted locomotion frame and goes exactly
 * where steering and the solved leg geometry put it. The torso is dynamic on a
 * motorised waist, so the shoulders can lean and twist while both hand targets
 * remain relative to world vertical. The arms, head and legs are dynamic too;
 * all are hittable and every registered part but the torso can be severed.
 *
 * The arm is driven by a single invisible keyframed *anchor* joined to the hand
 * by a six-degree-of-freedom constraint whose motors have a finite force budget.
 * Move the anchor and the solver drags the hand after it, the forearm and upper
 * arm follow because they are constrained, and the sword follows because it is
 * welded to the hand. Nothing is animated and no force is applied from outside
 * the solver.
 *
 * That last point is not stylistic. The first version ran a spring-damper on the
 * hand with `applyForce` each frame and shook itself to pieces, because Babylon
 * converts a force to an impulse using `getTimeStep()` while the world steps by
 * the real frame delta -- so the gain flickered every frame. It also torqued the
 * sword toward an aim direction while the weld held the sword rigid to the hand,
 * which is a contradiction the solver can only answer by vibrating.
 *
 * A second anchor holds the elbow. Pinning the hand in six degrees of freedom
 * leaves this seven-degree-of-freedom arm one spare, and an unheld spare axis
 * hangs: the elbow swings about the shoulder-to-hand line like a rope. See
 * `driveElbow`.
 *
 * **On pivots.** `rig.ts`'s `joint()` locks all three linear axes, so the two
 * anchors of every joint below are not a hint about where a part should sit --
 * they are an instruction, and the solver will drag the part to obey it. The
 * dummy this class replaces was authored to stand on the floor and then pinned
 * to the top of a 0.4 m stump by a pivot that assumed otherwise, and the two
 * anchors it named were 450 mm apart; the solver duly dragged the whole figure
 * down until they met, and the resulting slump was read for a long time as a
 * stiffness problem. It was not: every angular motor in it set to 40 000 N.m,
 * over a thousand times the shipped value, moved the head by exactly zero. Every
 * pivot here is therefore written as a world height in `config.ts`'s `body`
 * block and subtracted from the two parts' own centres, so that the arithmetic
 * is visible and both anchors provably land on the same point.
 *
 * **On input.** A fighter reads a `Mind` and has no idea what is behind it. The
 * human is a `Mind` too -- one that hands back `controls.state` -- so there is
 * deliberately no branch anywhere in here for "is this one the player", and
 * taking over a body is `fighter.mind = somethingElse` with nothing else to do.
 * `mind` is a plain mutable field for exactly that reason: session 07 swaps it
 * mid-fight, and the measurement session 04 could not take -- the standard
 * cursor sweep run on the *right* fighter's arm -- is a swap of it from the
 * console.
 */
/**
 * One hand's half of a view, allocated and never replaced.
 *
 * Four of these per fighter -- its own two and the two it can see -- built in
 * the constructor before either arm exists, so every field starts as a zero and
 * the first `observe` fills it. The alternative was to build them from the arms
 * after the arms, which would have put the view's allocation below the bones and
 * moved the build order the whole of `docs/measurements.md` was taken against.
 */
const blankHand = (): HandView => ({
  weapon: "empty",
  shoulder: new Vector3(),
  tip: new Vector3(),
  tipSpeed: 0,
  tipVelocity: new Vector3(),
  reach: 0,
  lost: false,
  outboard: 1,
});
const NO_NATURAL_ATTACKS = Object.freeze({});

/**
 * One projectile's half of a view, allocated on the step it is first needed and
 * never replaced.
 *
 * Grown lazily rather than built at `CONFIG.arrow.count` in the constructor,
 * because most fighters carry no bow at all and a pool of twelve dead records
 * per side per role would be four times the arrows anybody looses. The high
 * water mark settles within the first volley and nothing allocates after it.
 */
const blankProjectile = (owner: "self" | "opponent"): ProjectileView => ({
  kind: "arrow",
  owner,
  position: new Vector3(),
  velocity: new Vector3(),
  age: 0,
});

export class Fighter {
  readonly articulated: Fighter = this;
  readonly control: HumanoidControlEndpoint;
  readonly locomotion: PhysicalSupportedLocomotionPort | null;
  readonly kind: "warrior" | "broot" | "kaykit-knight";
  readonly profile: HumanoidProfile;
  private readonly bodyConfig: BodyConfig;
  private readonly fighterConfig: FighterConfig;
  private readonly armConfig: ArmConfig;
  readonly side: Side;
  readonly torso: Part;
  readonly head: Part;
  readonly pelvis: Part;

  /**
   * The driven arm.
   *
   * Everything from the shoulder outward used to be eleven singular fields on
   * this class, which was the right shape while there was one arm. The getters
   * below keep every one of those names working, because `rigview.ts` reaches
   * for `fighter.handAnchor` and `fighter.grip` by name, `main.ts` and
   * `scripts/measure.mjs` for `fighter.sword`, and the handover tests for both.
   * Delegating rather than renaming meant the extraction touched no caller and
   * no test, which is the only way to be sure a refactor of the arm has not
   * moved the arm.
   */
  readonly arms: Record<HandName, Arm>;

  /** What each hand ended up holding, after the two-hander rule. */
  readonly loadout: Record<HandName, WeaponKind>;

  /**
   * Which hand owns the two-hander, or null when neither does.
   *
   * Held rather than re-derived, because `update` asks every step and the answer
   * cannot change without a rebuild.
   */
  readonly twoHanded: HandName | null = null;

  /**
   * The primary arm, under the name everything already calls it by.
   *
   * `rigview.ts` draws one arm's anchors and drives, the takeover readings are
   * taken from one arm's pose, and every figure in `docs/measurements.md` was
   * measured on one arm. All of them mean this one.
   */
  get arm(): Arm {
    return this.arms.primary;
  }
  /** Height of the collision capsule's centre above the feet. */
  readonly torsoCentre: number;
  /** Every hittable piece, in the order the readout lists them. */
  readonly limbs: Limb[] = [];

  /**
   * The sword arm's four constraints, published rather than private.
   *
   * They were private, and session 02's rig overlay stopped at the boundary
   * rather than reaching in -- correctly, and at the cost of a joint layer that
   * drew the old dummy's eleven joints and none of the four that actually matter.
   * A `Physics6DoFConstraint` registers itself nowhere, a `PhysicsBody` cannot be
   * asked what constrains it, and the V2 engine keeps no constraint list, so the
   * only handle on a constraint is whatever object holds the reference. This is
   * that object, so this is where they have to be published from.
   */

  /** Where to face while locked on, or null to steer by hand. */
  lockTarget: Vector3 | null = null;

  /**
   * Who is driving, swappable at any moment.
   *
   * Public and mutable rather than set once in the constructor, because every
   * interesting thing anybody wants to do with it is a swap: session 07 takes a
   * body mid-fight and hands the one it left back to its policy, and the
   * measurement session 04 was blocked on wants a bespoke mind on the right
   * fighter for the length of one sweep. A constructor argument would make both
   * of those a rebuild, and rebuilding is precisely what neither can afford --
   * the first would drop the blade and the second would move the bodies it is
   * trying to hold still.
   */
  get mind(): Mind { return this.control.mind; }
  set mind(value: Mind) { this.control.installMind(value); }

  /** Compatibility tap for direct harnesses; arena recording uses `control.recording`. */
  get intentObserver(): ((view: FighterView, intent: Intent) => void) | null { return this.control.observer; }
  set intentObserver(value: ((view: FighterView, intent: Intent) => void) | null) { this.control.observer = value; }

  /**
   * What this fighter can see, republished in place by `observe`.
   *
   * Owned by the fighter rather than built per step, because `decide` runs 240
   * times a second per side. Handing a mind a fresh object each time would make
   * the view the largest allocator in the prototype, and it would also be a lie
   * about lifetime: everything in here is a live reading of a world that is
   * about to move.
   */
  readonly view: FighterView;

  /**
   * What the fighter is wearing. Held only so that the rig overlay can take it
   * off -- nothing here moves it, because every piece of it is parented to the
   * physics part it covers.
   *
   * Not the same set as `owns` answers for: the sword arm's capsules are drawn
   * as themselves and are pickable, but they are not a costume and the overlay
   * has no reason to hide them.
   */
  readonly costume: readonly AbstractMesh[];
  private readonly figure: FigureController;

  /**
   * Every body joint, how many times `body.jointStiffness` it is worth, and the
   * limb it holds on.
   *
   * The limb is here for the same reason `driven` carries one: a severed limb's
   * constraint has been disposed and this list still holds it, so anything that
   * walks these has to know which entries are dead letters.
   */
  private readonly springs: {
    constraint: Physics6DoFConstraint;
    strength: number;
    limb: Limb | null;
  }[] = [];
  private readonly waist: Physics6DoFConstraint;
  /**
   * The joints the stride drives, each beside the limb whose loss silences it.
   * Held as a list rather than looked up by key every step: this runs 240 times
   * a second per fighter, and a limb search in there would be six array scans
   * per step to answer a question that cannot change without a sever.
   */
  private readonly driven: {
    constraint: Physics6DoFConstraint;
    limb: Limb;
    angle: keyof GaitPose;
  }[] = [];

  private readonly byBody = new Map<PhysicsBody, Limb>();
  private readonly owned = new Set<AbstractMesh>();

  /** Where in the stride the legs are. */
  private stride = 0;

  /**
   * True once the head or the torso has come off.
   *
   * Kept separate from `armLost` because the two are different kinds of loss. An
   * arm off is a fighter with a problem; a head off is not a fighter at all, and
   * until this existed it went on walking, turning, aiming and swinging with a
   * stump for a neck. `bout.ts` noticed -- `beaten()` has named the head since it
   * was written -- but a verdict is the bout's business and a body is the body's,
   * and nothing here was listening.
   *
   * What it costs to be dead: the mind is never asked again, the torso stops
   * being keyframed and falls under its own 68 kg, and every body joint drops to
   * `body.deadJointStrength` of its usual ceiling so the thing crumples instead
   * of toppling in one rigid piece. A corpse has joints; it just has no strength
   * in them.
   */
  private dead = false;
  /** Set on the verdict edge for winner and loser alike. */
  private fighting = true;

  private readonly shoulderLocal: Vector3;
  private readonly middle = new Vector3();
  private readonly velocity = new Vector3();
  private trunkLean = 0;
  private trunkTwist = 0;
  private crouch = 0;
  private readonly pelvisRestY: number;
  /** Captured once per assisted rise so righting rotation follows the same bounded clock as height. */
  private risingStartRotation: Quaternion | null = null;

  /**
   * What is left of the fighter's own scratch once the arm took its share.
   *
   * Everything the four arm methods used -- the aim frame, the two bases, the
   * previous frame's axes, the commanded spin -- moved to `Arm`, one set per arm,
   * because two arms sharing a `prevX` is the second one being handed the first
   * one's history every step. These five are the torso's: three for `steer` and
   * `walk`, one for the feet, and `viewBasis` for `observe`, which is kept apart
   * from all of them so that a view can never overwrite a frame anything else is
   * mid-way through reading.
   */
  private readonly scratch = {
    feet: new Vector3(),
    spin: new Vector3(),
    trunkWake: new Vector3(),
    move: new Vector3(),
    right: new Vector3(),
    forward: new Vector3(),
    viewBasis: Matrix.Identity(),
    trunkBasis: Matrix.Identity(),
    locomotionFrame: Matrix.Identity(),
    trunkFrame: Matrix.Identity(),
    pelvisInverse: Quaternion.Identity(),
    relativeTrunk: Quaternion.Identity(),
    risingRotation: Quaternion.Identity(),
    risingTargetRotation: Quaternion.Identity(),
    trunkAngles: new Vector3(),
  };

  /**
   * This fighter's own projectile records, one pool per role it publishes in.
   *
   * Two pools rather than one, and it is a correctness requirement rather than
   * an economy. A bout observes both sides in turn, and the *same* shaft is
   * `self` in its owner's view and `opponent` in the other's -- so a single pool
   * would have the second `observe` of the step rewrite the `owner` label the
   * first one had just published, and every archer would read its own arrows as
   * incoming. `stepPair` runs both observations before either mind decides, so
   * the corruption would have been total rather than intermittent.
   */
  private readonly projectileRecords: Record<"self" | "opponent", ProjectileView[]> = {
    self: [],
    opponent: [],
  };

  constructor(scene: Scene, opts: FighterOptions, materials: FighterMaterials) {
    this.profile = opts.profile ?? WARRIOR_PROFILE;
    this.kind = this.profile.kind;
    const profileConfig = humanoidProfileValues(this.profile);
    this.bodyConfig = profileConfig.body;
    this.fighterConfig = profileConfig.fighter;
    this.armConfig = profileConfig.arm;
    const F = this.fighterConfig;
    const B = this.bodyConfig;
    const ordinaryLayers = layersFor(opts.side);
    const assistedLayers = supportedLayersFor(opts.side);
    const assisted = opts.locomotionMode === "supported";
    const layers = assisted ? { ...ordinaryLayers,
      trunk: assistedLayers.trunk, trunkCollides: assistedLayers.trunkCollides,
      arm: assistedLayers.arm, armCollides: assistedLayers.armCollides } : ordinaryLayers;
    this.side = opts.side;
    const initialMind = opts.mind ?? idleMind();

    // Built empty and filled in place by `observe` from then on. Nothing here
    // creates a body, a shape or a constraint, so it costs the arm's build order
    // nothing to sit above it.
    //
    // Both hands of both bodies are allocated here too, for the same reason and
    // with the same discipline: `describe` writes into them and never replaces
    // one. Built before the arms exist, so nothing in here may ask an arm
    // anything -- every field is a zero that the first `observe` overwrites.
    const blankHands = (): Record<HandName, HandView> => ({
      primary: blankHand(),
      secondary: blankHand(),
    });
    this.view = {
      self: {
        unit: this.kind,
        reach: this.armConfig.reachNeutral,
        crownHeight: this.bodyConfig.headCentre + this.bodyConfig.headRadius,
        vitalHeight: this.bodyConfig.torsoCentre,
        collisionRadius: this.bodyConfig.pelvisRadius,
        naturalAttacks: NO_NATURAL_ATTACKS,
        ground: new Vector3(),
        facing: opts.facing,
        shoulder: new Vector3(),
        tip: new Vector3(),
        tipSpeed: 0,
        hands: blankHands(),
        crouch: 0,
        trunkLean: 0,
        trunkTwist: 0,
        vitality: 1,
        health: {},
      },
      opponent: {
        unit: "warrior",
        reach: CONFIG.arm.reachNeutral,
        crownHeight: CONFIG.body.headCentre + CONFIG.body.headRadius,
        vitalHeight: CONFIG.body.torsoCentre,
        collisionRadius: CONFIG.body.pelvisRadius,
        naturalAttacks: NO_NATURAL_ATTACKS,
        ground: new Vector3(),
        facing: 0,
        shoulder: new Vector3(),
        tip: new Vector3(),
        tipSpeed: 0,
        hands: blankHands(),
        crouch: 0,
        trunkLean: 0,
        trunkTwist: 0,
        vitality: 1,
        health: {},
      },
      // Empty, and it stays the same array for the life of the fighter. Both
      // sides write their pooled records into it every step and its length is
      // trimmed to what was written; see `publishProjectiles`.
      projectiles: [],
      measure: Number.POSITIVE_INFINITY,
      clock: 0,
    };

    // Every part is built in the fighter's own upright frame and then turned to
    // face where it is standing. Doing it this way rather than by writing turned
    // world positions is what keeps every pivot below readable as a height above
    // the floor, which is the whole of how the dummy's root-pivot bug is avoided.
    const yaw = Quaternion.RotationAxis(new Vector3(0, 1, 0), opts.facing);
    const turn = Matrix.Identity();
    Matrix.FromQuaternionToRef(yaw, turn);
    const scratchLocal = new Vector3();
    const place = (x: number, y: number, z = 0): Vector3 => {
      scratchLocal.set(x, y, z);
      const world = Vector3.Zero();
      Vector3.TransformCoordinatesToRef(scratchLocal, turn, world);
      return world.addInPlace(opts.origin);
    };

    this.torsoCentre = B.torsoCentre;
    this.pelvisRestY = opts.origin.y + B.pelvisCentre;

    this.torso = capsulePart(scene, {
      name: `${opts.side}.torso`,
      position: place(0, B.torsoCentre, 0),
      rotation: yaw,
      height: B.torsoLength,
      radius: B.torsoRadius,
      mass: B.torsoMass,
      layer: layers.trunk,
      collidesWith: layers.trunkCollides,
      material: materials.cloth,
    });
    this.torso.mesh.isVisible = false;
    this.torso.mesh.isPickable = false;

    // ---- the sword arm, exactly as it was, and built exactly when it was ----
    //
    // The arm comes before the rest of the body, and the order is load-bearing
    // rather than editorial. Havok's solver is iterative, and an iterative
    // solver's answer depends on the order it visits bodies and constraints in
    // -- not at convergence, where everything agrees, but during a transient
    // where a force-limited motor is saturated and the solve is nowhere near
    // converged. Dragging a 6 kg arm and a 1.35 kg sword across the aiming
    // envelope in a quarter of a second is exactly such a transient: the grip's
    // 850 N ceiling is hit for most of it.
    //
    // Building the torso and then immediately the arm puts this fighter's arm
    // bodies and its six arm constraints at the same indices, in the same order,
    // that `Hero` handed them to Havok before the merge -- the arena's ground and
    // posts come first in both, and nothing else is created in between. Building
    // the hittable bones first instead pushes the arm eight bodies down the list,
    // and that alone moved the measured peak anchor-to-hand error over a sweep
    // from 221.74 mm to 242.88 mm. Nothing about the arm had changed: every
    // number, pivot, limit and mass in it is identical, the peak tip speed was
    // unmoved, and both steady-state errors stayed at exactly zero. Only the
    // order had changed.
    //
    // It is worth knowing what that reading does *not* mean, because the obvious
    // explanation was tested and is wrong. It is not the extra bodies sharing a
    // solver island with the arm: severing all eight non-arm limbs, which
    // disposes every constraint linking them to the torso, leaves the reading at
    // 242.88 mm exactly. Severing removes constraints and leaves the bodies where
    // they are in the list, which is precisely why it separates the two
    // explanations.
    //
    // So: do not move this block below the bones for tidiness. If it ever has to
    // move, the peak anchor-to-hand error over the standard sweep is the reading
    // that will notice, and it is one keystroke away on `G`.

    this.shoulderLocal = new Vector3(
      F.shoulderSide,
      F.shoulderHeight - B.torsoCentre,
      F.shoulderFront,
    );

    // Both arms, here, where the one arm used to be. The primary is built first
    // and exactly as it was, which is what keeps the sweep reading comparable
    // with every one taken before there were two; the secondary follows
    // immediately, so neither ends up below the bones. The build-order note
    // above is about this block as a whole.
    // What each hand holds, settled before either arm is built.
    //
    // A two-hander is one weapon, so it cannot be in both hands and cannot share
    // a hand with anything else: whichever hand names it gets the object, and the
    // other is emptied and then given a second grip on it below. The rule is
    // enforced here as well as in `bout.ts`'s picker, because the picker is a
    // screen and this is the body -- a harness that builds a fighter directly
    // never goes near the screen.
    const wanted: Record<HandName, WeaponKind> = {
      primary: opts.loadout?.primary ?? "sword",
      secondary: opts.loadout?.secondary ?? "empty",
    };
    const twoHanded: HandName | null =
      handsFor(wanted.primary) === 2 ? "primary" : handsFor(wanted.secondary) === 2 ? "secondary" : null;
    if (twoHanded) {
      wanted.primary = twoHanded === "primary" ? wanted.primary : "empty";
      wanted.secondary = twoHanded === "secondary" ? wanted.secondary : "empty";
    }
    this.loadout = wanted;

    const buildArm = (hand: HandName, side: number, visible: boolean): Arm =>
      new Arm(
        scene,
        {
          hand,
          name: `${opts.side}.${hand}`,
          torso: this.torso,
          trunkFrame: () => this.frameOf(this.torso, this.scratch.trunkFrame),
          locomotionFrame: () => this.frameOf(this.pelvis, this.scratch.locomotionFrame),
          shoulderLocal: new Vector3(side, F.shoulderHeight - B.torsoCentre, F.shoulderFront),
          shoulderWorld: place(side, F.shoulderHeight, F.shoulderFront),
          rotation: yaw,
          layer: layers.arm,
          collidesWith: layers.armCollides,
          // A shield is the one thing a fighter carries that its own trunk can
          // stop, so it is the one thing that goes on the shield layer. See the
          // table in `physics.ts` for why that is a bit of its own rather than
          // the blade exemption being lifted.
          // Both shields go on the shield layer, which is the one its owner's
          // own trunk can stop. A buckler is small and out on the end of the
          // arm, so it reaches a chest less often than a board does -- but "less
          // often" is a property of the poses somebody sampled, and this is a
          // property of the simulation.
          weaponLayer: isShield(wanted[hand]) ? layers.shield : layers.sword,
          weaponCollidesWith:
            isShield(wanted[hand]) ? layers.shieldCollides : layers.swordCollides,
          // Handed to every arm rather than only to one that shoots, because an
          // arm decides for itself whether it has a quiver -- and a mask passed
          // conditionally is a mask that has to be worked out twice.
          arrowLayer: layers.arrow,
          arrowCollidesWith: layers.arrowCollides,
          fistTrigger: assisted ? { membership: assistedLayers.fistTrigger,
            collidesWith: assistedLayers.fistTriggerCollides } : undefined,
          weapon: wanted[hand],
          bindPose: this.profile.appearance === "kaykit-knight" ? "outstretched" : "hanging",
          visible,
          config: this.armConfig,
        },
        materials,
      );

    // Neither arm draws its own capsules any more: both wear a sleeve, and a
    // bare capsule inside one is a second arm showing through the first. `G`
    // takes the costume off, which is what it is for.
    this.arms = {
      primary: buildArm("primary", F.shoulderSide, false),
      secondary: buildArm("secondary", -F.shoulderSide, false),
    };

    // The second hand takes hold of the haft, passively: it adds its mass and
    // its inertia and no force, because two motorised grips on one haft were
    // measured fighting each other and never helping. The strength of both arms
    // goes to the hand that has the weapon instead. The two sweeps that settled
    // it are in `config.ts` beside `club.trailingGrip`.
    if (twoHanded) {
      const holder = this.arms[twoHanded];
      const helper = this.arms[twoHanded === "primary" ? "secondary" : "primary"];
      if (holder.weapon) helper.takeSecondGrip(scene, holder.weapon, `${opts.side}.${twoHanded}`);
      helper.gripScale = CONFIG.club.trailingGrip;
      holder.gripScale = CONFIG.club.leadGrip;
      this.twoHanded = twoHanded;
    }
    for (const name of HANDS) {
      for (const mesh of this.arms[name].meshes) this.owned.add(mesh);
    }

    // ---- the body that can be hit ----
    //
    // Everything below is built after the arm, for the reason given above it.
    // These are bones rather than the picture: `Figure` hangs a costume off each
    // one and that is what the eye and a pick both see.

    const bone = (
      name: string,
      position: Vector3,
      height: number,
      radius: number,
      mass: number,
      collision = { layer: layers.trunk, collidesWith: layers.trunkCollides },
    ): Part => {
      const part = capsulePart(scene, {
        name: `${opts.side}.${name}`,
        position,
        rotation: yaw,
        height,
        radius,
        mass,
        layer: collision.layer,
        collidesWith: collision.collidesWith,
        material: materials.hide,
        friction: 0.8,
      });
      // Invisible, but present: the solver drives these meshes and the costume
      // rides on them as children, so they are the transform the costume needs.
      // The rig overlay draws its own copies from `body.getGeometry()` and does
      // not care what is visible.
      part.mesh.isVisible = false;
      part.mesh.isPickable = false;
      return part;
    };

    this.head = bone("head", place(0, B.headCentre, 0), B.headLength, B.headRadius, B.headMass);
    this.pelvis = bone("pelvis", place(0, B.pelvisCentre, 0), B.pelvisLength, B.pelvisRadius, B.pelvisMass);
    // A dynamic-root bracket lost both real foot contacts within the then-current 0.10 s grace even
    // at zero input; both bodies then collapse together. The game carrier owns supported walking,
    // while authored knockdown releases this root to the ordinary dynamic ragdoll.
    this.pelvis.body.setMotionType(PhysicsMotionType.ANIMATED);
    if (assisted && !opts.locomotionWorld) throw new Error("supported Fighter requires the pair world-query registry");
    const setAssistedAnatomyCollision = (supported: boolean): void => {
      for (const limb of this.limbs) {
        if (limb.severed) continue;
        const arm = ["upperArm", "forearm", "hand", "offUpperArm", "offForearm", "offHand"]
          .includes(limb.key);
        const leg = ["thighL", "shinL", "thighR", "shinR"].includes(limb.key);
        const membership = supported
          ? arm ? assistedLayers.arm : leg ? assistedLayers.leg : assistedLayers.trunk
          : arm ? ordinaryLayers.arm : ordinaryLayers.trunk;
        const collides = supported
          ? arm ? assistedLayers.armCollides : leg ? assistedLayers.legCollides : assistedLayers.trunkCollides
          : arm ? ordinaryLayers.armCollides : ordinaryLayers.trunkCollides;
        limb.part.shape.filterMembershipMask = membership;
        limb.part.shape.filterCollideMask = collides;
      }
    };
    this.locomotion = assisted ? new PhysicalSupportedLocomotionPort({
      id: `${opts.side}.${this.kind}`,
      position: { x: this.pelvis.mesh.position.x, y: this.pelvis.mesh.position.y, z: this.pelvis.mesh.position.z },
      yaw: opts.facing,
      footprint: deriveLocomotionFootprint({ radiusM: Math.max(B.torsoRadius, B.hipSide + B.thighRadius),
        heightM: B.headCentre + B.headRadius,
        provenance: { profileId: this.kind, source: "fighter-bind-geometry", measuredAt: "constructor-bind-pose" } }),
      ownerPartIds: new Set(["pelvis", "torso", "head", "left-leg", "right-leg"]),
      registry: opts.locomotionWorld as StandableWorldRegistry,
      supportedMassKg: B.torsoMass + B.headMass + B.pelvisMass + 2 * (B.thighMass + B.shinMass) +
        2 * (this.armConfig.upperMass + this.armConfig.foreMass + this.armConfig.handMass),
      authority: () => ({ carrierPartId: "pelvis",
        supportBindings: Object.freeze([{ role: "left-leg" }, { role: "right-leg" }]),
        braceCapacityMultiplier: 1, gaitStabilityScale: 1 }),
      supportBindings: Object.freeze(["left-leg", "right-leg"]),
      supportPoint: (role) => {
        const limb = this.limbs.find(({ key, severed }) => !severed && key ===
          (role === "left-leg" ? "shinL" : role === "right-leg" ? "shinR" : ""));
        if (!limb) return null;
        const rotation = limb.part.mesh.rotationQuaternion ?? Quaternion.Identity();
        const down = Vector3.Down().rotateByQuaternionToRef(rotation, new Vector3())
          .scaleInPlace(B.shinLength / 2);
        const point = limb.part.mesh.position.add(down);
        return { x: point.x, y: point.y, z: point.z };
      },
      applyAngularDrive: (targetYaw) => {
        const rotation = this.pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        const up = Vector3.Up().rotateByQuaternionToRef(rotation, new Vector3());
        const angular = this.pelvis.body.getAngularVelocity();
        const actualYaw = rotation.toEulerAngles().y;
        const yawError = Math.atan2(Math.sin(targetYaw - actualYaw), Math.cos(targetYaw - actualYaw));
        const mass = B.torsoMass + B.headMass + B.pelvisMass + 2 * (B.thighMass + B.shinMass) +
          2 * (this.armConfig.upperMass + this.armConfig.foreMass + this.armConfig.handMass);
        const torque = Vector3.Cross(up, Vector3.Up()).scaleInPlace(mass * 6);
        torque.x -= angular.x * mass * 7;
        torque.z -= angular.z * mass * 7;
        torque.y = Math.max(-mass * 8, Math.min(mass * 8, yawError * mass * 6 - angular.y * mass * 5));
        const limit = mass * 8;
        if (torque.length() > limit) torque.normalize().scaleInPlace(limit);
        this.pelvis.body.applyTorque(torque);
      },
      driveAnimatedRoot: (_targetPosition, targetVelocity, targetYaw, _dt) => {
        const liveRotation = this.pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        const actualYaw = liveRotation.toEulerAngles().y;
        const yawError = Math.atan2(Math.sin(targetYaw - actualYaw), Math.cos(targetYaw - actualYaw));
        this.pelvis.body.setLinearVelocity(new Vector3(targetVelocity.x, 0, targetVelocity.z));
        this.pelvis.body.setAngularVelocity(new Vector3(0,
          clamp(yawError * 8, -F.turnSpeed, F.turnSpeed), 0));
      },
      // Rising is the bounded carrier actuator, not ordinary supported movement and not an
      // unbounded ragdoll force. The Construct adapter already takes this path. Omitting it here
      // left Fighters on the fallback dynamic-root motor: the state reached `rising`, but a
      // prone pelvis never satisfied the upright predicate and could remain there forever.
      driveRisingRoot: (targetPosition, _targetVelocity, targetYaw) => {
        if (this.pelvis.body.getMotionType() !== PhysicsMotionType.ANIMATED) {
          this.pelvis.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        const liveRotation = this.pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        if (this.risingStartRotation === null) this.risingStartRotation = liveRotation.clone();
        Quaternion.RotationAxisToRef(Vector3.Up(), targetYaw, this.scratch.risingTargetRotation);
        const progress = this.locomotion?.diagnostic().recoveryProgress ?? 0;
        const smooth = progress * progress * (3 - 2 * progress);
        Quaternion.SlerpToRef(this.risingStartRotation, this.scratch.risingTargetRotation,
          smooth, this.scratch.risingRotation);
        this.pelvis.body.setTargetTransform(
          new Vector3(targetPosition.x, targetPosition.y, targetPosition.z),
          this.scratch.risingRotation);
      },
      releaseRoot: () => {
        this.risingStartRotation = null;
        if (this.pelvis.body.getMotionType() === PhysicsMotionType.ANIMATED) {
          this.pelvis.body.setMotionType(PhysicsMotionType.DYNAMIC);
        }
      },
      restoreRoot: () => {
        this.risingStartRotation = null;
        if (!this.dead && this.pelvis.body.getMotionType() === PhysicsMotionType.DYNAMIC) {
          this.pelvis.body.setMotionType(PhysicsMotionType.ANIMATED);
        }
        if (this.dead) return;
        // Reattachment is an admitted game transition. Retaining ragdoll momentum here made the
        // now-supported chain discharge its stored rotation through the first fencing pose (105
        // m/s in the Arbalest recovery bracket). A same-boundary hit cannot reach this branch: it
        // aborts rising above. Clear the recovered articulation once, never during ordinary play.
        for (const { part, severed } of this.limbs) {
          if (severed) continue;
          part.body.setLinearVelocity(Vector3.Zero());
          part.body.setAngularVelocity(Vector3.Zero());
        }
      },
      releaseAnatomyCollision: () => setAssistedAnatomyCollision(false),
      restoreSupportedAnatomyCollision: () => setAssistedAnatomyCollision(true),
      liveSupport: () => !this.dead && ["thighL", "shinL", "thighR", "shinR"].every((key) =>
        !this.limbs.find((limb) => limb.key === key)?.severed),
      postureSupported: () => {
        const rotation = this.pelvis.mesh.rotationQuaternion ?? Quaternion.Identity();
        const up = Vector3.Up().rotateByQuaternionToRef(rotation, new Vector3());
        return fighterPostureIsSupported({ pelvisUpDot: up.y,
          torsoHeightAbovePelvisM: this.torso.mesh.position.y - this.pelvis.mesh.position.y,
          headHeightAboveTorsoM: this.head.mesh.position.y - this.torso.mesh.position.y });
      },
      root: {
        sample: () => ({ motionType: this.pelvis.body.getMotionType() === PhysicsMotionType.DYNAMIC ? "dynamic" :
          this.pelvis.body.getMotionType() === PhysicsMotionType.ANIMATED ? "animated" : "static",
        position: { x: this.pelvis.mesh.position.x, y: this.pelvis.mesh.position.y, z: this.pelvis.mesh.position.z },
        velocity: { x: this.pelvis.body.getLinearVelocity().x, y: this.pelvis.body.getLinearVelocity().y,
          z: this.pelvis.body.getLinearVelocity().z }, massKg: B.torsoMass + B.headMass + B.pelvisMass +
          2 * (B.thighMass + B.shinMass) +
          2 * (this.armConfig.upperMass + this.armConfig.foreMass + this.armConfig.handMass), released: this.dead }),
        applyForce: (force) => {
          const mass = B.torsoMass + B.headMass + B.pelvisMass + 2 * (B.thighMass + B.shinMass) +
            2 * (this.armConfig.upperMass + this.armConfig.foreMass + this.armConfig.handMass);
          this.pelvis.body.applyForce(new Vector3(force.x, force.y + mass * 9.81, force.z), this.pelvis.mesh.position);
        },
        clearDrive: () => {
          if (this.pelvis.body.getMotionType() === PhysicsMotionType.ANIMATED) {
            this.pelvis.body.setLinearVelocity(Vector3.Zero());
            this.pelvis.body.setAngularVelocity(Vector3.Zero());
          }
        },
      },
    }) : null;

    // The off arm used to be two capsules on gait-driven motors, with no hand
    // body, no anchor and no grip: it counterswung while you walked and there
    // was nothing you could put in it. It is a second `Arm` now, built above
    // with the first, and `body.offUpper*` / `body.offFore*` are consequently
    // unread -- the two arms take their dimensions from the one `arm` block,
    // because two arms of different lengths on one body is not a design, it is
    // an oversight nobody got round to.

    const legs = (["L", "R"] as const).map((suffix, index) => {
      const x = index === 0 ? -B.hipSide : B.hipSide;
      return {
        x,
        thigh: bone(`thigh${suffix}`, place(x, B.thighCentre, 0), B.thighLength, B.thighRadius, B.thighMass,
          assisted ? { layer: assistedLayers.leg, collidesWith: assistedLayers.legCollides } : undefined),
        shin: bone(`shin${suffix}`, place(x, B.shinCentre, 0), B.shinLength, B.shinRadius, B.shinMass,
          assisted ? { layer: assistedLayers.leg, collidesWith: assistedLayers.legCollides } : undefined),
      };
    });

    // ---- and the joints that hold it on ----
    //
    // Every pivot below is written as `anchor - centre` for both parts, from the
    // heights in the `body` block, so the two anchors demonstrably meet. See the
    // class header for what happens when they do not.

    const hang = (spec: {
      key: string;
      label: string;
      parent: Part;
      parentCentre: Vector3;
      child: Part;
      childCentre: Vector3;
      /** Where the joint is, as a point in the fighter's own upright frame. */
      anchor: Vector3;
      swing: Parameters<typeof joint>[3]["swing"];
      strength: number;
      health: number;
      /** Which of the stride's angles this joint takes, if any. */
      angle?: keyof GaitPose;
    }): Limb => {
      const attachment = joint(scene, spec.parent, spec.child, {
        pivotParent: spec.anchor.subtract(spec.parentCentre),
        pivotChild: spec.anchor.subtract(spec.childCentre),
        swing: spec.swing,
      });
      const limb: Limb = {
        key: spec.key,
        label: spec.label,
        part: spec.child,
        attachment,
        health: spec.health,
        maxHealth: spec.health,
        severed: false,
        lastHitAt: -999,
      };
      this.springs.push({ constraint: attachment, strength: spec.strength, limb });
      this.register(limb);
      if (spec.angle) this.driven.push({ constraint: attachment, limb, angle: spec.angle });
      return limb;
    };

    const health = B.partHealth;
    const spine = { x: { min: -0.6, max: 0.6 }, y: { min: -0.7, max: 0.7 }, z: { min: -0.6, max: 0.6 } };
    // A hip has to reach the whole stride and no further. The dummy's sockets
    // were wider because a rag has no pose to protect; a fighter's leg that can
    // reach the splits looks broken the first time it is hit hard.
    const hipRange = {
      x: { min: B.hipLimitMin, max: B.hipLimitMax },
      y: { min: -0.7, max: 0.7 },
      z: { min: -0.6, max: 0.6 },
    };
    // Knees backward, with a hand's width of slack past straight so that a
    // motor target of zero is not sitting exactly on a stop. The elbow's own
    // range moved to `Arm` with the rest of the chain, and the shoulder socket
    // went with it; both arms are driven now, so nothing here needs either.
    const knee = { x: { min: B.kneeLimitMin, max: B.kneeLimitMax } };

    const torsoCentreVec = new Vector3(0, B.torsoCentre, 0);

    // The torso cannot be severed, so nothing can take it off. It
    // still carries health, because a bout has to be able to end on a body blow
    // and because a torso that cannot be scored against would teach the player
    // to aim at limbs for the wrong reason.
    this.register({
      key: "torso",
      label: "Torso",
      part: this.torso,
      attachment: null,
      health: health * B.torsoHealth,
      maxHealth: health * B.torsoHealth,
      severed: false,
      lastHitAt: -999,
    });

    hang({
      key: "head",
      label: "Head",
      parent: this.torso,
      parentCentre: torsoCentreVec,
      child: this.head,
      childCentre: new Vector3(0, B.headCentre, 0),
      anchor: new Vector3(0, B.neck, 0),
      swing: spine,
      strength: B.neckStrength,
      health,
    });
    // The pelvis is the animated locomotion parent and the torso is the dynamic
    // child. Havok's position motor drives B relative to A; leaving these in the
    // old root-first order records a non-zero target but moves neither body.
    this.waist = joint(scene, this.pelvis, this.torso, {
      pivotParent: new Vector3(0, B.waist - B.pelvisCentre, 0),
      pivotChild: new Vector3(0, B.waist - B.torsoCentre, 0),
      swing: spine,
    });
    const pelvisLimb: Limb = {
      key: "pelvis",
      label: "Pelvis",
      part: this.pelvis,
      attachment: this.waist,
      health: health * B.pelvisHealth,
      maxHealth: health * B.pelvisHealth,
      severed: false,
      lastHitAt: -999,
    };
    this.springs.push({ constraint: this.waist, strength: B.waistStrength, limb: pelvisLimb });
    this.register(pelvisLimb);

    // Both arms are hittable, and they are the only limbs whose loss changes
    // what the fighter can *do* rather than only how well it stands. Their joints
    // are not in `springs`, because they are tuned out of the `arm` block by
    // `applyTuning` and must go on being tuned there.
    //
    // The labels still say "Sword" and "Off" rather than "Primary" and
    // "Secondary", because the readout is read by a person watching a fight and
    // "Off forearm" is a part of a body while "Secondary forearm" is a part of a
    // program. The *keys* say primary and secondary, and the keys are what code
    // matches on. `offUpperArm` and `offForearm` are kept as keys for the same
    // reason `bout.ts` keeps naming the torso: `figure.ts` dresses those bones,
    // and renaming them would be a rename of the asset.
    const armLimbs: {
      hand: HandName;
      keys: [string, string, string];
      labels: [string, string, string];
    }[] = [
      {
        hand: "primary",
        keys: ["upperArm", "forearm", "hand"],
        labels: ["Sword arm", "Sword forearm", "Sword hand"],
      },
      {
        hand: "secondary",
        keys: ["offUpperArm", "offForearm", "offHand"],
        labels: ["Off arm", "Off forearm", "Off hand"],
      },
    ];
    for (const spec of armLimbs) {
      const arm = this.arms[spec.hand];
      const bones = [arm.upperArm, arm.forearm, arm.hand];
      const joints = [arm.shoulder, arm.elbow, arm.wrist];
      for (let i = 0; i < 3; i += 1) {
        this.register({
          key: spec.keys[i],
          label: spec.labels[i],
          part: bones[i],
          attachment: joints[i],
          health,
          maxHealth: health,
          severed: false,
          lastHitAt: -999,
        });
      }
    }

    const pelvisCentreVec = new Vector3(0, B.pelvisCentre, 0);
    for (const [index, leg] of legs.entries()) {
      const suffix = index === 0 ? "L" : "R";
      const label = index === 0 ? "Left" : "Right";
      const thighCentre = new Vector3(leg.x, B.thighCentre, 0);
      hang({
        key: `thigh${suffix}`,
        label: `${label} thigh`,
        parent: this.pelvis,
        parentCentre: pelvisCentreVec,
        child: leg.thigh,
        childCentre: thighCentre,
        anchor: new Vector3(leg.x, B.hip, 0),
        swing: hipRange,
        strength: B.hipStrength,
        health,
        angle: index === 0 ? "hipLeft" : "hipRight",
      });
      hang({
        key: `shin${suffix}`,
        label: `${label} shin`,
        parent: leg.thigh,
        parentCentre: thighCentre,
        child: leg.shin,
        childCentre: new Vector3(leg.x, B.shinCentre, 0),
        anchor: new Vector3(leg.x, B.knee, 0),
        swing: knee,
        strength: B.kneeStrength,
        health,
        angle: index === 0 ? "kneeLeft" : "kneeRight",
      });
    }

    // The costume goes on last, because every piece of it hangs off a body that
    // has to exist first. It carries no authority of any kind: it is what the
    // eye and `scene.pick` see, and what the rig overlay takes off.
    const figureRig = {
      prefix: opts.side,
      torso: this.torso,
      head: this.head,
      pelvis: this.pelvis,
      swordUpperArm: this.arms.primary.upperArm,
      swordForearm: this.arms.primary.forearm,
      swordHand: this.arms.primary.hand,
      offUpperArm: this.arms.secondary.upperArm,
      offForearm: this.arms.secondary.forearm,
      offHand: this.arms.secondary.hand,
      thighLeft: legs[0].thigh,
      shinLeft: legs[0].shin,
      thighRight: legs[1].thigh,
      shinRight: legs[1].shin,
    };
    try {
      this.figure = this.profile.appearance === "kaykit-knight"
        ? new KayKitFigure(scene, figureRig, {
            primary: this.arms.primary.weapon,
            secondary: this.arms.secondary.weapon,
          }, { origin: opts.origin, facing: opts.facing })
        : new Figure(scene, figureRig, materials.figure ?? materials, {
            scale: this.profile.scale,
            authored: this.profile.appearance === "warrior",
            loadout: this.loadout,
          });
    } catch (error) {
      // A constructor that throws has no object its caller can dispose. The
      // asset gate rejects known malformed geometry before the picker enables,
      // but this is the last boundary against an unexpected loader/Havok
      // failure after the ordinary body graph already exists.
      this.disposeBodyGraph();
      throw error;
    }
    this.costume = this.figure.pieces;
    for (const mesh of this.costume) this.owned.add(mesh);

    this.applyTuning();
    this.control = new HumanoidControlEndpoint({
      initialMind,
      initialPolicyName: opts.controlPolicyName,
      view: this.view,
      canStep: () => !this.dead && this.fighting,
      apply: (dt, intent) => this.applyIntent(dt, intent),
      stopBody: () => this.stopBody(),
      clearLocomotion: (reason) => this.locomotion?.clear(reason),
      policies: opts.controlPolicies ?? [{ name: "idle", label: "Idle" }],
      policyFactory: opts.controlPolicyFactory,
      human: opts.human,
      poseSeed: () => this.armed ? this.armPoses() : null,
    });
  }

  /**
   * Push the current CONFIG into the solver.
   *
   * Motor ceilings and damping are set on native objects at construction, so
   * editing CONFIG alone does nothing to them. Calling this re-reads the whole
   * lot, which is what makes `__sword.left.applyTuning()` a live tuning loop
   * rather than a page reload.
   *
   * The body's joints are in here for exactly that reason. The dummy set its
   * stiffnesses once, in a `stiffen()` helper called from its constructor, with
   * no way to re-read them -- so every live experiment that edited
   * `CONFIG.dummy.jointStiffness` and watched the result was measuring nothing
   * at all, and appeared to confirm whatever theory it was testing. A tunable
   * number with no way to push it into the solver is worse than a constant.
   */
  applyTuning(): void {
    const B = this.bodyConfig;

    // The arm tunes its own solver objects, and guards the two that `drop`
    // disposes -- a tuning pass on a fighter that has lost its arm, which `die`
    // performs on every death, must not write into a freed constraint. That is
    // the same hazard `walk` learned about when it started skipping severed
    // limbs.
    for (const name of HANDS) this.arms[name].applyTuning();

    // And the body's own joints, which is what the dummy could never do -- see
    // the note above. Every one of them is a position motor toward its rest
    // angle; the stride overwrites the targets of the six it drives on the very
    // next step, so setting them to zero here is a reset rather than a fight.
    // A dead fighter's joints go slack here rather than in `die`, so that the
    // corpse stays tunable: `__sword.config.body.deadJointStrength = 0.3;
    // __sword.left.applyTuning()` re-reads it on a body already lying on the
    // floor. A severed limb's constraint is disposed, and `springs` still holds
    // it -- so the skip is not tidiness, it is the same freed-constraint hazard
    // as everywhere else.
    const tone = this.dead ? B.deadJointStrength : 1;
    for (const spring of this.springs) {
      if (spring.limb?.severed) continue;
      for (const axis of ANGULAR) {
        spring.constraint.setAxisMotorType(axis, PhysicsConstraintMotorType.POSITION);
        spring.constraint.setAxisMotorTarget(axis, 0);
        const aliveWaist = spring.constraint === this.waist && !this.dead;
        spring.constraint.setAxisMotorMaxForce(
          axis,
          aliveWaist ? B.trunkMotorForce : B.jointStiffness * spring.strength * tone,
        );
      }
    }
  }

  targetPosition(): Vector3 {
    return this.arm.targetPosition();
  }

  /** The point the blade is aimed at, in world space. */
  aimPoint(): Vector3 {
    return this.arm.aimPoint();
  }

  /** The fighter's position on the ground. */
  feetPosition(): Vector3 {
    const p = this.pelvis.mesh.position;
    return this.scratch.feet.set(p.x, 0, p.z);
  }

  /** Horizontal speed, for the gait. */
  groundSpeed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  armAngles(): ArmPose {
    return this.arm.angles();
  }

  /**
   * Both hands' poses, which is what a takeover has to seed from.
   *
   * Both, always, even when one of them is holding nothing: the cursor is
   * absolute, so the hand it is *not* currently driving is still being commanded
   * from a pose the incoming mind knows nothing about, and rebasing only the
   * driven one would leave the other to snap at the full 850 N the grip can
   * pull.
   */
  armPoses(): ArmPoses {
    return { primary: this.arms.primary.angles(), secondary: this.arms.secondary.angles() };
  }

  /** False once the sword arm has been cut off it. */
  get armed(): boolean {
    return this.arm.armed;
  }

  // ---- the arm, under the names everything outside already calls it by ----
  //
  // `rigview.ts` reaches for `handAnchor`, `upperArm`, `hand`, `elbowAnchor`,
  // `grip` and `elbowDrive` by name; `main.ts`, `scripts/measure.mjs` and two
  // test files reach for `sword`. Delegating rather than renaming is what let
  // the arm move into its own class without a single caller changing, which is
  // the only way to be sure that a refactor of the arm has not moved the arm.

  /**
   * The primary hand's weapon.
   *
   * Nullable now, where it never used to be: a fighter can be built with an
   * empty primary hand, and a shield is not a sword. Every caller outside this
   * file was written when it could not be null, so each of them now has to say
   * what it does about a fighter holding nothing -- which is the point of making
   * it nullable rather than handing back a blade nobody is carrying.
   */
  get sword(): Weapon | null {
    return this.arm.weapon;
  }

  /**
   * Everything of this fighter's that can hurt somebody -- what it holds, and
   * what it can loose.
   *
   * What `Combat` watches. It was `weapons`, a list of what is in the two hands,
   * and the rename is the change rather than the addition: a `Weapon` is a thing
   * in a hand, and a quiver's arrows are things this fighter owns that no hand
   * holds. Nothing wanted the narrower list once the wider one existed, so there
   * is not one.
   *
   * A two-hander appears once, not twice: it belongs to the arm that welded it
   * and the other hand merely has hold of the haft, so the trailing arm's own
   * `weapon` is null and walking both hands is already right.
   *
   * Read once, in `Combat`'s constructor, and that is the whole reason a quiver
   * is a fixed pool. See `arrow.ts`: with a pool, this list is complete before
   * the first step, so an observable is never touched during a bout and no arrow
   * can outlive the observer watching it.
   */
  get strikers(): Striking[] {
    const all: Striking[] = [];
    for (const name of HANDS) {
      const arm = this.arms[name];
      if (arm.weapon) all.push(arm.weapon);
      else if (
        arm.fist &&
        arm.armed &&
        !arm.assisting &&
        (this.twoHanded === null || name === this.twoHanded)
      ) all.push(arm.fist);
      if (arm.quiver) all.push(...arm.quiver.arrows);
    }
    return all;
  }
  get upperArm(): Part {
    return this.arm.upperArm;
  }
  get forearm(): Part {
    return this.arm.forearm;
  }
  get hand(): Part {
    return this.arm.hand;
  }
  get handAnchor(): Part {
    return this.arm.handAnchor;
  }
  get elbowAnchor(): Part {
    return this.arm.elbowAnchor;
  }
  get grip(): Physics6DoFConstraint {
    return this.arm.grip;
  }
  get shoulder(): Physics6DoFConstraint {
    return this.arm.shoulder;
  }
  get elbow(): Physics6DoFConstraint {
    return this.arm.elbow;
  }
  get elbowDrive(): Physics6DoFConstraint {
    return this.arm.elbowDrive;
  }

  /** False once it has lost its head. A dead fighter is still in the world. */
  get alive(): boolean {
    return !this.dead;
  }

  /** The one body-wide health reading, derived from local part state. */
  get vitality(): number {
    return vitality(this.limbs);
  }

  /**
   * Roughly where the fighter is, for a lock-on to point at and a ring to sit
   * under. The torso, which is the one part that cannot come off -- a lock that
   * followed a severed arm across the arena would be a comedy.
   */
  centre(): Vector3 {
    return this.middle.copyFrom(this.torso.mesh.absolutePosition);
  }

  /**
   * True for a mesh that stands for part of this fighter's body -- its costume
   * and its bare sword arm -- which is what a pick is allowed to choose.
   *
   * Asked as a question rather than answered by a name prefix, because the
   * swords are named after their side too and a sword is not a target, and
   * because a prefix test goes quietly wrong the first time anything else in the
   * scene is named after a side.
   */
  owns(mesh: AbstractMesh): boolean {
    return this.owned.has(mesh);
  }

  limbFor(body: PhysicsBody): Limb | undefined {
    return this.byBody.get(body);
  }

  /**
   * The weapon of this fighter's that a body belongs to, if any.
   *
   * A blade stopped by a shield generates a real contact and the solver really
   * stops it -- the collision masks have said since they were written that an
   * enemy blade and this side's weapons may touch. What was missing was any
   * *record* of it: `limbFor` answers nothing for a weapon body, so `Combat`
   * dropped the contact and a block was indistinguishable from a miss.
   *
   * Walk the two hands rather than maintaining a second map. A held weapon has
   * one guard body; an empty hand guards with its real hand and forearm bodies.
   * This is only asked for contacts whose target was not already scored as a
   * limb.
   */
  parriedBy(body: PhysicsBody): { readonly kind: WeaponKind } | null {
    for (const name of HANDS) {
      const arm = this.arms[name];
      const weapon = arm.weapon;
      if (weapon && weapon.body === body) return weapon;
      if (
        arm.holding === "empty" &&
        arm.fist &&
        arm.armed &&
        !arm.assisting &&
        (this.twoHanded === null || name === this.twoHanded) &&
        (arm.hand.body === body || arm.forearm.body === body)
      ) return arm.fist;
    }
    return null;
  }

  /**
   * Republish what this fighter can see.
   *
   * Called before `update`, and before the *other* fighter's `update` too -- see
   * `stepPair`. Everything is written into `this.view` in place.
   *
   * **Nothing in here may touch a world matrix**, and that rule is the whole of
   * what this comment is for. It is not a preference and it cost a session to
   * learn.
   *
   * The first version read the torso through `getWorldMatrix()`, the limbs
   * through `absolutePosition` and the tip through `Sword.tipPosition`, on the
   * argument that reading the world the same way the arm reads it could not
   * disturb the arm. That argument was *correct about the physics* and wrong
   * about everything else, because both of those accessors have a side effect:
   * they run `computeWorldMatrix()`, which short-circuits on the scene's render
   * id and **stamps that id on the node**. Whoever calls first in a rendered
   * frame gets a fresh matrix and silently converts every later caller that
   * frame into a reader of that first sample.
   *
   * With the control loop at 240 Hz against a 60 Hz display, `observe` was
   * always first, four substeps ahead of everything else. The arm was unaffected
   * -- it reads through the same cache and got the same matrix it always had --
   * but a *measurement* taken from the console afterwards was reading a sample
   * up to three substeps old, and the standard sweep came back at 273.84 mm of
   * peak anchor-to-hand error against a true 242.88, with the tip speed and the
   * elbow drift shifted to match. It read exactly like a 9 % regression in the
   * arm. There was no regression: the instrument had been moved, not the thing
   * being measured. Measured both ways in `.review/parity.mjs`, forced against
   * unforced, with the two orderings run in freshly built scenes.
   *
   * So this reads `mesh.position` and `mesh.rotationQuaternion` instead. Every
   * bone, every anchor and the sword's root is a scene-root node, so those two
   * fields *are* the world transform; Havok's `syncTransform` writes them at the
   * end of every solver step, so they are cache-free and strictly fresher than
   * the matrix; and reading them stamps nothing, so a console reading taken
   * after a step is the same reading it was before this seam existed.
   *
   * It also drops the caveat the first version had to carry. A headless harness
   * that never renders never advances the render id, so a matrix-backed view
   * would freeze on its first sample; this one does not, and session 06's
   * measurements do not have to work around it.
   */
  observe(opponent: Combatant, clock: number): void {
    const view = this.view;
    view.clock = clock;
    this.describe(view.self);
    opponent.describe(view.opponent);
    view.measure = opponent.nearestPartTo(view.self.shoulder);
    // Clear the logical length, let each side overwrite its own pooled records
    // from the cursor it is handed, then trim. The records outlive the trim
    // because each body still holds its own pool, which is the whole of why
    // this allocates nothing once a volley has settled.
    const written = opponent.publishProjectiles(
      view.projectiles,
      this.publishProjectiles(view.projectiles, 0, "self"),
      "opponent",
    );
    view.projectiles.length = written;
  }

  /** See `Combatant.publishProjectiles`. Only a hand with a quiver has any. */
  publishProjectiles(into: ProjectileView[], at: number, owner: "self" | "opponent"): number {
    const pool = this.projectileRecords[owner];
    let index = at;
    for (const name of HANDS) {
      const quiver = this.arms[name].quiver;
      if (!quiver) continue;
      for (const arrow of quiver.arrows) {
        // Exactly `Quiver.flying`'s filter, so a policy and the readout can
        // never disagree about how many shafts are up. A planted or spent one
        // is scenery; a parked one is 60 m under the floor.
        if (!arrow.live || arrow.spent) continue;
        const slot = index - at;
        let record = pool[slot];
        if (!record) {
          record = blankProjectile(owner);
          pool[slot] = record;
        }
        arrow.tipPositionToRef(record.position);
        arrow.flightVelocityToRef(record.velocity);
        record.age = arrow.age;
        into[index] = record;
        index += 1;
      }
    }
    return index;
  }

  occlusionPoints(): readonly Vector3[] {
    return [this.pelvis.mesh.position, this.torso.mesh.position, this.head.mesh.position];
  }

  update(dt: number): void {
    this.control.driver.step(dt);
  }

  queueStabilityEvent(event: import("./supported-locomotion-state.ts").StabilityEvent): void {
    this.locomotion?.queueStabilityEvent(event);
  }

  private applyIntent(dt: number, intent: Intent): void {
    this.steer(dt, intent);
    // Once the bounded rise begins, continuing a fencing pose turns recovery into a fight between
    // the righting carrier and every high-force arm/waist motor. Movement remains live above so a
    // person or Mind can keep asking to recover; the articulated body takes the ordinary neutral
    // pose until support has actually been earned again.
    const recovering = this.locomotion?.state === "rising";
    const trunkIntent = recovering ? NEUTRAL : intent;
    // A rising arm rests instead of fencing against the floor or fighting the bounded root.
    // Re-enabling a Duelist's guard during rising reached 109 m/s in the representative Arbalest
    // cell; hands return only after the physical posture has earned supported state again.
    const armIntent = recovering ? NEUTRAL : intent;
    this.poseTrunk(dt, trunkIntent);
    this.walk(dt);
    // Both arms, each from its own half of the intent. `Arm.update` returns on
    // its own if that arm has been dropped, which is why there is no second
    // early return here: a fighter with one arm off still walks, and still
    // fights with the other one.
    //
    // A two-hander is the exception. The leading arm aims as any arm does; the
    // trailing one is *sent* to a point on the haft the leading one computed,
    // and holds the leading one's frame.
    //
    // Handing both arms the same `HandIntent` was the obvious first version and
    // it is wrong, because each arm builds its target from its own shoulder --
    // so one pose becomes two targets 0.42 m apart across the body, on a haft
    // that holds the fists 0.26 m apart. The two grips then pull against each
    // other for the whole bout. Measured: mean commanded-to-actual hand error
    // 95.70 mm, against 5.95 mm for the same club held in one hand.
    if (this.twoHanded) {
      const lead = this.arms[this.twoHanded];
      const trail = this.arms[otherHand(this.twoHanded)];
      lead.update(dt, armIntent[this.twoHanded]);
      trail.follow(lead.gripPoint(CONFIG.club.secondGrip), lead.commandedRotation);
      return;
    }
    // Plan both hands before moving either anchor. Sword-versus-own-shield is a
    // coupled request: resolving it after the primary hand had already moved
    // made the physical answer depend on `HANDS` iteration order and left two
    // high-force motors pushing into the same plate. The narrow resolver lives
    // below every Mind and player input, then the ordinary articulated drives
    // receive the pair together.
    for (const name of HANDS) this.arms[name].plan(dt, armIntent[name]);
    const primary = this.arms.primary;
    const secondary = this.arms.secondary;
    if (primary.weapon?.kind === "sword" && secondary.weapon?.kind === "shield") {
      primary.clearOwnShield(secondary);
    } else if (secondary.weapon?.kind === "sword" && primary.weapon?.kind === "shield") {
      secondary.clearOwnShield(primary);
    }
    for (const name of HANDS) this.arms[name].commit(dt);
  }

  /**
   * Remove combat authority without removing the body from the simulation.
   *
   * Called once on the fight-to-over edge, but idempotent because the edge is a
   * wiring fact rather than a second safety boundary. A surviving fighter stays
   * upright and simply stops; an exhausted one enters the same corpse physics
   * as a severed head. Neither is disposed.
   */
  stopFighting(): void {
    this.control.stopFighting();
  }

  private stopBody(): void {
    if (!this.fighting) return;
    this.fighting = false;
    for (const name of HANDS) this.arms[name].stopFighting();
    this.velocity.set(0, 0, 0);
    this.pelvis.body.setLinearVelocity(this.velocity);
    this.pelvis.body.setAngularVelocity(this.scratch.spin.set(0, 0, 0));
    this.torso.body.setLinearVelocity(this.scratch.move.set(0, 0, 0));
    this.torso.body.setAngularVelocity(this.scratch.trunkWake.set(0, 0, 0));
    // The chest is dynamic even while the pelvis is animated. Freezing only the
    // locomotion root leaves the chest completing its last turn against a stale
    // waist target after the verdict. Hold the achieved lean/twist explicitly;
    // Z has no commanded posture and returns to its neutral target.
    const posture = this.relativeTrunkAngles();
    this.waist.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, posture.x);
    this.waist.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Y, posture.y);
    this.waist.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_Z, 0);
    if (this.vitality === 0) this.die();
  }

  /** Age and recycle arrows after a verdict without restoring combat authority. */
  stepProjectiles(dt: number): void {
    for (const name of HANDS) this.arms[name].stepProjectiles(dt);
  }

  /** Cut a limb free and give it a parting shove along the cut. */
  sever(limb: Limb, direction: Vector3): void {
    if (limb.severed || !limb.attachment) return;
    limb.severed = true;
    limb.health = 0;
    limb.attachment.dispose();
    // The physics pieces are already independent roots. The one continuous
    // visual skin is not: remove weights that still cross this now-absent joint
    // before the freed body receives its parting impulse, or its first rendered
    // frame stretches the retained torso after it.
    this.figure.sever(limb.key);

    // Losing any piece of an arm drops that whole arm, anchors and all -- see
    // `Arm.drop`. Which arm is decided by the key, because that is what the key
    // is for; matching on the part would mean holding six references here to
    // answer a question the registry already answers.
    const dropped = armForLimbKey(limb.key);
    if (dropped) this.arms[dropped].drop();

    // The two `bout.ts`'s `beaten()` names. The torso cannot come off today --
    // it is registered with `attachment: null` and the guard above has already
    // returned -- and it is named here anyway for the same reason the rule names
    // it: severability is a property of the body, not of the rule, and a clause
    // that only covers what happens to be severable this week has to be found
    // and edited when one more becomes so.
    if (limb.key === "head" || limb.key === "torso") {
      this.die();
    }

    // Freed pieces stop being part of the fighter and become debris, so they no
    // longer benefit from the self-collision exemptions of a jointed body.
    limb.part.shape.filterMembershipMask = LAYER.DEBRIS;
    limb.part.shape.filterCollideMask = COLLIDES.DEBRIS;

    const kick = direction.normalizeToNew().scaleInPlace(CONFIG.combat.severKick);
    limb.part.body.applyImpulse(kick, limb.part.body.getObjectCenterWorld());
  }

  /**
   * Take the fighter out of the world.
   *
   * Constraints first, then bodies, and a severed limb's constraint is already
   * gone -- `dropArm` may also have taken the two anchor drives, which is why
   * they are guarded rather than disposed unconditionally. Disposing a mesh
   * disposes the aggregate that owns its body, and each part's mesh carries its
   * share of the costume as children, so the costume goes with the body it was
   * hanging on rather than being collected separately.
   */
  dispose(): void {
    this.control.dispose();
    this.locomotion?.dispose();
    this.figure.dispose();
    this.disposeBodyGraph();
  }

  private disposeBodyGraph(): void {
    for (const limb of this.limbs) {
      if (!limb.severed) limb.attachment?.dispose();
    }
    for (const name of HANDS) this.arms[name].dispose();
    for (const limb of this.limbs) limb.part.mesh.dispose();
    this.limbs.length = 0;
    this.driven.length = 0;
    this.springs.length = 0;
    this.byBody.clear();
    this.owned.clear();
  }

  private register(limb: Limb): void {
    this.limbs.push(limb);
    this.byBody.set(limb.part.body, limb);
  }

  /**
   * Fill one half of a view from one fighter.
   *
   * A private method rather than a free function so that it can reach the other
   * fighter's `shoulderLocal`, which is private and should stay so: the shoulder
   * offset is a construction detail and the only thing anyone outside wants is
   * where the shoulder *is*.
   *
   * The health map's keys are created on the first call and overwritten on every
   * one after, so the object's shape settles immediately and the steady state
   * allocates nothing. A severed limb stays in `limbs` and reads as exactly 0,
   * which is what makes "is it still on" and "is it finished" one question.
   */
  describe(into: BodyView): void {
    this.describeFighter(into, this);
  }

  private describeFighter(into: BodyView, fighter: Fighter): void {
    into.unit = fighter.kind;
    into.reach = fighter.armConfig.reachNeutral;
    into.crownHeight = fighter.bodyConfig.headCentre + fighter.bodyConfig.headRadius;
    into.vitalHeight = fighter.bodyConfig.torsoCentre;
    into.collisionRadius = fighter.bodyConfig.pelvisRadius;
    into.naturalAttacks = NO_NATURAL_ATTACKS;
    const pelvis = fighter.pelvis.mesh;
    const here = pelvis.position;
    const spin = pelvis.rotationQuaternion;

    into.ground.set(here.x, 0, here.z);
    into.crouch = clamp(
      (fighter.pelvisRestY - here.y) / Math.max(fighter.bodyConfig.crouchDepth, 1e-6),
      0,
      1,
    );

    const basis = this.scratch.viewBasis;
    if (spin) {
      // `(0, 0, 1)` turned by the quaternion -- the third row of the rotation
      // matrix, written out rather than composed through a `Matrix`, because the
      // whole point of this function is to touch nothing that caches. The
      // heading convention is the one used everywhere here: zero down +Z,
      // turning toward +X.
      const fx = 2 * (spin.x * spin.z + spin.w * spin.y);
      const fz = 1 - 2 * (spin.x * spin.x + spin.y * spin.y);
      into.facing = Math.atan2(fx, fz);
      Matrix.FromQuaternionToRef(spin, basis);
    } else {
      into.facing = 0;
      Matrix.IdentityToRef(basis);
    }
    const trunkBasis = this.scratch.trunkBasis;
    const trunkSpin = fighter.torso.mesh.rotationQuaternion;
    if (trunkSpin) Matrix.FromQuaternionToRef(trunkSpin, trunkBasis);
    else Matrix.IdentityToRef(trunkBasis);
    const trunkHere = fighter.torso.mesh.position;
    if (spin && trunkSpin) {
      const posture = fighter.relativeTrunkAngles();
      into.trunkLean = clamp(posture.x / fighter.bodyConfig.trunkLeanMax, -1, 1);
      into.trunkTwist = clamp(posture.y / fighter.bodyConfig.trunkTwistMax, -1, 1);
    } else {
      into.trunkLean = 0;
      into.trunkTwist = 0;
    }
    Vector3.TransformNormalToRef(fighter.shoulderLocal, trunkBasis, into.shoulder);
    into.shoulder.addInPlace(trunkHere);

    // Both hands, whatever either is holding, and in the same pass -- because a
    // policy that plans one hand by what the other is doing needs the two to be
    // samples of the same instant. `fighter.shoulderLocal` above is the
    // primary's socket, so `hands.primary.shoulder` is the same point arrived at
    // the same way, and the two are checked against each other in
    // `tests/view.test.mjs` rather than assumed.
    for (const name of HANDS) {
      const arm = fighter.arms[name];
      const hand = into.hands[name];
      hand.weapon = arm.holding;
      hand.lost = !arm.armed;
      hand.outboard = arm.side;
      hand.reach = arm.strikeReach;
      Vector3.TransformNormalToRef(arm.socket, trunkBasis, hand.shoulder);
      hand.shoulder.addInPlace(trunkHere);

      const held = arm.weapon;
      if (held) {
        held.tipPositionToRef(hand.tip);
      } else {
        // `mesh.position`, never `absolutePosition`. See the note on `observe`.
        hand.tip.copyFrom(arm.hand.mesh.position);
      }
      // Velocity first and speed from it, so the two can never disagree about
      // the same blade. Which reader answers is a fact about what is in the
      // hand: a held weapon is its own body, an empty hand is the fist that is
      // already in the solver, and a hand that has been cut off is neither --
      // `tip` goes on tracking a dropped sword because that is where the object
      // is, and a thing lying on the floor is not arriving anywhere.
      //
      // **Each body is read once here and every consumer is derived from that
      // one reading**, and it is a budget rather than a tidiness rule.
      // `getLinearVelocityToRef` and `getAngularVelocityToRef` are *not*
      // allocation-free: each one crosses into Havok, where the emscripten glue
      // returns a fresh array per call, and the `ToRef` saves only the
      // destination `Vector3`. So the cost of this loop is counted in boundary
      // reads -- two for a held weapon, whose tip is out on the end of a
      // rotating body, and **one** for a bare fist, whose published point is its
      // own centre and whose `w x r` term is therefore identically zero. The
      // fist of a hand that is holding something is never asked at all: the two
      // strikers on one arm would otherwise both cross the wire to describe one
      // hand. `tests/policy-perception.test.mjs` pins the count per `observe`,
      // and `AGENTS.md` carries why the obvious reading of `ToRef` is wrong.
      if (hand.lost) {
        hand.tipVelocity.setAll(0);
        hand.tipSpeed = 0;
      } else if (held) {
        held.velocityAtToRef(hand.tip, hand.tipVelocity);
        hand.tipSpeed = hand.tipVelocity.length();
      } else if (arm.fist) {
        arm.fist.centreVelocityToRef(hand.tipVelocity);
        hand.tipSpeed = hand.tipVelocity.length();
      } else {
        hand.tipVelocity.setAll(0);
        hand.tipSpeed = 0;
      }
    }

    // The primary weapon's point, or the fist itself when that hand is empty.
    // A view is a thing a mind reads every step and `duelist` builds its covering
    // line from this, so it has to be a place rather than a null: an empty hand
    // is at the end of an arm, which is exactly where the guard should be
    // covering.
    //
    // Copied off the hand record rather than recomputed, so the two can never
    // disagree about the same blade.
    const lead = into.hands.primary;
    into.tip.copyFrom(lead.tip);
    into.tipSpeed = lead.tipSpeed;
    into.vitality = fighter.vitality;

    for (const limb of fighter.limbs) {
      into.health[limb.key] = limb.severed ? 0 : Math.max(0, limb.health / limb.maxHealth);
    }
  }

  /**
   * How far the nearest piece of this fighter is from a point.
   *
   * Centres rather than surfaces, for the reason `FighterView.measure` gives.
   * Severed pieces are skipped: an arm lying on the floor five metres away is
   * not a thing to be in measure of, and a policy that closed on one would walk
   * away from the fight to stand over a limb.
   */
  nearestPartTo(point: Vector3): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const limb of this.limbs) {
      if (limb.severed) continue;
      // `mesh.position`, never `mesh.absolutePosition`. Every bone is a
      // scene-root mesh, so the two hold the same value -- but the second one is
      // a `computeWorldMatrix()` in disguise, and calling it stamps the scene's
      // render id on the node. See `observe`.
      const distance = Vector3.Distance(point, limb.part.mesh.position);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  /**
   * Stop being a fighter.
   *
   * Three things, and the order matters. The arm goes first, through the same
   * `dropArm` a severed elbow uses, because the grip would otherwise go on
   * hauling a corpse's hand about at 850 N. Then the pelvis stops being keyframed:
   * it has carried `PhysicsMotionType.ANIMATED` since construction, which is what
   * makes a fighter walk without wobbling under the weight of its own arm, and it
   * is also what would hold a dead one standing upright forever. Then
   * `applyTuning` re-reads the joint ceilings, which now come out at
   * `body.deadJointStrength` of their usual value because `dead` is set -- so the
   * body folds instead of toppling like a felled tree.
   *
   * Going through `applyTuning` rather than writing the motor forces here is the
   * point: it is the only path that pushes CONFIG into native solver objects, and
   * a ceiling set anywhere else is a number nobody can tune afterwards. The
   * dummy's `stiffen()` made exactly that mistake and every live experiment that
   * edited its stiffness was measuring nothing at all.
   */
  private die(): void {
    if (this.dead) return;
    this.dead = true;
    for (const name of HANDS) this.arms[name].drop();
    this.pelvis.body.setMotionType(PhysicsMotionType.DYNAMIC);
    this.applyTuning();
  }

  private steer(dt: number, input: Intent): void {
    const F = this.fighterConfig;
    const world = this.frameOf(this.pelvis, this.scratch.locomotionFrame);
    const right = this.scratch.right.set(world.m[0], world.m[1], world.m[2]).normalize();
    const forward = this.scratch.forward.set(world.m[8], world.m[9], world.m[10]).normalize();

    if (this.locomotion) {
      const magnitude = Math.hypot(input.forward, input.strafe);
      const scale = magnitude > 1 ? 1 / magnitude : 1;
      const yaw = clamp(this.turnRate(input, forward) / Math.max(F.turnSpeed, 1e-9), -1, 1);
      // A fallen carrier resolves translation to STOP, so allowed displacement cannot carry the
      // player's or Mind's intent across the next safe boundary. Translate deliberate Fighter
      // movement into the public recover bit before pair resolution erases that displacement.
      // Constructs already do this through their explicit recover Action.
      // Recovery authority must remain asserted for the whole bounded rise. Dropping the bit on
      // the first `rising` frame made the next safe boundary cancel every Fighter recovery even
      // though the same deliberate movement was still held.
      const recover = (this.locomotion.state === "fallen" || this.locomotion.state === "rising") &&
        Math.max(Math.abs(input.forward), Math.abs(input.strafe), Math.abs(yaw)) > 0;
      this.locomotion.request({ localForward: input.forward * scale,
        localRight: input.strafe * scale, yaw, recover });
      return;
    }

    const desired = this.scratch.move.set(0, 0, 0);
    // Backwards is slower than forwards, which it was not until there was a
    // policy that lived on the difference. See `fighter.backSpeed`.
    desired.addInPlace(
      forward.scale(input.forward * (input.forward >= 0 ? F.walkSpeed : F.backSpeed)),
    );
    desired.addInPlace(right.scale(input.strafe * F.strafeSpeed));

    const blend = 1 - Math.exp(-F.accelResponse * dt);
    this.velocity.x += (desired.x - this.velocity.x) * blend;
    this.velocity.z += (desired.z - this.velocity.z) * blend;
    this.velocity.y = 0;

    this.pelvis.body.setLinearVelocity(this.velocity);
    this.pelvis.body.setAngularVelocity(this.scratch.spin.set(0, this.turnRate(input, forward), 0));
  }

  /** Drive the physical chest about the planted, upright locomotion frame. */
  private poseTrunk(dt: number, input: Intent): void {
    const B = this.bodyConfig;
    const blend = 1 - Math.exp(-B.trunkResponse * dt);
    const posture = input.posture;
    this.trunkLean += (clamp(posture.trunkLean, -1, 1) - this.trunkLean) * blend;
    this.trunkTwist += (clamp(posture.trunkTwist, -1, 1) - this.trunkTwist) * blend;
    // Havok may put a settled dynamic torso to sleep. A changed motor target
    // does not wake it, so refresh its current velocity through the body API;
    // this is a wake-up, not a second controller.
    //
    // `...ToRef` into the scratch, for the reason `describeFighter` gives: the
    // reader crosses the boundary either way and nothing here can avoid that,
    // but `getAngularVelocity` hands back a fresh `Vector3` on top of it, and
    // this runs once per control step per fighter.
    this.torso.body.getAngularVelocityToRef(this.scratch.trunkWake);
    this.torso.body.setAngularVelocity(this.scratch.trunkWake);
    const wantedCrouch = clamp(posture.crouch, 0, 1);
    const crouchStep = clamp(
      (wantedCrouch - this.crouch) * (1 - Math.exp(-B.crouchResponse * dt)),
      -B.postureMaxRate * dt,
      B.postureMaxRate * dt,
    );
    this.crouch += crouchStep;
    this.waist.setAxisMotorTarget(
      PhysicsConstraintAxis.ANGULAR_X,
      this.trunkLean * B.trunkLeanMax,
    );
    this.waist.setAxisMotorTarget(
      PhysicsConstraintAxis.ANGULAR_Y,
      this.trunkTwist * B.trunkTwistMax,
    );
  }

  /** A cache-free world frame from Havok's latest root-node transform. */
  private frameOf(part: Part, into: Matrix): Matrix {
    const spin = part.mesh.rotationQuaternion;
    if (spin) Matrix.FromQuaternionToRef(spin, into);
    else Matrix.IdentityToRef(into);
    into.setTranslation(part.mesh.position);
    return into;
  }

  /** Actual waist rotation, read from root-node quaternions and no matrix cache. */
  private relativeTrunkAngles(): Vector3 {
    const pelvis = this.pelvis.mesh.rotationQuaternion;
    const torso = this.torso.mesh.rotationQuaternion;
    const angles = this.scratch.trunkAngles;
    if (!pelvis || !torso) return angles.set(0, 0, 0);
    pelvis.conjugateToRef(this.scratch.pelvisInverse);
    this.scratch.pelvisInverse.multiplyToRef(torso, this.scratch.relativeTrunk);
    return this.scratch.relativeTrunk.toEulerAnglesToRef(angles);
  }

  /**
   * The stride, delivered to joint motors rather than to a costume.
   *
   * This is the one thing in the fighter that a `TransformNode` used to do and a
   * constraint does now, and the reason is severability: a leg that is a body
   * with a joint can be taken off, and a leg that is a rotation on a node cannot.
   * The cost is that a wrong sign is no longer invisible -- see `gait`.
   *
   * `body.gaitDrivesLegs` turns it off without turning the legs off, which is
   * the switch to reach for if the knees ever chatter: the legs stay hittable and
   * simply hold straight. That is the fallback the plan asked to be available,
   * kept as a live config flag rather than as a second code path, because a
   * second code path would rot the moment nobody was using it.
   */
  private walk(dt: number): void {
    const B = this.bodyConfig;
    const allowed = this.locomotion?.priorAllowed() ?? null;
    const speed = this.locomotion ? Math.hypot(allowed?.localForward ?? 0,
      allowed?.localRight ?? 0) * this.fighterConfig.walkSpeed : this.groundSpeed();
    this.stride += speed * this.fighterConfig.strideCadence * dt;

    const pose = B.gaitDrivesLegs
      ? legPose(this.stride, speed, this.crouch, this.fighterConfig, B)
      : legPose(0, 0, this.crouch, this.fighterConfig, B);
    for (const drive of this.driven) {
      // A severed limb's joint has been disposed, and writing a motor target
      // into a freed constraint is the one way this loop can take the page down.
      if (drive.limb.severed) continue;
      drive.constraint.setAxisMotorTarget(PhysicsConstraintAxis.ANGULAR_X, pose[drive.angle]);
    }

    if (this.locomotion) return;

    // The pelvis is the locomotion frame and remains animated, but its vertical
    // reference is not arbitrary: it is the height implied by the same solved
    // chain whose targets were just sent to the hips and knees.
    const wantedY = this.pelvisRestY - pose.pelvisDrop;
    const maxVertical = B.crouchDepth * B.postureMaxRate;
    this.velocity.y = clamp(
      (wantedY - this.pelvis.mesh.position.y) * B.crouchResponse,
      -maxVertical,
      maxVertical,
    );
    this.pelvis.body.setLinearVelocity(this.velocity);
  }

  /**
   * Yaw rate: yours if you are steering, otherwise the lock's.
   *
   * A lock that fights the turn keys would be a trap, so touching them wins --
   * and, at the call site, drops the lock outright. Circling a locked enemy is
   * the point of the whole feature: strafe, and the fighter keeps its front and
   * its guard toward the thing trying to kill it.
   */
  private turnRate(input: Intent, forward: Vector3): number {
    const F = this.fighterConfig;
    if (input.turn !== 0 || !this.lockTarget) return input.turn * F.turnSpeed;

    const T = CONFIG.targeting;
    const here = this.pelvis.mesh.position;
    const wanted = Math.atan2(this.lockTarget.x - here.x, this.lockTarget.z - here.z);
    const facing = Math.atan2(forward.x, forward.z);
    return clamp(angleTo(facing, wanted) * T.lockTurnGain, -T.lockTurnMax, T.lockTurnMax);
  }
}

/**
 * One control step for the pair in the ring: both look, then both act.
 *
 * The ordering is the whole reason this is a function rather than four lines at
 * the call site. Observing a fighter after the other one has already moved this
 * step hands the second mind a half-step of foresight the first never gets --
 * small, invisible, systematic, and exactly the sort of thing that makes a
 * measured win rate mean something other than what it says. Session 06 reports
 * `duelist` against `swinger` as a distribution and swaps which side each is on
 * to cancel the arena; it should not also have to cancel this.
 *
 * Called once per solver substep from `scene.onBeforePhysicsObservable`, never
 * from the render loop. Babylon's accumulator takes several fixed steps per
 * rendered frame and notifies that observable before each; driving from the
 * render loop refreshes the keyframed anchors on only the first of them, and the
 * arm coasts through the rest.
 */
export function stepPair(left: Combatant, right: Combatant, dt: number, clock: number): void {
  stepControlledPair(left, right, dt, clock);
}
