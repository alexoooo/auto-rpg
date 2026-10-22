import type { Body, BodyView } from "../body.ts";
import type { Clock } from "../clock.ts";
import type { MotorMaker } from "../control/motor-part.ts";
import type { Pose } from "../control/motor.ts";
import type { ReadBody } from "../read-body.ts";
import type { GuardSkill } from "../skills/guard.ts";
import type { BodySpec } from "../spec/body.ts";
import type { Locomotion } from "../skills/locomotion.ts";
import type { Legs } from "./locomotion-part.ts";
import type { PartLookup } from "./lookup.ts";
import type { OwnBody } from "./mind.ts";
import type { PartConfig } from "./parts.ts";
import type { SubMind } from "./sub-mind.ts";

/** The game's guard: what a rig that plays a technique or a sub-mind without a mind of its own holds (`kitOf`). */
export const GAME_GUARD: PartConfig = Object.freeze({ kind: "cover-guard" });

/** The game's motor control, where a mind names none: the whole-body solve. */
export const GAME_MOTOR: PartConfig = Object.freeze({ kind: "whole-body" });

/** What makes the motor control `config` names, the game's where it names none, as `parts` finds it. */
export function motorOf(parts: PartLookup, config: PartConfig | null | undefined): MotorMaker {
  const named = config ?? GAME_MOTOR;
  return parts.of("motor", named).make(named);
}

/** Legs of any kind `parts` finds, as Move makes its gaits (`LocomotionPart.make`). */
function legsFrom(parts: PartLookup): Legs {
  return { make: (body, config) => legsOf(parts, body, config), runs: (config) => parts.of("locomotion", config).runs?.(config), parts };
}

/** **The legs' skill** `config` names for `body`, as `parts` finds it (`LocomotionPart.make`). */
export function legsOf(parts: PartLookup, body: Body, config: PartConfig): Locomotion {
  return parts.of("locomotion", config).make(body, config, legsFrom(parts));
}

/**
 * **What a mind hands the parts that drive its body themselves** (a sub-mind and its techniques):
 * its own motor and guard, so that a part swapped into the mind is the part they use.
 */
export interface MindKit {
  /** What makes a motor control: the mind's motor (`MotorPart.make`). */
  readonly motor: MotorMaker;
  /** The arms' rest: the mind's guard's posture for the body (`GuardPart.posture`). */
  readonly posture: Pose;
  /** The mind's guard, made for `built` (`GuardPart.make`). */
  guard(built: ReadBody): GuardSkill;
  /** The parts the mind's config may name, for the parts a sub-mind names (a stand-up's techniques). */
  readonly parts: PartLookup;
}

/** The parts of a mind a kit is made from: its motor (the game's where none) and its guard. */
export interface KitParts {
  readonly motor?: PartConfig | null;
  readonly guard: PartConfig;
}

/** The kit of the mind whose parts are `mind`, for a body of `spec`, each part as `parts` finds it. */
export function kitOf(parts: PartLookup, spec: BodySpec, mind: KitParts): MindKit {
  const guard = parts.of("guard", mind.guard);
  return { motor: motorOf(parts, mind.motor), posture: guard.posture(spec, mind.guard), guard: (built) => guard.make(built, mind.guard), parts };
}

/**
 * What makes a sub-mind for a body: its own body, its host's view of it, read each step before the
 * sub-mind is asked anything, and the world the body is in.
 */
export type SubMindMaker = (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) => SubMind;

/** The sub-mind `config` names, as `parts` finds it, made with `kit`. */
export function subMind(parts: PartLookup, own: OwnBody, view: BodyView, config: PartConfig, kit: MindKit, clock: Clock, afterPhysics?: Body["afterPhysics"]): SubMind {
  return parts.of("sub-mind", config).make(own, view, config, kit, clock, afterPhysics);
}

/** `configs`' sub-minds as a body takes them (`BodyOptions.subs`), each made with the kit of the mind whose parts are `mind`. */
export const subMindsOf = (parts: PartLookup, configs: readonly PartConfig[], mind: KitParts): readonly SubMindMaker[] =>
  configs.map((config) => (own: OwnBody, view: BodyView, clock: Clock, afterPhysics: Body["afterPhysics"]) =>
    subMind(parts, own, view, config, kitOf(parts, own.spec, mind), clock, afterPhysics));
