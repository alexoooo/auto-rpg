import type { Body, BodyView } from "../../control/body.ts";
import { soleRefusal } from "../../control/support.ts";
import type { MuscleReading, MuscleCommand } from "../../core/bodies/muscle/driver.ts";
import type { BodyControl } from "../../core/bodies/body-control.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { Clock } from "../../core/world/clock.ts";
import type { OwnBody } from "../../core/bodies/own-body.ts";
import type { MindKit } from "../kit.ts";
import type { Senses } from "../../core/bodies/senses.ts";
import type { GroundReading, Position } from "../../control/ground-reading.ts";
import { fitsAll, type KeysOf, type Part, type PartConfig } from "../../parts/parts.ts";
import type { Side } from "../../core/bodies/bilateral.ts";

/** A physical event completes a technique; other ends remain failures in the bed. */
export type TechniqueEnd = "done" | "failed" | "stalled" | "timed-out" | "interrupted";
/** Each implementation declares its configuration under its kind. */
export interface TechniqueConfigs {}
/** A registered technique's configuration. */
export type TechniqueConfig = TechniqueConfigs[keyof TechniqueConfigs];
export type TechniqueName = TechniqueConfig["kind"];
export interface TechniqueRun {
  readonly state: object;
  readonly phase: string;
  readonly yields: boolean;
  admits(reading: GroundReading, side: Side): boolean;
  reached(reading: GroundReading, to: Position): boolean;
  begin(side: Side): void;
  step(reading: GroundReading, senses: Senses, control: BodyControl, dt: number): TechniqueEnd | null;
  end(): void;
  /** Forget what it had under way, as the body's ground skills begin afresh with none carried over (`groundBody`); absent where it keeps nothing past its run. */
  forget?(): void;
}
/**
 * **A technique**: a part of role `technique` that a stand-up routes through (`standUp`): the sides
 * it may be begun on, the positions it takes the body between, and its run on a body.
 */
export interface TechniquePart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "technique";
  /** A sustained recovery mode, and its climbing phase where it has one. */
  readonly mode?: { readonly kind: "brace" | "land" | "steady"; readonly climbing?: string };
  readonly keys: KeysOf<C>;
  readonly sides: readonly Side[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
  /** Its entry (`TechniqueRun.admits`) reads the body's motion and its raw position (`GroundReading.raw`): a stand-up begins it on a body still tumbling where it admits it, and braces one only where none does. */
  readonly moving: boolean;
  /** A run of it under `config` on the body, driving it with the mind's motor and guard (`kit`). */
  make(own: OwnBody, view: BodyView, clock: Clock, kit: MindKit, config: C, afterPhysics: Body["afterPhysics"]): TechniqueRun;
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

const opposite = (name: string) => name.replace(/\.(left|right)\b/g, (_, side: string) => side === "left" ? ".right" : ".left");

/** Anatomical side names swap; the body's one-sided trunk channels change sign. */
export function mirrorPosture(posture: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(posture).map(([name, value]) => [opposite(name),
    / (lateral flexion right|rotation right)$/.test(name) ? -value : value]));
}

/** A technique's `fits`: a body the stance stands on its feet (`soleRefusal`), as a technique's steady and stance do. Experimental techniques stay out of gameplay defaults until their physical evidence qualifies them. */
const fitsStance = (spec: BodySpec): string | null => soleRefusal(spec);

/** A technique part of `kind` with no settings of its own, fitted to a body the stance stands (`fitsStance`) and, where `fits` is given, that `fits` admits. */
export const technique = <K extends string>(kind: K, part: Pick<TechniquePart, "label" | "stage" | "sides" | "edges" | "make" | "mode"> & { reads?: Part["reads"]; moving?: boolean; fits?: (spec: BodySpec) => string | null }): TechniquePart<{ readonly kind: K }> => {
  const { fits, ...rest } = part;
  return Object.freeze({ moving: false, ...rest, role: "technique", defaults: Object.freeze({ kind }), keys: Object.freeze({ kind: true }), fields: [], slots: [],
    fits: fits ? fitsAll(fitsStance, fits) : fitsStance, faults: () => [] });
};

declare module "../../parts/lookup.ts" {
  interface RoleParts {
    readonly technique: TechniquePart;
  }
}
