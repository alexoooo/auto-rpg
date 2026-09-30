import { createController, dofAngle, STRIDE, type Controller, type Placement } from "./control.ts";
import { armModel, humanModel, legModel, lowest, placed, type Model } from "./model.ts";
import { mean, median, percentile, qRotate, type V3 } from "./math.ts";
import { massesOf, type SceneSpec, type Settings, type Sim } from "./engines/types.ts";

/** Makes a sim of `scene` at `settings`; one per engine, with its module already loaded. */
export type Factory = (scene: SceneSpec, settings: Settings) => Sim;

/** One control step: the engine's prepare, read, the controller, the torques, the solver. */
export function controlStep(sim: Sim, state: Float64Array, controller: Controller): void {
  sim.prepare();
  sim.read(state);
  controller.compute(state);
  sim.applyTorques(controller.torques);
  sim.step();
}

const minJerk = (s: number): { p: number; v: number; a: number } => {
  const x = Math.min(1, Math.max(0, s));
  return { p: 10 * x ** 3 - 15 * x ** 4 + 6 * x ** 5, v: 30 * x ** 2 - 60 * x ** 3 + 30 * x ** 4, a: 60 * x - 180 * x ** 2 + 120 * x ** 3 };
};

const rms = (xs: readonly number[]): number => Math.sqrt(xs.reduce((a, x) => a + x * x, 0) / Math.max(1, xs.length));

// ---------------------------------------------------------------------------------------------
// Case A: the standing foot.
// ---------------------------------------------------------------------------------------------

export interface FootResult {
  readonly label: string;
  /** Whether the whole centre of mass is still above 80 % of its starting height at the end. */
  readonly standing: boolean;
  /** RMS of the foot's angular speed over 1-10 s, rad/s. */
  readonly footSpinRms: number;
  /** Largest angle between the foot's up and the world's up, deg, over 0-10 s and over 1-10 s. */
  readonly footTiltMax: number;
  readonly footTiltMaxLate: number;
  /** Horizontal travel of the whole centre of mass from 1 s to 10 s, mm. */
  readonly comDrift: number;
  /** Largest horizontal distance of the centre of mass from where it stood at 1 s, over 1-10 s, mm. */
  readonly comWander: number;
  /** Horizontal slide of the foot's centre of mass over the run, mm. */
  readonly footSlide: number;
  /** Largest joint error from the held pose over 1-10 s, rad. */
  readonly jointErrorMax: number;
  /** Seconds simulated per wall second, for the record. */
  readonly msPerStep: number;
}

export function standingFoot(make: Factory, settings: Settings, conditioning = 1, seconds = 10): FootResult {
  const base = legModel();
  const model = placed(base, [0, -lowest(base), 0]);
  const foot = model.segments.findIndex((s) => s.name === "foot.left");
  const scene: SceneSpec = { models: [model], ground: true, conditioning: conditioning === 1 ? undefined : { "foot.left": conditioning } };
  const sim = make(scene, settings);
  const masses = massesOf(scene);
  const controller = createController([{ model, base: 0, root: () => foot, gravity: () => true, grounded: [foot] }], sim.segments, masses);
  const state = new Float64Array(STRIDE * sim.segments);
  const steps = Math.round(seconds * settings.hz);
  const late = Math.round(settings.hz);
  const spin: number[] = [], tilts: number[] = [], lateTilts: number[] = [], errors: number[] = [];
  const com = (): V3 => {
    let m = 0, x = 0, y = 0, z = 0;
    for (let i = 0; i < sim.segments; i++) { const o = i * STRIDE; m += masses[i]!; x += masses[i]! * state[o]!; y += masses[i]! * state[o + 1]!; z += masses[i]! * state[o + 2]!; }
    return [x / m, y / m, z / m];
  };
  let com0: V3 = [0, 0, 0], comLate: V3 = [0, 0, 0], foot0: V3 = [0, 0, 0];
  let wander = 0;
  const t0 = performance.now();
  for (let n = 0; n <= steps; n++) {
    sim.prepare();
    sim.read(state);
    const c = com();
    const o = foot * STRIDE;
    if (n === 0) { com0 = c; foot0 = [state[o]!, state[o + 1]!, state[o + 2]!]; }
    if (n === late) comLate = c;
    const up = qRotate([state[o + 3]!, state[o + 4]!, state[o + 5]!, state[o + 6]!], [0, 1, 0]);
    const tilt = (Math.acos(Math.min(1, Math.max(-1, up[1]))) * 180) / Math.PI;
    tilts.push(tilt);
    if (n >= late) {
      spin.push(Math.hypot(state[o + 10]!, state[o + 11]!, state[o + 12]!));
      lateTilts.push(tilt);
      wander = Math.max(wander, Math.hypot(c[0] - comLate[0], c[2] - comLate[2]) * 1000);
      let e = 0;
      for (const j of controller.joints) for (let k = 0; k < j.axes.length; k++) e = Math.max(e, Math.abs(dofAngle(state, j, k)));
      errors.push(e);
    }
    if (n === steps) break;
    controller.compute(state);
    sim.applyTorques(controller.torques);
    sim.step();
  }
  const ms = (performance.now() - t0) / steps;
  const c = com();
  const o = foot * STRIDE;
  const result: FootResult = {
    label: sim.label,
    standing: c[1] > 0.8 * com0[1],
    footSpinRms: rms(spin),
    footTiltMax: Math.max(...tilts),
    footTiltMaxLate: Math.max(...lateTilts),
    comDrift: Math.hypot(c[0] - comLate[0], c[2] - comLate[2]) * 1000,
    comWander: wander,
    footSlide: Math.hypot(state[o]! - foot0[0], state[o + 2]! - foot0[2]) * 1000,
    jointErrorMax: Math.max(...errors),
    msPerStep: ms,
  };
  sim.dispose();
  return result;
}

// ---------------------------------------------------------------------------------------------
// Case B: the forearm chain.
// ---------------------------------------------------------------------------------------------

/** The guard, the lab's (`GUARD`, `src/core/skills/guard.ts`), in the controller's measure. */
export const ARM_GUARD = { shoulder: [0.5, -0.2, 0], elbow: 1.3, wrist: [0, 0, 0] } as const;
/** The elbow's swing: from the guard's 1.3 rad to `ELBOW_TO`, minimum jerk over `SWING_SECONDS`, from `SWING_AT`. */
export const ELBOW_TO = 0.2;
export const SWING_SECONDS = 0.15;
export const SWING_AT = 2.5;
export const ARM_SECONDS = 4;

export interface ArmResult {
  readonly label: string;
  /** RMS of the hand's angular speed while the guard is held (1.5-2.5 s), rad/s. */
  readonly handJitterRms: number;
  /** RMS of the wrist's relative angular speed (hand less forearm) over the same window, rad/s. */
  readonly wristJitterRms: number;
  /** Largest and RMS error of the elbow from its command during the swing, rad. */
  readonly swingErrorMax: number;
  readonly swingErrorRms: number;
  /** How far the elbow went past its final command after the swing, rad. */
  readonly overshoot: number;
  /** RMS hand angular speed 0.35-1.35 s after the swing ends, rad/s. */
  readonly ringRms: number;
  /** Seconds from the swing's end until the elbow stays within 0.01 rad of its command. */
  readonly settle: number;
  /** The elbow's angle at every control step, rad. */
  readonly elbow: readonly number[];
  readonly msPerStep: number;
}

export function forearmChain(make: Factory, settings: Settings): ArmResult {
  const model = armModel();
  const scene: SceneSpec = { models: [model], ground: false };
  const sim = make(scene, settings);
  const masses = massesOf(scene);
  const controller = createController([{ model, base: 0, root: () => -1, gravity: () => true }], sim.segments, masses);
  const shoulder = controller.byName.get("shoulder.right")!, elbow = controller.byName.get("elbow.right")!, wrist = controller.byName.get("wrist.right")!;
  const hand = model.segments.findIndex((s) => s.name === "hand.right"), forearm = model.segments.findIndex((s) => s.name === "forearm.right");
  const state = new Float64Array(STRIDE * sim.segments);
  const hz = settings.hz, steps = Math.round(ARM_SECONDS * hz);
  const jitter: number[] = [], wristJ: number[] = [], swingErr: number[] = [], ring: number[] = [], angles: number[] = [];
  let overshoot = 0, lastOut = SWING_AT + SWING_SECONDS;
  const swingEnd = SWING_AT + SWING_SECONDS;
  const t0 = performance.now();
  for (let n = 0; n <= steps; n++) {
    const t = n / hz;
    sim.prepare();
    sim.read(state);
    const theta = dofAngle(state, elbow, 0);
    angles.push(theta);
    const h = hand * STRIDE, fa = forearm * STRIDE;
    const w = Math.hypot(state[h + 10]!, state[h + 11]!, state[h + 12]!);
    if (t >= 1.5 && t < SWING_AT) {
      jitter.push(w);
      wristJ.push(Math.hypot(state[h + 10]! - state[fa + 10]!, state[h + 11]! - state[fa + 11]!, state[h + 12]! - state[fa + 12]!));
    }
    if (t >= SWING_AT && t <= swingEnd) swingErr.push(theta - elbow.target[0]!);
    if (t > swingEnd) {
      overshoot = Math.max(overshoot, ELBOW_TO - theta);
      if (Math.abs(theta - ELBOW_TO) > 0.01) lastOut = t;
      if (t >= swingEnd + 0.35 && t < swingEnd + 1.35) ring.push(w);
    }
    if (n === steps) break;
    // Commands for this step.
    const approach = minJerk(t / 0.5);
    for (let k = 0; k < 3; k++) {
      shoulder.target[k] = ARM_GUARD.shoulder[k]! * approach.p;
      shoulder.rate[k] = (ARM_GUARD.shoulder[k]! * approach.v) / 0.5;
      shoulder.accel[k] = (ARM_GUARD.shoulder[k]! * approach.a) / 0.25;
      wrist.target[k] = 0;
    }
    if (t < SWING_AT) {
      elbow.target[0] = ARM_GUARD.elbow * approach.p;
      elbow.rate[0] = (ARM_GUARD.elbow * approach.v) / 0.5;
      elbow.accel[0] = (ARM_GUARD.elbow * approach.a) / 0.25;
    } else {
      const s = minJerk((t - SWING_AT) / SWING_SECONDS), d = ELBOW_TO - ARM_GUARD.elbow;
      elbow.target[0] = ARM_GUARD.elbow + d * s.p;
      elbow.rate[0] = (d * s.v) / SWING_SECONDS;
      elbow.accel[0] = (d * s.a) / SWING_SECONDS ** 2;
    }
    controller.compute(state);
    sim.applyTorques(controller.torques);
    sim.step();
  }
  const ms = (performance.now() - t0) / steps;
  sim.dispose();
  return {
    label: sim.label,
    handJitterRms: rms(jitter), wristJitterRms: rms(wristJ),
    swingErrorMax: Math.max(...swingErr.map(Math.abs)), swingErrorRms: rms(swingErr),
    overshoot, ringRms: rms(ring), settle: lastOut - swingEnd, elbow: angles, msPerStep: ms,
  };
}

/** Largest difference between two elbow series over the swing and the second after it, rad. */
export function deviation(a: readonly number[], b: readonly number[], hz: number): number {
  let d = 0;
  for (let n = Math.round(SWING_AT * hz); n < Math.min(a.length, b.length, Math.round((SWING_AT + SWING_SECONDS + 1) * hz)); n++) {
    d = Math.max(d, Math.abs(a[n]! - b[n]!));
  }
  return d;
}

// ---------------------------------------------------------------------------------------------
// Scaling: N simplified humans, standing apart or dropped in a pile.
// ---------------------------------------------------------------------------------------------

export type Layout = "spaced" | "pile";

/**
 * Where each human's body-frame origin goes. Spaced: a grid 2 m apart. Pile: 4 x 2 a layer, 1.3 m
 * by 0.6 m (arm span 1.16 m, depth 0.53 m, so no two start in contact), layers 1.9 m apart, jittered
 * by up to 5 cm: the layers land on one another and topple together.
 */
export function layoutOf(kind: Layout, n: number): V3[] {
  const out: V3[] = [];
  let seed = 12345;
  const rand = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let i = 0; i < n; i++) {
    if (kind === "spaced") {
      const side = Math.ceil(Math.sqrt(n));
      out.push([(i % side) * 2, 0, Math.floor(i / side) * 2]);
    } else {
      const layer = Math.floor(i / 8), k = i % 8;
      out.push([(k % 4) * 1.3 - 1.95 + rand() * 0.1, 0.02 + layer * 1.9, Math.floor(k / 4) * 0.6 - 0.3 + rand() * 0.1]);
    }
  }
  return out;
}

const LEG = /^(hip|knee|ankle)\.(left|right)$/;

/**
 * The human's control placement: each leg held from its own foot, read as the ground, carrying half
 * of the body above the hips, through its own hip, and none of the other leg (`Placement.share`,
 * `shareAt`); the trunk, head and arms held from the lower trunk. Gravity fed forward everywhere.
 *
 * Rejected:
 * - legs from their feet at full share, gravity off the legs: each leg also holds the other, so the
 *   pelvis counts twice in the joint-space inertia, and the body flails and falls;
 * - one tree from the left foot: the whole body's roll moment lands on that ankle, which saturates;
 * - half shares with the shared weight left at its own centre: each leg carries half the body
 *   cantilevered off its own side, and the legs squeeze the pelvis between them.
 * With the load through each hip the human stands still in Rapier, and in MuJoCo once its feet
 * carry the inertia conditioning (case C, REPORT.md).
 */
export function humanPlacement(model: Model, base: number, prefix = ""): Placement {
  const index = (name: string): number => model.segments.findIndex((s) => s.name === name);
  const trunk = index("lowerTrunk");
  const legOf = (name: string): string | undefined => /^(thigh|shank|foot)\.(left|right)$/.exec(name)?.[2];
  return {
    model, base, prefix,
    root: (j) => { const m = LEG.exec(model.joints[j]!.name); return m ? index(`foot.${m[2]}`) : trunk; },
    gravity: () => true,
    share: (j, s) => {
      const side = LEG.exec(model.joints[j]!.name)?.[2];
      if (!side) return 1;
      const leg = legOf(model.segments[s]!.name);
      return leg === undefined ? 0.5 : leg === side ? 1 : 0;
    },
    shareAt: (j) => {
      const side = LEG.exec(model.joints[j]!.name)?.[2];
      if (!side) return undefined;
      const hip = (s: string): number => model.joints.findIndex((x) => x.name === `hip.${s}`);
      return [hip(side), hip(side === "left" ? "right" : "left")];
    },
    grounded: [index("foot.left"), index("foot.right")],
  };
}

export interface StepTimes {
  readonly solver: number[];
  readonly read: number[];
  readonly control: number[];
  readonly total: number[];
}

export interface ScalingResult {
  readonly label: string;
  readonly kind: Layout;
  readonly humans: number;
  readonly steps: number;
  readonly total: Stat;
  readonly solver: Stat;
  readonly read: Stat;
  readonly control: Stat;
  /** Humans whose centre of mass is above 0.7 m at the end (spaced: still standing). */
  readonly upright: number;
  /** Largest speed of any segment at the end, m/s: an explosion check. */
  readonly maxSpeed: number;
}

export interface Stat { readonly median: number; readonly p95: number; readonly mean: number }
const stat = (xs: readonly number[]): Stat => ({ median: median(xs), p95: percentile(xs, 95), mean: mean(xs) });

export interface ScalingOptions {
  readonly warmup?: number;
  readonly measure?: number;
  readonly now?: () => number;
  /** Build the sim yourself, given the offsets (to wrap an engine's step, say). */
  readonly build?: (offsets: readonly V3[]) => Sim;
  /** Rotational-inertia factors by segment name, every human (the feet's: `FEET`, `chosen.ts`). */
  readonly conditioning?: Readonly<Record<string, number>>;
  /** Called as the timed steps start and after they end (allocation and GC counting). */
  readonly mark?: (phase: "start" | "end") => void;
}

/**
 * N humans in `kind`, the controller holding the reference pose. Warm up `warmup` steps (a pile
 * falls and lands in them), then time `measure` steps, each split into solver (prepare + step),
 * read and control (the controller and the torques handed over).
 */
export function scaling(make: Factory, settings: Settings, kind: Layout, humans: number, options: ScalingOptions = {}): ScalingResult {
  const now = options.now ?? (() => performance.now());
  const warmup = options.warmup ?? (kind === "pile" ? Math.round(1.5 * settings.hz) : Math.round(0.5 * settings.hz));
  const measure = options.measure ?? Math.round(3 * settings.hz);
  const human = humanModel();
  const lift = -lowest(human);
  const offsets = layoutOf(kind, humans).map((o): V3 => [o[0], o[1] + lift, o[2]]);
  const models = offsets.map((o) => placed(human, o));
  const scene: SceneSpec = { models, ground: true, conditioning: options.conditioning };
  const sim = options.build ? options.build(offsets) : make(scene, settings);
  const masses = massesOf(scene);
  const n = human.segments.length;
  const controller = createController(models.map((m, i) => humanPlacement(m, i * n, `${i}:`)), sim.segments, masses);
  const state = new Float64Array(STRIDE * sim.segments);
  const times: StepTimes = { solver: [], read: [], control: [], total: [] };
  for (let s = 0; s < warmup + measure; s++) {
    if (s === warmup) options.mark?.("start");
    const a = now();
    sim.prepare();
    const b = now();
    sim.read(state);
    const c = now();
    controller.compute(state);
    sim.applyTorques(controller.torques);
    const d = now();
    sim.step();
    const e = now();
    if (s >= warmup) {
      times.solver.push(b - a + (e - d)); times.read.push(c - b); times.control.push(d - c); times.total.push(e - a);
    }
  }
  options.mark?.("end");
  sim.prepare();
  sim.read(state);
  let upright = 0, maxSpeed = 0;
  for (let h = 0; h < humans; h++) {
    let m = 0, y = 0;
    for (let i = h * n; i < (h + 1) * n; i++) {
      m += masses[i]!; y += masses[i]! * state[i * STRIDE + 1]!;
      maxSpeed = Math.max(maxSpeed, Math.hypot(state[i * STRIDE + 7]!, state[i * STRIDE + 8]!, state[i * STRIDE + 9]!));
    }
    if (y / m > 0.7) upright++;
  }
  const label = sim.label;
  sim.dispose();
  return {
    label, kind, humans, steps: measure,
    total: stat(times.total), solver: stat(times.solver), read: stat(times.read), control: stat(times.control),
    upright, maxSpeed,
  };
}

export interface HumanResult {
  readonly label: string;
  /** Centre of mass height at 0.5 s and at the end, m. */
  readonly comAtHalf: number;
  readonly comAtEnd: number;
  /** Largest segment speed after 1 s, m/s: stillness. */
  readonly maxSpeedLate: number;
  /** Horizontal travel of the centre of mass from 0.5 s to the end, mm. */
  readonly comDrift: number;
}

/**
 * **Case C, an observation and no bar: one whole human on both feet** (the scaling load), held in
 * its reference pose by the controller for `seconds`. It judges nothing; it says whether the humans
 * the scaling tables time are standing.
 */
export function standingHuman(make: Factory, settings: Settings, conditioning?: Readonly<Record<string, number>>, seconds = 4): HumanResult {
  const human = humanModel();
  const model = placed(human, [0, -lowest(human), 0]);
  const scene: SceneSpec = { models: [model], ground: true, conditioning };
  const sim = make(scene, settings);
  const masses = massesOf(scene);
  const controller = createController([humanPlacement(model, 0)], sim.segments, masses);
  const state = new Float64Array(STRIDE * sim.segments);
  const n = human.segments.length, steps = Math.round(seconds * settings.hz), half = Math.round(0.5 * settings.hz);
  let comAtHalf = 0, comAtEnd = 0, maxSpeedLate = 0, x0 = 0, z0 = 0, comDrift = 0;
  for (let s = 1; s <= steps; s++) {
    controlStep(sim, state, controller);
    sim.prepare();
    sim.read(state);
    let m = 0, x = 0, y = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      m += masses[i]!; x += masses[i]! * state[o]!; y += masses[i]! * state[o + 1]!; z += masses[i]! * state[o + 2]!;
      if (s > settings.hz) maxSpeedLate = Math.max(maxSpeedLate, Math.hypot(state[o + 7]!, state[o + 8]!, state[o + 9]!));
    }
    x /= m; y /= m; z /= m;
    if (s === half) { comAtHalf = y; x0 = x; z0 = z; }
    if (s > half) comDrift = Math.max(comDrift, 1000 * Math.hypot(x - x0, z - z0));
    comAtEnd = y;
  }
  const label = sim.label;
  sim.dispose();
  return { label, comAtHalf, comAtEnd, maxSpeedLate, comDrift };
}
