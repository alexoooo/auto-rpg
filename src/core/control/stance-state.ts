/**
 * The stance's records: what it is made with (`Stance`), what it remembers from one step to the
 * next (`StanceState`), and the values its functions work in (`StanceScratch`).
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import type { Assist } from "./assist.ts";
import type { Foot, StanceReading, SwingGoal } from "./stance.ts";
import { resolveStance, type ResolvedStance, type StanceTuning } from "./stance-tuning.ts";
import { footStatesOf, restWidth, type FootMemory, type FootState } from "./support.ts";

/**
 * A foot's task for a step: whether the stance drives its leg, and whether it bears; its sole's
 * point's asked acceleration and its spin's (`command`), and its leg's freedoms' (`carry`).
 */
export interface FootTask {
  on: boolean;
  bearing: boolean;
  readonly linear: Vector3;
  readonly angular: Vector3;
  readonly accel: Float64Array;
}

/**
 * **What a stance remembers**: everything a step writes that a later step, or a reader between
 * steps, reads. It is plain data -- numbers, strings, plain objects, arrays, typed arrays, vectors
 * and turns, and no segment, joint, body or function -- so the whole of a stance's memory is this
 * one record.
 */
interface StanceState {
  /** The foot of the last step of a walk, while it steps on without standing between. */
  stride: Foot | null;
  /** The walk the stance's step under way is for, if it is a walk's: `pace` itself, read as it is each step. */
  striding: readonly [number, number] | null;
  /** Each channel the last command drove, 1, or 0. */
  owned: Uint8Array;
  /** The feet the last command had bear the body; null if it asked for no stance. */
  last: readonly Foot[] | null;
  /** The walk's pace, world (x, z), m/s: toward the goal's at the gait's acceleration, toward none standing. */
  readonly pace: [number, number];
  /** The step under way: its swing, the time since its foot left the ground, and where and how the foot left it. */
  readonly step: {
    swing: SwingGoal | null;
    lifted: boolean;
    time: number;
    /** How long a walk's double support has run, s. */
    held: number;
    readonly from: Vector3;
    readonly turn: Quaternion;
    readonly lift: Quaternion;
  };
  /** The centre of mass's planned place (x, height over the soles, z) and velocity, since the stance began. */
  readonly plan: { on: boolean; readonly at: Vector3; readonly velocity: Vector3 };
  /** What the last reading and command found and asked (`StanceControl.reading`); its `soles` are the feet's `middle`s. */
  readonly reading: { -readonly [K in keyof StanceReading]: StanceReading[K] };
  /**
   * The torque stance's aims for this step (`command`): the root's angular acceleration and the
   * centre of mass's, and each leg's foot's, its sole's middle's and its spin's; then (`carry`) the
   * root's acceleration and each leg's freedoms' accelerations.
   */
  readonly aim: { on: boolean; readonly spin: Vector3; readonly centre: Vector3; readonly root: Float64Array };
  /** What the assist is asked this step: the soles' shortfall, within its ceiling. */
  readonly helped: { readonly force: Vector3; readonly moment: Vector3 };
  /** The freedoms held at a torque as `carry` found them, and their accelerations, z0 + Z a_root. */
  readonly held: { channels: number[]; z0: number[]; Z: number[][] };
  /** Each foot's task, in the feet's order. */
  readonly tasks: readonly FootTask[];
  /** Each foot's memory, in the feet's order: `feet[k]` is `Stance.feet[k].memory`. */
  readonly feet: readonly FootMemory[];
}

/** **What a stance's functions work in**: each value is written by a call before that call reads it. */
interface StanceScratch {
  /** The ground's wrench as the bearing soles share it, and what of it they cannot give. */
  readonly shares: { readonly force: Vector3; readonly moment: Vector3 }[];
  readonly missed: { readonly force: Vector3; readonly moment: Vector3 };
  readonly idScratch: { readonly lin: Vector3; readonly ang: Vector3; readonly at: Vector3; readonly force: Vector3; readonly moment: Vector3 };
  readonly path: Vector3;
  readonly along: Vector3;
  readonly sole: Vector3;
  readonly v: Vector3;
  readonly spin: Vector3;
  readonly target: Quaternion;
  readonly error: Quaternion;
  readonly inverse: Quaternion;
  readonly pelvisSpin: Vector3;
  readonly turn: Vector3;
  readonly p: Vector3;
  readonly hipAt: Vector3;
  readonly ankleAt: Vector3;
  readonly kneeAt: Vector3;
  readonly shank: Quaternion;
  readonly footTurn: Quaternion;
  readonly level: Quaternion;
  readonly whole: Quaternion;
  readonly wholeAxis: Vector3;
}

/**
 * **A stance**, as its functions are handed it: what the body and the tuning fix when it is made,
 * its assist, its memory (`state`) and its working values (`scratch`).
 */
export interface Stance {
  readonly built: BuiltBody;
  /** What gives the root what the soles miss, within its ceiling (`Assist`); null, nothing does. */
  readonly assist: Assist | null;
  readonly tuning: ResolvedStance;
  /** The segment the legs hang from. */
  readonly pelvis: BuiltSegment;
  readonly segments: readonly BuiltSegment[];
  /** The body's mass, kg. */
  readonly total: number;
  /** The feet, left then right. */
  readonly feet: readonly FootState[];
  /**
   * How far apart the soles' middles stand as the body was built, m: its own stance, which a walk's
   * end returns to (`settleStep`).
   */
  readonly rest: number;
  readonly state: StanceState;
  readonly scratch: StanceScratch;
}

export function makeStance(built: BuiltBody, tuning: StanceTuning, assist: Assist | null): Stance {
  const feet = footStatesOf(built);
  const segments = [...built.segments.values()];
  return {
    built, assist, tuning: resolveStance(tuning), pelvis: feet[0]!.chain[0]!.parent, segments,
    total: segments.reduce((sum, segment) => sum + segment.rigid.mass, 0),
    feet, rest: restWidth(feet),
    state: {
      stride: null, striding: null, owned: new Uint8Array(0), last: null, pace: [0, 0],
      step: { swing: null, lifted: false, time: 0, held: 0, from: new Vector3(), turn: new Quaternion(), lift: new Quaternion() },
      plan: { on: false, at: new Vector3(), velocity: new Vector3() },
      reading: { centre: new Vector3(), velocity: new Vector3(), support: new Vector3(), place: new Vector3(),
        plan: new Vector3(), planVelocity: new Vector3(),
        phase: "stand", soles: { left: feet[0]!.middle, right: feet[1]!.middle }, own: null, recoveries: 0, strides: 0,
        shortfall: { force: new Vector3(), moment: new Vector3() } },
      aim: { on: false, spin: new Vector3(), centre: new Vector3(), root: new Float64Array(6) },
      helped: { force: new Vector3(), moment: new Vector3() },
      held: { channels: [], z0: [], Z: [] },
      tasks: feet.map((): FootTask => ({ on: false, bearing: false, linear: new Vector3(), angular: new Vector3(), accel: new Float64Array(6) })),
      feet: feet.map((foot) => foot.memory),
    },
    scratch: {
      shares: [0, 1].map(() => ({ force: new Vector3(), moment: new Vector3() })),
      missed: { force: new Vector3(), moment: new Vector3() },
      idScratch: { lin: new Vector3(), ang: new Vector3(), at: new Vector3(), force: new Vector3(), moment: new Vector3() },
      path: new Vector3(), along: new Vector3(), sole: new Vector3(), v: new Vector3(), spin: new Vector3(),
      target: new Quaternion(), error: new Quaternion(), inverse: new Quaternion(), pelvisSpin: new Vector3(), turn: new Vector3(),
      p: new Vector3(), hipAt: new Vector3(), ankleAt: new Vector3(), kneeAt: new Vector3(), shank: new Quaternion(),
      footTurn: new Quaternion(), level: new Quaternion(), whole: new Quaternion(), wholeAxis: new Vector3(),
    },
  };
}

/** Gravity's pull, m/s^2, read from the body's world at each call. */
export const gravityOf = (s: Stance): number => -s.built.physics.gravity[1];
