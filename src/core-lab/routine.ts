import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { createBody, type BodyCommand, type CoreBody, type Fist } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { MusclePush, Pose } from "../core/control/motor.ts";
import type { StanceTuning, SwingGoal } from "../core/control/stance.ts";
import type { World } from "../core/world.ts";
import { stanceLegs } from "./legs.ts";

/**
 * **The core lab's routine**: a human walks forward, strikes three times, turns, walks back to
 * where it started and turns again, on a loop. It is an instrument for watching stage 2's muscles,
 * not a mind:
 *
 * - **The legs are the stance's** (`legs.ts`): the body stands and walks on its own feet, and
 *   strikes standing. The stance turns only while it walks, so a turn is walked, on an arc, at
 *   `TURN_PACE`, and a walk steers its heading onto the path's line as a walker would (`STEER`),
 *   so the loop comes back to its start.
 * - **Its arms' commands are hand-set joint poses and pushes**, given to the body
 *   (`src/core/body.ts`) each step as a posture for the servo to hold around the pushes. A mind
 *   would give hand goals.
 *
 * Every torque comes from the muscle driver (`src/core/muscle/driver.ts`), so the strikes are as
 * fast as the muscles make them: that is what the page is for. The strikes are hand-set onsets
 * until the strike search chooses them.
 */

/**
 * The servo's time constant, s. At 0.1 s, on this routine, over the second half of each settle and
 * the freedoms the legs leave to the posture: no speed reversed by more than 0.010 rad/s from one
 * step to the next on the Rogue at 120 Hz, 0.008 at 480 Hz, and 0.026 and 0.046 on the Warrior,
 * the worst at a wrist's radial deviation or the lumbar spine; and the guard was held within 0.026
 * and 0.029 rad on the Rogue, 0.039 and 0.022 on the Warrior, the worst at the trunk's flexion
 * (Node stand, Rapier; the Warrior at 120 Hz read over the first two settles, since it fell in the
 * third strike). That band is not the servo's: with the lower trunk held it ends within 0.0002 rad
 * (`servo`); the standing body moves under it, and the servo leaves out the root's acceleration.
 * On Havok the band was its brake on slow bodies (0.032 rad at 120 Hz), and a time constant
 * needed ten steps; on Rapier two steps hold (`servo`), so 0.1 s is a choice, not a floor.
 */
export const SERVO_SECONDS = 0.1;

export type { Fist, Pose };

/** Fists up before the chin, elbows in. */
export const GUARD: Pose = {
  "shoulder.right flexion": 0.5, "shoulder.right abduction": -0.2, "elbow.right flexion": 1.3,
  "shoulder.left flexion": 0.5, "shoulder.left abduction": -0.2, "elbow.left flexion": 1.3,
};

/**
 * One freedom pushed toward a speed no joint reaches: which way (+1 or -1), from when to when after
 * the chamber, s, and at what activation (1, flat out, when not given).
 */
export interface Push {
  readonly channel: string;
  readonly sense: 1 | -1;
  readonly from: number;
  readonly to: number;
  readonly level?: number;
}

export interface Strike {
  readonly name: string;
  readonly hand: "left" | "right";
  /** A pose held first, for `seconds`, before the pushes begin; the guard when not given. */
  readonly chamber?: { readonly seconds: number; readonly pose: Pose };
  readonly pushes: readonly Push[];
}

/** A straight from `hand`: the trunk turns away from it, the shoulder drives forward, the elbow opens. */
export function straight(hand: "left" | "right"): Strike {
  const turn = hand === "right" ? -1 : 1;
  return {
    name: `${hand} straight`, hand,
    pushes: [
      { channel: "lumbar rotation right", sense: turn, from: 0, to: 0.2 },
      { channel: "thoracic rotation right", sense: turn, from: 0, to: 0.2 },
      { channel: `shoulder.${hand} flexion`, sense: 1, from: 0.03, to: 0.18 },
      { channel: `elbow.${hand} flexion`, sense: -1, from: 0.06, to: 0.16 },
    ],
  };
}

/** A step of the routine, `seconds` long. */
export type Step =
  | { readonly kind: "settle"; readonly seconds: number }
  | { readonly kind: "walk"; readonly seconds: number; readonly metres: number }
  | { readonly kind: "turn"; readonly seconds: number; readonly radians: number }
  /**
   * On the stance, a step into a stance to strike from: the right foot to `width` across the
   * heading from the left and `behind` it, m.
   */
  | { readonly kind: "set"; readonly seconds: number; readonly width: number; readonly behind: number }
  | { readonly kind: "strike"; readonly seconds: number; readonly strike: Strike };

/**
 * The walking pace of a turn on the stance, m/s. Walking at 0.3 m/s and turned half round at 0.25,
 * 0.5, 1 and 2 rad/s, each human held every one and went the new way (`LAB_TURN_RATE` in
 * `stance-mode.ts`, Node stand, 120 Hz).
 */
export const TURN_PACE = 0.3;

/**
 * How long a turn on the stance walks straight before it turns, s. Turned from its first moment,
 * the heading turned over feet still planted for the walk's first weight shift, and the shift ran
 * away sideways until the Warrior fell, at the first turn after the strikes in most runs (Node
 * stand, 120 Hz); the lab's turn rates were measured on a walk already under way.
 */
export const TURN_LEAD = 1;

export const ROUTINE: readonly Step[] = [
  { kind: "settle", seconds: 1 },
  { kind: "walk", seconds: 5, metres: 2 },
  { kind: "settle", seconds: 1.5 },
  { kind: "set", seconds: 1.5, width: 0.3, behind: 0.15 },
  { kind: "strike", seconds: 0.8, strike: straight("right") },
  { kind: "strike", seconds: 0.8, strike: straight("left") },
  { kind: "strike", seconds: 0.8, strike: straight("right") },
  { kind: "settle", seconds: 1.5 },
  { kind: "turn", seconds: TURN_LEAD + Math.PI, radians: Math.PI },
  { kind: "walk", seconds: 5, metres: 2 },
  { kind: "turn", seconds: TURN_LEAD + Math.PI, radians: Math.PI },
];

/**
 * **How a walk on the stance steers**: at its pace, straight ahead, its heading turned toward the
 * point of the path's line `metres` further on than the body is, no more than `most` off the
 * line (rad) and at no more than `rate` (rad/s, inside the turn rates the stance held walking,
 * `LAB_TURN_RATE`). Walked on the path's heading alone, the stance does not end a turn where the
 * path does, and each loop of `ROUTINE` ended some 0.4 m further from where it began, each human
 * (Node stand, 120 Hz). Asked instead for the velocity toward where the path would be a second on,
 * sideways and faster to catch up, it fell in three runs of four.
 */
export const STEER = { metres: 1, most: 0.35, rate: 0.5 } as const;

/** A set step's swing: its time and lift, s and m, as the stance's steps were measured (`tests/core-stance.test.mjs`). */
const SET_SWING = { seconds: 0.45, lift: 0.05 } as const;

/** Where the routine is. */
export interface RoutineState {
  /** Seconds since the routine began. */
  readonly time: number;
  readonly step: Step;
  readonly stepIndex: number;
  /** Seconds into the step. */
  readonly into: number;
}

export interface StrikeReading {
  readonly name: string;
  /** Peak fist speed in the world, m/s, over the strike's window. */
  readonly peak: number;
}

export interface Routine {
  readonly body: CoreBody;
  readonly fists: { readonly left: Fist; readonly right: Fist };
  state(): RoutineState;
  /** The fist speed of the striking hand (or the right one), m/s, last sub-step. */
  fistSpeed(): number;
  /** Each strike thrown so far, most recent last. */
  readonly strikes: readonly StrikeReading[];
  /**
   * How far `hand` is closed into a fist, 0 relaxed to 1 closed, for the skin to draw. The routine
   * owns the strike timing, so it says when; nothing physical reads this.
   */
  closure(hand: "left" | "right"): number;
  dispose(): void;
}

/**
 * Run `ROUTINE` on `built`, a human in its reference pose at the origin, facing +z, on its feet on the
 * ground; `tuning` tunes its stance, as an experiment's override.
 */
export function startRoutine(built: BuiltBody, world: World, routine: readonly Step[] = ROUTINE, tuning?: StanceTuning): Routine {
  if (!built.segments.has("lowerTrunk")) throw new Error(`${built.spec.model} is not a human the routine knows`);
  const stance = stanceLegs();
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, stance: tuning });
  const fists = body.view.fists;
  const speed = { left: 0, right: 0 };

  const cycle = routine.reduce((sum, step) => sum + step.seconds, 0);
  let time = 0, stepIndex = 0, into = 0;
  // Where the walk has got to: the start of the current step, and the heading.
  type Place = { at: Vector3; heading: number };
  const place: Place = { at: new Vector3(), heading: 0 };
  const start: Place = { at: new Vector3(), heading: 0 };
  // Where the body's centre of mass began the path (x, z), and the heading asked.
  let home: readonly [number, number] | null = null, facing = 0;
  // A set step's swing, fixed where its step began.
  let setting: SwingGoal | null = null;
  const strikes: StrikeReading[] = [];
  let peak = 0;

  /** Where the path is `seconds` into the current step. A turn is an arc walked at `TURN_PACE`. */
  const locate = (seconds: number, out: Place = place) => {
    const step = routine[stepIndex]!;
    const f = Math.min(1, seconds / step.seconds);
    out.at.copyFrom(start.at);
    out.heading = start.heading;
    switch (step.kind) {
      case "walk": {
        const d = step.metres * f;
        out.at.addInPlaceFromFloats(Math.sin(start.heading) * d, 0, Math.cos(start.heading) * d);
        break;
      }
      case "turn": {
        // Straight for `TURN_LEAD`, then an arc whose radius is the pace over the
        // turn's rate, its centre on the side turned to. The right of a heading h is (cos h, -sin h).
        const t = f * step.seconds, lead = Math.min(t, TURN_LEAD), rate = step.radians / (step.seconds - TURN_LEAD);
        out.at.addInPlaceFromFloats(Math.sin(start.heading) * TURN_PACE * lead, 0, Math.cos(start.heading) * TURN_PACE * lead);
        const from = out.heading, side = TURN_PACE / rate;
        out.heading += rate * Math.max(0, t - TURN_LEAD);
        out.at.addInPlaceFromFloats(side * (Math.cos(from) - Math.cos(out.heading)), 0, side * (Math.sin(out.heading) - Math.sin(from)));
        break;
      }
      case "settle": case "strike": case "set": break;
      default: { const never: never = step; throw new Error(`unknown step ${JSON.stringify(never)}`); }
    }
  };

  const pushes: MusclePush[] = [];
  const command: { -readonly [K in keyof BodyCommand]: BodyCommand[K] } =
    { posture: {}, hands: { left: null, right: null }, pushes, stance: null };
  body.drive((view, dt) => {
    time += dt;
    into += dt;
    while (into >= routine[stepIndex]!.seconds) {
      const done = routine[stepIndex]!;
      locate(done.seconds);
      into -= done.seconds;
      if (done.kind === "strike") strikes.push({ name: done.strike.name, peak });
      peak = 0;
      start.at.copyFrom(place.at);
      start.heading = place.heading;
      stepIndex = (stepIndex + 1) % routine.length;
      if (stepIndex === 0) time = time % cycle;
    }
    locate(into);
    const step = routine[stepIndex]!;

    // A walk steered onto its line, a turn walked on its arc, else standing.
    const c = view.stance.centre;
    if (!home && view.time > 0) home = [c.x, c.z];
    let walk: [number, number] | null = null;
    if (home && step.kind === "walk") {
      const h = start.heading, fx = Math.sin(h), fz = Math.cos(h);
      const sx = home[0] + start.at.x, sz = home[1] + start.at.z;
      const along = (c.x - sx) * fx + (c.z - sz) * fz + STEER.metres;
      const aim = Math.atan2(sx + fx * along - c.x, sz + fz * along - c.z);
      const off = Math.max(-STEER.most, Math.min(STEER.most, wrap(aim - h)));
      facing += Math.max(-STEER.rate * dt, Math.min(STEER.rate * dt, wrap(h + off - facing)));
      // The pace that ends the line on time, from where the body is along it.
      const left = step.metres - (along - STEER.metres), time = Math.max(step.seconds - into, 1);
      const pace = Math.max(0.1, Math.min(0.5, left / time));
      walk = [pace, 0];
    } else if (home && step.kind === "turn") {
      if (into >= TURN_LEAD) facing += step.radians / (step.seconds - TURN_LEAD) * dt;
      walk = [TURN_PACE, 0];
    }
    if (step.kind !== "set") setting = null;
    else if (!setting) {
      // The right foot to its place from the left: the right of a heading h is (cos h, -sin h).
      const left = view.stance.soles.left, h = facing;
      setting = { foot: "right", seconds: SET_SWING.seconds, lift: SET_SWING.lift,
        to: [left.x + step.width * Math.cos(h) - step.behind * Math.sin(h), left.z - step.width * Math.sin(h) - step.behind * Math.cos(h)] };
    }
    const goal = stance.goal(view, facing, walk);
    command.stance = goal && setting ? { ...goal, swing: setting } : goal;

    // The fists, as the last sub-step left them.
    for (const side of ["left", "right"] as const) speed[side] = fists[side].velocity.length();
    if (step.kind === "strike") peak = Math.max(peak, speed[step.strike.hand]);

    // A strike's chamber, then its pushes, timed from the chamber's end.
    const strike = step.kind === "strike" ? step.strike : undefined;
    const chambered = strike?.chamber && into < strike.chamber.seconds ? strike.chamber.pose : undefined;
    const since = into - (strike?.chamber?.seconds ?? 0);
    pushes.length = 0;
    if (strike && !chambered) {
      for (const p of strike.pushes) if (since >= p.from && since < p.to) pushes.push({ channel: p.channel, sense: p.sense, level: p.level ?? 1 });
    }
    command.posture = { ...GUARD, ...chambered };
    return command;
  });

  return {
    body,
    fists,
    strikes,
    state: () => ({ time, step: routine[stepIndex]!, stepIndex, into }),
    fistSpeed: () => {
      const step = routine[stepIndex]!;
      return step.kind === "strike" ? speed[step.strike.hand] : Math.max(speed.left, speed.right);
    },
    closure: (hand) => {
      const step = routine[stepIndex]!, before = routine[(stepIndex + routine.length - 1) % routine.length]!;
      if (step.kind === "strike" && step.strike.hand === hand) return Math.min(1, into / FIST_CLOSING);
      if (before.kind === "strike" && before.strike.hand === hand) return Math.max(0, 1 - into / FIST_OPENING);
      return 0;
    },
    dispose: () => body.dispose(),
  };
}

/** `a` turned into (-pi, pi]. */
const wrap = (a: number): number => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));

/**
 * A striking hand closes over `FIST_CLOSING` seconds from its strike's start, before the elbow's
 * push begins at 0.06 s, and opens over `FIST_OPENING` seconds of the step after. Chosen by eye.
 */
const FIST_CLOSING = 0.1, FIST_OPENING = 0.25;
