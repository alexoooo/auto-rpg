import meta from "../../../assets/core/learned-run.meta.json" with { type: "json" };
import type { Body, BodyView } from "../body.ts";
import { recoveryNetwork } from "../control/recovery-network.ts";
import { hasteOver } from "../human/attributes.ts";
import { cos, sin } from "../math/real.ts";
import { deepFreeze } from "../state.ts";
import { wrap } from "../math/turn.ts";
import type { Side } from "../spec/body.ts";
import { STEER_KEYS, type RunCycleMemory, type RunCycleSettings, type RunSteer } from "./cycle-run.ts";
import type { Locomotion } from "./locomotion.ts";
import { walkRun, WALK_RUN, WALK_RUN_CYCLE, type WalkRunSettings } from "./walk-run.ts";

/** How many control steps a policy's steer holds, at 120 Hz: it decides 30 times a second. */
export const DECIDE = 4;

/**
 * How far each of a policy's outputs, -1 to 1, moves its offset (`RunSteer`): rad for the angles,
 * a share for the cycle's rate and the pushes' strength, m/s for the pace.
 */
const STEER_RANGE: Readonly<RunSteer> = Object.freeze({
  swingHip: 0.3, swingOut: 0.15, swingKnee: 0.4, swingAnkle: 0.3, stanceKnee: 0.3, stanceAnkle: 0.3, stanceRoll: 0.15,
  lean: 0.2, bank: 0.1, cadence: 0.3, pace: 1.5, effort: 0.5,
});

/** The legs' channels a policy reads, by joint and freedom: each leg's hip's three, its knee and its ankle's two. */
const LEG_CHANNELS = ["hip.%s flexion", "hip.%s abduction", "hip.%s internal rotation", "knee.%s flexion", "ankle.%s dorsiflexion", "ankle.%s inversion"] as const;

/** How many features a policy reads (`runFeatures`). */
export const RUN_FEATURES = 23 + 4 * LEG_CHANNELS.length;

/**
 * **What is known of the run's trained policy before it loads** (`dataOf("learned-run")`): the
 * names a learned run's config may give it (`LearnedRunConfig.policy`), and how its gait was timed
 * to its haste in training (`RunPolicy.hasted`), the editor's default. `all-bodies` is trained on
 * the Warrior, the Rogue and the skeleton, empty-handed and with the club, at Haste 0 and 100 (its
 * asset's `made` says how).
 */
export const RUN_POLICY: { readonly hasted: number; readonly policies: readonly string[] } = deepFreeze(meta);

/** **A learned run's network**: a ReLU network whose outputs are the steer's (`STEER_KEYS`), its inputs the features (`runFeatures`), normalised in its first layer. */
export interface RunPolicy {
  /** How the gait it steered in training was timed to its haste (`WalkRunSettings.hasted`): a learned run's config takes it (`LearnedRunConfig`). */
  readonly hasted: number;
  readonly actions: number;
  readonly layers: readonly { readonly weights: readonly (readonly number[])[]; readonly bias: readonly number[] }[];
}

/**
 * **What a run's policy reads**, into `out`: the run as its bearing leg has it, the side the
 * bearing leg is on mirrored away, so one policy runs on either foot. In order: the bearing
 * leg's own phase as the sine and cosine of twice its turn; the pace asked and the pace the cycle
 * runs at, m/s; the centre of mass's velocity along the heading, across it toward the bearing
 * side and up; its height over the lower sole; where it is from the bearing sole, along and
 * across, and the swinging sole from it, along, across and up; the pelvis's lean forward and
 * toward the bearing side, and the heading's error from the body's facing, rad; the body's
 * angular momentum about its centre of mass, about the heading's right, up and forward, kg m²/s;
 * whether each sole touches, the bearing's first; the body's haste over a person's; the heading's
 * turn, rad/s; then the bearing leg's and the swinging leg's angles (`LEG_CHANNELS`), and their
 * speeds, rad and rad/s. Across and about up and forward are toward the bearing side.
 */
export function runFeatures(body: Body, view: BodyView, run: RunCycleMemory, heading: number, asked: number, turning: number, out: number[]): number[] {
  const s = view.stance, c = s.centre, v = s.velocity, m = s.momentum;
  const bearing: Side = run.phase < 0.5 ? "left" : "right", swinging: Side = bearing === "left" ? "right" : "left", side = bearing === "left" ? 1 : -1;
  const own = bearing === "left" ? run.phase : run.phase - 0.5;
  const fx = sin(heading), fz = cos(heading), rx = cos(heading), rz = -sin(heading);
  const along = (x: number, z: number): number => x * fx + z * fz, across = (x: number, z: number): number => -(x * rx + z * rz) * side;
  const q = view.root.rotation, ux = 2 * (q.x * q.y - q.w * q.z), uz = 2 * (q.y * q.z + q.w * q.x);
  const b = s.soles[bearing], w = s.soles[swinging], low = Math.min(b.y, w.y);
  let k = 0;
  out[k++] = sin(4 * Math.PI * own); out[k++] = cos(4 * Math.PI * own);
  out[k++] = asked; out[k++] = run.pace;
  out[k++] = along(v.x, v.z); out[k++] = across(v.x, v.z); out[k++] = v.y;
  out[k++] = c.y - low;
  out[k++] = along(c.x - b.x, c.z - b.z); out[k++] = across(c.x - b.x, c.z - b.z);
  out[k++] = along(w.x - c.x, w.z - c.z); out[k++] = across(w.x - c.x, w.z - c.z); out[k++] = w.y - b.y;
  out[k++] = along(ux, uz); out[k++] = across(ux, uz); out[k++] = wrap(heading - s.facing) * side;
  out[k++] = m.x * rx + m.z * rz; out[k++] = m.y * side; out[k++] = along(m.x, m.z) * side;
  out[k++] = s.touching[bearing] ? 1 : 0; out[k++] = s.touching[swinging] ? 1 : 0;
  out[k++] = hasteOver(body.built.spec) - 1; out[k++] = turning * side;
  const muscles = body.muscles;
  for (const leg of [bearing, swinging]) for (const name of LEG_CHANNELS) out[k++] = muscles.angle(muscles.channel(name.replace("%s", leg)));
  for (const leg of [bearing, swinging]) for (const name of LEG_CHANNELS) out[k++] = muscles.speed(muscles.channel(name.replace("%s", leg)));
  out.length = k;
  return out;
}

/** The steer `actions` (each -1 to 1, in `STEER_KEYS`' order) ask, into `steer`. */
export function steerFrom(actions: readonly number[], steer: RunSteer): RunSteer {
  STEER_KEYS.forEach((key, i) => { steer[key] = Math.max(-1, Math.min(1, actions[i]!)) * STEER_RANGE[key]; });
  return steer;
}

/**
 * **The walk and the learned run**: the walk and run (`walkRun`) whose run a policy steers
 * (`RunSteer`): every `DECIDE` control steps it reads the run (`runFeatures`) and sets the
 * cycle's offsets from its network's outputs (`steerFrom`). Its run is held to no envelope: the
 * policy is trained to the paces it is asked. With no policy the run is steered from outside: its
 * steer (`RunCycleMemory.steer`) is left as it is set, as a policy's training sets it. Its settings
 * are by default the walk and run's, timed to its haste as its policy's training was (`RunPolicy.hasted`).
 */
export function learnedRun(body: Body, policy: RunPolicy | null, given: WalkRunSettings = policy ? { ...WALK_RUN, hasted: policy.hasted } : WALK_RUN, givenRun: RunCycleSettings = WALK_RUN_CYCLE, may = true): Locomotion {
  if (policy === null) return walkRun(body, given, givenRun, may, { runEnvelope: null });
  if (policy.actions !== STEER_KEYS.length) throw new Error(`a learned run's policy gives ${STEER_KEYS.length} actions`);
  const act = recoveryNetwork(policy), features: number[] = [];
  return walkRun(body, given, givenRun, may, {
    runEnvelope: null,
    steer(view, heading, asked, run, turning) {
      if (run.steps % DECIDE === 0) steerFrom(act(runFeatures(body, view, run, heading, asked, turning, features)), run.steer);
    },
  });
}
