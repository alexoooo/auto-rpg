import { commandRefusal, type BodyView } from "../../body.ts";
import type { MuscleDriver } from "../../muscle/driver.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { Clock } from "../../clock.ts";
import type { OwnBody } from "../mind.ts";
import type { MindKit } from "../kit.ts";
import type { Senses } from "../senses.ts";
import type { GroundReading, Position } from "./reading.ts";
import type { KeysOf, Part, PartConfig } from "../../parts/parts.ts";
import type { TECHNIQUES } from "./techniques.ts";

/** A physical event completes a technique; other ends remain failures in the bed. */
export type TechniqueEnd = "done" | "failed" | "stalled" | "timed-out" | "interrupted";
/** **A technique's config**, by kind (`TECHNIQUES`). */
export type TechniqueConfig = { [K in keyof typeof TECHNIQUES]: (typeof TECHNIQUES)[K]["defaults"] }[keyof typeof TECHNIQUES];
export type TechniqueName = TechniqueConfig["kind"];
export interface TechniqueRun {
  readonly state: object;
  readonly phase: string;
  readonly yields: boolean;
  admits(reading: GroundReading, side: Side): boolean;
  reached(reading: GroundReading, to: Position): boolean;
  begin(side: Side): void;
  step(reading: GroundReading, senses: Senses, dt: number): TechniqueEnd | null;
  end(): void;
}
/**
 * **A technique**: a part of role `technique` that a stand-up routes through (`standUp`): the sides
 * it may be begun on, the positions it takes the body between, and its run on a body.
 */
export interface TechniquePart<C extends PartConfig = PartConfig> extends Part<C> {
  readonly role: "technique";
  readonly keys: KeysOf<C>;
  readonly sides: readonly Side[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
  /** Its entry (`TechniqueRun.admits`) reads the body's motion and its raw position (`GroundReading.raw`): a stand-up begins it on a body still tumbling where it admits it, and braces one only where none does. */
  readonly moving: boolean;
  /** A run of it on the body, driving it with the mind's motor and guard (`kit`). */
  make(own: OwnBody, view: BodyView, clock: Clock, kit: MindKit): TechniqueRun;
}

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
export function poseDrive(muscles: MuscleDriver) {
  const rates = new Float64Array(muscles.channels.length);
  return (posture: Readonly<Record<string, number>>, within = .2, top = 3, activation = 1): void => {
    for (let i = 0; i < rates.length; i++) {
      const channel = muscles.channels[i]!, dof = channel.dof.spec;
      const goal = Math.max(dof.min.value, Math.min(dof.max.value, (posture[channel.name] ?? 0) - dof.bind.value));
      rates[i] = Math.max(-top, Math.min(top, (goal - muscles.angle(i)) / within));
    }
    for (let i = 0; i < rates.length; i++) {
      const channel = muscles.channels[i]!, first = i - channel.index;
      let speed = 0;
      for (let k = 0; k < channel.joint.dofs.length; k++) speed += muscles.turning(i, k) * rates[first + k]!;
      muscles.velocity[i] = speed; muscles.activation[i] = activation;
    }
  };
}

const opposite = (name: string) => name.replace(/\.(left|right)\b/g, (_, side: string) => side === "left" ? ".right" : ".left");

/** Anatomical side names swap; the body's one-sided trunk channels change sign. */
export function mirrorPosture(posture: Readonly<Record<string, number>>): Readonly<Record<string, number>> {
  return Object.fromEntries(Object.entries(posture).map(([name, value]) => [opposite(name),
    / (lateral flexion right|rotation right)$/.test(name) ? -value : value]));
}

/** A technique's `fits`: a body the command layers read (`commandRefusal`), whose limbs it bears on. Experimental techniques stay out of gameplay defaults until their physical evidence qualifies them. */
const fitsHumanoid = (spec: BodySpec): string | null => commandRefusal(spec);

/** A technique part of `kind` with no settings of its own. */
export const technique = <K extends string>(kind: K, part: Pick<TechniquePart, "label" | "stage" | "sides" | "edges" | "make"> & { reads?: Part["reads"]; moving?: boolean }): TechniquePart<{ readonly kind: K }> =>
  Object.freeze({ moving: false, ...part, role: "technique", defaults: Object.freeze({ kind }), keys: Object.freeze({ kind: true }), fields: [], slots: [], fits: fitsHumanoid, faults: () => [] });

/** The positions a body stands up from: every edge from them goes to standing. */
export const TO_STANDING = Object.freeze((["front", "back", "left", "right", "fours", "half-kneel", "kneeling", "sitting", "between"] as const)
  .map(from => Object.freeze({ from, to: "standing" as const })));
