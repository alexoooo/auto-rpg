import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import cycles from "../../../assets/core/run-cycle.json" with { type: "json" };
import type { Body, BodyView } from "../body.ts";
import type { MusclePush, Pose } from "../control/motor.ts";
import type { Side } from "../spec/body.ts";
import { atan2, cos, sin } from "../math/real.ts";
import { STANDARD_GRAVITY } from "../spec/constants.ts";
import { spinBetweenToRef, turnAboutToRef } from "../math/turn.ts";
import { armSwing } from "./arm-swing.ts";
import { otherSide } from "../spec/body.ts";

/**
 * **A run that tracks a person's run cycle's settings** (`runCycle`). Angles are rad; times s;
 * "own phase" is a leg's place in its cycle, 0 as its sole lands.
 */
export interface RunCycleSettings {
  /** How far under the slowest cycle's pace and past the fastest's the blend may run, as a share of the span to the next cycle's. */
  readonly blend: number;
  /** The pace from which the swing grows and the cycle quickens, m/s; per m/s past it, the hip's and the knee's swing's growth, and the cycle's rate's. */
  readonly gainsFrom: number;
  readonly swingGain: number;
  readonly cadenceGain: number;
  /**
   * How much a pace under the slowest cycle's shortens the hip's and the knee's swing, its cadence
   * kept: 0 none, the slowest cycle's whole swing; 1 a swing as much shorter as the pace is.
   */
  readonly short: number;
  /** The cycle's time over the clips'. */
  readonly period: number;
  /** How fast the run's pace comes up to one asked faster, and down to one asked slower, m/s². */
  readonly accel: number;
  readonly brake: number;
  /**
   * How far the run's pace may go past the body's own speed along its heading, m/s: a cycle
   * quickened past what the body has come up to throws the body forward of its feet.
   */
  readonly ahead: number;
  /** The pelvis's lean forward, its servo's time and the stance hip's share of strength holding it. */
  readonly lean: number;
  readonly pelvis: number;
  /** The lean taken back per m/s the body goes faster than its pace (forward, slower), rad, and the most it changes so. */
  readonly leanGain: number;
  readonly leanMost: number;
  /** The pelvis's lean into a turn, as a share of the lean whose tangent is the turn's pull over gravity (the speed times the heading's rate, over g). */
  readonly bank: number;
  readonly hold: number;
  /** Each freedom's error is taken up over this, on the reference's own rate. */
  readonly settle: number;
  /** The shares of strength: the stance knee, the swinging leg, the ankles. */
  readonly stance: number;
  readonly swing: number;
  readonly ankle: number;
  /** The swinging thigh's feedback, on from its own phase `late`: per m/s faster than the pace, per m the centre of mass is ahead of the stance ankle. */
  readonly cv: number;
  readonly cd: number;
  readonly late: number;
  /**
   * The swinging thigh's trim, rad per m the body has gone faster than its pace, and the most it
   * comes to: the pace's error integrated, so the run holds the pace asked.
   */
  readonly paceGain: number;
  readonly paceMost: number;
  /** Across the heading, the swinging sole lands where a hopping machine's does (Raibert 1986): half the stance's sway, `contact` s of it, more by `gainSide` s of the sway's speed, `width` out, and `cdSide` per m the centre of mass is out from the stance ankle. */
  readonly contact: number;
  readonly gainSide: number;
  readonly width: number;
  readonly cdSide: number;
  /** The stance ankle's inversion per m/s of sway. */
  readonly cvAnkleSide: number;
  /** Offsets on the cycle's angles: the stance knee while it bears, the ankles, and the swinging hip. */
  readonly kneeAdd: number;
  readonly ankleAdd: number;
  readonly hipAdd: number;
  /** A sole landing within `early` of its own phase's end sets its phase to 0; one not down by then holds the phase for at most `wait`. */
  readonly early: number;
  readonly wait: number;
  /** The arms' swing against the legs (`armSwing`) and the elbows' bend. */
  readonly arms: number;
  readonly elbow: number;
}

/**
 * The run as it is taken unless told otherwise, set for the Warrior's leg (`SimbiconSettings.leg`):
 * the best of searches on the Warrior, the Rogue and the skeleton together, each from the one
 * before's best (`research/run-cycle-search.mjs`, Node stand, Rapier, 120 Hz, measuring on), last
 * `--speeds 3,4,5 --turns 0.6,-0.6 --stops 1.5,2.4,3.5 --holds empty,club --winds 1:5:5 --seconds 22
 * --narrow 0.3` over the lateral, lean, stance and swing settings, in the guard, with the walk's
 * `run` and `speedup` (`SIMBICON`). Its `brake` is the walk's `slowdown` the search stopped it by:
 * the run's pace asked came down no faster than that.
 */
export const RUN_CYCLE: RunCycleSettings = Object.freeze({
  blend: 0.3036, gainsFrom: 4.3006, swingGain: 0.0932, cadenceGain: 0.0777, short: 0.1612, period: 1.0481, accel: 1.1428, brake: 0.473, ahead: 0.4603,
  lean: 0.3224, pelvis: 0.1946, leanGain: 0.0767, leanMost: 0.1415, bank: 0.526, hold: 0.9465, settle: 0.1277, stance: 0.7509, swing: 0.8715, ankle: 0.6568,
  cv: 0.3177, cd: 0.1805, late: 0.7804, paceGain: 0.0461, paceMost: 0.0228,
  contact: 0.1677, gainSide: 0.0257, width: 0.0997, cdSide: 0.4542, cvAnkleSide: -0.2591,
  kneeAdd: -0.1387, ankleAdd: -0.0395, hipAdd: 0.0364, early: 0.2654, wait: 0.0184, arms: 0.6842, elbow: 1.5504,
});

/**
 * Where a run holds the arms that it does not swing, rad: at the sides. The guard's, drawn in across
 * the trunk, held through a run and the walk it gives way to, throw the body sideways at every step
 * (a lab actor, Node, Rapier, 120 Hz: the Warrior and the Rogue asked 2 to 3.5 m/s, stopped after 6
 * to 15 m, fall 25 and 30 times in 40 with the guard's, 8 and 18 with these and the walk after the run
 * holding them).
 */
const RUN_ARMS = Object.freeze({ abduction: 0 });

/** The run's settings, `tuning` over `base` (by default `RUN_CYCLE`). */
export function runCycleSettings(tuning: Partial<RunCycleSettings> = {}, base: RunCycleSettings = RUN_CYCLE): RunCycleSettings {
  return { ...base, ...tuning };
}

/** Whether a run's settings are each finite and none missing or more, its times, its pace's rates and lead and the cycle's positive, and its shares of strength and `short` within (0, 1] and [0, 1]. */
export function validRunCycle(run: RunCycleSettings): boolean {
  const { settle, pelvis, period, accel, brake, ahead, contact, stance, swing, ankle, hold, early, wait, paceMost, leanMost, short } = run;
  return Object.keys(run).length === Object.keys(RUN_CYCLE).length && (Object.values(run) as number[]).every(Number.isFinite)
    && [settle, pelvis, period, accel, brake, ahead, contact].every((x) => x > 0) && [stance, swing, ankle, hold].every((x) => x > 0 && x <= 1)
    && early > 0 && early < 0.5 && wait >= 0 && paceMost >= 0 && leanMost >= 0 && short >= 0 && short <= 1;
}

/** A clip's cycle as `research/run-cycle.mjs` writes it (`assets/core/run-cycle.json`): its leg's three series and when its sole leaves. */
interface Cycle {
  readonly leg: number;
  readonly speed: number;
  readonly period: number;
  readonly leaves: number;
  readonly lean: number;
  readonly hip: readonly number[];
  readonly knee: readonly number[];
  readonly ankle: readonly number[];
}

/** The cycles the run blends between, the slower first (`research/run-cycle.mjs` writes them so, by Froude). */
const CYCLES: readonly Cycle[] = cycles.cycles;
const CHANNELS = ["hip", "knee", "ankle"] as const;
type Channel = (typeof CHANNELS)[number];

/** The world's right, +x: the axis a pelvis leans forward about. */
const RIGHT: Readonly<Vector3> = Object.freeze(new Vector3(1, 0, 0));
/** The world's forward, +z: the axis a pelvis leans to the side about. */
const FORWARD: Readonly<Vector3> = Object.freeze(new Vector3(0, 0, 1));

/** A leg's channels and their offsets from the anatomical angles the cycles are in. */
interface Leg {
  readonly hip: readonly [number, number, number];
  readonly knee: number;
  readonly ankle: readonly [number, number];
  readonly names: { readonly hip: readonly [string, string, string]; readonly knee: string; readonly ankle: readonly [string, string] };
  readonly bind: { readonly [C in Channel]: number };
  /** The hip's abduction in the reference pose, rad: what its abduction channel reads 0 at. */
  readonly spread: number;
}

/** **What the run remembers.** */
interface RunCycleMemory {
  /** The left leg's phase, turns, and how long the phase has waited for a landing, s. */
  phase: number;
  waited: number;
  /** The pace it runs at, m/s, and the swinging thigh's trim, rad. */
  pace: number;
  trim: number;
  /** Whether each sole touched at the last step. */
  touching: { left: boolean; right: boolean };
  /** The pelvis's turn as the last step found it, for its spin; and the heading, rad, for its rate. */
  root: Quaternion;
  heading: number;
  /** The pelvis's lean forward and its bank to the right that the stance hip last held it to, rad: the run's own lean as it begins. */
  lean: number;
  bank: number;
}

/**
 * **A run that tracks a person's** (the tracking of a captured cycle, Lee, Kim and Lee 2010,
 * "Data-driven biped control"): each leg's hip, knee and ankle follow a clip's run cycle as a
 * Fourier series in the leg's own phase (`assets/core/run-cycle.json`, `research/run-cycle.mjs`),
 * blended by the pace between the two clips whose paces bracket it, the swing grown and the cycle
 * quickened past `gainsFrom`, and shortened under the slowest one's pace (`short`). The cycles' speeds and times go to the body's leg by Froude (`k`, the
 * body's leg over the clip's); the settings come scaled to it.
 *
 * The phase runs on at the cycle's rate. A sole landing near its own phase's end sets it to 0, and
 * one not yet down holds it a while. While a leg's sole bears, its hip turns the pelvis upright,
 * leaning `lean`, less as the body goes faster than its pace (`leanGain`), and into a turn (`bank`), toward the heading, as SIMBICON's stance hip does (Yin, Loken and van de Panne 2007); the swinging thigh's reference is set
 * in the world, the clip's lean taken off, with the pace's feedback late in the swing; across the
 * heading the swinging sole is placed by Raibert's rule.
 */
export function runCycle(body: Body, settings: RunCycleSettings, leg: number, quick = 1): {
  readonly state: RunCycleMemory;
  /** Begins the run from the body as it is, as the sole `landed` lands. */
  begin(view: BodyView, heading: number, landed: Side): void;
  /** The pace it runs at, m/s. */
  readonly pace: number;
  /** One step toward `asked` m/s along `heading`: the legs' pushes and the arms' posture; and the sole that landed, if one did. */
  drive(view: BodyView, dt: number, heading: number, asked: number): { readonly posture: Pose; readonly pushes: MusclePush[]; readonly landed: Side | null };
} {
  const p = settings, muscles = body.muscles, dynamics = muscles.dynamics, spec = body.built.spec;
  if (CYCLES.length < 2) throw new Error("a run cycle needs two clips' cycles to blend between");
  const scale = (c: Cycle): number => Math.sqrt(leg / c.leg);
  // Each clip's speed and time taken to the body's leg, and quickened as its gait is.
  const speeds = CYCLES.map((c) => c.speed * scale(c) * quick), periods = CYCLES.map((c) => c.period * scale(c) / quick);
  const slowSpeed = speeds[0]!, slowPeriod = periods[0]!;
  const terms = CYCLES[0]!.hip.length;
  const series = { hip: new Float64Array(terms), knee: new Float64Array(terms), ankle: new Float64Array(terms) };
  /** The cycle at `pace`: the blended series, its time, s, when its sole leaves and its lean. */
  const blended = { period: 0, leaves: 0, lean: 0 };
  const blend = (pace: number): void => {
    // The two clips whose paces bracket the pace, the slowest two under the slowest and the fastest two past the fastest.
    let i = 0;
    while (i + 2 < CYCLES.length && pace > speeds[i + 1]!) i++;
    const slow = CYCLES[i]!, fast = CYCLES[i + 1]!, from = speeds[i]!, to = speeds[i + 1]!;
    const w = Math.max(i === 0 ? -p.blend : 0, Math.min(i + 2 === CYCLES.length ? 1 + p.blend : 1, (pace - from) / (to - from)));
    const past = Math.max(0, pace - p.gainsFrom), under = pace < slowSpeed ? 1 - p.short * (1 - Math.max(0, pace) / slowSpeed) : 1, grown = (1 + p.swingGain * past) * under;
    for (const channel of CHANNELS) {
      const a = slow[channel], b = fast[channel], out = series[channel], g = channel === "ankle" ? 1 : grown;
      for (let k = 0; k < terms; k++) out[k] = (a[k]! + w * (b[k]! - a[k]!)) * (k === 0 ? 1 : g);
    }
    blended.period = Math.max(slowPeriod / 2, periods[i]! + w * (periods[i + 1]! - periods[i]!)) * p.period / (1 + p.cadenceGain * past);
    blended.leaves = slow.leaves + w * (fast.leaves - slow.leaves);
    blended.lean = slow.lean + w * (fast.lean - slow.lean);
  };
  // The harmonics' cosines and sines at a phase, by the angle sum from the first.
  const harmonics = { cos: new Float64Array(terms), sin: new Float64Array(terms) };
  const at = (phase: number): void => {
    const c1 = cos(2 * Math.PI * phase), s1 = sin(2 * Math.PI * phase), hc = harmonics.cos, hs = harmonics.sin;
    let c = c1, s = s1;
    for (let k = 1; 2 * k < terms; k++) {
      hc[k] = c; hs[k] = s;
      const nc = c * c1 - s * s1;
      s = s * c1 + c * s1; c = nc;
    }
  };
  /** A channel's angle at the phase `at` was last given, and its rate, rad/s. */
  const angle = (channel: Channel): number => {
    const x = series[channel]; let y = x[0]!;
    for (let k = 1; 2 * k < terms; k++) y += x[2 * k - 1]! * harmonics.cos[k]! + x[2 * k]! * harmonics.sin[k]!;
    return y;
  };
  const rate = (channel: Channel): number => {
    const x = series[channel]; let y = 0;
    for (let k = 1; 2 * k < terms; k++) y += 2 * Math.PI * k * (x[2 * k]! * harmonics.cos[k]! - x[2 * k - 1]! * harmonics.sin[k]!);
    return y / blended.period;
  };
  const bindOf = (joint: string, dof = 0): number => {
    const found = spec.joints.find((j) => j.name === joint);
    if (!found) throw new Error(`a run cycle needs a joint ${joint}`);
    return found.dofs[dof]!.bind.value;
  };
  const limbOf = (side: Side): Leg => {
    const names = {
      hip: [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`] as const,
      knee: `knee.${side} flexion`, ankle: [`ankle.${side} dorsiflexion`, `ankle.${side} inversion`] as const,
    };
    return { names, hip: [muscles.channel(names.hip[0]), muscles.channel(names.hip[1]), muscles.channel(names.hip[2])],
      knee: muscles.channel(names.knee), ankle: [muscles.channel(names.ankle[0]), muscles.channel(names.ankle[1])],
      bind: { hip: bindOf(`hip.${side}`), knee: bindOf(`knee.${side}`), ankle: bindOf(`ankle.${side}`) }, spread: bindOf(`hip.${side}`, 1) };
  };
  const legs = { left: limbOf("left"), right: limbOf("right") };
  const memory: RunCycleMemory = { phase: 0, waited: 0, pace: 0, trim: 0, touching: { left: true, right: true }, root: new Quaternion(), heading: 0, lean: 0, bank: 0 };
  const scratch = { up: new Vector3(), spin: new Vector3(), target: new Quaternion(), pitch: new Quaternion(), roll: new Quaternion(), error: new Vector3(), relative: new Vector3(),
    speeds: [0, 0, 0] as [number, number, number] };
  const runner = armSwing(p.arms, true);
  const own = (side: Side): number => { const x = side === "left" ? memory.phase : memory.phase - 0.5; return x - Math.floor(x); };

  /** The speeds of a hip's three freedoms that give it the relative spin `spin` (world), by Cramer's rule; zero where the axes are all but flat. */
  const speedsFor = (channels: readonly number[], spin: Vector3, out: [number, number, number]): [number, number, number] => {
    const a = dynamics.axis(channels[0]!), b = dynamics.axis(channels[1]!), c = dynamics.axis(channels[2]!);
    const triple = (x: readonly number[], y: readonly number[], z: readonly number[]): number =>
      x[0]! * (y[1]! * z[2]! - y[2]! * z[1]!) - x[1]! * (y[0]! * z[2]! - y[2]! * z[0]!) + x[2]! * (y[0]! * z[1]! - y[1]! * z[0]!);
    const det = triple(a, b, c), w = [spin.x, spin.y, spin.z];
    if (Math.abs(det) < 1e-9) { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
    out[0] = triple(w, b, c) / det; out[1] = triple(a, w, c) / det; out[2] = triple(a, b, w) / det;
    return out;
  };

  return {
    state: memory,
    get pace() { return memory.pace; },
    begin(view, heading, landed) {
      const s = view.stance, fx = sin(heading), fz = cos(heading);
      memory.phase = landed === "left" ? 0 : 0.5;
      memory.waited = 0;
      memory.pace = Math.max(0, s.velocity.x * fx + s.velocity.z * fz);
      memory.trim = 0;
      memory.touching.left = s.touching.left;
      memory.touching.right = s.touching.right;
      memory.root.copyFrom(view.root.rotation);
      memory.heading = heading;
      memory.lean = p.lean;
      memory.bank = 0;
    },
    drive(view, dt, heading, asked) {
      const s = view.stance, c = s.centre, v = s.velocity;
      const fx = sin(heading), fz = cos(heading), rx = cos(heading), rz = -sin(heading), along = v.x * fx + v.z * fz;
      memory.pace += Math.max(-p.brake * dt, Math.min(p.accel * dt, Math.min(asked, along + p.ahead) - memory.pace));
      blend(memory.pace);
      // The phase: on at the cycle's rate, set to a landing near its own, held a while for one late.
      let next = memory.phase + dt / blended.period, landed: Side | null = null;
      for (const side of ["left", "right"] as const) {
        const o = own(side);
        if (s.touching[side] && !memory.touching[side]) {
          landed = side;
          if (o >= 1 - p.early) { next = memory.phase + (1 - o); memory.waited = 0; }
        }
      }
      for (const side of ["left", "right"] as const) {
        const o = own(side);
        if (o + (next - memory.phase) >= 1 && o >= 1 - p.early && !s.touching[side] && memory.waited < p.wait) { next = memory.phase + (1 - 1e-6 - o); memory.waited += dt; }
      }
      memory.touching.left = s.touching.left;
      memory.touching.right = s.touching.right;
      memory.phase = next - Math.floor(next);
      const stanceSide: Side = own("left") < 0.5 ? "left" : "right", swingSide: Side = otherSide(stanceSide);
      const st = legs[stanceSide], sw = legs[swingSide], out = stanceSide === "left" ? 1 : -1;
      const os = own(stanceSide), ow = own(swingSide);
      const bearing = s.touching[stanceSide] && os < blended.leaves + 0.05;
      // The pelvis in the world: its lean forward and to the right of the heading, and its spin.
      const turn = view.root.rotation;
      const up = scratch.up.set(0, 1, 0).applyRotationQuaternionToRef(turn, scratch.up);
      const pitch = atan2(up.x * fx + up.z * fz, up.y), roll = atan2(up.x * rx + up.z * rz, up.y);
      const spin = spinBetweenToRef(memory.root, turn, dt, scratch.spin);
      memory.root.copyFrom(turn);
      const pushes: MusclePush[] = [];
      const drive = (name: string, i: number, goal: number, level: number, more = 0): void => {
        const u = more + (goal - muscles.angle(i)) / p.settle;
        pushes.push({ channel: name, sense: u >= 0 ? 1 : -1, level: Math.min(1, level), speed: u });
      };
      const a = dynamics.pivot(st.ankle[0]), across = v.x * rx + v.z * rz;
      const error = along - memory.pace, turned = heading - memory.heading, turning = (turned - 2 * Math.PI * Math.round(turned / (2 * Math.PI))) / dt;
      memory.heading = heading;
      memory.trim = Math.max(-p.paceMost, Math.min(p.paceMost, memory.trim + p.paceGain * error * dt));
      // The swinging leg: its thigh in the world, the clip's lean taken off, with the feedback late in its swing.
      at(ow);
      const feedback = ow >= p.late || ow < 0.5 ? p.cv * error + p.cd * ((c.x - a[0]!) * fx + (c.z - a[2]!) * fz) + memory.trim : 0;
      drive(sw.names.hip[0], sw.hip[0], angle("hip") - sw.bind.hip - blended.lean + p.hipAdd + feedback + pitch, p.swing, rate("hip"));
      const hp = dynamics.pivot(sw.hip[0]), height = Math.max(0.3, hp[1]! - Math.min(s.soles.left.y, s.soles.right.y));
      const aside = ((c.x - hp[0]!) * rx + (c.z - hp[2]!) * rz + across * (p.contact / 2 + p.gainSide)) * out;
      const landOut = atan2(aside + p.width, height) + p.cdSide * ((c.x - a[0]!) * rx + (c.z - a[2]!) * rz) * out;
      drive(sw.names.hip[1], sw.hip[1], landOut + out * roll - sw.spread, p.swing);
      drive(sw.names.hip[2], sw.hip[2], 0, p.swing);
      drive(sw.names.knee, sw.knee, angle("knee") - sw.bind.knee, p.swing, rate("knee"));
      drive(sw.names.ankle[0], sw.ankle[0], angle("ankle") - sw.bind.ankle + p.ankleAdd, p.swing, rate("ankle"));
      drive(sw.names.ankle[1], sw.ankle[1], 0, p.swing);
      // The leg on the stance side: knee and ankle on the cycle; its hip holds the pelvis while its sole bears.
      at(os);
      drive(st.names.knee, st.knee, angle("knee") - st.bind.knee + (bearing ? p.kneeAdd : 0), p.stance, rate("knee"));
      drive(st.names.ankle[0], st.ankle[0], angle("ankle") - st.bind.ankle + p.ankleAdd, p.ankle, rate("ankle"));
      drive(st.names.ankle[1], st.ankle[1], p.cvAnkleSide * across * out, p.ankle);
      if (bearing) {
        const lean = p.lean - Math.max(-p.leanMost, Math.min(p.leanMost, p.leanGain * error));
        // Leaning into the turn: to the right (about forward, negative) as the heading turns right.
        const roll = -p.bank * atan2(along * turning, STANDARD_GRAVITY.value);
        memory.lean = lean; memory.bank = roll;
        turnAboutToRef(Vector3.UpReadOnly, heading, scratch.target).multiplyInPlace(turnAboutToRef(RIGHT, lean, scratch.pitch))
          .multiplyInPlace(turnAboutToRef(FORWARD, roll, scratch.roll));
        const wanted = spinBetweenToRef(turn, scratch.target, p.pelvis, scratch.error);
        // The hip's spin now, the thigh's less the pelvis's, less the change the pelvis is asked for.
        const relative = scratch.relative.setAll(0);
        for (const i of st.hip) { const axis = dynamics.axis(i), u = muscles.speed(i); relative.x += axis[0]! * u; relative.y += axis[1]! * u; relative.z += axis[2]! * u; }
        relative.addInPlace(spin).subtractInPlace(wanted);
        const speeds = speedsFor(st.hip, relative, scratch.speeds);
        for (let k = 0; k < 3; k++) pushes.push({ channel: st.names.hip[k]!, sense: speeds[k]! >= 0 ? 1 : -1, level: Math.min(1, p.hold), speed: speeds[k]! });
      } else {
        drive(st.names.hip[0], st.hip[0], angle("hip") - st.bind.hip - blended.lean + pitch, p.swing, rate("hip"));
        drive(st.names.hip[1], st.hip[1], -st.spread, p.swing);
        drive(st.names.hip[2], st.hip[2], 0, p.swing);
      }
      // The arms swing at the sides, neither drawn in nor out (`RUN_ARMS`), whatever the guard holds.
      const swung = runner(view, heading, { step: null, swung: 0, off: false });
      const posture: Pose = { "shoulder.left flexion": swung["shoulder.left flexion"]!, "shoulder.right flexion": swung["shoulder.right flexion"]!,
        "shoulder.left abduction": RUN_ARMS.abduction, "shoulder.right abduction": RUN_ARMS.abduction, "elbow.left flexion": p.elbow, "elbow.right flexion": p.elbow };
      return { posture, pushes, landed };
    },
  };
}
