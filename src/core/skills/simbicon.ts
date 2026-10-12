import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import type { MusclePush } from "../control/motor.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import { atan2, sin, cos } from "../math/real.ts";
import { spinBetweenToRef, turnAboutToRef, wrap } from "../math/turn.ts";
import { armSwing } from "./arm-swing.ts";
import { paceToward, simbiconEnvelope } from "../control/stance-envelope.ts";
import { locomotion, type LegsDrive, type Locomotion } from "./locomotion.ts";

/**
 * **A SIMBICON gait's settings** (Yin, Loken and van de Panne 2007, "SIMBICON: Simple Biped
 * Locomotion Control", SIGGRAPH): each stance's two states, the angles each asks of the legs, the
 * balance feedback on where the swinging foot goes, and how hard each leg is driven. Angles are
 * rad. "Late" names the second state of a stance, which lasts until the swinging sole meets the
 * ground.
 */
export interface SimbiconSettings {
  /** The first state of each stance, s. */
  readonly seconds: number;
  /** The most a swing lasts, s: past it the legs swap roles whether or not the sole has met the ground. */
  readonly longest: number;
  /** The swinging thigh's lean forward of straight down, in the world. */
  readonly swingHip: number;
  readonly swingHipLate: number;
  /** The swinging knee's flexion. */
  readonly swingKnee: number;
  readonly swingKneeLate: number;
  /** The swinging hip's abduction, before the balance feedback: below zero brings the foot in under the hip. */
  readonly swingSpread: number;
  /** The swinging ankle's dorsiflexion. */
  readonly swingAnkle: number;
  readonly swingAnkleLate: number;
  /** The stance knee's flexion. */
  readonly stanceKnee: number;
  readonly stanceKneeLate: number;
  /** The stance ankle's dorsiflexion, and its rad more for each m/s the body is slower forward than the walk asked: the body rolls over a foot that gives. */
  readonly stanceAnkle: number;
  readonly cvAnkle: number;
  /** The pelvis's lean forward of upright, in the world. */
  readonly lean: number;
  /**
   * The balance feedback: rad of the swinging thigh's lean for each metre the centre of mass is
   * ahead of the stance ankle (`cd`) and each m/s it goes forward (`cv`), in each state; and out to
   * the swinging side, for each metre and m/s toward it (`cdSide`, `cvSide`).
   */
  readonly cd: number;
  readonly cv: number;
  readonly cdLate: number;
  readonly cvLate: number;
  readonly cdSide: number;
  readonly cvSide: number;
  /**
   * The inverted pendulum's landing (Coros, Beaudoin and van de Panne 2010), added to the late
   * state's thigh and to the spread in both states: the angle from the swinging hip to where the
   * sole would bring the centre of mass to rest over it, times `landing`, short of that point by
   * `lead` times the walk asked forward and `leadSide` times the walk asked to the side, s, and
   * out to the swinging side by `width`, m.
   */
  readonly landing: number;
  readonly lead: number;
  readonly leadSide: number;
  readonly width: number;
  /**
   * The time each leg freedom takes up its error in, s, the paper's damping over its gain: each is
   * driven at its error over this, at up to `stance` (the bearing leg) or `swing` (the swinging leg)
   * of its strength.
   */
  readonly settle: number;
  readonly stance: number;
  readonly swing: number;
  /** The share of its strength the stance ankle is held with, lower than the knee's so the body rolls over the foot. */
  readonly ankle: number;
  /**
   * The pelvis, held upright and facing the heading in the world through the stance hip: the time
   * it takes up its turn's error in, s, and the share of the hip's strength it is held with.
   */
  readonly pelvis: number;
  readonly hold: number;
  /**
   * The heading's fastest turn while walking, rad/s, and no faster than swings the body's velocity
   * round at `swerve`, m/s²: its pace, or the walk asked if that is faster, times the turn. Setting
   * off, the heading holds while the weight shifts onto the first stance foot, and turns once it lifts.
   */
  readonly turn: number;
  readonly swerve: number;
  /** The fastest change of the walk the balance feedback asks for, m/s each second. */
  readonly speedup: number;
  /** The arms' swing against the legs (`armSwing`), rad for each metre the other side's sole leads; 0 keeps the guard. */
  readonly arms: number;
  /**
   * The walk asked forward past which it runs (`SIMBICON_RUN`), m/s: the walk is taken no faster,
   * and the run takes over as a foot lands once the body has come up to it.
   */
  readonly run: number;
  /**
   * The leg the settings were set for, m: the hip's centre to the ankle's in the reference pose
   * (`legOf`). A body whose leg is another length takes them scaled to it (`scaledGait`).
   */
  readonly leg: number;
}

/**
 * **A SIMBICON run's states**: the walk's (`SimbiconSettings`), and how each stance ends. The
 * stance knee and ankle are pushed flat out (`MusclePush`, torque sources) after the first state,
 * `pushKnee` and `push` of their strength, until the stance sole leaves the ground or `reach` s
 * have passed; from then the swinging leg reaches for its landing, and the leg that bore folds
 * its knee to `trailKnee` at the swinging leg's share, its ankle driven to `pushAnkle` at `push`.
 * The swinging sole lands where a hopping machine's does (Raibert 1986): ahead of the centre of
 * mass by half the way it goes in `contact` s, and `gain` s of its speed more than the walk asked.
 */
interface SimbiconRun extends Omit<SimbiconSettings, "stanceKneeLate" | "lead" | "turn" | "swerve" | "speedup" | "arms" | "run" | "leg"> {
  readonly push: number;
  readonly pushKnee: number;
  readonly pushAnkle: number;
  readonly reach: number;
  readonly trailKnee: number;
  readonly contact: number;
  readonly gain: number;
}

/**
 * The gait as it is taken unless told otherwise: the walk of Yin et al. 2007 (their table 1), its
 * swinging ankle kept within this body's dorsiflexion and its first state shortened, its late
 * thigh and its spread placed by the inverted pendulum's landing in place of the paper's feedback
 * on distance, and its stance ankle giving; then its angles, lean, gains and landing searched on
 * the Warrior, the Rogue and the skeleton together (`research/locomotion-search.mjs --kind simbicon
 * --way forward`, scored as well by coming to rest when asked to stand): the swinging thigh driven
 * further and its knee bent more, the feet set wider and the pelvis leaning forward. Forward under
 * gusts on their worst seeds, the Warrior and the Rogue walk and run on to 1.7 m/s and the skeleton
 * walks to 1.2, and each comes to rest when asked.
 */
export const SIMBICON: SimbiconSettings = Object.freeze({
  seconds: 0.25, longest: 0.8,
  swingHip: 0.598, swingHipLate: -0.03, swingSpread: 0.023, swingKnee: 1.19, swingKneeLate: 0.206, swingAnkle: 0.34, swingAnkleLate: 0.031,
  stanceKnee: 0.043, stanceKneeLate: 0.159, stanceAnkle: -0.023, cvAnkle: 0.221, lean: 0.116,
  cd: 0.07, cv: 0.292, cdLate: 0.24, cvLate: 0.162, cdSide: -0.242, cvSide: -0.051, landing: 1, lead: 0.134, leadSide: 0.121, width: 0.158,
  settle: 0.1, stance: 1, swing: 0.5, ankle: 0.3, pelvis: 0.1, hold: 1, turn: 2, swerve: 1.6, speedup: 0.5, arms: 0, run: 1.4,
  leg: 0.8815024260685317,
});

/**
 * The run, searched on the Warrior from the walk at 1.4 m/s (a cross-entropy search over its
 * states, scored by the pace held at 2 to 2.5 m/s asked and the time off the ground), its landing's
 * `gain` then raised from the search's 0.03, which held no pace asked and ran on when asked to
 * stop. It found no flight: with `reach` 0 the stance leg folds as its first state ends, a grounded
 * run at 2.8 steps a second that holds 40 s at 1.6 to 2.5 m/s asked, faster than asked under 2 m/s,
 * and falls within 8 s at 3.
 */
const SIMBICON_RUN: SimbiconRun = Object.freeze({
  seconds: 0.19, longest: 0.7,
  swingHip: 0.922, swingHipLate: 0, swingSpread: -0.066, swingKnee: 1.501, swingKneeLate: 0.22, swingAnkle: 0.326, swingAnkleLate: 0.251,
  stanceKnee: 0.087, stanceAnkle: 0.245, cvAnkle: 0.566, lean: 0.156,
  cd: 0, cv: -0.071, cdLate: 0, cvLate: 0, cdSide: 0, cvSide: 0, landing: 1, leadSide: 0.25, width: 0.074,
  settle: 0.164, stance: 0.954, swing: 0.951, ankle: 0.892, pelvis: 0.067, hold: 0.97,
  push: 0.859, pushKnee: 0.541, pushAnkle: -0.57, reach: 0, trailKnee: 0.689, contact: 0.271, gain: 0.15,
});

/**
 * Changing between the walk and the run as a foot lands, m/s: the run begins once the walk asked is
 * `past` over the run's pace and the body goes forward no slower than `short` under it (a walk
 * asked at the run's pace, as a cap on the walk gives it, walks), and gives way to the walk once the walk
 * asked has come down `below` under it, the walk taking up the pace the body goes and slowing
 * from it: the run has no brake of its own.
 */
const RUN_SWITCH = { past: 0.05, short: 0.1, below: 0.2 } as const;

/**
 * The farthest the face asked may be from the stance's heading for a walk to set off, rad: past it the
 * stance turns the body where it stands first, since a heading turned while the first step shifts the
 * weight onto one foot throws the body.
 */
const SET_OFF = 0.35;

/** The walk the stance is asked while it turns the body where it stands. */
const IN_PLACE: readonly [number, number] = Object.freeze([0, 0]) as readonly [number, number];

/**
 * **What a gait's setting measures**, for its scaling to a leg of another length by dynamic
 * similarity (a pendulum's gait at the same Froude number, Alexander and Jayes 1983): with the legs'
 * ratio k, a time goes as √k, a length as k, a speed as √k, and an angle, a share of strength or an
 * acceleration not at all.
 */
type Dimension = "time" | "length" | "speed" | "per-length" | "per-speed" | "rate" | "same";

/** Each setting's dimension, the walk's and the run's. */
const DIMENSION: { readonly [K in keyof SimbiconSettings | keyof SimbiconRun]: Dimension } = Object.freeze({
  seconds: "time", longest: "time", settle: "time", pelvis: "time", lead: "time", leadSide: "time", reach: "time", contact: "time", gain: "time",
  width: "length", leg: "length", run: "speed", turn: "rate",
  cd: "per-length", cdLate: "per-length", cdSide: "per-length", arms: "per-length", cv: "per-speed", cvLate: "per-speed", cvSide: "per-speed", cvAnkle: "per-speed",
  swingHip: "same", swingHipLate: "same", swingSpread: "same", swingKnee: "same", swingKneeLate: "same", swingAnkle: "same", swingAnkleLate: "same",
  stanceKnee: "same", stanceKneeLate: "same", stanceAnkle: "same", lean: "same", landing: "same", stance: "same", swing: "same", ankle: "same",
  hold: "same", swerve: "same", speedup: "same", push: "same", pushKnee: "same", pushAnkle: "same", trailKnee: "same",
});

/** What a setting of `dimension` is multiplied by for a leg `k` times as long, given `root`, √k. */
function factor(dimension: Dimension, k: number, root: number): number {
  switch (dimension) {
    case "time": case "speed": return root;
    case "length": return k;
    case "per-length": return 1 / k;
    case "per-speed": case "rate": return 1 / root;
    case "same": return 1;
    default: { const never: never = dimension; throw new Error(`no dimension ${String(never)}`); }
  }
}

/** `settings` (a gait's, a way's or the run's) for a leg `k` times as long as the one they were set for; `settings` itself if k is 1. */
export function scaledGait<T extends Partial<Record<keyof typeof DIMENSION, number>>>(settings: T, k: number): T {
  if (k === 1) return settings;
  const root = Math.sqrt(k);
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value * factor(DIMENSION[key as keyof typeof DIMENSION], k, root)])) as T;
}

/** `spec`'s leg, m: its left hip's centre to its left ankle's in the reference pose. */
export function legOf(spec: BodySpec): number {
  const centre = (name: string): readonly number[] => {
    const joint = spec.joints.find((j) => j.name === name);
    if (!joint) throw new Error(`a SIMBICON gait needs a joint ${name}`);
    return joint.centre.value;
  };
  const hip = centre("hip.left"), ankle = centre("ankle.left");
  const x = hip[0]! - ankle[0]!, y = hip[1]! - ankle[1]!, z = hip[2]! - ankle[2]!;
  return Math.sqrt(x * x + y * y + z * z);
}

/** The settings that change with the way the walk goes: the legs' angles, the lean, the balance gains and the landing's offsets. */
const WAY_KEYS = ["swingHip", "swingHipLate", "swingSpread", "swingKnee", "swingKneeLate", "swingAnkle", "swingAnkleLate",
  "stanceKnee", "stanceKneeLate", "stanceAnkle", "cvAnkle", "lean", "cd", "cv", "cdLate", "cvLate", "cdSide", "cvSide", "lead", "leadSide", "width"] as const;

/** **A way's gait**: the settings a walk to a side, or back, takes in place of forward's (`SIMBICON`). */
export type SimbiconWay = Pick<SimbiconSettings, (typeof WAY_KEYS)[number]>;

/**
 * **The gait each way** (Coros, Beaudoin and van de Panne 2010, whose walks change their settings
 * with the motion asked): to either side, and back. The walk reads a blend of these and forward's,
 * weighted by the walk asked (`blendWays`).
 */
interface SimbiconWays {
  readonly side: SimbiconWay;
  readonly back: SimbiconWay;
}


/**
 * The gait each way as it is taken unless told otherwise, each searched on the Warrior, the Rogue
 * and the skeleton together on the envelope's walk battery (`research/locomotion-search.mjs --kind
 * simbicon --way side|back --objective battery`): from standing, each way at each speed with each
 * thing a fight holds, walking the way asked at the pace asked and no faster than a ceiling over it,
 * then stopping. How fast each body holds each way is its envelope's (`simbiconEnvelope`).
 */
const SIMBICON_WAYS: SimbiconWays = Object.freeze({
  side: Object.freeze({
    swingHip: 0.4975, swingHipLate: 0.0403, swingSpread: -0.074, swingKnee: 0.9776, swingKneeLate: 0.0362, swingAnkle: 0.3159, swingAnkleLate: 0.079,
    stanceKnee: 0.0214, stanceKneeLate: 0.2522, stanceAnkle: -0.0169, cvAnkle: 0.5755, lean: 0.0107,
    cd: 0.1462, cv: 0.6811, cdLate: -0.2477, cvLate: 0.3619, cdSide: 0.0399, cvSide: 0.0996, lead: 0.0826, leadSide: 0.1217, width: 0.0725,
  }),
  back: Object.freeze({
    swingHip: 0.2959, swingHipLate: 0.1545, swingSpread: 0.0078, swingKnee: 1.389, swingKneeLate: 0.0729, swingAnkle: 0.2898, swingAnkleLate: 0.3289,
    stanceKnee: 0.0858, stanceKneeLate: 0.3839, stanceAnkle: -0.1931, cvAnkle: 0.9296, lean: -0.0592,
    cd: 0.5, cv: 0.3113, cdLate: 0.1964, cvLate: -0.076, cdSide: -0.4656, cvSide: 0.0775, lead: 0.119, leadSide: 0.097, width: 0.1153,
  }),
});

/** `ways` with `tuning`'s settings laid over each way's. */
export function simbiconWays(tuning: { readonly side?: Partial<SimbiconWay>; readonly back?: Partial<SimbiconWay> } = {}, ways: SimbiconWays = SIMBICON_WAYS): SimbiconWays {
  return { side: { ...ways.side, ...tuning.side }, back: { ...ways.back, ...tuning.back } };
}

/** Whether `ways` are a gait's: each way has exactly the settings a way changes, each finite. */
export function validWays(ways: SimbiconWays): boolean {
  return [ways.side, ways.back].every((way) => Object.keys(way).length === WAY_KEYS.length
    && WAY_KEYS.every((key) => Number.isFinite(way[key])));
}

/**
 * The settings a walk asked `forward` m/s ahead and `right` m/s to the right reads, into `out`:
 * forward's, moved toward the side's by the share of the walk's square that is sideways, and toward
 * the back's by the share that is backward. Standing, forward's.
 */
function blendWays(settings: SimbiconSettings, ways: SimbiconWays, forward: number, right: number, out: { -readonly [K in keyof SimbiconSettings]: number }): void {
  const square = forward * forward + right * right;
  const side = square > 0 ? right * right / square : 0, back = square > 0 && forward < 0 ? forward * forward / square : 0;
  for (const key of WAY_KEYS) out[key] = settings[key] + side * (ways.side[key] - settings[key]) + back * (ways.back[key] - settings[key]);
}

/** Whether `settings` are a gait's: each finite, its times, turn, swerve, speed-up, run and leg positive, its shares of strength within (0, 1] and its arms not negative. */
export function validSimbicon(settings: SimbiconSettings): boolean {
  const values = Object.values(settings) as number[];
  const { seconds, longest, settle, stance, swing, ankle, pelvis, hold, turn, swerve, speedup, arms, run, leg } = settings;
  return values.length === Object.keys(SIMBICON).length && values.every(Number.isFinite)
    && seconds > 0 && longest > seconds && [settle, pelvis, turn, swerve, speedup, run, leg].every((x) => x > 0)
    && [stance, swing, ankle, hold].every((x) => x > 0 && x <= 1) && arms >= 0;
}

/** A leg's channels, by the freedoms the gait drives. */
interface Leg {
  readonly hip: readonly [flexion: number, abduction: number, rotation: number];
  readonly knee: number;
  readonly ankle: readonly [dorsiflexion: number, inversion: number];
  readonly names: { readonly hip: readonly [string, string, string]; readonly knee: string; readonly ankle: readonly [string, string] };
}

/** **What the gait remembers**, besides the stance's legs' own (`locomotion`). */
interface SimbiconMemory {
  /** Whether it drives the legs; false while they are the stance's. */
  walking: boolean;
  /** Whether it runs (`SIMBICON_RUN`); and, running, whether the stance sole has left the ground this stance. */
  running: boolean;
  air: boolean;
  /** The leg that bears, and which of its two states it is in, and for how long it has been, s. */
  stance: Side;
  late: boolean;
  time: number;
  /** The heading it walks toward, rad. */
  heading: number;
  /** The pace asked, m/s, the walk asked forward, and the walk it is the speed of, forward and to the right of the heading. */
  pace: number;
  asked: number;
  forward: number;
  right: number;
  /** The pelvis's turn as the last step found it, for its spin; and whether there was one. */
  root: Quaternion;
  read: boolean;
  /** Asked to stand: the walk asked is brought to rest, and the legs go back to the stance as a swinging foot lands once the body is slow. */
  stopping: boolean;
  /** Setting off: the stance shifting the weight onto the first stance foot before it lifts the other. */
  shifting: boolean;
}

/**
 * Setting off, how near over the first stance sole's middle the centre of mass is brought across
 * the heading before the other foot lifts, m, and the longest the shift takes, s: the stance's
 * width leaves the body falling toward a foot lifted from the middle.
 */
const SHIFT = { near: 0.03, longest: 1.5 } as const;

/**
 * Stopping, the speeds of the centre of mass under which a landing gives the legs back to the
 * stance, m/s: along the heading, and in all, the walk's sway from side to side being part of it.
 */
const SETTLED = { forward: 0.2, all: 0.5 } as const;

/** The world's right, +x: the axis a pelvis leans forward about. */
const RIGHT: Readonly<Vector3> = Object.freeze(new Vector3(1, 0, 0));

/**
 * **A SIMBICON walk** (Yin et al. 2007): a locomotion skill (`Locomotion`) that drives the legs
 * itself (`Locomotion.drive`), with no stance goal. A finite-state machine over the legs: each
 * stance has two states, the first of `seconds`, the second until the swinging sole meets the
 * ground (`StanceReading.touching`), or `longest` has passed, when the legs swap roles. Each state
 * names an angle for every leg freedom.
 *
 * Every leg freedom is driven toward its angle at a speed (`MusclePush.speed`), its error over
 * `settle`, at up to a share of its strength: the paper's PD with its damping held by the solver
 * within the step, which an explicit damping on so light a pelvis at 120 Hz is not. The servo,
 * taking the pelvis to be held, would leave the stance leg the stiffness of what hangs below each
 * joint, a radian's bend at the knee under the body's weight.
 *
 * - **The swinging leg**, at `swing` of its strength: its thigh's lean set in the world (the
 *   pelvis's lean added back); late in the swing, and out to its side throughout, toward where
 *   its sole would bring the centre of mass to rest over it (the inverted pendulum's landing,
 *   Coros et al. 2010), short of it by the walk asked times its lead and out by `width`; and the
 *   paper's feedback, `cd` times the centre of mass's distance from the stance ankle and `cv` times
 *   its velocity's error from the walk asked.
 * - **The stance leg**: its knee at `stance` of its strength toward its state's angle; its ankle
 *   at `ankle`, a foot that gives, its dorsiflexion raised as the body is slower than the walk
 *   asked; its hip driven at the speeds that turn the pelvis upright and to the heading in the
 *   world, as the paper's stance hip holds its torso, at `hold` of its strength.
 *
 * A walk asked faster than the body holds that way (its envelope's, where it has one: `paceToward`)
 * is taken at the most it holds. Asked to go forward faster than `run`, it walks at `run` (the walk asked to the side brought down
 * with it), and once the body has come up to it runs by the same machine in the run's states
 * (`SIMBICON_RUN`) from the next landing, and walks again from a landing once the walk asked has
 * come down under it and the body has slowed to it. Running, it goes straight ahead, turning only by
 * its heading.
 *
 * The settings, each way's and the run's are taken scaled to the body's leg (`scaledGait`, `legOf`)
 * from the leg they were set for (`SimbiconSettings.leg`).
 *
 * Standing, and asked to place the feet, the legs are the stance's (`locomotion`): it walks from
 * the stance's stand, shifting the weight onto the first stance foot before the other lifts, and
 * asked to stand while walking it brings the walk asked to rest and gives the legs back to the
 * stance as a swinging foot lands once the body is slow, the stance resumed from the body as it is.
 */
export function simbicon(body: Body, given: SimbiconSettings = SIMBICON, givenWays: SimbiconWays = SIMBICON_WAYS): Locomotion {
  if (!validSimbicon(given)) throw new Error("a SIMBICON gait needs every setting finite, its times, turn, swerve, speed-up, run and leg positive, and its shares of strength within (0, 1]");
  if (!validWays(givenWays)) throw new Error("a SIMBICON gait needs each way to give every setting a way changes, finite");
  const k = legOf(body.built.spec) / given.leg, settings = scaledGait(given, k), runGait = scaledGait(SIMBICON_RUN, k);
  const ways: SimbiconWays = { side: scaledGait(givenWays.side, k), back: scaledGait(givenWays.back, k) };
  const envelope = body.envelope ? simbiconEnvelope(body.built.spec) : null;
  const legs = locomotion(envelope, settings.turn), muscles = body.muscles, dynamics = muscles.dynamics;
  const limbOf = (side: Side): Leg => {
    const names = {
      hip: [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`] as const,
      knee: `knee.${side} flexion`, ankle: [`ankle.${side} dorsiflexion`, `ankle.${side} inversion`] as const,
    };
    return { names, hip: [muscles.channel(names.hip[0]), muscles.channel(names.hip[1]), muscles.channel(names.hip[2])],
      knee: muscles.channel(names.knee), ankle: [muscles.channel(names.ankle[0]), muscles.channel(names.ankle[1])] };
  };
  const leg = { left: limbOf("left"), right: limbOf("right") };
  const memory: SimbiconMemory = { walking: false, running: false, air: false, stance: "left", late: false, time: 0, heading: 0, pace: 0, asked: 0, forward: 0, right: 0,
    root: new Quaternion(), read: false, stopping: false, shifting: false };
  const state = { legs: legs.state, gait: memory };
  const scratch = { target: new Quaternion(), pitch: new Quaternion(), error: new Vector3(), spin: new Vector3(), up: new Vector3(),
    relative: new Vector3(), speeds: [0, 0, 0] as [number, number, number] };
  const swinger = settings.arms ? armSwing(settings.arms) : null;
  // The settings this step reads: forward's blended toward the side's and the back's by the walk asked.
  const current: { -readonly [K in keyof SimbiconSettings]: number } = { ...settings };

  /**
   * The speeds of a joint's three freedoms `channels` that give it the relative spin `spin` (world),
   * into `out`: the spin is the sum of each freedom's speed times its motion axis, solved by
   * Cramer's rule; zero where the axes are all but flat.
   */
  const speedsFor = (channels: readonly number[], spin: Vector3, out: [number, number, number]): [number, number, number] => {
    const a = dynamics.axis(channels[0]!), b = dynamics.axis(channels[1]!), c = dynamics.axis(channels[2]!);
    const triple = (p: readonly number[], q: readonly number[], r: readonly number[]): number =>
      p[0]! * (q[1]! * r[2]! - q[2]! * r[1]!) - p[1]! * (q[0]! * r[2]! - q[2]! * r[0]!) + p[2]! * (q[0]! * r[1]! - q[1]! * r[0]!);
    const det = triple(a, b, c), w = [spin.x, spin.y, spin.z];
    if (Math.abs(det) < 1e-9) { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
    out[0] = triple(w, b, c) / det; out[1] = triple(a, w, c) / det; out[2] = triple(a, b, w) / det;
    return out;
  };

  const begin = (view: BodyView, heading: number, right: number): void => {
    const s = view.stance, c = s.centre;
    // Walking to a side, the foot on the other side bears and the leading foot swings first; else the foot nearer the centre of mass bears.
    const near = (side: Side): number => (s.soles[side].x - c.x) * (s.soles[side].x - c.x) + (s.soles[side].z - c.z) * (s.soles[side].z - c.z);
    memory.walking = true;
    memory.running = false;
    memory.air = false;
    memory.stance = right > 0 ? "left" : right < 0 ? "right" : near("left") <= near("right") ? "left" : "right";
    memory.late = false;
    memory.time = 0;
    memory.heading = heading;
    memory.read = false;
    memory.stopping = false;
    memory.shifting = true;
  };
  /**
   * The stance's stand with the centre of mass asked over the first stance sole; null once the
   * centre of mass, going on as it goes, would come within `SHIFT.near` of it across the heading (its
   * capture point, Pratt et al. 2006), or the shift has taken its longest.
   */
  const shift = (view: BodyView, dt: number, lower?: number): LegsDrive | null => {
    const s = view.stance, sole = s.soles[memory.stance], h = memory.heading, rx = cos(h), rz = -sin(h);
    memory.time += dt;
    const height = s.centre.y - sole.y, omega = height > 0 ? Math.sqrt(-body.built.physics.gravity[1] / height) : 0;
    const across = (sole.x - s.centre.x) * rx + (sole.z - s.centre.z) * rz, toward = s.velocity.x * rx + s.velocity.z * rz;
    const short = omega > 0 ? (across - toward / omega) * Math.sign(across) : 0;
    if (short <= SHIFT.near || memory.time >= SHIFT.longest) { memory.shifting = false; memory.time = 0; return null; }
    const goal = legs.goal(view, null, h, dt, lower);
    return { kind: "stance", goal: goal && { ...goal, centre: [sole.x, sole.z] } };
  };
  const stand = (view: BodyView): void => {
    memory.walking = false;
    memory.running = false;
    memory.stopping = false;
    memory.shifting = false;
    memory.pace = 0;
    memory.asked = 0;
    memory.forward = 0;
    memory.right = 0;
    legs.resume(view);
  };

  const walk = (view: BodyView, dt: number): LegsDrive => {
    const s = view.stance, c = s.centre, v = s.velocity, h = memory.heading;
    // The state machine: the first state on its time, the second until the swinging sole meets the ground.
    const swing: Side = memory.stance === "left" ? "right" : "left";
    memory.time += dt;
    const timing = memory.running ? runGait : settings;
    if (!memory.late && memory.time >= timing.seconds) memory.late = true;
    else if (memory.late && (s.touching[swing] || memory.time >= timing.longest)) {
      const along = v.x * sin(h) + v.z * cos(h);
      if (memory.stopping && memory.forward === 0 && memory.right === 0 && Math.abs(along) <= SETTLED.forward && v.x * v.x + v.z * v.z <= SETTLED.all * SETTLED.all) {
        stand(view);
        return { kind: "stance", goal: legs.goal(view, null, h, dt) };
      }
      memory.stance = swing;
      memory.late = false;
      memory.air = false;
      memory.time = 0;
      // The walk and the run change as a foot lands.
      if (!memory.running) memory.running = memory.asked > settings.run + RUN_SWITCH.past && memory.forward >= settings.run && along >= settings.run - RUN_SWITCH.short;
      else if (memory.forward < settings.run - RUN_SWITCH.below) {
        memory.running = false;
        memory.forward = Math.max(memory.forward, along);
      }
    }
    if (!memory.running) blendWays(settings, ways, memory.forward, memory.right, current);
    const running = memory.running, gait = running ? runGait : current, run = runGait;
    const st = leg[memory.stance], sw = leg[memory.stance === "left" ? "right" : "left"], out = memory.stance === "left" ? 1 : -1;
    // The pelvis in the world: its lean forward and to the right of the heading, and its spin.
    const turn = view.root.rotation, fx = sin(h), fz = cos(h), rx = cos(h), rz = -sin(h);
    const up = scratch.up.set(0, 1, 0).applyRotationQuaternionToRef(turn, scratch.up);
    const pitch = atan2(up.x * fx + up.z * fz, up.y), roll = atan2(up.x * rx + up.z * rz, up.y);
    const spin = memory.read ? spinBetweenToRef(memory.root, turn, dt, scratch.spin) : scratch.spin.setAll(0);
    memory.root.copyFrom(turn);
    memory.read = true;

    // The swinging leg's angles, its thigh's lean set in the world, with the balance feedback.
    const a = dynamics.pivot(st.ankle[0]), dx = c.x - a[0], dz = c.z - a[2];
    // The velocity's feedback is on its error from the walk asked (Coros et al. 2010).
    const ahead = dx * fx + dz * fz, aside = (dx * rx + dz * rz) * out;
    const forward = v.x * fx + v.z * fz - memory.forward, outward = (v.x * rx + v.z * rz - memory.right) * out;
    // Running, the swinging leg reaches for its landing once the stance sole is off the ground, or `reach` into the push.
    if (running && memory.late && !s.touching[memory.stance]) memory.air = true;
    const late = running ? memory.air || (memory.late && memory.time >= run.seconds + run.reach) : memory.late;
    // The inverted pendulum's landing: the sole set where the centre of mass, going on as it goes, comes to rest over it; a
    // stance sole above the hip, as in a fall, gives the pendulum no height.
    const p = dynamics.pivot(sw.hip[0]), height = Math.max(0, p[1] - s.soles[memory.stance].y), g = -body.built.physics.gravity[1];
    const rest = (u: number): number => u * Math.sqrt(height / g + u * u / (4 * g * g));
    const vf = v.x * fx + v.z * fz, vr = v.x * rx + v.z * rz, hx = c.x - p[0], hz = c.z - p[2];
    // Running, the sole lands where a hopping machine's does (Raibert 1986): ahead by half the way the body goes in a stance, and more as it goes too fast.
    const landF = running ? atan2(hx * fx + hz * fz + vf * run.contact / 2 + run.gain * forward, height)
      : atan2(hx * fx + hz * fz + rest(vf) - current.lead * memory.forward, height);
    const landOut = atan2((hx * rx + hz * rz + rest(vr) - gait.leadSide * memory.right) * out + gait.width, height);
    const thigh = (late ? gait.swingHipLate + gait.landing * landF : gait.swingHip) + (late ? gait.cdLate : gait.cd) * ahead + (late ? gait.cvLate : gait.cv) * forward;
    const spread = gait.swingSpread + gait.landing * landOut + gait.cdSide * aside + gait.cvSide * outward;
    const pushes: MusclePush[] = [];
    const drive = (name: string, i: number, goal: number, level: number): void => {
      const u = (goal - muscles.angle(i)) / gait.settle;
      pushes.push({ channel: name, sense: u >= 0 ? 1 : -1, level, speed: u });
    };
    drive(sw.names.hip[0], sw.hip[0], thigh + pitch, gait.swing);
    drive(sw.names.hip[1], sw.hip[1], spread + out * roll, gait.swing);
    drive(sw.names.hip[2], sw.hip[2], 0, gait.swing);
    drive(sw.names.knee, sw.knee, late ? gait.swingKneeLate : gait.swingKnee, gait.swing);
    drive(sw.names.ankle[0], sw.ankle[0], late ? gait.swingAnkleLate : gait.swingAnkle, gait.swing);
    drive(sw.names.ankle[1], sw.ankle[1], 0, gait.swing);
    // The stance knee and ankle, toward their angles under the body's weight; running, pushed off, then folded.
    if (!running || !memory.late) {
      drive(st.names.knee, st.knee, running ? run.stanceKnee : memory.late ? current.stanceKneeLate : current.stanceKnee, gait.stance);
      drive(st.names.ankle[0], st.ankle[0], gait.stanceAnkle - gait.cvAnkle * forward, gait.ankle);
    } else if (!late) {
      pushes.push({ channel: st.names.knee, sense: -1, level: run.pushKnee });
      pushes.push({ channel: st.names.ankle[0], sense: -1, level: run.push });
    } else {
      drive(st.names.knee, st.knee, run.trailKnee, run.swing);
      drive(st.names.ankle[0], st.ankle[0], run.pushAnkle, run.push);
    }
    drive(st.names.ankle[1], st.ankle[1], 0, gait.ankle);

    // The stance hip: driven at the speeds that, the thigh going on as it goes, turn the pelvis at the
    // spin that takes up its error from upright, leaning `lean` and facing the heading, in `pelvis` s.
    turnAboutToRef(Vector3.UpReadOnly, h, scratch.target).multiplyInPlace(turnAboutToRef(RIGHT, gait.lean, scratch.pitch));
    const error = spinBetweenToRef(turn, scratch.target, gait.pelvis, scratch.error);
    // The hip's spin now, the thigh's less the pelvis's, less the change the pelvis is asked for.
    const relative = scratch.relative.setAll(0);
    for (const i of st.hip) { const a = dynamics.axis(i), u = muscles.speed(i); relative.x += a[0] * u; relative.y += a[1] * u; relative.z += a[2] * u; }
    relative.addInPlace(spin).subtractInPlace(error);
    const speeds = speedsFor(st.hip, relative, scratch.speeds);
    for (let k = 0; k < 3; k++) {
      const u = speeds[k]!;
      pushes.push({ channel: st.names.hip[k]!, sense: u >= 0 ? 1 : -1, level: gait.hold, speed: u });
    }
    return { kind: "drive", posture: {}, pushes };
  };

  return {
    state, envelope,
    ...(swinger ? { arms: (view: BodyView) => memory.walking ? swinger(view, memory.heading, { step: null, swung: 0, off: false }) : null } : {}),
    get heading() { return memory.walking ? memory.heading : legs.heading; },
    get pace() { return memory.walking ? memory.pace : 0; },
    get reference() { return legs.reference; },
    get placed() { return !memory.walking && legs.placed; },
    resume(view) { stand(view); },
    place(view, footing, lower) {
      if (memory.walking) stand(view);
      return legs.place(view, footing, lower);
    },
    goal(view, walk, face, dt, lower) {
      if (memory.walking) stand(view);
      return legs.goal(view, walk, face, dt, lower);
    },
    drive(view, asked, face, dt, lower) {
      if (!memory.walking) {
        const turning = asked !== null && Math.abs(wrap(face - legs.heading)) > SET_OFF, goal = legs.goal(view, turning ? IN_PLACE : null, face, dt, lower);
        // The stance's stand until a walk is asked, the body faces near the way asked (`SET_OFF`), is up and the stance takes no step of its own.
        if (!asked || turning || !goal || view.down || view.stance.own || view.stance.phase !== "stand") return { kind: "stance", goal };
        begin(view, legs.heading, asked[1]);
      }
      if (view.down) { stand(view); return { kind: "stance", goal: legs.goal(view, null, face, dt, lower) }; }
      memory.stopping = asked === null;
      // A walk asked past what the body holds that way is taken at the most it holds (`paceToward`).
      const speed = asked ? Math.sqrt(asked[0] * asked[0] + asked[1] * asked[1]) : 0, holds = asked && envelope ? paceToward(envelope, asked[0], asked[1]) : Infinity;
      const held = speed > holds ? holds / speed : 1, forward = asked ? asked[0] * held : 0, right = asked ? asked[1] * held : 0;
      // The heading turns once the weight has shifted: the shift brings the centre of mass over the sole across the heading,
      // and a heading that turns under it shifts it toward a moving mark.
      if (asked && !memory.shifting) {
        const v = view.stance.velocity, going = Math.max(memory.pace, Math.sqrt(v.x * v.x + v.z * v.z));
        const rate = Math.min(settings.turn, going > 0 ? settings.swerve / going : Infinity) * dt, turn = wrap(face - memory.heading);
        memory.heading += Math.max(-rate, Math.min(rate, turn));
      }
      memory.pace = Math.sqrt(forward * forward + right * right);
      memory.asked = forward;
      // The walk the feedback asks for follows the walk asked, or rest, at up to `speedup`: walking, no faster forward than the run's pace, its
      // way kept; running, straight ahead, a run turning only by its heading.
      const scale = !memory.running && forward > settings.run ? settings.run / forward : 1, toward = forward * scale, side = memory.running ? 0 : right * scale;
      const most = settings.speedup * dt, df = toward - memory.forward, dr = side - memory.right, change = Math.sqrt(df * df + dr * dr);
      if (change <= most) { memory.forward = toward; memory.right = side; }
      else { memory.forward += df * most / change; memory.right += dr * most / change; }
      if (memory.shifting) {
        if (memory.stopping) { stand(view); return { kind: "stance", goal: legs.goal(view, null, face, dt, lower) }; }
        const shifted = shift(view, dt, lower);
        if (shifted) return shifted;
      }
      return walk(view, dt);
    },
  };
}
