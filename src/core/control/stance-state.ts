/**
 * The stance's records: what it is made with (`Stance`), what it remembers from one step to the
 * next (`StanceState`), and the values its functions work in (`StanceScratch`).
 */
import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody, BuiltSegment } from "../build/build-body.ts";
import type { Assist } from "./assist.ts";
import { makeBearing, type Bearing, type Limb, type LimbTask } from "./bearing.ts";
import type { WholeBodyAsk } from "./solve.ts";
import type { StanceGoal, StanceReading, SwingGoal } from "./stance.ts";
import { makeLegNow, type LegNow, type SwingShift } from "./swing-leg.ts";
import type { SwingBow } from "./swing-path.ts";
import { resolveStance, SUPPORT_INSET, type ResolvedStance, type StanceTuning } from "./stance-tuning.ts";
import { footStatesOf, massOf, restWidth, type FootMemory, type FootState } from "./support.ts";
import type { Side } from "../spec/body.ts";

/**
 * **What a stance remembers**: everything a step writes that a later step, or a reader between
 * steps, reads. It is plain data -- numbers, strings, plain objects, arrays, typed arrays, vectors
 * and turns, and no segment, joint, body or function -- so the whole of a stance's memory is this
 * one record.
 *
 * With it are five values no later step reads: what `command` leaves for `carry` and `bear` of its
 * own step (`aim`, `helped`, `held`, `tasks`), and the turn a swing asks (`step.turn`).
 */
interface StanceState {
  /** The supported root pose requested this step; null uses the walking planner. */
  pose: StanceGoal["pose"] | null;
  /** The foot of the last step of a walk, while it steps on without standing between. */
  stride: Side | null;
  /** The walk the stance's step under way is for, if it is a walk's: the pace it was planned at (`reachablePace`), which `pace` goes on from. */
  striding: readonly [number, number] | null;
  /** Each channel the last command drove, 1, or 0. */
  owned: Uint8Array;
  /** The feet the last command had bear the body; null if it asked for no stance. */
  last: readonly Side[] | null;
  /** The walk's pace, world (x, z), m/s: toward the goal's at the gait's acceleration, toward none standing. */
  readonly pace: [number, number];
  /** How far below the goal's height the walk holds the plan, m, so that its legs reach the steps its pace takes (`paceToward`); 0 standing. */
  crouch: number;
  /** The step under way: its swing, the time since its foot left the ground, where, how and how fast the foot left it, and the turn asked of it now. */
  readonly step: {
    swing: SwingGoal | null;
    lifted: boolean;
    /** Whether the pivot the plan falls about has been chosen in the step's phase under way (`planAcross`): within the horizon of the phase's end it is held. */
    pivoted: boolean;
    time: number;
    /** How long a walk's double support has run, s. */
    held: number;
    /** How far the capture point was from what the bearing sole holds at a weight shift's last command, m; Infinity before its first. */
    off: number;
    /** Whether the step under way catches a push (`catchStep`): it runs to its landing before any step the goal asks. */
    catching: boolean;
    /** Whether the stance's own step under way is a recovery step (`recoveryStep`), re-aimed as one (`aimRecovery`). */
    recovering: boolean;
    readonly from: Vector3;
    /** The sole's middle's velocity as the foot left the ground, world, m/s (`SwingGoal.momentum`). */
    readonly launch: Vector3;
    readonly turn: Quaternion;
    readonly lift: Quaternion;
    /** How far the sole's lowest corner lay below its middle under the turn asked at the last command, m (`soleDrop`), for the path's rate (`swingFoot`). */
    drop: number;
    /** The swing leg's reaction on the plan, as the last command found it (`swingShiftToRef`). */
    readonly shift: SwingShift;
  };
  /**
   * A run's flight (`SwingGoal.flight`): whether one is under way, the centre of mass as the
   * bearing foot left the ground, and that foot's sole's middle from it then, world.
   */
  readonly flight: { on: boolean; readonly left: Vector3; readonly from: Vector3 };
  /**
   * The centre of mass's planned place (x, height over the soles, z) and velocity, since the stance
   * began, and what the ground missed of the force the last command asked of it, N, less what the
   * assist gave (the last solve's shortfall and help): the plan goes on from what the body could get.
   */
  readonly plan: { on: boolean; readonly at: Vector3; readonly velocity: Vector3; readonly missed: Vector3 };
  /** What the last reading and command found and asked (`StanceControl.reading`); its `soles` are the feet's `middle`s. */
  readonly reading: { -readonly [K in Exclude<keyof StanceReading, "touching">]: StanceReading[K] } & { readonly touching: Record<Side, boolean> };
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
  /**
   * Each foot's leg's task, in the feet's order (`LimbTask`): whether the stance drives the leg, and
   * whether it bears; its sole's point's asked acceleration and its spin's (`command`), and its
   * leg's freedoms' (`carry`).
   */
  readonly tasks: readonly LimbTask[];
  /** Each foot's memory, in the feet's order: `feet[k]` is `Stance.feet[k].memory`. */
  readonly feet: readonly FootMemory[];
}

/** **What a stance's functions work in**: each value is written by a call before that call reads it. */
interface StanceScratch {
  readonly path: Vector3;
  readonly along: Vector3;
  readonly sole: Vector3;
  readonly v: Vector3;
  readonly target: Quaternion;
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
  /** A swing foot's turn held within its ankle's range from the shank as it is, its turn relative to the shank, body frame, and an inverse's work (`ankleTurnToRef`). */
  readonly ankleHeld: Quaternion;
  readonly ankleRelative: Quaternion;
  readonly ankleInverse: Quaternion;
  /** A swing's progress at a time: the share of the way, and its rates per share of the swing's time and per its square (`swingProgressToRef`). */
  readonly progress: Vector3;
  /** The body's velocity with what its angular momentum brings it (`carriedVelocity`). */
  readonly carried: Vector3;
  /** The swinging leg as it is (`legNowToRef`). */
  readonly legNow: LegNow;
  /** The swing's path's bow clear of the bearing sole (`swingBowToRef`), and the path's acceleration (`swingPathToRef`). */
  readonly bow: SwingBow;
  readonly accel: Vector3;
}

/**
 * **A stance**, as its functions are handed it: what the body and the tuning fix when it is made,
 * its assist, its memory (`state`) and its working values (`scratch`). Its legs are the limbs of
 * the bearing solve (`bearing.ts`), which leaves what it finds in the state's own records.
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
  /** Each foot's leg as the solve takes it, in the feet's order: its task is the state's. */
  readonly limbs: readonly Limb[];
  /** The solve of `limbs`: the root's acceleration into `state.aim.root`, and `state.helped`, `state.held` and the reading's shortfall. */
  readonly bearing: Bearing;
  /** The same asks as the whole-body solve takes them (`StanceControl.ask`), leaving what it finds in the same records. */
  readonly ask: WholeBodyAsk;
  /**
   * How far apart the soles' middles stand as the body was built, m: its own stance, which a walk's
   * end returns to (`settleStep`).
   */
  readonly rest: number;
  /** The centre of mass's height over the hip joints' centres as the body was built, m: what a goal's height over the soles leaves the hips. */
  readonly rise: number;
  readonly state: StanceState;
  readonly scratch: StanceScratch;
}

export function makeStance(built: BuiltBody, tuning: StanceTuning, assist: Assist | null): Stance {
  const feet = footStatesOf(built, tuning.supportInset ?? SUPPORT_INSET);
  const segments = [...built.segments.values()], total = massOf(segments);
  const rise = segments.reduce((sum, part) => sum + part.spec.mass.value * part.spec.centreOfMass.value[1], 0) / total
    - feet.reduce((sum, foot) => sum + foot.chain[0]!.spec.centre.value[1], 0) / feet.length;
  const pace: [number, number] = [0, 0];
  const state: StanceState = {
    pose: null, stride: null, striding: null, owned: new Uint8Array(0), last: null, pace, crouch: 0,
    step: { swing: null, lifted: false, pivoted: false, time: 0, held: 0, off: Infinity, catching: false, recovering: false, from: new Vector3(), launch: new Vector3(), turn: new Quaternion(), lift: new Quaternion(), drop: 0,
      shift: { now: [0, 0], capture: [0, 0], centre: [0, 0] } },
    flight: { on: false, left: new Vector3(), from: new Vector3() },
    plan: { on: false, at: new Vector3(), velocity: new Vector3(), missed: new Vector3() },
    reading: { centre: new Vector3(), velocity: new Vector3(), momentum: new Vector3(), support: new Vector3(), place: new Vector3(),
      plan: new Vector3(), planVelocity: new Vector3(),
      facing: 0, phase: "stand", soles: { left: feet[0]!.middle, right: feet[1]!.middle }, touching: { left: false, right: false }, own: null, recoveries: 0, strides: 0, pace,
      shortfall: { force: new Vector3(), moment: new Vector3() },
      asked: { left: { at: new Vector3(), force: new Vector3(), moment: new Vector3() }, right: { at: new Vector3(), force: new Vector3(), moment: new Vector3() } } },
    aim: { on: false, spin: new Vector3(), centre: new Vector3(), root: new Float64Array(6) },
    helped: { force: new Vector3(), moment: new Vector3() },
    held: { channels: [], z0: [], Z: [] },
    tasks: feet.map((foot): LimbTask => ({ on: false, bearing: false, linear: new Vector3(), angular: new Vector3(),
      accel: new Float64Array(foot.chain.reduce((count, joint) => count + joint.dofs.length, 0)),
      given: new Float64Array(foot.chain.reduce((count, joint) => count + joint.dofs.length, 0)).fill(NaN) })),
    feet: feet.map((foot) => foot.memory),
  };
  const limbs = feet.map((foot, f): Limb => ({
    segment: foot.segment, memory: foot.memory, reach: foot.reach, task: state.tasks[f]!,
    stem: [], work: { at: new Vector3(), rows: null, ahead: [], toward: null, patch: null, share: 1 },
  }));
  return {
    built, assist, tuning: resolveStance(tuning), pelvis: feet[0]!.chain[0]!.parent, segments,
    total,
    feet, rest: restWidth(feet), rise, limbs,
    bearing: makeBearing(assist, limbs, { root: state.aim.root, helped: state.helped, held: state.held, shortfall: state.reading.shortfall }),
    ask: { aim: state.aim, limbs, lever: 0, root: state.aim.root, helped: state.helped, shortfall: state.reading.shortfall,
      asked: feet.map((foot) => state.reading.asked[foot.side]) },
    state,
    scratch: {
      path: new Vector3(), along: new Vector3(), sole: new Vector3(), v: new Vector3(),
      target: new Quaternion(), pelvisSpin: new Vector3(), turn: new Vector3(),
      p: new Vector3(), hipAt: new Vector3(), ankleAt: new Vector3(), kneeAt: new Vector3(), shank: new Quaternion(),
      footTurn: new Quaternion(), level: new Quaternion(), whole: new Quaternion(), wholeAxis: new Vector3(), ankleHeld: new Quaternion(), ankleRelative: new Quaternion(), ankleInverse: new Quaternion(), progress: new Vector3(), carried: new Vector3(), legNow: makeLegNow(), bow: { aside: [0, 0], at: 0.5 }, accel: new Vector3(),
    },
  };
}

/** Gravity's pull, m/s^2, read from the body's world at each call. */
export const gravityOf = (s: Stance): number => -s.built.physics.gravity[1];
