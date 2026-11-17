import type { Body, BodyView } from "../../../control/body.ts";
import type { LegsAsked } from "../../framework/skill.ts";
import { rootSegment } from "../../../core/bodies/read-body.ts";
import { Vector3 } from "../../../core/math/vector.ts";
import { cos, sin } from "../../../core/math/real.ts";
import { recoveryNetwork, networkFaults, type Network } from "../../../core/math/learning/recovery-network.ts";
import { act, ask, learnerOf, start, type Learner } from "../../../core/math/learning/learner.ts";
import { legOf } from "../shared/leg.ts";
import { deepFreeze } from "../../../core/state.ts";

/** Where the back step is, as its actor reads it: each a flag. */
const PHASES = Object.freeze(["armed", "out", "back", "waiting in", "stepping in", "following", "shuffling"] as const);
export type BackStepPhase = typeof PHASES[number] | "walk";

const FEET = Object.freeze(["lead", "rear"] as const);

/** **The back step's actor's layout**: what it reads and what it answers, by name. */
export const BACK_STEP_LAYOUT = deepFreeze({
  inputs: [...PHASES.map((phase) => `phase ${phase}`), "sway seconds", "walk forward", "walk right", "face sin", "face cos",
    "forward speed", "side speed", "vertical speed", "up forward", "up side", "up vertical", "spin forward", "spin side", "spin up", "height",
    "from forward", "from side", "stance shift", "stance swing", "catch step",
    ...FEET.flatMap((foot) => [`${foot} contact`, `${foot} forward`, `${foot} side`, `${foot} height`])],
  outputs: ["centre forward", "centre side", "follow step", "follow length"],
});

/**
 * **An actor's settings over the back step**: its network (none where a trainer answers it), how
 * often it decides, s, and the bounds of what it answers: how far it moves the centre the back step
 * asks forward and to the side, m, and the share of the follow's step it adds or takes away.
 */
export interface LearnedBackStepSettings {
  readonly network?: Network;
  readonly interval: number;
  readonly forward: number;
  readonly side: number;
  readonly length: number;
}

/** The settings of an actor a trainer answers where its config names none: deciding each 0.05 s, the centre moved up to 0.12 m forward or back and 0.06 m aside, the follow's step up to half again or half. */
export const BACK_STEP_ACTOR = deepFreeze<LearnedBackStepSettings>({ interval: .05, forward: .12, side: .06, length: .5 });

/** What is wrong with an actor's settings, each a sentence. */
export function learnedBackStepFaults(value: unknown): readonly string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["a back step's actor is an object"];
  const settings = value as LearnedBackStepSettings, faults: string[] = [];
  if (settings.network !== undefined) {
    const read = networkFaults(settings.network);
    if (read.faults.length || read.inputs !== BACK_STEP_LAYOUT.inputs.length || settings.network.actions !== BACK_STEP_LAYOUT.outputs.length)
      faults.push(`a back step's actor is a ${BACK_STEP_LAYOUT.inputs.length}-input, ${BACK_STEP_LAYOUT.outputs.length}-action network`);
  }
  if (!(settings.interval > 0) || !Number.isFinite(settings.interval)) faults.push("a back step's actor decides at a finite positive interval, s");
  for (const [key, most] of [["forward", .3], ["side", .2], ["length", 1]] as const)
    if (!Number.isFinite(settings[key]) || settings[key] < 0 || settings[key] > most) faults.push(`a back step's actor's ${key} is from 0 to ${most}`);
  return faults;
}

/** What the actor's answer asks of the back step this control step: the centre moved, m, along and across the legs' heading; whether the follow may take its next step; its step's share more. */
export interface BackStepCorrection { forward: number; side: number; step: boolean; length: number }

/** What the back step tells its actor of itself as it decides. */
export interface BackStepReading {
  readonly phase: BackStepPhase;
  readonly seconds: number;
  readonly heading: number;
  readonly from: readonly [number, number] | null;
}

/** **A back step's actor**: its learner, the correction its last answer asks, and its step's two halves. */
export interface BackStepActor {
  readonly learner: Learner;
  readonly correction: BackStepCorrection;
  /** Before the back step's goal: the answer in force (the network's, where it has one). */
  before(): void;
  /** After it: what the actor reads, written where it decides. */
  after(view: BodyView, asked: LegsAsked, reading: BackStepReading, dt: number): void;
  /** As the legs take the back step up: its schedule and correction begin again. */
  resume(): void;
}

/**
 * The actor of `body`'s back step: decides each `interval` s while the back step is the legs' gait,
 * from what it reads of its body (its speed, lean and spin, its feet against its centre) and of the
 * back step (where its sway is, the walk asked), and answers its correction (`BackStepCorrection`).
 * `steered`, its network is left out and its learner is answered by a trainer.
 */
export function backStepActor(body: Body, settings: LearnedBackStepSettings, { steered = false }: { readonly steered?: boolean } = {}): BackStepActor {
  const faults = learnedBackStepFaults(settings);
  if (faults.length) throw new Error(faults.join("; "));
  if (!steered && !settings.network) throw new Error("a back step's actor no trainer steers needs its network");
  const policy = steered || !settings.network ? undefined : recoveryNetwork(settings.network);
  const leg = legOf(body.built.spec), root = rootSegment(body.built);
  const learner = learnerOf(BACK_STEP_LAYOUT.inputs.length, settings.interval, { running: true, trained: !steered });
  const correction: BackStepCorrection = { forward: 0, side: 0, step: true, length: 0 };
  const up = new Vector3(), spin = new Vector3(), observation = new Array<number>(BACK_STEP_LAYOUT.inputs.length).fill(0);
  return {
    learner, correction,
    before() {
      const answer = act(learner, policy);
      if (answer.length === 0) return;
      correction.forward = answer[0]! * settings.forward; correction.side = answer[1]! * settings.side;
      correction.step = answer[2]! >= 0; correction.length = answer[3]! * settings.length;
    },
    after(view, asked, { phase, seconds, heading: h, from }, dt) {
      const s = view.stance, fx = sin(h), fz = cos(h), rx = fz, rz = -fx;
      up.set(0, 1, 0).applyRotationQuaternionToRef(view.root.rotation, up);
      root.body.angularVelocityToRef(spin);
      const ends = Object.values(s.ends).sort((a, b) => (b.middle.x * fx + b.middle.z * fz) - (a.middle.x * fx + a.middle.z * fz));
      const feet = [ends[0]!, ends[ends.length - 1]!];
      let k = 0;
      for (const one of PHASES) observation[k++] = phase === one ? 1 : 0;
      observation[k++] = seconds;
      observation[k++] = asked.walk?.[0] ?? 0; observation[k++] = asked.walk?.[1] ?? 0;
      observation[k++] = sin(asked.face - h); observation[k++] = cos(asked.face - h);
      observation[k++] = s.velocity.x * fx + s.velocity.z * fz; observation[k++] = s.velocity.x * rx + s.velocity.z * rz; observation[k++] = s.velocity.y;
      observation[k++] = up.x * fx + up.z * fz; observation[k++] = up.x * rx + up.z * rz; observation[k++] = up.y;
      observation[k++] = spin.x * fx + spin.z * fz; observation[k++] = spin.x * rx + spin.z * rz; observation[k++] = spin.y;
      observation[k++] = (s.centre.y - Math.min(feet[0]!.middle.y, feet[1]!.middle.y)) / leg;
      const dx = from ? s.centre.x - from[0] : 0, dz = from ? s.centre.z - from[1] : 0;
      observation[k++] = (dx * fx + dz * fz) / leg; observation[k++] = (dx * rx + dz * rz) / leg;
      observation[k++] = s.phase === "shift" ? 1 : 0; observation[k++] = s.phase === "swing" ? 1 : 0; observation[k++] = s.own ? 1 : 0;
      for (const foot of feet) {
        const x = foot.middle.x - s.centre.x, z = foot.middle.z - s.centre.z;
        observation[k++] = foot.touching ? 1 : 0; observation[k++] = (x * fx + z * fz) / leg; observation[k++] = (x * rx + z * rz) / leg; observation[k++] = (foot.middle.y - s.centre.y) / leg;
      }
      if (ask(learner, dt)) for (let i = 0; i < observation.length; i++) learner.inputs[i] = observation[i]!;
    },
    resume() {
      start(learner);
      correction.forward = 0; correction.side = 0; correction.step = true; correction.length = 0;
    },
  };
}
