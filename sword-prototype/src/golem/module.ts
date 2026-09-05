import { Matrix, Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh.js";
import type { Scene } from "@babylonjs/core/scene.js";

import type { Striking } from "../combat.ts";
import type { HandIntent, HandName } from "../mind.ts";
import type { Side } from "../physics.ts";
import type { Part } from "../rig.ts";
import type { GolemMaterialPalette } from "./materials.ts";

/**
 * The golem module contract: what every slot's option has to be, in one file.
 *
 * A golem is a fixed body plan of five slots, each filled by one pre-made module. This is the
 * contract those modules implement, and it lands here unchanged for every later session --
 * chains and terminals (03, 04), locomotion (05, 06), torso and head (07).
 *
 * **Explicit `.ts` on every intra-directory import.** `scripts/golem-bench.mjs` and
 * `tests/golem-bench.test.mjs` load this graph directly under Node, which strips types rather
 * than compiling them, and Node's ESM resolver insists on the extension where Vite does not
 * care. The same rule bans TypeScript parameter properties from anything in this graph; see
 * `AGENTS.md`.
 */

/** The five slots of the fixed body plan. */
export type GolemSlot = "locomotion" | "torso" | "primary" | "secondary" | "head";

/**
 * The two effector sockets, which are exactly the two hand names.
 *
 * Not a coincidence and not worth a second vocabulary: `Intent` splits a person's command into
 * `primary` and `secondary` hand channels, so an effector in the `primary` slot reads
 * `intent.primary`, and the slot name *is* the channel name. `effectorSlot` is the narrowing.
 */
export const EFFECTOR_SLOTS: readonly GolemSlot[] = ["primary", "secondary"];

export const effectorSlot = (slot: GolemSlot): HandName | null =>
  slot === "primary" || slot === "secondary" ? slot : null;

/**
 * The chain ladder, as the overview freezes it.
 *
 * This union is the *design*, not the built set: rungs 2 and 3 are Session 03's and are named
 * here so that a registry entry for one of them is a spelling this file already knows. What is
 * actually offered on the bench is derived from the registry's own records -- see
 * `registry.ts` -- so there is no id anywhere in the system without a builder behind it.
 */
export type ChainId = "none" | "pitch" | "reach" | "wrist";

/** The terminal shelf. `blade` is built in Session 02; the other three are Session 04's. */
export type TerminalId = "blade" | "plate" | "mace" | "whip";

/**
 * One severable piece of a module.
 *
 * `part` is `rig.ts`'s pairing of a mesh, a body and its collider leaf rather than a second
 * copy of those three fields, which also means the collider named here is the leaf Havok
 * actually filters on. The shell is separate and carries no authority: cosmetics decide no hit
 * (house rule), so a shell mesh has no body and may be absent entirely.
 */
export interface GolemPart {
  readonly id: string;
  readonly part: Part;
  readonly shell: readonly AbstractMesh[];
  readonly health: number;
  readonly vitalityWeight: number;
  /** Whether losing this piece ends the golem. No effector part is. */
  readonly fatal: boolean;
}

/** One driven axis, in the module's own terms. */
export interface ModuleAxisEnvelope {
  readonly id: string;
  readonly unit: "rad" | "m";
  readonly min: number;
  readonly max: number;
  /**
   * The ceiling on how fast the *command* may move, per second.
   *
   * Published rather than kept private because it is one of the three things that decide
   * whether a driven limb reads as a limb or as a robot arm -- the other two being the torque
   * cap and the stroke shape -- and because a mind picking inside the envelope has to know how
   * fast the envelope's own point of view can move.
   */
  readonly rate: number;
}

/**
 * A stroke a module can run, as a capability rather than as a button.
 *
 * Published on the envelope so Session 09's mind picks by capability instead of by chain id --
 * "can this effector cut" is a question about the module, and a mind that answered it by
 * switching on `ChainId` would be a second copy of the ladder living outside the registry.
 *
 * `cover` is in the list and is deliberately **not** an `EffectorStroke` phase: covering is a
 * held pose, so it is a level rather than an edge (the rule `src/buttons.ts` states), and a
 * chain running it reports `idle`. The two enumerations are therefore about different things --
 * what a module can be asked for, and which phase of a velocity event it is in -- and collapsing
 * them would put a level into a state machine that only understands edges.
 */
export type EffectorStrokeKind = "thrust" | "cut" | "cover";

/**
 * The clamped sphere-shell an effector's target lives in, in its own socket's frame.
 *
 * Frozen rule 3 says a command lives inside the envelope and that the mapping clamps **before
 * the anchor ever sees a target**, so this is the shape the clamp clamps to and not a guard that
 * runs after one. It is published because two readers need it and neither can derive it: the
 * bench overlay draws it, and Session 09's mind picks inside it.
 *
 * **Outboard-signed, so one description serves both sockets.** `swing` is the azimuth multiplied
 * by the socket's own `outboard`, so positive is always *away from the golem* whichever side the
 * module is bolted to. The mirroring trap this avoids is a recorded one: the stroke geometry in
 * `policies.ts` is written for a right arm and has to be mirrored for the other, and getting a
 * sign backwards there does not look like a hand held wrong, it looks like an arm coming apart.
 *
 * `carryMin` is the minimum outboard carry, measured from the socket rather than from the
 * golem's centreline so that the whole record stays socket-relative like everything else here.
 * It is negative when the target may be carried inboard of its own socket, and the module picks
 * it so that the shortfall is less than the socket's own stand-off -- which is what makes "hand
 * across the sternum" not a pose a controller refuses but a pose that is not in the envelope.
 */
export interface ReachEnvelope {
  /** Closest the business end may be commanded to the socket, metres. */
  readonly reachMin: number;
  /** Furthest, metres. Strictly inside the chain's own full extension. */
  readonly reachMax: number;
  /** Outboard-signed azimuth limits, radians. Negative is across the body. */
  readonly swingMin: number;
  readonly swingMax: number;
  /** Elevation limits, radians. Negative is below the socket. */
  readonly liftMin: number;
  readonly liftMax: number;
  /**
   * The least outboard offset from the socket the target may have, metres.
   *
   * Negative: the target may come this far inboard of its own socket and no further.
   */
  readonly carryMin: number;
}

/**
 * What a module can reach, published so that the mouse mapping and a mind both pick inside it.
 *
 * Frozen rule 3: a controller never receives an unreachable target and never needs a refusal
 * branch for one.
 */
export interface ModuleEnvelope {
  readonly axes: readonly ModuleAxisEnvelope[];
  /** How far the business end travels from the socket at full extension, metres. */
  readonly reach: number;
  /** Which strokes this module can be asked for. Empty for a module that has none. */
  readonly strokes: readonly EffectorStrokeKind[];
  /** The reachable set, for a module whose command is a point; null for every other. */
  readonly reachable: ReachEnvelope | null;
  /**
   * How close the first published axis has to be to its command to count as arrived, in that
   * axis's own unit.
   *
   * On the envelope rather than in the instrument because it is a property of the *module*: rung
   * 1's first axis is an angle and rungs 2 and 3's is a distance, so one constant serving both
   * would be a number whose unit depends on which option happens to be on the stand. Both
   * harnesses build their `BenchReadout` from this.
   */
  readonly settledBand: number;
}

/** Which phase of a stroke a chain is in. A chain with no stroke is always `idle`. */
export type EffectorStroke = "idle" | "drive" | "follow";

export interface EffectorAxisView {
  readonly id: string;
  readonly commanded: number;
  readonly achieved: number;
}

/**
 * What an effector publishes each control step.
 *
 * **Read `mesh.position` and `mesh.rotationQuaternion` and nothing else.** `getWorldMatrix()`
 * short-circuits on the render id, and *reading* it stamps that id, silently converting every
 * later reader in the frame into a reader of the first sample -- a defect that has cost three
 * separate sessions here and produced a clean nine per cent phantom regression. Havok's
 * `syncTransform` writes those two fields at the end of every solver step, and every body in a
 * golem module is a scene-root node, so those two fields *are* the world transform.
 * `Fighter.observe` is built the same way and `tests/view.test.mjs` pins it.
 *
 * Every object here is allocated once at build and mutated in place: this is published at
 * 240 Hz.
 */
export interface EffectorView {
  readonly slot: GolemSlot;
  /** Where the business end is. */
  readonly tip: Vector3;
  /** Where the business end is being asked to be. */
  readonly commandedTip: Vector3;
  readonly axes: readonly EffectorAxisView[];
  readonly stroke: EffectorStroke;
  /**
   * Where the chain's own anchor has got to, or null for a chain with no anchor.
   *
   * A field on the view rather than an overlay reaching into a chain, which is the seam Session
   * 02 asked for when it noted that `AnchorDrive` builds an invisible massless sphere and
   * nothing in the module contract published it. The overlay draws this beside the commanded
   * and achieved tips, so a limb hanging behind its own anchor is visible rather than merely
   * measured.
   */
  readonly anchor: Vector3 | null;
  /**
   * How far the driven body is from its own anchor, metres, or null for a chain with no
   * anchor.
   *
   * Null for both of Session 02's chains, which is why it is nullable rather than absent: rung
   * 0 has no drive at all and rung 1 drives a hinge motor directly. Session 03's `reach` and
   * `wrist` chains drive an `AnchorDrive` and fill it, and a driven limb that is not within a
   * few millimetres of its own anchor is not posed wrongly, it is stuck on something -- which
   * is the reading `AGENTS.md` says to take first.
   */
  readonly anchorStray: number | null;
  /**
   * Which way the terminal's edge faces, or null when what is on the end has no edge.
   *
   * `src/scoring.ts` multiplies the *signed* alignment of this against the contact velocity, so
   * on the ladder it is the number that becomes controllable the moment a chain grows a roll
   * axis -- rung 3 and no earlier. Null for rung 0's capped socket, whose bite is mass: an
   * alignment reported for something with no edge is a number that means nothing, and the
   * readout says "n/a" rather than printing one.
   */
  readonly edge: Vector3 | null;
  /**
   * How far a **trailing** grip is from the point of the terminal it grips, metres, or null
   * for a terminal that claims one socket.
   *
   * The mace's own reading, and the honest signature of the arrangement the club's measured
   * lesson forces: two position motors on one rigid body fight, so the second socket's chain
   * carries no drive at all and is held to the shaft by a plain constraint instead. A
   * constraint is solved, a force-capped motor lags -- so this number must stay *below*
   * `anchorStray`, which is the driven grip's, and a run where it does not is a run where the
   * trailing arm has started pushing back. `tests/golem-bench.test.mjs` asserts the pair.
   */
  readonly gripStray: number | null;
}

/** Which layers a module's bodies belong to and collide with. */
export interface GolemLayers {
  /** Structural links: the golem's own anatomy. */
  readonly body: number;
  readonly bodyCollidesWith: number;
  /** A terminal, which declares itself against the *enemy* and passes through its owner. */
  readonly strike: number;
  readonly strikeCollidesWith: number;
}

/**
 * Where a module is bolted on.
 *
 * `rotation` and `world` are taken once, at construction, and they are what a weld has to be
 * built against: a weld whose two frames disagree at construction is a violation the solver
 * clears by flinging the thing -- 48.3 m/s of tip speed on a fighter standing perfectly still,
 * before `weapon.ts`'s `mountRotation` existed.
 */
export interface GolemSocket {
  readonly slot: GolemSlot;
  /** The body this module hangs from. */
  readonly mount: Part;
  /** Where the socket sits in the mount's own local frame. */
  readonly local: Vector3;
  /** Where the socket is in world space at construction. */
  readonly world: Vector3;
  /** The mount's world rotation at construction. Nothing is built at odds with it. */
  readonly rotation: Quaternion;
  /** Which way is away from the body for this socket: +1 or -1. */
  readonly outboard: number;
}

export interface ModuleBuild {
  readonly scene: Scene;
  readonly side: Side;
  /** Name prefix for every body and mesh, so two golems in one scene can be told apart. */
  readonly name: string;
  readonly socket: GolemSocket;
  readonly layers: GolemLayers;
  readonly materials: GolemMaterialPalette;
  /**
   * The golem's *other* effector socket, for a terminal that claims both of them.
   *
   * Optional rather than required, and that is a decision about merging as much as about the
   * contract: every other slot ignores it, three call sites construct a `ModuleBuild` today and
   * two more sessions are appending to this tree at the same time. What keeps it from being a
   * silent hole is that `effectorModule` **refuses** at build, by name, when a two-socket
   * terminal is handed a context without one -- the same refusal it already makes for a chain
   * paired with a terminal it cannot take.
   */
  readonly companion?: GolemSocket | null;
}

export interface BuiltModule<Command> {
  readonly parts: readonly GolemPart[];
  readonly strikers: readonly Striking[];
  /** Once per control boundary. */
  command(next: Command): void;
  /** Once per physics substep, at 240 Hz, from `scene.onBeforePhysicsObservable`. */
  step(dt: number): void;
  envelope(): ModuleEnvelope;
  /** Effectors only; every other slot answers null. */
  view(): EffectorView | null;
  sever(): void;
  dispose(): void;
}

export interface GolemModuleDefinition<Command> {
  /** Stable, e.g. `effector.pitch.blade` or `locomotion.biped`. */
  readonly id: string;
  /**
   * Which slots this module may fill.
   *
   * The overview sketched a single `slot`, which is right for locomotion, torso and head and
   * wrong for an effector: one effector option is offered in both hand sockets, and a
   * definition that named one of them would either be a lie in a field or two registrations of
   * the same module. A one-entry array for the other three slots costs nothing.
   */
  readonly slots: readonly GolemSlot[];
  readonly label: string;
  readonly massKg: number;
  /**
   * How many of its slot's sockets this module occupies. Absent means one.
   *
   * Optional, and only an effector carrying a two-socket terminal ever sets it: locomotion, the
   * torso and the head each fill a slot that has one socket, so a required field would be a
   * number three other sessions had to write down in order to say "the ordinary thing". What
   * reads it is the bench, which refuses to put a second effector on the stand beside a module
   * that has already claimed both sockets.
   */
  readonly sockets?: 1 | 2;
  build(ctx: ModuleBuild): BuiltModule<Command>;
}

/**
 * Which two of a terminal's own axes pin to which two of the link it welds onto.
 *
 * The same shape as `weapon.ts`'s `Mount` and for the same reason, stated for a golem: a golem
 * has no grip, so this is not "how a hand holds it" but "which way round the thing is bolted
 * to the arm". A terminal owns its own answer.
 */
export interface GolemMount {
  /** Where the terminal's own +X points, in the link's frame. */
  readonly axis: Vector3;
  /** Where the terminal's own +Y points, in the link's frame. */
  readonly perp: Vector3;
}

/** Everything a terminal needs in order to be built already agreeing with its own weld. */
export interface ChainWeld {
  /** The last link of the chain. */
  readonly link: Part;
  /** Where the terminal attaches, in the link's own local frame. */
  readonly pivot: Vector3;
  /** That same point in world space at construction. */
  readonly world: Vector3;
  /** The link's world rotation at construction. */
  readonly rotation: Quaternion;
  readonly mount: GolemMount;
}

/**
 * The world rotation a terminal must be *built* with to satisfy its own weld.
 *
 * The same arithmetic as `weapon.ts`'s `mountRotation`, written against a `GolemMount` instead
 * of a `WeaponKind`, because a golem's terminals are not a hand's weapons and switching on a
 * weapon kind here would be a second copy of a table this file has no business holding. Row-
 * vector convention, so `local.multiply(host)` is "terminal into the link, then link into the
 * world" and not the other way round.
 */
export function weldRotation(
  mount: GolemMount,
  host: Quaternion,
  into = new Quaternion(),
): Quaternion {
  const local = Matrix.Identity();
  Matrix.FromXYZAxesToRef(mount.axis, mount.perp, Vector3.Cross(mount.axis, mount.perp), local);
  const hostMatrix = Matrix.Identity();
  Matrix.FromQuaternionToRef(host, hostMatrix);
  Quaternion.FromRotationMatrixToRef(local.multiply(hostMatrix), into);
  return into;
}

export interface BuiltTerminal {
  readonly parts: readonly GolemPart[];
  /**
   * Every body of this terminal that scores, **the business end first**.
   *
   * A list rather than one striker because a whip is a chain of bodies and its bite is the last
   * few segments of it: a whip that scored only with its final capsule would be a whip that
   * mostly misses, and one that scored with all of them would be a rope that bruises with its
   * own handle. The first entry is where the tip and the edge are read from --
   * `Striking.tipPosition()` is already the "where is the business end" question, so a terminal
   * answers it once rather than publishing a second point beside it.
   *
   * `effectorModule` refuses an empty list at build: a terminal that cannot hit anything is a
   * terminal with no striker, and a module offering zero strikers to `Combat` is a weapon that
   * silently scores nothing -- which is the shape of the defect that let an archer land 80
   * arrows a bout for 0 kills.
   */
  readonly strikers: readonly Striking[];
  /** How far the business end is from the weld point, metres. */
  readonly tipOffset: number;
  /**
   * How far a trailing grip is from the point of this terminal it grips, metres.
   *
   * Null for every terminal that claims one socket, which is every one but the mace. See
   * `EffectorView.gripStray` for what the number is for.
   */
  gripStray(): number | null;
  /**
   * Cut loose: stop scoring, and become debris.
   *
   * A dropped weapon is debris like any other piece, and the exemption that let it pass
   * through its owner belonged to the owner and not to the steel -- so a severed terminal
   * re-layers onto `DEBRIS` **on its own leaf shape**, never on a container, and marks itself
   * spent so `Combat` stops scoring cuts from a blade lying on the floor.
   */
  sever(): void;
  dispose(): void;
}

/**
 * The narrower envelope a terminal forces on whatever chain carries it.
 *
 * **A terminal still contributes nothing to control**, and this is the one place that sentence
 * needs saying carefully. A two-socket terminal is a rigid bar between two arms, which is a
 * closed kinematic loop: the driven arm's three axes fix the whole loop, and most of the driven
 * arm's own envelope puts the *other* arm's grip somewhere that arm cannot reach. So the
 * terminal states what it makes unreachable, the chain clamps to it before the anchor is ever
 * handed a target, and neither knows why the other exists. That is frozen rule 3 with a second
 * author, not a refusal branch: a command outside the pair's reach is not in the envelope at
 * all. The arithmetic that produced the mace's numbers is beside them in `config.ts`.
 *
 * **Total, and every field nullable.** Total, so a terminal cannot quietly omit the one limit
 * that mattered -- adding an axis here turns every narrowing terminal red rather than leaving
 * one of them silently unnarrowed. Nullable, so that "this terminal takes nothing from this
 * axis" is said once rather than by transcribing the chain's own constant, which is the
 * second-copy defect this directory keeps paying for. Each number is applied as a *tightening*
 * against the chain's own -- a `max` on a floor and a `min` on a ceiling -- so a terminal can
 * never grant reach it does not have, whatever it states.
 *
 * A chain that has no such axis ignores the fields that name it and says so: rungs 0 and 1
 * ignore all nine, and rung 2 ignores the two wrist rows.
 */
export interface ChainLimits {
  /** The reach shell, metres, as `ReachEnvelope` states it. */
  readonly reachMin: number | null;
  readonly reachMax: number | null;
  /** Outboard-signed azimuth limits, radians. Negative is across the body. */
  readonly swingMin: number | null;
  readonly swingMax: number | null;
  /** Elevation limits, radians. */
  readonly liftMin: number | null;
  readonly liftMax: number | null;
  /** The least outboard offset from the socket the target may have, metres. */
  readonly carryMin: number | null;
  /** The roll a wrist may be commanded to, radians, symmetric. Zero pins the roll. */
  readonly rollMax: number | null;
  /** The flexion a wrist may be commanded to, radians. Zero pins the bend. */
  readonly bendMax: number | null;
}

export interface BuiltChain {
  readonly parts: readonly GolemPart[];
  /**
   * Where a terminal welds on, or null when the chain carries its own.
   *
   * Rung 0 is the null: it has no link to weld anything onto, so its socket cap belongs to the
   * chain. Everything above rung 0 hands a weld out and takes whatever terminal it is given.
   */
  readonly weld: ChainWeld | null;
  /** A chain that carries its own terminal declares it here; every other chain answers null. */
  readonly ownTerminal: BuiltTerminal | null;
  /** How far the weld point (or the chain's own tip) is from the socket, metres. */
  readonly reach: number;
  command(next: HandIntent): void;
  step(dt: number): void;
  envelope(): ModuleEnvelope;
  axes(): readonly EffectorAxisView[];
  stroke(): EffectorStroke;
  /** Where the chain's anchor is, into a ref the chain owns, or null when it has none. */
  anchor(): Vector3 | null;
  anchorStray(): number | null;
  /**
   * Where the chain is commanding a point `distanceFromSocket` metres out to be, in world
   * space, into a ref the chain owns.
   *
   * Takes the distance rather than answering for its own far end, because the point the
   * readout wants is the *terminal's* tip and only the module knows how long the terminal is.
   * A chain that answered for its own end would force the module to reconstruct the commanded
   * direction from the answer, which is the same rule stated twice in two places.
   */
  commandedEnd(distanceFromSocket: number): Vector3;
  /**
   * Let go of the drive and keep the linkage: what a **trailing** limb is.
   *
   * The measured lesson, from the Warrior's two-handed club and restated for a golem: two
   * position motors on one rigid body do not add up, they fight. Swept, the trailing grip made
   * every column worse at every setting -- mean hand error 34.45 mm at no trailing motor
   * against 90.30 mm at half of one -- because two chains hanging off two sockets can reach
   * different poses and two motors asked for poses their chains disagree about pull against
   * each other. So the second socket's chain of a two-socket effector is built, jointed, and
   * then told this: its position drive lets go, and it is carried by the thing it grips.
   *
   * It is **not** `sever`. Sever takes the joints down and the limb falls off; this keeps every
   * joint and every stop, and keeps whatever motors hold the link's own shape rather than its
   * place -- rung 3's wrist pair stays on at its zero targets, because a wrist left free would
   * add two unconstrained axes to a loop that is exactly determined without them.
   */
  unmotorise(): void;
  sever(): void;
  dispose(): void;
}

export interface EffectorChainDefinition {
  readonly id: ChainId;
  readonly axes: 0 | 1 | 3 | 5;
  readonly label: string;
  readonly massKg: number;
  /**
   * `limits` is the narrowing whatever terminal is on the end demands, or null for none.
   *
   * A second parameter rather than a field on `ModuleBuild`, because it is a fact about this
   * *pair* and not about the golem the pair is bolted to -- and because a chain that has no
   * such axis can go on declaring `build(ctx)` and stay assignable, which is what keeps rungs 0
   * and 1 out of a change that is not about them.
   */
  build(ctx: ModuleBuild, limits: ChainLimits | null): BuiltChain;
}

export interface EffectorTerminalDefinition {
  readonly id: TerminalId;
  /** How many effector sockets it occupies. A mace needs both. */
  readonly sockets: 1 | 2;
  readonly bite: "edge" | "point" | "mass" | "none";
  readonly label: string;
  readonly massKg: number;
  /** What this terminal makes unreachable, or null when it narrows nothing. */
  readonly limits: ChainLimits | null;
  /**
   * `trailing` is the second socket's weld for a terminal whose `sockets` is 2, and null for
   * every other -- which is what a one-socket terminal ignores without a branch.
   *
   * **A terminal reads no `HandIntent` and takes no command channel**, and the signature is
   * where that is enforced rather than merely stated: what arrives here is two weld frames, a
   * scene and a palette, and there is nothing in any of them a person could have pressed.
   */
  build(ctx: ModuleBuild, onto: ChainWeld, trailing: ChainWeld | null): BuiltTerminal;
}

/**
 * Declare a chain, keeping its `id` as a literal type.
 *
 * A plain `: EffectorChainDefinition` annotation widens `id` to the whole `ChainId` union, and
 * a widened id is exactly what stops the registry from proving that a definition is filed
 * under its own name. These two helpers keep the literal, so `EFFECTOR_CHAINS.pitch` is known
 * to hold the chain whose id is `"pitch"` and a definition put under the wrong key is a
 * compile error rather than a mislabelled picker entry.
 */
export const defineChain = <K extends ChainId>(
  definition: EffectorChainDefinition & { readonly id: K },
): EffectorChainDefinition & { readonly id: K } => Object.freeze(definition);

export const defineTerminal = <K extends TerminalId>(
  definition: EffectorTerminalDefinition & { readonly id: K },
): EffectorTerminalDefinition & { readonly id: K } => Object.freeze(definition);

/** An envelope with no driven axis. Declared once so every axis-free chain agrees. */
export const NO_ENVELOPE_AXES: readonly ModuleAxisEnvelope[] = Object.freeze([]);

/** A module that can be asked for no stroke at all. Same reason: one empty, not three. */
export const NO_STROKES: readonly EffectorStrokeKind[] = Object.freeze([]);
