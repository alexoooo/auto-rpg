import type { BodyView } from "../../body.ts";
import { recoveryNetwork } from "../../control/recovery-network.ts";
import { cos, sin } from "../../math/real.ts";
import { deepFreeze } from "../../state.ts";
import type { World } from "../../world.ts";
import type { OwnBody } from "../mind.ts";
import { RISE_STEER_KEYS, type RiseSteer } from "../rise/staged.ts";
import { stepUp, type StepUpRise } from "./step-up.ts";
import type { TechniqueRun } from "./techniques.ts";

/** How many control steps a policy's steer holds, at 120 Hz: it decides 30 times a second. */
export const RISE_DECIDE = 4;
/** How fast the rise's steer follows what a policy asks, s: a first-order lag, at the pace the servo moves the body. */
const RISE_EASE = .2;

/**
 * How far each of a policy's outputs, -1 to 1, moves the rise's steer (`RiseSteer`): the log of
 * the stages' pace, the share the tolerances widen, m for the centre's place, a share of standing
 * height for its height, rad for the pitch and the posture.
 */
const RISE_RANGE: Readonly<RiseSteer> = Object.freeze({
  clock: 1, hurry: .8, forward: .15, side: .1, height: .1, pitch: .3,
  hipLeft: .4, hipRight: .4, kneeLeft: .4, kneeRight: .4, ankleLeft: .3, ankleRight: .3, spine: .3, shoulders: .5, elbows: .5,
});

/** The segments whose heights a policy reads, over the lower sole. */
const HEIGHTS = ["head", "hand.left", "hand.right", "shank.left", "shank.right", "foot.left", "foot.right"] as const;
/** What a rise may be doing, as a policy reads it: lying slack, rolling, rising, its stance steadying the body, or none of them. */
const DOING = ["settle", "roll", "rise", "steady"] as const;
const LIES = ["front", "back", "left", "right"] as const;

/** How many features a policy reads of a body of `channels` muscle channels (`riseFeatures`). */
export const riseFeatures = (channels: number): number => 22 + HEIGHTS.length + 2 * channels;

/** **A learned rise's network**: a ReLU network whose outputs are the steer's (`RISE_STEER_KEYS`), its inputs the features (`readRise`), normalised in its first layer. */
interface RisePolicy {
  readonly actions: number;
  readonly layers: readonly { readonly weights: readonly (readonly number[])[]; readonly bias: readonly number[] }[];
}

/** The rise's trained policies, by the model whose body each was trained on. */
const RISE_POLICIES: Readonly<Record<string, RisePolicy>> = deepFreeze({});

/**
 * **What a rise's policy reads**, into `out`: how high the pelvis's left, up and forward point,
 * of 1; the centre of mass's height over the lower sole, its velocity along and across the way the
 * body faces and up, m and m/s; the body's angular momentum about its centre of mass, about the
 * way it faces, its right and up, kg m²/s; the heights of `HEIGHTS` over the lower sole, m; what
 * the rise is doing (`DOING`), its stage's place in what it plays and the time in it, s, how the
 * body lay when last read (`LIES`), whether it plays the whole rise, and how many attempts it has
 * had (`whole`, else it joined part-way); then every muscle channel's angle and speed, rad and rad/s.
 */
export function readRise(own: OwnBody, view: BodyView, rise: StepUpRise, whole: boolean, steadying: boolean, out: number[]): number[] {
  const s = view.stance, c = s.centre, v = s.velocity, m = s.momentum, q = view.root.rotation, h = s.facing;
  const fx = sin(h), fz = cos(h), low = Math.min(s.soles.left.y, s.soles.right.y), r = rise.state;
  const doing = steadying ? "steady" : r.phase === "idle" ? null : r.phase, playing = r.phase === "roll" || r.phase === "rise" ? rise.stages(r.phase) : 0;
  let k = 0;
  out[k++] = 2 * (q.x * q.y + q.w * q.z); out[k++] = 1 - 2 * (q.x * q.x + q.z * q.z); out[k++] = 2 * (q.y * q.z - q.w * q.x);
  out[k++] = c.y - low; out[k++] = v.x * fx + v.z * fz; out[k++] = v.x * fz - v.z * fx; out[k++] = v.y;
  out[k++] = m.x * fx + m.z * fz; out[k++] = m.x * fz - m.z * fx; out[k++] = m.y;
  for (const name of HEIGHTS) out[k++] = own.built.segments.get(name)!.node.position.y - low;
  for (const one of DOING) out[k++] = doing === one ? 1 : 0;
  out[k++] = playing > 0 ? (r.stage + 1) / playing : 0; out[k++] = r.time;
  for (const lie of LIES) out[k++] = r.lie === lie ? 1 : 0;
  out[k++] = whole ? 1 : 0; out[k++] = r.tries;
  const muscles = own.muscles;
  for (let i = 0; i < muscles.channels.length; i++) out[k++] = muscles.angle(i);
  for (let i = 0; i < muscles.channels.length; i++) out[k++] = muscles.speed(i);
  out.length = k;
  return out;
}

/** The steer `actions` (each -1 to 1, in `RISE_STEER_KEYS`' order) ask, into `steer`. */
export function riseSteerFrom(actions: readonly number[], steer: RiseSteer): RiseSteer {
  RISE_STEER_KEYS.forEach((key, i) => { steer[key] = Math.max(-1, Math.min(1, actions[i]!)) * RISE_RANGE[key]; });
  return steer;
}

/**
 * **The learned rise**: step up (`stepUp`) whose rise a policy steers (`RiseSteer`): every
 * `RISE_DECIDE` control steps it reads the rise (`readRise`) and asks a steer of its network's
 * outputs (`riseSteerFrom`); every step the steer eases toward what is asked (`RISE_EASE`) and is
 * given to each of step up's rises. With no policy what is asked is set from outside, as a
 * policy's training sets it; nought, it is step up.
 */
export function learnedRise(own: OwnBody, view: BodyView, world: World, policy: RisePolicy | null = RISE_POLICIES[own.spec.model] ?? null): TechniqueRun & {
  readonly state: { readonly asked: RiseSteer; readonly steer: RiseSteer; readonly steps: number };
  readonly up: ReturnType<typeof stepUp>;
} {
  if (policy !== null && policy.actions !== RISE_STEER_KEYS.length) throw new Error(`a learned rise's policy gives ${RISE_STEER_KEYS.length} actions`);
  const up = stepUp(own, view, world), act = policy === null ? null : recoveryNetwork(policy), features: number[] = [];
  const nought = () => Object.fromEntries(RISE_STEER_KEYS.map((key) => [key, 0])) as unknown as RiseSteer;
  const state = { up: up.state, asked: nought(), steer: nought(), steps: 0 };
  return {
    state, up,
    get phase() { return up.phase; },
    get yields() { return up.yields; },
    admits: (g, side) => up.admits(g, side),
    reached: (g, to) => up.reached(g, to),
    begin(side) { state.steps = 0; up.begin(side); },
    end() { up.end(); },
    step(g, senses, dt) {
      if (act !== null && state.steps % RISE_DECIDE === 0) riseSteerFrom(act(readRise(own, view, up.rise, up.rise === up.rises[0], up.steadying, features)), state.asked);
      state.steps++;
      const ease = Math.min(1, dt / RISE_EASE);
      for (const key of RISE_STEER_KEYS) state.steer[key] += (state.asked[key] - state.steer[key]) * ease;
      for (const rise of up.rises) Object.assign(rise.state.steer, state.steer);
      return up.step(g, senses, dt);
    },
  };
}
