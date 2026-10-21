import type { Body, BodyView } from "../body.ts";
import type { StanceGoal, SwingGoal } from "../control/stance.ts";
import type { Side } from "../spec/body.ts";
import { exp, sin, cos, hypot } from "../math/real.ts";
import { locomotion, type Locomotion } from "./locomotion.ts";
import { armSwing } from "./arm-swing.ts";

/** **A run's settings**: how long each foot bears, how high the body is thrown between, and where each foot lands. */
export interface RunSettings {
  /** Each foot's time on the ground, s. */
  readonly contact: number;
  /** The upward speed the body leaves each foot at, m/s (`SwingGoal.flight`): a flight of twice it over gravity. */
  readonly flight: number;
  /** How high the swinging sole's middle is lifted at its path's middle, m. */
  readonly lift: number;
  /** The constant the swinging foot takes up its errors from its path at, s (`SwingGoal.settle`). */
  readonly settle: number;
  /** The soles' middles' distance apart across the heading as they land, m. */
  readonly width: number;
  /** How far ahead a foot lands for each m/s the body goes faster than its pace, s (Raibert 1986). */
  readonly gain: number;
  /** How fast the run's pace goes toward the one asked, m/s². */
  readonly accel: number;
  /** The heading's fastest turn, rad/s. */
  readonly turn: number;
  /** How far under the stance's reference height the centre of mass leaves and meets each foot, m: the room the legs push through. */
  readonly drop: number;
  /**
   * The arms' swing against the legs (`armSwing`): rad of each shoulder's flexion for every metre the
   * other side's sole leads the centre of mass. Absent or 0, the arms keep the guard.
   */
  readonly arms?: number;
  /** How far the capture point is asked ahead of a steady run's for each m/s the body is short of its pace, s. Absent, 0. */
  readonly drive?: number;
  /** The lever a step's missed moment is weighed at, m (`SwingGoal.lever`); none or 0, the stance's. */
  readonly lever?: number;
}

/**
 * The run as it is taken unless told otherwise: 0.3 s on each foot and a flight of 0.07 s
 * (0.35 m/s up), the swinging sole lifted 10 cm, the feet landing 30 cm apart, placed where the
 * centre of mass will be with no correction for speed, the pace changing at 2 m/s² and the heading
 * turning at up to 3 rad/s, the centre of mass 8 cm under its reference height as each foot lands
 * and leaves, and the arms swinging 1 rad for each metre the soles part.
 */
export const RUN: RunSettings = Object.freeze({ contact: 0.3, flight: 0.35, lift: 0.1, settle: 0.05, width: 0.3, gain: 0, accel: 2, turn: 3, drop: 0.08, arms: 1 });

/** Whether `settings` are a run's: each finite, the gain not negative, the rest positive. */
export function validRun(settings: RunSettings): boolean {
  const { contact, flight, lift, settle, width, gain, accel, turn, drop, arms, drive, lever } = settings;
  return [contact, flight, lift, settle, width, gain, accel, turn, drop].every(Number.isFinite)
    && contact > 0 && flight > 0 && lift > 0 && settle > 0 && width > 0 && gain >= 0 && accel > 0 && turn > 0 && drop >= 0
    && [arms, drive, lever].every((x) => x === undefined || Number.isFinite(x) && x >= 0);
}

/** The pendulum's least height, m: a numeric floor, for a body that has fallen flat. */
const HEIGHT_FLOOR = 0.1;

/** **What a run remembers**, besides the legs' own (`locomotion`). */
interface RunMemory {
  /** The step handed to the stance while it is under way, as last aimed; null between steps. */
  step: SwingGoal | null;
  /** Whether the stance has lifted the step's foot, and for how long it has swung, s. */
  lifted: boolean;
  swung: number;
  /** The foot of the last step that landed; null standing. */
  last: Side | null;
  /** The run's velocity reached, world (x, z), m/s. */
  pace: [number, number];
}

/**
 * **The run**: a locomotion skill (`Locomotion`) whose steps fly. Each step hands the stance one
 * foot's swing (`SwingGoal`) while the other bears for `contact` and then throws the body up at
 * `flight` (`SwingGoal.flight`): nothing bears until the swinging foot lands, and the next step is
 * the other foot's. The foot is placed as a hopping machine places it (Raibert 1986, "Legged robots
 * that balance"): where the centre of mass will be as it lands, ahead by half the way it goes while
 * the foot bears, and by `gain` times the velocity's excess over the pace, out to its own side by
 * half the width; re-aimed each control step until it lands. Asked to walk nowhere, it runs on the
 * spot; asked no walk, it lands and stands. Its heading and resume are the locomotion skill's,
 * with no envelope, and its height `drop` under the reference whatever the body is asked.
 */
export function run(body: Body, settings: RunSettings = RUN): Locomotion {
  if (!validRun(settings)) throw new Error("a run needs every setting finite and positive, its gain not negative");
  const legs = locomotion(null, settings.turn);
  const g = -body.built.physics.gravity[1], seconds = settings.contact + 2 * settings.flight / g;
  const memory: RunMemory = { step: null, lifted: false, swung: 0, last: null, pace: [0, 0] };
  const state = { legs: legs.state, run: memory };
  const forget = (): void => {
    memory.step = null;
    memory.lifted = false;
    memory.swung = 0;
    memory.last = null;
    memory.pace[0] = 0;
    memory.pace[1] = 0;
  };
  /** Where `side`'s foot lands, `left` s from now, facing `heading`, the run's pace `pace` (world). */
  const landing = (view: BodyView, heading: number, side: Side, left: number, pace: readonly [number, number]): [number, number] => {
    const s = view.stance, rx = cos(heading), rz = -sin(heading), out = (side === "right" ? 1 : -1) * settings.width / 2;
    const vx = s.velocity.x, vz = s.velocity.z, ahead = left + settings.contact / 2;
    return [s.centre.x + vx * ahead + settings.gain * (vx - pace[0]) + out * rx, s.centre.z + vz * ahead + settings.gain * (vz - pace[1]) + out * rz];
  };
  /**
   * The step to `side`'s landing `to`, facing `heading`, its capture point asked where a steady run
   * at `pace` has it as the foot lands (as `stride` asks a steady walk's, its period the run's):
   * ahead of the landing by the pace's share of a step, back toward the middle by the width's, and on
   * by `drive` times the velocity's shortfall of the pace. Not moving, the stance's own, halfway
   * between the soles.
   */
  const stepTo = (view: BodyView, heading: number, side: Side, to: [number, number], pace: readonly [number, number]): SwingGoal => {
    const step: SwingGoal = { foot: side, to, seconds, lift: settings.lift, shift: false, settle: settings.settle, lands: true, flight: settings.flight,
      ...settings.lever ? { lever: settings.lever } : {} };
    if (pace[0] === 0 && pace[1] === 0) return step;
    const w = Math.sqrt(g / Math.max(view.stance.plan.y, HEIGHT_FLOOR)), grow = exp(w * seconds);
    const sign = side === "right" ? 1 : -1, rx = cos(heading), rz = -sin(heading), drive = settings.drive ?? 0, v = view.stance.velocity;
    return { ...step, capture: [to[0] + pace[0] * seconds / (grow - 1) - sign * settings.width * rx / (grow + 1) + drive * (pace[0] - v.x),
      to[1] + pace[1] * seconds / (grow - 1) - sign * settings.width * rz / (grow + 1) + drive * (pace[1] - v.z)] };
  };

  const swinger = settings.arms ? armSwing(settings.arms, true) : null;
  return {
    state, envelope: null, stopping: settings.accel,
    ...(swinger ? { arms: (view: BodyView) => swinger(view, legs.heading, { step: memory.step, swung: memory.swung, off: view.stance.phase === "swing" || view.stance.phase === "flight" }) } : {}),
    get heading() { return legs.heading; },
    get pace() { return legs.pace; },
    get reference() { return legs.reference; },
    get placed() { return legs.placed; },
    resume(view) {
      forget();
      legs.resume(view);
    },
    place(view, footing, lower) {
      forget();
      return legs.place(view, footing, lower);
    },
    goal(view, walk, face, dt) {
      const base = legs.goal(view, walk, face, dt, settings.drop);
      if (!base) return null;
      // Squaring the feet after a resume: the locomotion skill's step.
      if (base.swing) { forget(); return base; }
      const s = view.stance, asked = base.walk ?? [0, 0], pace = memory.pace, dx = asked[0] - pace[0], dz = asked[1] - pace[1];
      const most = settings.accel * dt, d = hypot(dx, dz), k = d > most ? most / d : 1;
      pace[0] += dx * k;
      pace[1] += dz * k;
      const stand: StanceGoal = { ...base, walk: null };
      // A step the stance takes of itself, to catch a push, ends the one under way.
      if (s.own) {
        memory.step = null;
        memory.lifted = false;
        memory.last = s.own.foot;
        return stand;
      }
      if (memory.step) {
        if (s.phase === "swing" || s.phase === "flight") {
          memory.lifted = true;
          memory.swung += dt;
          const to = landing(view, base.heading, memory.step.foot, Math.max(memory.step.seconds - memory.swung, 0), pace);
          if (to.every(Number.isFinite)) memory.step = { ...stepTo(view, base.heading, memory.step.foot, to, pace), follows: true };
          return { ...stand, swing: memory.step };
        }
        if (s.phase !== "stand" || !memory.lifted) return { ...stand, swing: memory.step };
        // Landed.
        memory.last = memory.step.foot;
        memory.step = null;
        memory.lifted = false;
        memory.swung = 0;
      }
      if (base.walk === null || base.walk === undefined) { memory.last = null; return stand; }
      const side: Side = memory.last === "left" ? "right" : "left";
      const to = landing(view, base.heading, side, seconds, pace);
      if (!to.every(Number.isFinite)) return stand;
      memory.step = stepTo(view, base.heading, side, to, pace);
      return { ...stand, swing: memory.step };
    },
  };
}
