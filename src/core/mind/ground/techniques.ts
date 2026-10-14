import type { BodyView } from "../../body.ts";
import type { MuscleDriver } from "../../muscle/driver.ts";
import type { BodySpec, Side } from "../../spec/body.ts";
import type { World } from "../../world.ts";
import type { OwnBody } from "../mind.ts";
import type { Senses } from "../senses.ts";
import type { Recipe } from "../rise/stages.ts";
import type { GroundReading, Position } from "./reading.ts";
import { plantUp } from "./plant-up.ts";
import { rollToFront } from "./roll.ts";
import { rollBack } from "./roll-back.ts";
import { sitUp } from "./sit-up.ts";
import { postUp } from "./post-up.ts";

/** A physical event completes a technique; other ends remain failures in the bed. */
export type TechniqueEnd = "done" | "failed" | "stalled" | "timed-out" | "interrupted";
export type TechniqueName = "plant-up" | "roll" | "roll-back" | "sit-up" | "post-up";
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
export interface TechniqueSpec {
  readonly label: string;
  readonly stage: "game" | "experimental";
  readonly sides: readonly Side[];
  readonly edges: readonly { readonly from: Position; readonly to: Position }[];
  fits(spec: BodySpec): boolean;
  make(own: OwnBody, view: BodyView, world: World): TechniqueRun;
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

/** Every bearing chain and prop follows its mirrored segment, retaining its other inputs. */
export function mirrorLimbs(limbs: Recipe["limbs"]): Recipe["limbs"] {
  return limbs.map(limb => {
    const common = { ...limb, name: opposite(limb.name), segment: opposite(limb.segment), from: opposite(limb.from) };
    switch (limb.kind) {
      case "foot": return common;
      case "end": return { ...common, takes: limb.takes.map(opposite) };
      case "propped": return { ...common, takes: limb.takes.map(opposite), prop: opposite(limb.prop) };
      default: { const never: never = limb; throw new Error(`unknown bearing limb ${never}`); }
    }
  });
}

/** Experimental techniques stay out of gameplay defaults until their physical evidence qualifies them. */
const humanoid = (spec: BodySpec) => spec.model === "workshop-fighter" || spec.model === "workshop-rogue" || spec.model === "crypt-skeleton";

/** The registry offers compatible anatomy independently of whether an experimental route succeeds. */
export const TECHNIQUES: Readonly<Record<TechniqueName, TechniqueSpec>> = Object.freeze({
  "plant-up": Object.freeze({ label: "Plant up", stage: "experimental", sides: Object.freeze(["left"] as const),
    edges: Object.freeze((["front", "fours", "half-kneel", "crouch"] as const).map(from => Object.freeze({ from, to: "standing" as const }))),
    fits: humanoid,
    make: plantUp }),
  roll: Object.freeze({ label: "Roll onto front", stage: "experimental", sides: Object.freeze(["right"] as const),
    edges: Object.freeze((["back", "right"] as const).map(from => Object.freeze({ from, to: "front" as const }))),
    fits: humanoid,
    make: rollToFront }),
  "roll-back": Object.freeze({ label: "Roll onto back", stage: "experimental", sides: Object.freeze(["right"] as const),
    edges: Object.freeze([Object.freeze({ from: "front" as const, to: "back" as const })]),
    fits: humanoid, make: rollBack }),
  "sit-up": Object.freeze({ label: "Sit up", stage: "experimental", sides: Object.freeze(["left"] as const),
    edges: Object.freeze([Object.freeze({ from: "back" as const, to: "sitting" as const })]),
    fits: humanoid, make: sitUp }),
  "post-up": Object.freeze({ label: "Post up", stage: "experimental", sides: Object.freeze(["left"] as const),
    edges: Object.freeze([Object.freeze({ from: "sitting" as const, to: "standing" as const })]),
    fits: humanoid, make: postUp }),
});
