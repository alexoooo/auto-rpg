import type { MotorAndGuard } from "../../framework/motor-and-guard.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import { channelSpeed, type MuscleReading, type MuscleCommand } from "../../../core/bodies/muscle/driver.ts";
import type { BodyControl } from "../../../core/bodies/body-control.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { Clock } from "../../../core/world/clock.ts";
import type { OwnBody } from "../../../core/bodies/own-body.ts";
import type { Senses } from "../../../core/bodies/senses.ts";
import type { GroundReading, Position } from "../../../control/ground-reading.ts";
import type { KeysOf, Part, PartConfig } from "../../../parts/parts.ts";

/**
 * A physical event completes a technique; other ends remain failures in the bed. A way up let go
 * where it got nowhere against an object ends `obstructed` (`groundSkills`, `STUCK`).
 */
export type TechniqueEnd = "done" | "failed" | "stalled" | "timed-out" | "interrupted" | "obstructed";
/** Each implementation declares its configuration under its kind. */
export interface TechniqueConfigs {}
/** The kind of a technique the toolkit registers. */
export type TechniqueName = keyof TechniqueConfigs;
export interface TechniqueRun<Start extends string = string> {
  readonly state: object;
  readonly phase: string;
  /** Where along its way it is, finer than its phase: a new one each time it moves on (a stage begun); absent, its phase says. */
  readonly stage?: string;
  readonly yields: boolean;
  admits(reading: GroundReading, start: Start): boolean;
  reached(reading: GroundReading, to: Position): boolean;
  begin(start: Start): void;
  step(reading: GroundReading, senses: Senses, control: BodyControl, dt: number): TechniqueEnd | null;
  /** Let it go before its end: interrupted, or `obstructed` where it got nowhere against an object, which a run may try differently next (the roll over its other side). */
  end(why?: "interrupted" | "obstructed"): void;
  /** Forget what it had under way, as the body's ground skills begin afresh with none carried over (`groundBody`); absent where it keeps nothing past its run. */
  forget?(): void;
}
/**
 * **A technique**: a part of role `technique` that a stand-up routes through: the start identifiers
 * its implementation understands, the positions it takes the body between, and its run on a body.
 */
export interface TechniquePart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "technique";
  /**
   * Where it is a mode of the ground, run until it is let go, what it does: whether it `braces` the
   * body as it falls, and where it regains the body's feet, the stage it `climbs` in (null, it
   * regains none), its try timed (`riseMemory`).
   */
  readonly mode?: { readonly braces: boolean; readonly climbs: string | null };
  readonly keys: KeysOf<C>;
  readonly starts: readonly string[];
  /** Physical segment identifiers used to select the declared start tokens. */
  bindings(spec: BodySpec, config: C): readonly { readonly segment: string; readonly start: string }[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
  /**
   * Where it is a way up (its `edges`), what a mind that names no technique of its own takes it for:
   * rising (`ascent`, a way up, `WAY_UP_OPTION`) or changing the lie the body rises from
   * (`fallback`, a reposition, `REPOSITION_OPTION`).
   */
  readonly purpose?: "ascent" | "fallback";
  /** Its entry (`TechniqueRun.admits`) reads the body's motion and its raw position (`GroundReading.raw`): a stand-up begins it on a body still tumbling where it admits it, and braces one only where none does. */
  readonly moving: boolean;
  /** A run of it under `config` on the body, driving it with the mind's motor and guard (`fitted`). */
  make(own: OwnBody, view: BodyView, clock: Clock, fitted: MotorAndGuard, config: C, afterPhysics: Body["afterPhysics"]): TechniqueRun;
}

/** Whether `part` is a way up: it takes the body between positions (its `edges`), where a mode of the ground holds it (none). */
export const isWayUp = (part: Pick<TechniquePart, "edges">): boolean => part.edges.length > 0;

/** Whether the segment `name` is of the trunk: a humanoid's trunk segments are named so (`upperTrunk`, `lowerTrunk`). */
export const isTrunk = (name: string): boolean => name.endsWith("Trunk");

/** The indices of `spec`'s trunk segments (`isTrunk`), in its order. */
export const trunkOf = (spec: BodySpec): number[] => spec.segments.flatMap((segment, i) => isTrunk(segment.name) ? [i] : []);

/** A reached physical predicate must remain true this long; search settings cannot change it. */
export const REACHED_SECONDS = .1;

/** Deadline and progress memory for one phase. Progress measures belong to their phase. */
export function phaseClock() {
  const state = { elapsed: 0, progressTime: 0, progress: 0, begun: false, reached: 0 };
  return {
    state,
    reset() { state.elapsed = 0; state.progressTime = 0; state.progress = 0; state.begun = false; state.reached = 0; },
    step(input: { readonly inside: boolean; readonly event: boolean; readonly deadline: number;
      readonly hold?: number; readonly progress?: { readonly value: number; readonly gain: number; readonly window: number } }, dt: number): TechniqueEnd | null {
      state.elapsed += dt;
      if (!input.inside) return "failed";
      if (state.elapsed > input.deadline + 1e-9) return "timed-out";
      state.reached = input.event ? state.reached + dt : 0;
      if (input.event && state.reached + 1e-9 >= (input.hold ?? 0)) return "done";
      if (input.progress) {
        const { value, gain, window } = input.progress;
        if (!state.begun || value - state.progress >= gain) {
          state.progress = value; state.progressTime = state.elapsed; state.begun = true;
        } else if (state.elapsed - state.progressTime >= window) return "stalled";
      }
      return null;
    },
  };
}

/**
 * How a posture is driven (`poseDrive`): each freedom asked the rate that closes its gap to the
 * posture in `within` seconds, no faster than `top`, rad/s, at `activation`. Speeds, not the joint
 * servo, which takes the root as held and knows no contact, as a body pressing off the ground is not.
 */
export interface PoseDriving { readonly within: number; readonly top: number; readonly activation: number }

/** The pose drive as a way up drives its postures: a gap closed in 0.2 s, no faster than 3 rad/s, at full activation. */
export const POSE_DRIVING: PoseDriving = Object.freeze({ within: 0.2, top: 3, activation: 1 });

/** The angle `posture` asks of `channel`, rad from its reference pose, within its range: none named, the reference. */
export function postureGoal(channel: MuscleReading["channels"][number], posture: Readonly<Record<string, number>>): number {
  const dof = channel.dof.spec;
  return Math.max(dof.min.value, Math.min(dof.max.value, (posture[channel.name] ?? 0) - dof.bind.value));
}

/** How far the channels `indices` are from what `posture` asks of them (`postureGoal`), on average, rad; NaN with none. */
export function postureError(muscles: MuscleReading, indices: readonly number[], posture: Readonly<Record<string, number>>): number {
  let error = 0;
  for (const i of indices) error += Math.abs(postureGoal(muscles.channels[i]!, posture) - muscles.angle(i));
  return error / indices.length;
}

/** Rate goals use the joint's actual turning map before they become motor speeds. Work is per body. */
export function poseDrive(muscles: MuscleReading) {
  const rates = new Float64Array(muscles.channels.length);
  return (command: MuscleCommand, posture: Readonly<Record<string, number>>, { within, top, activation }: PoseDriving = POSE_DRIVING): void => {
    for (let i = 0; i < rates.length; i++) rates[i] = Math.max(-top, Math.min(top, (postureGoal(muscles.channels[i]!, posture) - muscles.angle(i)) / within));
    for (let i = 0; i < rates.length; i++) {
      command.velocity[i] = channelSpeed(muscles, i, rates, i - muscles.channels[i]!.index); command.activation[i] = activation;
    }
  };
}

declare module "../../../parts/lookup.ts" {
  interface RoleParts {
    readonly technique: TechniquePart;
  }
  interface RoleConfigs {
    readonly technique: TechniqueConfigs;
  }
}
