/**
 * The body command: what a mind hands a body, by channel (skill ceiling session 06, the
 * command-surface half; `docs/analysis/2026-09-26-command-surface.md`).
 *
 * **Designed for control rather than for a mouse.** `Intent` was the controller a person used to
 * drive a body with, and every mind wrote it because a person did. A person no longer puppets a body
 * (the orders half retired that), so the command is shaped by what a body can be asked to do:
 *
 * - **effector**, one per business end: its legacy envelope aim, or an experimental world target
 *   on a chain that declares one, with bounded speed and force;
 * - **trunk**: lean, twist and crouch;
 * - **gait**: travel and turn, and on a stepping gait a stance (width, lead foot, weight) and a step
 *   target with a timing;
 * - **natural**: the natural striker's two buttons.
 *
 * **Channels are declared per module from shared kinds** (`ChannelDeclaration`). Each built module
 * says which kinds it answers and with which features, and the golem publishes the whole list once on
 * `view.self.capabilities.channels`. A planner reads that list instead of a module id, so the same
 * code drives a biped, a wheel or a head-rammer with no arms: it writes what the body declares and
 * leaves the rest at neutral.
 *
 * **The authority rule.** Every feature names its actuator, and a feature is something a motor or
 * the carrier actually does within its limits: the stance moves the feet with the hip, knee and ankle
 * motors inside their joint stops, and the step target is carried out by the carrier inside its
 * speed ceilings. Nothing here places a body part.
 *
 * **New features land behind a flag** (`CHANNEL_FLAGS`), as experiments. With a flag off the feature
 * is not declared and the body ignores it, whatever a command says, so a bout is the bout it was.
 *
 * **`Intent` is kept as an input, through one adapter** (`intentToCommand`), so the hand-written minds
 * -- the duelist, the miser, the needle and the rest -- stay available as benchmarks. It is a known,
 * tested translation and the only one: nothing new is written against `Intent`.
 *
 * Node-loadable: relative imports carry `.ts`, and there are no parameter properties.
 */
import type { HandIntent, Intent } from "./mind.ts";
import type { HandName } from "./hands.ts";

// ---------------------------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------------------------

/** The shared kinds every module's channels are declared from. */
export type ChannelKind = "effector" | "trunk" | "stepping-gait" | "rolling-base" | "natural-striker";

export const CHANNEL_KINDS: readonly ChannelKind[] = Object.freeze(
  ["effector", "trunk", "stepping-gait", "rolling-base", "natural-striker"] as ChannelKind[]);

/**
 * What one channel answers. Each is a field (or a group of fields) of `BodyCommand`:
 *
 * - `aim` -- `effectors[hand].aim`, the envelope coordinates; `orientation` -- its optional pose;
 * - `target`, `speed`, `force` -- `effectors[hand].target`, a world pose and fractions of motor ceilings;
 * - `lean`, `twist`, `crouch` -- `trunk`;
 * - `travel`, `turn` -- `gait.forward`/`strafe` and `gait.turn`;
 * - `stance` -- `gait.stance`; `step` -- `gait.step`;
 * - `thrust`, `guard` -- `natural`.
 */
export type ChannelFeature = "aim" | "orientation" | "lean" | "twist" | "crouch"
  | "travel" | "turn" | "stance" | "step" | "thrust" | "guard" | "target" | "speed" | "force";

export interface ChannelDeclaration {
  readonly kind: ChannelKind;
  /** The module that answers it, e.g. `locomotion.biped` or `effector.wrist.blade`. */
  readonly module: string;
  /** Which socket, for an effector; null otherwise. */
  readonly hand: HandName | null;
  readonly features: readonly ChannelFeature[];
  /** What physically carries the channel out, feature by feature: the authority rule. */
  readonly actuator: string;
}

export const declare = (kind: ChannelKind, module: string, features: readonly ChannelFeature[], actuator: string,
  hand: HandName | null = null): ChannelDeclaration =>
  Object.freeze({ kind, module, hand, features: Object.freeze([...features]), actuator });

/** Whether any declaration of `kind` (for `hand`, when given) answers `feature`. */
export function declares(channels: readonly ChannelDeclaration[] | undefined | null, kind: ChannelKind,
  feature: ChannelFeature, hand: HandName | null = null): boolean {
  if (!channels) return false;
  for (const channel of channels) {
    if (channel.kind !== kind) continue;
    if (hand !== null && channel.hand !== hand) continue;
    if (channel.features.includes(feature)) return true;
  }
  return false;
}

/** Whether the body's gait answers `feature`, whichever gait kind it is. */
export const gaitDeclares = (channels: readonly ChannelDeclaration[] | undefined | null, feature: ChannelFeature): boolean =>
  declares(channels, "stepping-gait", feature) || declares(channels, "rolling-base", feature);

/**
 * The experiment flags: one per feature this session added. Off, the feature is not declared and
 * the body leaves it at neutral; a flag is read when a body is built, so a harness sets it before
 * it builds a bout (and a fork is built in the same realm, under the same flags).
 *
 * Which of them are on by default is the command-surface analysis's verdict, feature by feature.
 */
export interface ChannelFlags {
  /** `gait.stance` on a stepping gait: stance width, lead foot and weight. */
  stance: boolean;
  /** `gait.step`: a ground point and a time, carried out by the carrier. */
  step: boolean;
  /** World-space effector targets, only on chains that implement the target actuator. */
  effector: boolean;
}

export const DEFAULT_CHANNEL_FLAGS: Readonly<ChannelFlags> = Object.freeze({ stance: false, step: false, effector: false });

/** The live flags. Mutated only through `setChannelFlags`, by a harness or page, before a build. */
export const CHANNEL_FLAGS: ChannelFlags = { ...DEFAULT_CHANNEL_FLAGS };

/** Set some flags and return the previous values, so a caller can put them back. */
export function setChannelFlags(next: Partial<ChannelFlags>): ChannelFlags {
  const previous = { ...CHANNEL_FLAGS };
  for (const key of Object.keys(next) as (keyof ChannelFlags)[]) {
    if (!Object.hasOwn(DEFAULT_CHANNEL_FLAGS, key)) throw new Error(`no channel flag "${String(key)}"`);
    if (typeof next[key] !== "boolean") throw new Error(`channel flag "${String(key)}" takes a boolean`);
    CHANNEL_FLAGS[key] = next[key] as boolean;
  }
  return previous;
}

/** Flags by name, e.g. `stance,step,effector`, as a harness or page spells them. */
export function parseChannelFlags(text: string | null | undefined): Partial<ChannelFlags> {
  const out: Partial<ChannelFlags> = {};
  for (const name of (text ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (!Object.hasOwn(DEFAULT_CHANNEL_FLAGS, name)) throw new Error(`no channel flag "${name}"`);
    out[name as keyof ChannelFlags] = true;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The command
// ---------------------------------------------------------------------------------------------

export interface EffectorCommand {
  /** Where in its envelope the business end is asked to be, in the chain's own coordinates. */
  aim: HandIntent;
  /** Experimental task-space command; absent/null retains the legacy aim exactly. */
  target?: EffectorTarget | null;
}

export interface EffectorTarget {
  /** Business-end point, world metres. The module removes its own terminal offset. */
  position: { x: number; y: number; z: number };
  /** World orientation of the carrying hand's frame, not a socket-relative quaternion. */
  orientation: { x: number; y: number; z: number; w: number };
  /** Fraction of the chain's joint target-rate ceilings, clamped to [0, 1]. */
  speed: number;
  /** Fraction of available motor effort, clamped to [0, 1], multiplied by the body's live tone. */
  force: number;
}

export interface TrunkCommand {
  /** -1 back through +1 forward. */
  lean: number;
  /** -1 left through +1 right. */
  twist: number;
  /** 0 standing through 1 fully crouched. */
  crouch: number;
}

/**
 * How a stepping gait stands, each -1 to +1 and 0 the build stance. Carried out by the hip, knee and
 * ankle motors (`bipedPose`), so the feet go where the joints can put them and no further.
 */
export interface StanceCommand {
  /** Feet apart: +1 wider by the gait's `stanceWidthM` each side, -1 narrower. */
  width: number;
  /** Which foot leads: +1 the right foot forward and the left back by `stanceLeadM`, -1 the reverse. */
  lead: number;
  /** Weight fore and aft over the base: +1 the body over the toes (feet back by `stanceShiftM`), -1 over the heels. */
  weight: number;
}

/**
 * A step: be at a ground point by a time. Carried out by the carrier inside its speed ceilings, so a
 * step asked for faster than the carrier walks arrives late; the timing is a target, not an order.
 */
export interface StepCommand {
  /** The ground point, world metres. */
  x: number;
  z: number;
  /** Seconds, from the first command naming this point, in which to arrive. */
  within: number;
}

export interface GaitCommand {
  /** -1 back, +1 forward: a fraction of the carrier's ceiling in the body's own frame. */
  forward: number;
  /** -1 left, +1 right. */
  strafe: number;
  /** -1 left, +1 right. */
  turn: number;
  stance: StanceCommand;
  /** A step target, or null for none; while one is set it replaces `forward` and `strafe`. */
  step: StepCommand | null;
}

export interface NaturalCommand {
  thrust: boolean;
  guard: boolean;
}

export interface BodyCommand {
  /** The effector a stroke is executing on, or null when what acts is not a hand (`Intent.actingHand`). */
  actingHand: HandName | null;
  effectors: { primary: EffectorCommand; secondary: EffectorCommand };
  trunk: TrunkCommand;
  gait: GaitCommand;
  natural: NaturalCommand;
}

const freshAim = (): HandIntent =>
  ({ pointerX: 0, pointerY: 0, reach: 0, roll: 0, wristBend: 0, thrust: false, guard: false });

/** A neutral command this caller owns and overwrites in place. */
export const freshBodyCommand = (): BodyCommand => ({
  actingHand: "primary",
  effectors: {
    primary: { aim: freshAim() },
    secondary: { aim: freshAim() },
  },
  trunk: { lean: 0, twist: 0, crouch: 0 },
  gait: { forward: 0, strafe: 0, turn: 0, stance: { width: 0, lead: 0, weight: 0 }, step: null },
  natural: { thrust: false, guard: false },
});

export const NEUTRAL_STANCE: Readonly<StanceCommand> = Object.freeze({ width: 0, lead: 0, weight: 0 });

export const stanceIsNeutral = (stance: StanceCommand | null | undefined): boolean =>
  !stance || (stance.width === 0 && stance.lead === 0 && stance.weight === 0);

const copyAim = (from: HandIntent, into: HandIntent): void => {
  into.pointerX = from.pointerX;
  into.pointerY = from.pointerY;
  into.reach = from.reach;
  into.roll = from.roll;
  into.wristBend = from.wristBend;
  into.thrust = from.thrust;
  into.guard = from.guard;
  if (from.orientation) {
    const o = into.orientation ?? (into.orientation = { x: 0, y: 0, z: 0, w: 1 });
    o.x = from.orientation.x; o.y = from.orientation.y; o.z = from.orientation.z; o.w = from.orientation.w;
  } else if (into.orientation) {
    delete into.orientation;
  }
};

/** Copy a whole command, field by field, into one the caller owns. */
export function copyBodyCommand(from: BodyCommand, into: BodyCommand): BodyCommand {
  into.actingHand = from.actingHand;
  for (const hand of ["primary", "secondary"] as const) {
    copyAim(from.effectors[hand].aim, into.effectors[hand].aim);
    const target = from.effectors[hand].target;
    if (target) {
      const p = target.position, q = target.orientation;
      into.effectors[hand].target = { position: { x: p.x, y: p.y, z: p.z }, orientation: { x: q.x, y: q.y, z: q.z, w: q.w },
        speed: target.speed, force: target.force };
    } else if (target === null) {
      into.effectors[hand].target = null;
    } else {
      delete into.effectors[hand].target;
    }
  }
  into.trunk.lean = from.trunk.lean;
  into.trunk.twist = from.trunk.twist;
  into.trunk.crouch = from.trunk.crouch;
  const g = into.gait, f = from.gait;
  g.forward = f.forward;
  g.strafe = f.strafe;
  g.turn = f.turn;
  g.stance.width = f.stance.width;
  g.stance.lead = f.stance.lead;
  g.stance.weight = f.stance.weight;
  if (f.step) {
    const s = g.step ?? (g.step = { x: 0, z: 0, within: 0 });
    s.x = f.step.x; s.z = f.step.z; s.within = f.step.within;
  } else {
    g.step = null;
  }
  into.natural.thrust = from.natural.thrust;
  into.natural.guard = from.natural.guard;
  return into;
}

export const cloneBodyCommand = (from: BodyCommand): BodyCommand => copyBodyCommand(from, freshBodyCommand());

/**
 * `Intent` into a body command: the one adapter, and a pure narrowing.
 *
 * Every field `Intent` has is carried to the channel that does the same thing, and every channel
 * `Intent` has no word for is neutral: the build stance and no step target. The hand records are *shared*
 * with the intent rather than copied, so a body reads exactly the object it read before; `into` is
 * reused when given, and the result is `into`.
 */
export function intentToCommand(intent: Intent, into: BodyCommand = freshBodyCommand()): BodyCommand {
  into.actingHand = intent.actingHand;
  into.effectors.primary.aim = intent.primary;
  into.effectors.secondary.aim = intent.secondary;
  delete into.effectors.primary.target;
  delete into.effectors.secondary.target;
  into.trunk.lean = intent.posture.trunkLean;
  into.trunk.twist = intent.posture.trunkTwist;
  into.trunk.crouch = intent.posture.crouch;
  const g = into.gait;
  g.forward = intent.forward;
  g.strafe = intent.strafe;
  g.turn = intent.turn;
  g.stance.width = 0;
  g.stance.lead = 0;
  g.stance.weight = 0;
  g.step = null;
  into.natural.thrust = intent.natural.thrust;
  into.natural.guard = intent.natural.guard;
  return into;
}

// ---------------------------------------------------------------------------------------------
// The declarations each kind of module makes
// ---------------------------------------------------------------------------------------------

/** An effector socket: its aim, and its pose where the chain takes one. */
export function effectorChannel(module: string, hand: HandName, orientation: boolean, target = false): ChannelDeclaration {
  const features: ChannelFeature[] = orientation ? ["aim", "orientation"] : ["aim"];
  if (target && CHANNEL_FLAGS.effector) features.push("target", "speed", "force");
  return declare("effector", module, features,
    "the chain's joint servos, driven toward the aim or world target through its rate limit and at its torque ceilings", hand);
}

/** A torso: lean and twist. */
export const trunkChannel = (module: string): ChannelDeclaration =>
  declare("trunk", module, ["lean", "twist"], "the waist's lean and twist servos, at the torso's rate and torque ceilings");

/** A head: the guard tuck, and the lunge where it carries a striker. */
export const naturalChannel = (module: string, striker: boolean): ChannelDeclaration =>
  declare("natural-striker", module, striker ? ["thrust", "guard"] : ["guard"],
    striker ? "the neck servos: the ram's lunge (a drive, then a follow) and the guard tuck" : "the neck servos: the guard tuck");

/**
 * A locomotion module: travel and turn on its gait kind, a step target and a stance where flagged
 * (a stance only on a gait that can place its feet), and the crouch on the trunk where it has a
 * height range.
 */
export function gaitChannels(kind: "stepping-gait" | "rolling-base", module: string,
  { crouch, stance }: { crouch: boolean; stance: boolean }): readonly ChannelDeclaration[] {
  const features: ChannelFeature[] = ["travel", "turn"];
  const actuators = ["travel and turn: the virtual carrier, inside its speed and yaw ceilings"];
  if (CHANNEL_FLAGS.step) {
    features.push("step");
    actuators.push("step: the same carrier, sent toward the point at the speed that arrives on time, capped at its ceilings");
  }
  if (stance && CHANNEL_FLAGS.stance) {
    features.push("stance");
    actuators.push("stance: the hip abduction and flexion, knee and ankle servos, placing each foot inside its joint stops");
  }
  const out = [declare(kind, module, features, actuators.join("; "))];
  if (crouch) {
    out.push(declare("trunk", module, ["crouch"], "the legs' hip, knee and ankle flexion, lowering the carrier inside its height range"));
  }
  return Object.freeze(out);
}
