import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import { PhysicsMotionType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin.js";
import type { PhysicsBody } from "@babylonjs/core/Physics/v2/physicsBody.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { GolemSetup } from "../bout.ts";
import { vitality as vitalityOf } from "../bout.ts";
import type { Striking } from "../combat.ts";
import { CONFIG } from "../config.ts";
import type { HumanDriverSource } from "../control-host.ts";
import type { Limb } from "../fighter.ts";
import type { WeaponKind } from "../hands.ts";
import { HANDS } from "../hands.ts";
import type {
  BodyView,
  EffectorView as PublishedEffector,
  FighterView,
  HandCursors,
  HandIntent,
  HandName,
  HandView,
  Intent,
  Mind,
  NaturalAttackView,
  NaturalIntent,
  ProjectileView,
} from "../mind.ts";
import { NEUTRAL } from "../mind.ts";
import { COLLIDES, LAYER, golemLayersFor, type Side } from "../physics.ts";
import { boxPart, type Part } from "../rig.ts";
import { armouredDamage } from "../scoring.ts";
import type { PhysicalSupportedLocomotionPort } from "../supported-locomotion-production.ts";
import type { StabilityEvent } from "../supported-locomotion-state.ts";
import type { StandableWorldRegistry } from "../supported-locomotion-runtime.ts";
import type { Combatant } from "../units.ts";
import {
  golemEffectorPlan,
  golemHead,
  golemLocomotion,
  golemTorso,
  golemUpperMassKg,
  type GolemEffectorOption,
} from "./build.ts";
import { GOLEM_ASSEMBLY } from "./config.ts";
import { GolemControlEndpoint } from "./golem-control.ts";
import { locomotionCommand, type BuiltLocomotion } from "./locomotion.ts";
import { golemMaterials, type GolemMaterialPalette } from "./materials.ts";
import {
  partArmour,
  type BuiltModule,
  type EffectorCapability,
  type GolemCapabilities,
  type GolemPart,
  type GolemSlot,
  type GolemSocket,
  type GolemView,
  type ModuleAxisEnvelope,
} from "./module.ts";
import { moduleDurability, type GolemModuleReport } from "./parts-bin.ts";
import { refreshGolemWear, seedGolemWear, type GolemWearTie } from "./wear.ts";
import type { BuiltTorso, TorsoCommand } from "./torso/torso.ts";

/**
 * A golem: five modules bolted together, driven through one `Intent`, and hittable.
 *
 * **What this file is, and what it deliberately is not.** Every module already knows how to be
 * built, commanded, stepped, measured and cut off; none of them knows what it is bolted to. This
 * is the thing that knows -- where the sockets are, which module fills which slot, whose command
 * channel goes where, what the whole body is worth and what happens when a piece of it comes off.
 * There is no physics in here that a module could have owned and no branch on which module is in a
 * slot: the assembly asks the registry's definitions and hands them sockets.
 *
 * ## Build order, and the one thing it settles
 *
 * Locomotion, then the torso on the locomotion root, then the head and the effectors on the
 * torso's own sockets. That order is forced rather than chosen, and forcing it answers the
 * question Session 05 stated and left open: **who owns the waist.**
 *
 * A joint can only be built by the module that has both bodies in hand, so it belongs to whichever
 * of the two is built second. The torso *must* be second, because it reads its mount's live
 * transform every substep to know where its own commanded pose is -- a torso bolted to a fixed
 * frame while the pelvis walked away would be the "arms lag the body" defect at its root. So the
 * torso owns the waist. It is also the right owner on the merits: the waist is the joint a person
 * turns with `Intent.posture`, the torso publishes its lean and twist on its own envelope and
 * view, and the locomotion module's waist exists only to carry a bench block that has no module of
 * its own. The biped's own rule -- a `DYNAMIC` mount is a load and gets a waist, an `ANIMATED` one
 * is a frame and is left alone -- already yields it, because the base frame below is `ANIMATED`.
 *
 * What the locomotion module gets in exchange is `carry`: the mass it is holding up and the body
 * the posture predicate's third signal is measured against. Two owners is two motors on one joint,
 * which this tree has already paid for; one owner and one declaration is what is here.
 *
 * ## The substep
 *
 * `stepControlledPair` runs `observe` on both bodies, then `beginControlStep`, then both drivers,
 * then the paired carrier resolution, then `afterLocomotion`. A golem's own halves hang off the
 * first and last of those: the root's velocity sample is refreshed in `observe`, which is the
 * first call of the substep, and the gait, the substep close-out and every upper module's `step`
 * run in `afterLocomotion`, which is the first moment the carrier has agreed where the golem is.
 * That is the order `BuiltLocomotion` states, and stepping the arms before it would drive them at
 * a shoulder the world had not yet placed.
 *
 * ## Reading the world
 *
 * `mesh.position` and `mesh.rotationQuaternion`, and nothing else. `getWorldMatrix()`
 * short-circuits on the render id and *reading* it stamps that id, which silently converts every
 * later reader in the frame -- a person at a console included -- into a reader of this sample.
 * Every golem body is a scene-root node and Havok writes those two fields at the end of every
 * solver step, so those two fields are the world transform.
 */

const UP = Object.freeze(new Vector3(0, 1, 0));
const clamp01 = (value: number): number => (value < 0 ? 0 : value > 1 ? 1 : value);

/** The ceiling a published axis declares, or zero when the module has no such axis. */
const axisCeiling = (axes: readonly ModuleAxisEnvelope[], id: string): number =>
  axes.find((axis) => axis.id === id)?.max ?? 0;

/** The narrowest thing this file needs from a module, so one list can hold all five. */
interface MountedModule {
  readonly parts: readonly GolemPart[];
  readonly strikers: readonly Striking[];
  step(dt: number): void;
  sever(): void;
  dispose(): void;
}

/** One module in one slot, with the limbs it registered and whether it has come off. */
interface AssembledModule {
  readonly slot: GolemSlot;
  readonly id: string;
  readonly built: MountedModule;
  readonly limbs: Limb[];
  severed: boolean;
  /**
   * What was left of this module at the instant a **blow** broke its socket, or null.
   *
   * Null until then, and null forever for a module that came off because the golem died -- the
   * carrier letting go is not a part being cut off. It is a snapshot rather than a reading taken
   * later because `sever` zeroes every one of the module's parts on its way past, so the facts the
   * loot rule reads stop existing one line after this is written. See `parts-bin.ts` for the rule
   * itself; what is recorded here is only what was true.
   */
  loot: { readonly durability: number; readonly intact: boolean } | null;
}

/** One effector socket: which module answers for it, and how the golem talks to it. */
interface MountedEffector {
  readonly option: GolemEffectorOption;
  readonly module: BuiltModule<HandIntent>;
  readonly socket: GolemSocket;
  /** Which hand channel drives it. For a mace this is `primary` in both sockets. */
  readonly driven: HandName;
}

export interface GolemOptions {
  readonly side: Side;
  readonly origin: Vector3;
  readonly facing: number;
  readonly setup: GolemSetup;
  readonly mind: Mind;
  readonly human?: HumanDriverSource;
  readonly controlPolicies: readonly { readonly name: string; readonly label: string }[];
  readonly controlPolicyName?: string;
  readonly controlPolicyFactory?: (name: string, seed?: number) => Mind;
  /** The shared world registry. A pair of golems must be handed exactly the same one. */
  readonly locomotionWorld?: StandableWorldRegistry;
}

/**
 * A readable label for a part, from the module id its own builder gave it.
 *
 * `left.golem.primary.fore` becomes "Primary fore". The verdict sentence lower-cases it -- "a cut
 * to the primary fore" -- which is why the words are anatomy rather than an id, and why the slot
 * is in front: a golem has two of most things and a banner naming one of them by a name it shares
 * with the other tells you nothing about which arm came off.
 */
const labelFor = (slot: GolemSlot, id: string): string => {
  const tail = id.split(".").pop() ?? id;
  const words = tail.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  const prefix = slot === "primary" || slot === "secondary" ? `${slot} ` : "";
  const whole = `${prefix}${words}`;
  return whole.charAt(0).toUpperCase() + whole.slice(1);
};

/**
 * A blank hand record, allocated once per hand per body and rewritten in place.
 *
 * Four per golem -- its own two and the two it can see -- exactly as a `Fighter` allocates them,
 * and for the same reason: `decide` runs 240 times a second per side and a view rebuilt per call
 * would be the largest allocator in the prototype.
 */
const blankHand = (outboard: number): HandView => ({
  weapon: "empty",
  shoulder: new Vector3(),
  tip: new Vector3(),
  tipSpeed: 0,
  tipVelocity: new Vector3(),
  reach: 0,
  lost: false,
  outboard,
});

const blankHands = (): Record<HandName, HandView> => ({
  primary: blankHand(1),
  secondary: blankHand(-1),
});

const blankBody = (): BodyView => ({
  unit: "golem",
  reach: 0,
  crownHeight: 0,
  vitalHeight: 0,
  collisionRadius: 0,
  naturalAttacks: Object.freeze({}),
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
});

export class Golem implements Combatant {
  readonly kind = "golem" as const;
  /** Not a humanoid, and it does not pretend to be one. See `Combatant.articulated`. */
  readonly articulated = null;
  /** A body a person drives with the same mouse. See `Combatant.humanDriver`. */
  readonly humanDriver: Golem = this;
  readonly side: Side;
  readonly control: GolemControlEndpoint;
  readonly locomotion: PhysicalSupportedLocomotionPort;
  readonly limbs: Limb[] = [];
  readonly strikers: Striking[] = [];
  readonly costume: AbstractMesh[] = [];
  readonly view: FighterView;
  lockTarget: Vector3 | null = null;

  private readonly materials: GolemMaterialPalette;
  private readonly base: Part;
  private readonly modules: AssembledModule[] = [];
  private readonly locomotionModule: BuiltLocomotion;
  private readonly torsoModule: BuiltTorso;
  private readonly headModule: BuiltModule<NaturalIntent>;
  /** Both sockets. For a two-socket terminal both entries are the same module. */
  private readonly effectors: Record<HandName, MountedEffector | null>;
  /** Each distinct effector module once, for commanding, stepping and disposal. */
  private readonly effectorModules: MountedEffector[] = [];
  private readonly byBody = new Map<PhysicsBody, Limb>();
  private readonly owned = new Set<AbstractMesh>();
  private readonly moduleOfLimb = new Map<Limb, AssembledModule>();
  private readonly occlusion: Vector3[] = [];
  /** Every shell's wear binding, tied to the limb whose health drives it. See `src/golem/wear.ts`. */
  private readonly wear: GolemWearTie[] = [];

  private readonly geometry: {
    readonly reach: number;
    readonly crownHeight: number;
    readonly vitalHeight: number;
    readonly collisionRadius: number;
  };

  private readonly natural: Record<string, NaturalAttackView> = {};
  private readonly ram: NaturalAttackView & { ready: boolean; active: boolean } | null;

  private readonly scratch = {
    feet: new Vector3(),
    centre: new Vector3(),
    socket: new Vector3(),
    kick: new Vector3(),
  };

  private dead = false;
  private fighting = true;

  constructor(scene: Scene, options: GolemOptions) {
    this.side = options.side;
    const setup = options.setup;
    const name = `${options.side}.golem`;
    const layers = golemLayersFor(options.side);
    // **`procedural-pbr`, so that wear is visible at all.** The salvaged damage-wear shader is what
    // draws a worn module -- cracks darkening below a health ratio of 0.75 and at their worst by
    // 0.10 -- and until this session nothing in the tree ever asked for the shader path, so the
    // plugin bound its uniforms into a define that was always off. `selectGolemSurfaceMode` is the
    // audit that falls back to `mapped-pbr` where the GLSL path, high precision or derivatives are
    // missing, and `bindForSubMesh` falls back again if the compile itself reduces -- so asking is
    // safe on a machine that cannot do it. Session 10, 2026-09-04.
    this.materials = golemMaterials(scene, options.side, "procedural-pbr");
    const facing = Quaternion.RotationAxis(UP, options.facing);

    const locomotionDefinition = golemLocomotion(setup.locomotion);
    const torsoDefinition = golemTorso(setup.torso);
    const headDefinition = golemHead(setup.head);
    if (!locomotionDefinition || !torsoDefinition || !headDefinition) {
      this.materials.dispose();
      throw new Error(`golem build names a module that is not assemblable: ${setup.locomotion}, ${setup.torso}, ${setup.head}`);
    }
    const plan = golemEffectorPlan(setup);

    // --- the base frame ---------------------------------------------------------------------
    //
    // The one body here that is not part of the golem. See `GOLEM_ASSEMBLY.baseSize` for why a
    // module with nothing above it still needs a mount, and why this one is `ANIMATED` on a
    // collision mask of zero.
    const standHeight = locomotionDefinition.heightRange.standM;
    const waist = new Vector3(options.origin.x, options.origin.y + standHeight, options.origin.z);
    const size = GOLEM_ASSEMBLY.baseSize;
    this.base = boxPart(scene, {
      name: `${name}.base`,
      position: waist.clone(),
      rotation: facing,
      size: new Vector3(size, size, size),
      mass: 0,
      layer: 0,
      collidesWith: 0,
      motionType: PhysicsMotionType.ANIMATED,
      visible: false,
    });

    const build = (socket: GolemSocket, suffix: string) => Object.freeze({
      scene,
      side: options.side,
      name: `${name}.${suffix}`,
      socket,
      layers,
      materials: this.materials,
      world: options.locomotionWorld,
    });

    // --- locomotion, then the torso on its root, then the head and both effectors -------------
    this.locomotionModule = locomotionDefinition.build(build(Object.freeze({
      slot: "locomotion" as GolemSlot,
      mount: this.base,
      local: Vector3.Zero(),
      world: waist.clone(),
      rotation: facing.clone(),
      outboard: 1,
    }), "legs"));
    this.locomotion = this.locomotionModule.port;
    this.register("locomotion", locomotionDefinition.id, this.locomotionModule);

    // The torso's socket, derived from where the root actually is rather than from a constant.
    // `local` is the waist point expressed in the root's own frame, which is the arithmetic every
    // module does to keep a socket right for a mount that turns -- and it means nothing here knows
    // how tall a pelvis is, so a wheel or a multileg root needs no change to this line.
    const root = this.locomotionModule.root;
    const rootInverse = (root.mesh.rotationQuaternion ?? Quaternion.Identity()).clone();
    rootInverse.conjugateInPlace();
    const waistLocal = waist.subtract(root.mesh.position);
    waistLocal.rotateByQuaternionToRef(rootInverse, waistLocal);
    this.torsoModule = torsoDefinition.build(build(Object.freeze({
      slot: "torso" as GolemSlot,
      mount: root,
      local: waistLocal,
      world: waist.clone(),
      rotation: (root.mesh.rotationQuaternion ?? Quaternion.Identity()).clone(),
      outboard: 1,
    }), "trunk"));
    this.register("torso", torsoDefinition.id, this.torsoModule);

    this.headModule = headDefinition.build(
      build(this.torsoModule.socket("head"), "head"));
    this.register("head", headDefinition.id, this.headModule);

    const primarySocket = this.torsoModule.socket("primary");
    const secondarySocket = this.torsoModule.socket("secondary");
    // **How a mace claims both sockets.** One module, built into the primary socket, handed the
    // secondary as its `companion`; `effectorModule` builds the second chain there, unmotorises
    // it, and holds the terminal to it with a plain constraint. `plan.secondary` is null in that
    // case, so nothing else is built and both hand records answer for the same module.
    const primaryModule = plan.primary.definition.build(Object.freeze({
      ...build(primarySocket, "primary"),
      companion: secondarySocket,
    }));
    // The one place a fitted second-hand module is a second-hand module: it is built exactly as a
    // new one is and then started at the durability the bin remembers, which is what makes the
    // shelf and the bin the same shelf. See `register`.
    this.register("primary", plan.primary.id, primaryModule, setup.primary.durability);
    const primary: MountedEffector = Object.freeze({
      option: plan.primary, module: primaryModule, socket: primarySocket, driven: "primary",
    });
    this.effectorModules.push(primary);
    let secondary: MountedEffector = primary;
    if (plan.secondary) {
      const secondaryModule = plan.secondary.definition.build(Object.freeze({
        ...build(secondarySocket, "secondary"),
        companion: primarySocket,
      }));
      this.register("secondary", plan.secondary.id, secondaryModule, setup.secondary.durability);
      secondary = Object.freeze({
        option: plan.secondary, module: secondaryModule, socket: secondarySocket,
        driven: "secondary" as HandName,
      });
      this.effectorModules.push(secondary);
    }
    this.effectors = { primary, secondary };

    // What the carrier is holding up. The torso's own head socket names the body the upper stack
    // hangs from, which is the honest answer to "what does the root carry" without this file
    // knowing that a torso's core is called a core.
    this.locomotionModule.carry?.({
      part: this.torsoModule.socket("head").mount,
      massKg: golemUpperMassKg(setup),
    });

    // --- limbs, vitality and what a pick may choose --------------------------------------------
    this.scaleVitality();
    const core = this.torsoModule.socket("head").mount;
    this.geometry = Object.freeze({
      reach: primaryModule.envelope().reach,
      crownHeight: standHeight + this.torsoModule.envelope().reach + this.headModule.envelope().reach,
      // Measured off the body rather than composed from constants: the core is where it is.
      vitalHeight: core.mesh.position.y - options.origin.y,
      collisionRadius: this.locomotionModule.footprint.radiusM,
    });
    this.occlusion.push(root.mesh.position, core.mesh.position);
    const headPart = this.modules.find((module) => module.slot === "head")?.built.parts;
    if (headPart && headPart.length > 1) this.occlusion.push(headPart[1].part.mesh.position);

    // A ram publishes a natural attack, because a golem's head is the one striker that is not on a
    // hand and `Intent.natural` is the channel a person presses it with. A plain head publishes
    // none, which is what an empty record means -- not "unknown", but "there is nothing here".
    this.ram = this.headModule.strikers.length > 0
      ? { reach: this.headModule.envelope().reach, ready: true, active: false }
      : null;
    if (this.ram) this.natural.ram = this.ram;

    // **The capabilities go on `self` and are written once.** Every number in them is fixed at
    // build -- an envelope is what a module can be asked for, not what it is doing -- so publishing
    // them per step would be 240 writes a second of a constant. What changes during a bout is
    // whether a module is still attached, and `HandView.lost` is where `describe` says that.
    const self = blankBody() as GolemView;
    self.capabilities = this.golemCapabilities();
    this.view = {
      self,
      opponent: blankBody(),
      projectiles: [],
      measure: Number.POSITIVE_INFINITY,
      clock: 0,
    };

    this.control = new GolemControlEndpoint({
      initialMind: options.mind,
      initialPolicyName: options.controlPolicyName,
      view: this.view,
      canStep: () => !this.dead && this.fighting,
      apply: (dt, intent) => this.applyIntent(dt, intent),
      stopBody: () => this.stopBody(),
      clearLocomotion: (reason) => this.locomotion.clear(reason),
      policies: options.controlPolicies,
      policyFactory: options.controlPolicyFactory,
      human: options.human,
      cursorSeed: () => this.cursorSeed(),
    });
  }

  // ------------------------------------------------------------------------------- assembly

  /**
   * File one module's parts as limbs.
   *
   * **A golem's parts carry their own vitality weights**, because `bout.ts`'s weight table throws
   * on an unknown key by design -- it is a Warrior's anatomy and a golem's part keys are not in
   * it. `PartState.vitalityWeight` is the escape hatch that already existed for exactly this, and
   * the centipede uses it too.
   *
   * The shells become pickable here and nowhere else. A shell carries no authority and never will
   * -- nothing in this file gives one a body, a shape or a constraint -- but a pick is how the
   * takeover ring finds a body under the cursor, and most module builders set `isPickable = false`
   * on their cosmetics because on the bench nothing picks anything. Choosing what a click may
   * choose is the assembly's business, which is why it is done once, here, on the meshes this
   * body then admits to owning.
   *
   * **`durability` is how a salvaged module arrives second-hand.** One number, applied once, in the
   * one place a golem's parts get their health: `maxHealth` is what the module declared and
   * `health` is that times the fraction the bin remembered. So a fitted blade at 0.62 is a blade
   * that has already taken 38 % of what it can take -- it wears through sooner, it lowers the whole
   * body's vitality bar by its own share, and it is drawn cracked from the first frame. Absent is
   * one, which is every module built new off the shelf and every module of every other slot.
   *
   * It is a **uniform** scale over the module's parts rather than a per-part record, and that is a
   * stated simplification: the bin holds "one of these, this worn" and nothing about which piece
   * the blow found. A per-part save would be a body description format, which is exactly what the
   * salvaged surface and material files were cut free of.
   */
  private register(slot: GolemSlot, id: string, built: MountedModule, durability = 1): void {
    const record: AssembledModule = { slot, id, built, limbs: [], severed: false, loot: null };
    const worn = Number.isFinite(durability) ? Math.max(0, Math.min(1, durability)) : 1;
    for (const part of built.parts) {
      const limb: Limb = {
        key: part.id,
        label: labelFor(slot, part.id),
        part: part.part,
        // A golem's severable unit is the module, not the piece: cutting through any of an arm
        // takes the arm off at the socket, exactly as the Warrior's `sever` drops a whole arm
        // whichever bone was struck. So no individual part owns an attachment constraint, and
        // `Golem.sever` breaks the module's own joints instead.
        attachment: null,
        health: part.health * worn,
        maxHealth: part.health,
        severed: false,
        lastHitAt: -999,
        vitalityWeight: part.vitalityWeight,
        fatal: part.fatal,
      };
      this.limbs.push(limb);
      record.limbs.push(limb);
      this.byBody.set(part.part.body, limb);
      this.moduleOfLimb.set(limb, record);
      for (const mesh of part.shell) {
        mesh.isPickable = true;
        this.costume.push(mesh);
        this.owned.add(mesh);
      }
      // Wear is seeded here for the same reason a pick is decided here: the shell passes through
      // this loop and nowhere else, and a module builder has no idea what it was fitted at.
      this.wear.push({ of: limb, bindings: seedGolemWear(slot, part.id, part.shell, worn) });
    }
    for (const striker of built.strikers) this.strikers.push(striker);
    this.modules.push(record);
  }

  /**
   * Turn the modules' declared vitality points into this body's own bar.
   *
   * The whole of `GOLEM_ASSEMBLY.vitalityTotal`'s argument is beside that number; what happens
   * here is the arithmetic. Declared weights are replaced rather than adjusted at every read,
   * because `PartState.vitalityWeight` is what `bout.ts` consumes and a scale applied at the
   * consumer would be a second copy of this rule living in a file that has no business holding an
   * opinion about golem anatomy.
   */
  private scaleVitality(): void {
    let points = 0;
    for (const limb of this.limbs) points += limb.vitalityWeight ?? 0;
    if (!(points > 0)) {
      throw new Error("a golem whose modules declare no vitality at all cannot be exhausted");
    }
    const scale = GOLEM_ASSEMBLY.vitalityTotal / points;
    for (const limb of this.limbs) {
      (limb as { vitalityWeight: number }).vitalityWeight = (limb.vitalityWeight ?? 0) * scale;
    }
  }

  // --------------------------------------------------------------------------- the control seam

  get mind(): Mind { return this.control.mind; }
  set mind(value: Mind) { this.control.installMind(value); }

  /** The whole `Intent`, narrowed onto five modules. Nothing here widens the command. */
  private applyIntent(dt: number, intent: Intent): void {
    const locomotion = locomotionCommand(intent);
    this.locomotionModule.command(locomotion);
    // **And the port, separately, because the pair path is what stages a request.** A module's
    // `command` is what the module keeps -- the crouch it drives and the request it hands its own
    // solo carrier -- and `stepControlledPair` never calls `request` for anybody: `Fighter.steer`
    // stages its own, and this is the golem's. A body that commanded only the module would walk on
    // a bench and stand perfectly still in a bout, which is the least visible way this could have
    // gone wrong.
    this.locomotion.request(locomotion.request);
    const posture: TorsoCommand = intent.posture;
    this.torsoModule.command(posture);
    this.headModule.command(intent.natural);
    for (const effector of this.effectorModules) {
      effector.module.command(intent[effector.driven]);
    }
    void dt;
  }

  /**
   * Where a person's cursor has to sit for this golem to be commanded into the pose it is in.
   *
   * Null when neither effector can answer -- both cut off -- which is the golem's version of the
   * Warrior's "the sword arm is off, so there is no pose to seed from". The body is still worth
   * taking, so the refusal is of the seed and not of the takeover.
   */
  private cursorSeed(): HandCursors | null {
    const seed: HandCursors = {
      primary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0 },
      secondary: { pointerX: 0, pointerY: 0, roll: 0, wristBend: 0 },
    };
    let found = false;
    for (const hand of HANDS) {
      const effector = this.effectors[hand];
      if (!effector) continue;
      const record = this.recordFor(effector.module);
      if (!record || record.severed) continue;
      const cursor = effector.module.cursor?.();
      if (!cursor) continue;
      seed[hand] = cursor;
      found = true;
    }
    return found ? seed : null;
  }

  /**
   * What a takeover has to seed from and measure against. See `DrivenPose` in `src/units.ts`.
   *
   * `command` is the primary effector's commanded business end **in the trunk's own frame**, which
   * is the same choice the Warrior's `handOffset` makes and for the same reason: a golem that is
   * walking is being translated and turned by its own carrier during the very step the reading
   * spans, and a world-space difference would fold that in and report a walk as a handover jump.
   */
  drivenPose(): {
    readonly cursors: HandCursors | null;
    readonly refusal: string | null;
    readonly command: { readonly x: number; readonly y: number; readonly z: number };
    readonly tip: Vector3;
  } {
    const cursors = this.cursorSeed();
    const effector = this.effectors.primary;
    const record = effector ? this.recordFor(effector.module) : null;
    const live = effector && record && !record.severed ? effector : null;
    const view = live ? live.module.view() : null;
    const command = { x: 0, y: 0, z: 0 };
    const tip = new Vector3();
    if (live && view) {
      const socket = live.socket;
      const mount = socket.mount.mesh;
      const inverse = (mount.rotationQuaternion ?? Quaternion.Identity()).clone();
      inverse.conjugateInPlace();
      const offset = view.commandedTip.subtract(this.socketWorld(socket, new Vector3()));
      offset.rotateByQuaternionToRef(inverse, offset);
      command.x = offset.x;
      command.y = offset.y;
      command.z = offset.z;
      tip.copyFrom(view.tip);
    } else {
      tip.copyFrom(this.centre());
    }
    return Object.freeze({
      cursors,
      refusal: cursors
        ? null
        : "both effectors are off, so there is no pose to seed from",
      command: Object.freeze(command),
      tip,
    });
  }

  /** The body an overhead camera sits behind: the carrier root, which is what turns. */
  chaseRoot(): AbstractMesh { return this.locomotionModule.root.mesh; }

  /**
   * One effector socket's own publication, or null when nothing answers for it.
   *
   * The module contract's `EffectorView` rather than the view a mind is shown, and the difference
   * is the point: `BodyView.hands` carries what a *policy* needs and this carries what an
   * *instrument* needs -- the anchor, the stray from it, the stroke phase, the edge and the
   * trailing grip. `AGENTS.md` says to measure a driven limb against its own anchor before
   * believing anything about its pose, and this is the only place that number exists on an
   * assembled body. Read by `tests/golem-arena.test.mjs` and by anything that draws the golem.
   */
  effectorView(hand: HandName): ReturnType<BuiltModule<HandIntent>["view"]> {
    return this.effectors[hand]?.module.view() ?? null;
  }

  /**
   * What one effector socket can be asked for, or null when nothing answers for it.
   *
   * Frozen rule 3 in the overview: the module publishes what it can reach, and the mouse mapping
   * and the mind both pick inside it, so a controller never receives an unreachable target and
   * never needs a refusal branch for one. `FighterView` carries no envelope -- it is a view of the
   * *world*, and what a limb can do is a fact about the limb -- so this is where a mind reaches for
   * it, and the reason it exists before there is a mind to read it is the one thing an envelope has
   * to be able to say out loud.
   *
   * **A mace pins the swing.** `TERMINAL_MACE.limits` states `swingMin = swingMax = 0`, the chain
   * folds it into its own limits before it publishes anything, and the `ReachEnvelope` that comes
   * back therefore reports an azimuth range of exactly zero. A golem carrying one **cannot turn
   * its weapon with its arm** and has to turn with the torso's twist or the carrier's yaw. That is
   * a fact about the body a mind must read rather than discover, which is why it is asserted in
   * `tests/golem-arena.test.mjs` rather than left in a comment.
   */
  effectorEnvelope(hand: HandName): ReturnType<BuiltModule<HandIntent>["envelope"]> | null {
    return this.effectors[hand]?.module.envelope() ?? null;
  }

  /**
   * The same envelopes, narrowed onto the questions a mind asks, and published on `self`.
   *
   * **This is the answer to "should the envelope be on the view".** `Mind.decide` is handed a
   * `FighterView` and nothing else -- that is the one seam, and a policy that could reach for the
   * body would be a policy that could pose a limb -- so a mind that had to ask `effectorEnvelope`
   * could not exist without widening the seam. Frozen rule 3 says the module publishes what it can
   * reach and the mind picks inside it, and this is where "publishes" happens for an assembled body.
   *
   * **Self only, and never into an opponent's record.** A body knows what its own limbs can do and
   * cannot see the inside of somebody else's; what a mind is entitled to know about the thing in
   * front of it is where it is, how fast it is going, how far its arms go and what is on the end of
   * them, and `BodyView.reach` and `HandView.weapon` already publish all four for every unit. So
   * `describe` is untouched, no Warrior's view gains a key, and a golem looking at a golem sees
   * exactly what a Warrior looking at one sees.
   *
   * `rollMax` and `bendMax` are read out of the published axes by id, which is the same idiom
   * `normalisedAxis` below already uses for the trunk's lean and twist: an axis id is part of the
   * envelope's own vocabulary, and a chain that has no such axis simply has no entry and answers
   * zero. That is how a mace arrives as "there is nothing here to turn" rather than as a special
   * case for a module id.
   */
  private golemCapabilities(): GolemCapabilities {
    const effector = (hand: HandName): EffectorCapability => {
      const envelope = this.effectors[hand]?.module.envelope() ?? null;
      return Object.freeze({
        strokes: envelope ? envelope.strokes : [],
        reachable: envelope ? envelope.reachable : null,
        rollMax: envelope ? Math.max(0, axisCeiling(envelope.axes, "roll")) : 0,
        bendMax: envelope ? Math.max(0, axisCeiling(envelope.axes, "bend")) : 0,
      });
    };
    const range = this.locomotionModule.heightRange;
    return Object.freeze({
      effectors: Object.freeze({ primary: effector("primary"), secondary: effector("secondary") }),
      trunkTwistMax: Math.max(0, axisCeiling(this.torsoModule.envelope().axes, "twist")),
      crouchTravel: Math.max(0, range.standM - range.crouchM),
    });
  }

  /** The locomotion module's own instrument, for a harness that wants the walk rather than the arm. */
  locomotionEvidence(): ReturnType<BuiltLocomotion["evidence"]> {
    return this.locomotionModule.evidence();
  }

  locomotionReadout(): ReturnType<BuiltLocomotion["readout"]> {
    return this.locomotionModule.readout();
  }

  /**
   * The two live numbers the readout draws, from the primary effector.
   *
   * `edgeAlignment` is null-safe by construction: `EffectorView.edge` is null for anything whose
   * bite is not an edge, and a number reported for a plate's alignment would mean nothing while
   * looking exactly like a number that means something. Zero is what the gauge draws for "there is
   * no edge here", which is the same thing it draws for a Warrior holding nothing.
   */
  strikeReadout(): { readonly tipSpeed: number; readonly edgeAlignment: number } {
    const record = this.view.self.hands.primary;
    const view = this.effectors.primary?.module.view() ?? null;
    const edge = view?.edge ?? null;
    const speed = record.tipSpeed;
    if (!edge || speed < 0.4) return { tipSpeed: speed, edgeAlignment: 0 };
    const alignment = Math.abs(Vector3.Dot(
      record.tipVelocity.scale(1 / speed), edge,
    ));
    return { tipSpeed: speed, edgeAlignment: alignment };
  }

  private recordFor(built: MountedModule): AssembledModule | null {
    return this.modules.find((module) => module.built === built) ?? null;
  }

  // --------------------------------------------------------------------------------- the substep

  /**
   * Republish what this golem can see, and refresh the root's velocity sample.
   *
   * `stepControlledPair` calls this first, once per body per substep, which is why the root's
   * once-a-substep sample lives here: the port reads the root from `beginControlStep` onward, and
   * `getLinearVelocityToRef` crosses the plugin boundary at 216 B a call. A caller that skipped it
   * would drive the pair off a velocity a substep old.
   */
  observe(opponent: {
    describe(into: BodyView): void;
    nearestPartTo(point: Vector3): number;
    publishProjectiles(into: ProjectileView[], at: number, owner: "self" | "opponent"): number;
  }, clock: number): void {
    this.locomotionModule.beginSubstep();
    this.describe(this.view.self);
    opponent.describe(this.view.opponent);
    this.view.measure = opponent.nearestPartTo(this.view.self.shoulder);
    this.view.clock = clock;
    this.view.projectiles.length =
      opponent.publishProjectiles(this.view.projectiles, 0, "opponent");
  }

  /**
   * The half of a substep that has to run after both carriers are resolved.
   *
   * The gait and the substep close-out because `BuiltLocomotion` says so, and **every upper
   * module's `step` too**, which is this session's own addition to that ordering. A torso, a head
   * and an arm all compute their commanded points from their mount's live transform, and the mount
   * chain ends at a root the pair resolution has just placed. Stepping them before it would drive
   * every one of them at where the golem was a substep ago -- which is the arms-lag-the-body
   * defect arriving through scheduling rather than through arithmetic.
   */
  afterLocomotion(dt: number): void {
    this.locomotionModule.gait(dt);
    this.locomotionModule.endSubstep(dt);
    this.torsoModule.step(dt);
    this.headModule.step(dt);
    for (const effector of this.effectorModules) effector.module.step(dt);
    if (this.ram) {
      const stroke = this.headModule.view()?.stroke ?? "idle";
      this.ram.ready = stroke === "idle";
      this.ram.active = stroke === "drive";
    }
    // Presentation, once per substep, and it feeds nothing: the shader reads a health ratio this
    // body already publishes on `BodyView.health`, and no rule anywhere reads it back.
    refreshGolemWear(this.wear);
    if (this.vitality <= 0) this.die();
  }

  /** Compatibility with the direct harnesses, which drive a body rather than a pair. */
  update(dt: number): void {
    this.control.driver.step(dt);
  }

  // ------------------------------------------------------------------------------- what it is

  get alive(): boolean { return !this.dead; }
  get vitality(): number { return vitalityOf(this.limbs); }

  feetPosition(): Vector3 {
    const root = this.locomotionModule.root.mesh.position;
    return this.scratch.feet.set(root.x, 0, root.z);
  }

  centre(): Vector3 {
    return this.scratch.centre.copyFrom(this.torsoModule.socket("head").mount.mesh.position);
  }

  aimPoint(): Vector3 {
    const view = this.effectors.primary?.module.view();
    return view ? view.commandedTip : this.centre();
  }

  owns(mesh: AbstractMesh): boolean { return this.owned.has(mesh); }
  limbFor(body: PhysicsBody): Limb | undefined { return this.byBody.get(body); }
  occlusionPoints(): readonly Vector3[] { return this.occlusion; }

  /**
   * A golem has no guard that is not also a part of it, so nothing here is a parry.
   *
   * A held shield is a separate object a fighter interposes and `Combat` files as a block; a
   * golem's plate is a **module**, with health, a vitality weight and a socket joint that can be
   * broken. So a blade stopped by a plate is a wound to the plate, which is the "weapons are body
   * parts" rule taken to its conclusion and is why a plate wears out. Null rather than a body,
   * exactly as the centipede answers, because there is no third thing to name.
   */
  parriedBy(): { readonly kind: WeaponKind } | null { return null; }

  /** A golem looses nothing; hand the cursor back rather than truncating the other body's. */
  publishProjectiles(_into: ProjectileView[], at: number): number { return at; }
  stepProjectiles(): void { /* nothing of a golem's is ever in the air */ }

  queueStabilityEvent(event: StabilityEvent): void {
    this.locomotion.queueStabilityEvent(event);
  }

  nearestPartTo(point: Vector3): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const limb of this.limbs) {
      if (limb.severed) continue;
      const distance = Vector3.Distance(point, limb.part.mesh.position);
      if (distance < nearest) nearest = distance;
    }
    return nearest;
  }

  // -------------------------------------------------------------------------------- publication

  describe(into: BodyView): void {
    into.unit = this.kind;
    into.reach = this.geometry.reach;
    into.crownHeight = this.geometry.crownHeight;
    into.vitalHeight = this.geometry.vitalHeight;
    into.collisionRadius = this.geometry.collisionRadius;
    into.naturalAttacks = this.natural;

    const root = this.locomotionModule.root.mesh;
    const here = root.position;
    into.ground.set(here.x, 0, here.z);
    const spin = root.rotationQuaternion;
    if (spin) {
      // `(0, 0, 1)` turned by the quaternion, written out rather than composed through a `Matrix`
      // -- the heading convention every body here uses, zero down +Z turning toward +X.
      const fx = 2 * (spin.x * spin.z + spin.w * spin.y);
      const fz = 1 - 2 * (spin.x * spin.x + spin.y * spin.y);
      into.facing = Math.atan2(fx, fz);
    } else {
      into.facing = 0;
    }

    const evidence = this.locomotionModule.evidence();
    const range = this.locomotionModule.heightRange;
    const span = range.standM - range.crouchM;
    into.crouch = span > 1e-6 ? clamp01((range.standM - evidence.heightM) / span) : 0;
    const trunk = this.torsoModule.view();
    const axes = trunk ? trunk.axes : [];
    const envelope = this.torsoModule.envelope().axes;
    into.trunkLean = this.normalisedAxis(axes, envelope, "lean");
    into.trunkTwist = this.normalisedAxis(axes, envelope, "twist");

    for (const hand of HANDS) {
      const record = into.hands[hand];
      const effector = this.effectors[hand];
      const module = effector ? this.recordFor(effector.module) : null;
      const lost = !effector || !module || module.severed;
      record.weapon = effector ? effector.option.weapon : "empty";
      record.lost = lost;
      record.outboard = effector ? effector.socket.outboard : hand === "primary" ? 1 : -1;
      record.reach = effector ? effector.module.envelope().reach : 0;
      if (effector) this.socketWorld(effector.socket, record.shoulder);
      const view = effector ? effector.module.view() : null;
      if (view) record.tip.copyFrom(view.tip);
      else record.tip.copyFrom(here);
      // One boundary read per live effector: the striker's own `velocityAt` asks Havok for a
      // linear and an angular velocity, and both cross the plugin boundary at 216 and 184 bytes a
      // call. A severed module is not asked at all -- a limb lying on the floor is not arriving
      // anywhere -- which is the same rule `describeFighter` applies to a dropped sword.
      const striker = !lost && effector ? effector.module.strikers[0] : null;
      if (striker && view) {
        record.tipVelocity.copyFrom(striker.velocityAt(view.tip));
        record.tipSpeed = record.tipVelocity.length();
      } else {
        record.tipVelocity.setAll(0);
        record.tipSpeed = 0;
      }
    }

    const lead = into.hands.primary;
    into.shoulder.copyFrom(lead.shoulder);
    into.tip.copyFrom(lead.tip);
    into.tipSpeed = lead.tipSpeed;
    into.effectors = this.publishedEffectors(into);
    into.vitality = this.vitality;
    for (const limb of this.limbs) {
      into.health[limb.key] = limb.severed ? 0 : Math.max(0, limb.health / limb.maxHealth);
    }
  }

  /**
   * The mounted-striker publication `BodyView.effectors` already existed for.
   *
   * It is the field a construct filled and the option layer reads -- `actionCoverAt` and the
   * tactic that picks a threat both walk it -- so a golem fills it rather than inventing a second
   * list. The records are the hand records themselves, which is not a shortcut: a golem's
   * effectors *are* its hands, and publishing a second copy of the same two would be two
   * descriptions of one arm that could disagree about which way it was pointing.
   */
  private publishedEffectors(into: BodyView): readonly PublishedEffector[] {
    return HANDS.map((hand) => {
      const record = into.hands[hand];
      const view = this.effectors[hand]?.module.view() ?? null;
      return {
        weapon: record.weapon,
        anchor: view?.anchor ?? record.shoulder,
        tip: record.tip,
        tipVelocity: record.tipVelocity,
        reach: record.reach,
        lost: record.lost,
      };
    });
  }

  /** One published axis, normalized to its own envelope, or zero when the module has no such axis. */
  private normalisedAxis(
    axes: readonly { readonly id: string; readonly commanded: number; readonly achieved: number }[],
    envelope: readonly { readonly id: string; readonly min: number; readonly max: number }[],
    id: string,
  ): number {
    const axis = axes.find((entry) => entry.id === id);
    const limits = envelope.find((entry) => entry.id === id);
    if (!axis || !limits) return 0;
    const span = Math.max(Math.abs(limits.min), Math.abs(limits.max));
    return span > 1e-6 ? Math.max(-1, Math.min(1, axis.achieved / span)) : 0;
  }

  /** Where a socket is now, world, into a ref the caller owns. */
  private socketWorld(socket: GolemSocket, into: Vector3): Vector3 {
    socket.local.rotateByQuaternionToRef(
      socket.mount.mesh.rotationQuaternion ?? Quaternion.Identity(), this.scratch.socket,
    );
    return into.copyFrom(this.scratch.socket).addInPlace(socket.mount.mesh.position);
  }

  // ------------------------------------------------------------------------------------- damage

  /**
   * Armour, and the subtraction.
   *
   * `Combat` leaves the subtraction to a body that implements this -- `if (!this.target.applyDamage)
   * limb.health -= damage` -- so a body that takes the seam takes the whole of it. The rule itself
   * is `armouredDamage` in `src/scoring.ts`, pure and beside the rest of the damage model, and the
   * armour fraction is a number on the part. There is no branch here for which torso is fitted.
   */
  applyDamage(target: Limb, rawDamage: number): number {
    const armour = this.armourOf(target);
    const applied = armouredDamage(rawDamage, armour);
    target.health -= applied;
    return applied;
  }

  private armourOf(limb: Limb): number {
    for (const module of this.modules) {
      for (const part of module.built.parts) {
        if (part.id === limb.key) return partArmour(part);
      }
    }
    return 0;
  }

  /**
   * Severing a module is breaking its socket joint.
   *
   * **The module is the severable unit and the piece struck is not.** Cutting through a golem's
   * forearm takes the whole arm off at the shoulder, which is the Warrior's own rule -- "losing any
   * piece of an arm drops that whole arm, anchors and all" -- restated for a body whose arm is a
   * module. So the socket joint's health is the health of whatever piece of the module the blow
   * found, and when a piece goes the subtree detaches with its shell.
   *
   * What that leaves on the floor is real physics: every part of the module re-layers onto
   * `DEBRIS` **on its own leaf shape** (a container's mask is a no-op Havok ignores and reads back
   * as garbage), its terminal stops scoring so a blade lying on the ground cuts nobody, and its
   * drives let go, because a motor still hauling a chain that has come off is the haunting the
   * Warrior's anchors produce.
   *
   * **A golem does not bleed.** Nothing here calls the blood system: `src/blood.ts` reads the
   * combat log and decides for itself, and what a stone body should throw off -- dust, chips,
   * nothing at all -- is a decision for somebody looking at it rather than a call from the sever
   * path.
   */
  sever(limb: Limb, direction: Vector3): void {
    const module = this.moduleOfLimb.get(limb);
    if (!module || module.severed) return;
    // **Before the zeroing, because the zeroing destroys what the loot rule reads.** `severs` in
    // `src/scoring.ts` refuses to sever a piece whose health is still above zero, so the struck
    // piece is always down by the time this runs -- which is why "intact" is every part *but* that
    // one. A module with a second piece already at zero was cut to pieces rather than cut off, and
    // is debris. Recorded here rather than inferred later because this is the sever itself: a
    // reading taken from the outside would be inferring an event from a side effect.
    module.loot = Object.freeze({
      durability: moduleDurability(module.limbs),
      intact: module.limbs.every((part) => part === limb || part.health > 0),
    });
    module.severed = true;
    for (const part of module.limbs) {
      part.severed = true;
      part.health = 0;
      // On the leaf. Every golem part is a single box, capsule or sphere and never a container,
      // which is what makes this one line correct rather than a write nothing consults.
      part.part.shape.filterMembershipMask = LAYER.DEBRIS;
      part.part.shape.filterCollideMask = COLLIDES.DEBRIS;
    }
    // The module's own `sever` is what breaks the joints and stops the strikers; this file decides
    // *that* it happens and the module decides *how*, because which joint holds a wrist on is the
    // wrist's business.
    module.built.sever();

    const kick = this.scratch.kick.copyFrom(direction);
    if (kick.lengthSquared() > 1e-9) {
      kick.normalize().scaleInPlace(CONFIG.combat.severKick);
      limb.part.body.applyImpulse(kick, limb.part.body.getObjectCenterWorld());
    }

    // The two fatal slots. A head is fatal because the module says so and a pelvis because the
    // locomotion module does; `beaten()` reads the same two flags off the parts, so this is the
    // *body's* half of the rule and not a second copy of it -- what happens here is that the golem
    // stops being driven, and what happens there is that the bout ends.
    if (module.limbs.some((part) => part.fatal === true)) this.die();
  }

  /**
   * What each of this golem's five modules is worth, for the verdict to read.
   *
   * The one accessor Session 10 added to this file, and it is deliberately one rather than two:
   * `AssembledModule` is private, so a verdict that wants to know what came off has to be handed
   * something -- and the same call answers the other half, which is how worn a module *still on the
   * body* is, because a module fitted from the parts bin has to carry its remaining durability back
   * into the bin when the bout ends. Two accessors would have been the same walk twice.
   *
   * It publishes facts and applies no rule. Whether a severed module is loot is
   * `partsBinLoot` in `src/golem/parts-bin.ts`, which is pure, has no Babylon in its graph, and can
   * therefore be argued with.
   */
  moduleReport(): readonly GolemModuleReport[] {
    return Object.freeze(this.modules.map((module) => Object.freeze({
      slot: module.slot,
      id: module.id,
      severed: module.severed,
      // A severed module's durability is the snapshot; a live one's is read now. There is no third
      // case: `sever` records before it zeroes, and nothing else changes `loot`.
      durability: module.loot ? module.loot.durability : moduleDurability(module.limbs),
      severedIntact: module.severed && module.loot !== null && module.loot.intact,
    })));
  }

  // -------------------------------------------------------------------------------- end of life

  stopFighting(): void { this.control.stopFighting(); }

  private stopBody(): void {
    if (!this.fighting) return;
    this.fighting = false;
    // One neutral command, so the modules hold a pose that was chosen rather than whatever the
    // last driver happened to leave standing. `stopFighting` stops the driver, so nothing will
    // command them again.
    this.applyIntent(0, NEUTRAL);
  }

  /**
   * Stop being a golem.
   *
   * The carrier goes, which for a stone body is the honest end: the root becomes an ordinary
   * dynamic body, the legs' drives let go, and the assembly comes apart under its own weight
   * rather than standing decapitated. A Warrior crumples because a corpse has joints with no
   * strength in them; a golem is not soft enough to crumple, so it falls to pieces instead, and
   * `docs/design.md` records that as a decision rather than as an accident of implementation.
   */
  private die(): void {
    if (this.dead) return;
    this.dead = true;
    this.fighting = false;
    const legs = this.modules.find((module) => module.slot === "locomotion");
    if (legs && !legs.severed) {
      legs.severed = true;
      legs.built.sever();
    }
  }

  dispose(): void {
    this.control.dispose();
    this.locomotion.dispose();
    // Effectors first, then the head, then the torso, then the legs, then the base: a module's
    // welds are anchored into the module below it, and disposing the lower body first would leave
    // a constraint pointing at a freed Havok body. `PhysicsBody.dispose` walks straight past
    // whatever is constraining it.
    for (const effector of this.effectorModules) effector.module.dispose();
    this.headModule.dispose();
    this.torsoModule.dispose();
    this.locomotionModule.dispose();
    this.base.body.dispose();
    this.base.shape.dispose();
    this.base.mesh.dispose(false, false);
    this.materials.dispose();
    this.limbs.length = 0;
    this.strikers.length = 0;
    this.costume.length = 0;
    this.modules.length = 0;
    this.effectorModules.length = 0;
    this.occlusion.length = 0;
    this.wear.length = 0;
    this.byBody.clear();
    this.owned.clear();
    this.moduleOfLimb.clear();
  }
}
