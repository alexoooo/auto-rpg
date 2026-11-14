import type { MotorAndGuard } from "../../framework/motor-and-guard.ts";
import type { Body, BodyView } from "../../../control/body.ts";
import type { MuscleReading, MuscleCommand } from "../../../core/bodies/muscle/driver.ts";
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
 * **A technique**: a part of role `technique` that a stand-up routes through (`standUp`): the start identifiers
 * its implementation understands, the positions it takes the body between, and its run on a body.
 */
export interface TechniquePart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "technique";
  /** A sustained recovery mode, and its climbing phase where it has one. */
  readonly mode?: { readonly kind: "brace" | "land" | "steady"; readonly climbing?: string };
  readonly keys: KeysOf<C>;
  readonly starts: readonly string[];
  /** Physical segment identifiers used to select the declared start tokens. */
  bindings(spec: BodySpec, config: C): readonly { readonly segment: string; readonly start: string }[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
  /** Its entry (`TechniqueRun.admits`) reads the body's motion and its raw position (`GroundReading.raw`): a stand-up begins it on a body still tumbling where it admits it, and braces one only where none does. */
  readonly moving: boolean;
  /** A run of it under `config` on the body, driving it with the mind's motor and guard (`fitted`). */
  make(own: OwnBody, view: BodyView, clock: Clock, fitted: MotorAndGuard, config: C, afterPhysics: Body["afterPhysics"]): TechniqueRun;
}

/** Whether `part` is a way up: it takes the body between positions (its `edges`), where a mode of the ground holds it (none). */
export const isWayUp = (part: Pick<TechniquePart, "edges">): boolean => part.edges.length > 0;

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


/** Rate goals use the joint's actual turning map before they become motor speeds. Work is per body. */
export function poseDrive(muscles: MuscleReading) {
  const rates = new Float64Array(muscles.channels.length);
  return (command: MuscleCommand, posture: Readonly<Record<string, number>>, within = .2, top = 3, activation = 1): void => {
    for (let i = 0; i < rates.length; i++) {
      const channel = muscles.channels[i]!, dof = channel.dof.spec;
      const goal = Math.max(dof.min.value, Math.min(dof.max.value, (posture[channel.name] ?? 0) - dof.bind.value));
      rates[i] = Math.max(-top, Math.min(top, (goal - muscles.angle(i)) / within));
    }
    for (let i = 0; i < rates.length; i++) {
      const channel = muscles.channels[i]!, first = i - channel.index;
      let speed = 0;
      for (let k = 0; k < channel.joint.dofs.length; k++) speed += muscles.turning(i, k) * rates[first + k]!;
      command.velocity[i] = speed; command.activation[i] = activation;
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
