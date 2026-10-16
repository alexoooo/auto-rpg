import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { jacobianTo } from "../control/bearing.ts";
import type { MusclePush, Pose } from "../control/motor.ts";
import { LEG_DAMPING } from "../control/stance-tuning.ts";
import { fixedSolveTo, fixedWork } from "../math/flat.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import { atan2, sin, cos } from "../math/real.ts";
import { spinBetweenToRef, turnAboutToRef, wrap } from "../math/turn.ts";
import { armSwing } from "./arm-swing.ts";
import { paceToward, quickened, simbiconEnvelope, simbiconRunEnvelope, type StanceEnvelope } from "../control/stance-envelope.ts";
import { hasteOver } from "../human/attributes.ts";
import { locomotion, type LegsDrive, type Locomotion } from "./locomotion.ts";
import { gaitAssist, type GaitAssistMemory } from "./gait-assist.ts";
import { RUN_ARMS, RUN_CYCLE, runCycle, validRunCycle, type RunCycleSettings } from "./cycle-run.ts";

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
  /** The stance ankle's inversion, rad for each m/s the body goes out toward the swinging side faster than the walk asked. */
  readonly cvAnkleSide: number;
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
   * out to the swinging side by `width`, m. The swinging leg on the side the walk goes lands short by
   * `leadOut` in place of `leadSide`: a leading sole short of where the centre of mass comes to rest
   * lets it roll on past that sole, and the trailing leg cannot step out under it.
   */
  readonly landing: number;
  readonly lead: number;
  readonly leadSide: number;
  readonly leadOut: number;
  readonly width: number;
  /**
   * The stance leg's speed servo, the velocity form of a virtual force on the centre of mass
   * (Coros, Beaudoin and van de Panne 2010): the stance leg's freedoms are driven, besides toward
   * their angles, at the speeds that carry the centre of mass over the planted foot `vf` times the
   * error of its walk over the last stride from the walk asked forward faster, and `vfSide` times it
   * to the side, at most `vfMost` m/s, the pelvis's spin and height left as they are. Over a stride
   * each step's sway toward its stance foot cancels. At 0 the leg is driven toward its angles alone.
   */
  readonly vf: number;
  readonly vfSide: number;
  readonly vfMost: number;
  /**
   * The landing's regulator of the walk's speed, step to step: at each landing the trim forward
   * keeps `1 - trimLeak` of itself and gains `trim` s times the m/s the walk over the last stride
   * fell short of the walk asked forward, and the trim to the side `trimSide` s times its shortfall
   * to the right, each at most `trimMost` m; the swinging sole lands that much short of where the
   * landing sets it, so a walk slower than asked lands shorter and goes on faster, and one faster
   * lands further and brakes. The trims are learnt over a steady walk: a stride over which the walk
   * asked changed by more than `TRIM_STEADY` clears them. At 0 the landing is the pendulum's alone.
   */
  readonly trim: number;
  readonly trimSide: number;
  readonly trimMost: number;
  readonly trimLeak: number;
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
   * round at `swerve`, m/s²: its pace, or the walk asked if that is faster, times the turn. It turns
   * as fast as it may at once, but slows its turn, or turns it the other way, by no more than
   * `turnRate` rad/s each second, stopping on the face asked: a face that turns steadily is followed
   * at its rate, and one asked back and forth faster than that swings the heading less. Setting off, the heading holds while the weight shifts onto the first stance foot, and
   * turns once it lifts.
   */
  readonly turn: number;
  readonly swerve: number;
  readonly turnRate: number;
  /**
   * The fastest change of the walk the balance feedback asks for, m/s each second: up to `speedup`
   * speeding up, and to `slowdown` slowing, each way its own (`SIMBICON_WAYS`), which the run follows at no more than its own rates
   * (`RunCycleSettings.accel` and `brake`): a run braked faster than about 0.5 m/s² falls more often as it stops.
   */
  readonly speedup: number;
  readonly slowdown: number;
  /** The arms' swing against the legs (`armSwing`), rad for each metre the other side's sole leads; 0 keeps the guard. */
  readonly arms: number;
  /**
   * The walk asked forward past which it runs (`runCycle`), m/s: the walk is taken no faster,
   * and the run takes over as a foot lands once the body has come up to it.
   */
  readonly run: number;
  /**
   * The leg the settings were set for, m: the hip's centre to the ankle's in the reference pose
   * (`legOf`). A body whose leg is another length takes them scaled to it (`scaledGait`).
   */
  readonly leg: number;
  /**
   * How a hasted body's gait is timed (`AttributeSpec.haste`, `hasteOver`): its times go as one over
   * its haste over a person's to this power, 0, 1/2 or 1, and its speeds as that power of it.
   */
  readonly hasted: number;
}

/**
 * The gait as it is taken unless told otherwise: the walk of Yin et al. 2007 (their table 1), its
 * swinging ankle kept within this body's dorsiflexion and its first state shortened, its late
 * thigh and its spread placed by the inverted pendulum's landing in place of the paper's feedback
 * on distance, and its stance ankle giving; then its angles, lean, gains and landing searched on
 * the Warrior, the Rogue and the skeleton together (`research/locomotion-search.mjs --kind simbicon
 * --way forward --objective battery --turns --track --narrow 0.9 --winds 1:5:11,12,13,14`): scored on
 * the envelope's walk battery calm and in the lab's 5 N gusts, by the share of each pace it made, and
 * cut as its soles land wider than 0.9 of how they stood. It steps about as wide as it stands, with
 * the stance leg's speed servo and the landing's trims on. The pace it runs from (`run`) and how
 * fast its walk asked speeds up (`speedup`) are searched with the run
 * (`research/run-cycle-search.mjs`). The walk's `slowdown` is not the search's: its 0.68 m/s² throws
 * the skeleton's guard walk as it stops from 1.2 m/s (Node stand, Rapier, 120 Hz, the stance
 * envelope's walk with running free: 4 falls in 5 calm and in gusts, against none at this one).
 */
export const SIMBICON: SimbiconSettings = Object.freeze({
  seconds: 0.25, longest: 0.8,
  swingHip: 0.596, swingHipLate: -0.0317, swingSpread: -0.1043, swingKnee: 1.1192, swingKneeLate: 0.0323, swingAnkle: 0.35, swingAnkleLate: 0.1059,
  stanceKnee: 0.0197, stanceKneeLate: 0.2298, stanceAnkle: -0.0123, cvAnkle: 0.2434, cvAnkleSide: -0.5131, lean: 0.1583,
  cd: 0.5, cv: 0.141, cdLate: 0.2207, cvLate: 0.2293, cdSide: -0.5, cvSide: 0.0138, landing: 1, lead: 0.0793, leadSide: 0.1406, leadOut: -0.0657, width: 0.2269, vf: 0.5255, vfSide: 0.6894, vfMost: 0.6701, trim: 0.0083, trimSide: 0, trimMost: 0.1, trimLeak: 0.2,
  settle: 0.1, stance: 1, swing: 0.5, ankle: 0.2902, pelvis: 0.1, hold: 1, turn: 2, swerve: 1.6, turnRate: 2, speedup: 1.1608, slowdown: 0.473, arms: 0, run: 1.3103,
  leg: 0.8815024260685317, hasted: 0,
});

/**
 * Changing between the walk and the run as a foot lands, m/s: the run begins once the walk asked is
 * `past` over the run's pace and the body goes forward no slower than `short` under it (a walk
 * asked at the run's pace, as a cap on the walk gives it, walks), or, for a body whose walk makes
 * less than the run's pace, once the walk asked has stood at it for `top` s, by when the body goes as
 * fast as it walks, taking up the pace the body goes; and, once it has landed `landings` times, gives way to the walk
 * once the pace asked (not the walk it has ramped to) has come down `below` under it and the body has slowed to the run's pace, its
 * landings braking it until then, or, told it may not run, once the walk asked has come down to the
 * run's pace; the walk takes up the pace the body goes and slows from it. A run that gives way at its first
 * landing hands the walk a body just come down from the run's first flight, whose swinging foot does not come
 * down before the body tips over the stance foot.
 */
const RUN_SWITCH = { past: 0.05, short: 0.1, below: 0.2, top: 1, landings: 2 } as const;

/** The most the walk asked may change over a stride, m/s, forward and to the side together, for the landing's trims to learn from it (`SimbiconSettings.trim`). */
const TRIM_STEADY = 0.05;

/**
 * The farthest the face asked may be from the walk's heading for it to walk as asked, rad: setting off
 * (`set`), past it the walk steps where it stands while its heading turns, as a person turns round; under
 * way, it walks on turning through a bend up to `round`, and past that it brakes to turn round. The
 * stance's own turn where it stands twists the pelvis over feet that stay put, and a walk set off from
 * it walks across the way the feet face.
 */
const SET_OFF = Object.freeze({ set: 0.35, round: Math.PI / 2 });

/** The speed, m/s, under which a walk is setting off (`SET_OFF`), and turns its heading turning round: faster, it brakes first. */
const TURN_ROUND = 0.3;

/**
 * The least share of its trials a pace must have held that way for the gait to take it asked
 * (`paceToward`): a mind may ask a pace it risks falling at, and the most it gets is one the body
 * held in a fifth of its tries.
 */
const REACH = 0.2;

/**
 * **What a gait's setting measures**, for its scaling to a leg of another length by dynamic
 * similarity (a pendulum's gait at the same Froude number, Alexander and Jayes 1983): with the legs'
 * ratio k, a time goes as √k, a length as k, a speed as √k, and an angle, a share of strength or an
 * acceleration not at all.
 */
type Dimension = "time" | "length" | "speed" | "per-length" | "per-speed" | "rate" | "rate-change" | "same";

/** Each setting's dimension, the walk's and the run's. */
const DIMENSION: { readonly [K in keyof SimbiconSettings | keyof RunCycleSettings]: Dimension } = Object.freeze({
  seconds: "time", longest: "time", settle: "time", pelvis: "time", lead: "time", leadSide: "time", leadOut: "time", contact: "time", gainSide: "time", wait: "time",
  width: "length", leg: "length", trimMost: "length", run: "speed", vfMost: "speed", gainsFrom: "speed", paceGain: "per-length", swingGain: "per-speed", cadenceGain: "per-speed", turn: "rate", turnRate: "rate-change", trim: "time", trimSide: "time",
  cd: "per-length", cdLate: "per-length", cdSide: "per-length", arms: "per-length", cv: "per-speed", cvLate: "per-speed", cvSide: "per-speed", cvAnkle: "per-speed", cvAnkleSide: "per-speed",
  swingHip: "same", swingHipLate: "same", swingSpread: "same", swingKnee: "same", swingKneeLate: "same", swingAnkle: "same", swingAnkleLate: "same",
  stanceKnee: "same", stanceKneeLate: "same", stanceAnkle: "same", lean: "same", landing: "same", stance: "same", swing: "same", ankle: "same",
  hold: "same", elbow: "same", vf: "same", vfSide: "same", trimLeak: "same", swerve: "same", speedup: "same", slowdown: "same",
  hasted: "same", blend: "same", short: "same", leanGain: "per-speed", leanMost: "same", bank: "same", period: "same", accel: "same", brake: "same", ahead: "speed", late: "same", paceMost: "same", kneeAdd: "same", ankleAdd: "same", hipAdd: "same", early: "same",
});

/**
 * What a setting of `dimension` is multiplied by for a leg `k` times as long, given `root`, √k, on a
 * body whose gait is `quick` times as quick (`quickness`): its times shortened by it, its lengths kept.
 */
function factor(dimension: Dimension, k: number, root: number, quick: number): number {
  switch (dimension) {
    case "time": return root / quick;
    case "speed": return root * quick;
    case "length": return k;
    case "per-length": return 1 / k;
    case "rate-change": return 1 / k * quick * quick;
    case "per-speed": return 1 / root / quick;
    case "rate": return 1 / root * quick;
    case "same": return 1;
    default: { const never: never = dimension; throw new Error(`no dimension ${String(never)}`); }
  }
}

/**
 * `settings` (a gait's, a way's or the run's) for a leg `k` times as long as the one they were set
 * for, on a body whose gait is `quick` times as quick; `settings` itself if both are 1.
 */
export function scaledGait<T extends Partial<Record<keyof typeof DIMENSION, number>>>(settings: T, k: number, quick = 1): T {
  if (k === 1 && quick === 1) return settings;
  const root = Math.sqrt(k);
  return Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value * factor(DIMENSION[key as keyof typeof DIMENSION], k, root, quick)])) as T;
}

/** How many times as quick the gait of a body hasted `haste` times a person (`hasteOver`) is, timed by `hasted` (`SimbiconSettings.hasted`). */
function quickness(haste: number, hasted: number): number {
  if (hasted === 0) return 1;
  if (hasted === 0.5) return Math.sqrt(haste);
  if (hasted === 1) return haste;
  throw new Error(`a gait is timed to its haste to the power 0, 1/2 or 1, not ${hasted}`);
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

/** The settings that change with the way the walk goes: the legs' angles, the lean, the balance gains, the landing's offsets, the stance servo and the stance ankle's share. */
const WAY_KEYS = ["swingHip", "swingHipLate", "swingSpread", "swingKnee", "swingKneeLate", "swingAnkle", "swingAnkleLate",
  "stanceKnee", "stanceKneeLate", "stanceAnkle", "cvAnkle", "cvAnkleSide", "lean", "cd", "cv", "cdLate", "cvLate", "cdSide", "cvSide", "lead", "leadSide", "leadOut", "width", "vf", "vfSide", "vfMost", "ankle", "trim", "trimSide", "speedup", "slowdown"] as const;

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
 * and the skeleton together, with the legs of the run's body (`docs/reference/run-body.md`), on the
 * envelope's walk battery (`research/locomotion-search.mjs --kind simbicon --way side|back --objective
 * battery`): from standing, each way at each speed with each thing a fight holds, walking the way
 * asked at the pace asked and no faster than a ceiling over it, then stopping, the walk asked changed at 0.5 m/s² either way (`speedup`,
 * `slowdown`), which each way keeps: forward's sets off faster for the run. How fast each body holds each way is its envelope's (`simbiconEnvelope`).
 */
const SIMBICON_WAYS: SimbiconWays = Object.freeze({
  side: Object.freeze({
    swingHip: 0.5929, swingHipLate: 0.0303, swingSpread: -0.2959, swingKnee: 1.2181, swingKneeLate: 0, swingAnkle: 0.35, swingAnkleLate: 0.2295,
    stanceKnee: 0.1678, stanceKneeLate: 0.3902, stanceAnkle: 0.0457, cvAnkle: 0.6201, cvAnkleSide: -0.3403, lean: 0.1456,
    cd: 0.2291, cv: 0.4691, cdLate: 0.0532, cvLate: 0.4097, cdSide: -0.2444, cvSide: 0.1273, lead: 0.1425, leadSide: 0.087, leadOut: -0.1494, width: 0.3, vf: 0.2017, vfSide: 1.4861, vfMost: 0.5352, ankle: 0.4927, trim: 0.1228, trimSide: 0.0888, speedup: 0.5, slowdown: 0.5,
  }),
  back: Object.freeze({
    swingHip: 0.3705, swingHipLate: 0.1356, swingSpread: -0.0365, swingKnee: 1.6, swingKneeLate: 0, swingAnkle: 0.334, swingAnkleLate: 0.2045,
    stanceKnee: 0.0689, stanceKneeLate: 0.3858, stanceAnkle: -0.1169, cvAnkle: 0.7385, cvAnkleSide: -0.2147, lean: 0.1435,
    cd: 0.3335, cv: 0.259, cdLate: -0.3136, cvLate: 0.0644, cdSide: -0.3307, cvSide: -0.0644, lead: -0.0285, leadSide: 0.3283, leadOut: 0.1242, width: 0.2033, vf: 0.1339, vfSide: 0.3382, vfMost: 0.2481, ankle: 0.4084, trim: 0.1872, trimSide: 0.0106, speedup: 0.5, slowdown: 0.5,
  }),
});

/** `ways` with `tuning`'s settings laid over each way's. */
export function simbiconWays(tuning: { readonly side?: Partial<SimbiconWay>; readonly back?: Partial<SimbiconWay> } = {}, ways: SimbiconWays = SIMBICON_WAYS): SimbiconWays {
  return { side: { ...ways.side, ...tuning.side }, back: { ...ways.back, ...tuning.back } };
}

/** The run's settings with `tuning`'s laid over them. */

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

/** Whether `settings` are a gait's: each finite, its times, turn, swerve, turn's change, speed-up, run and leg positive, its shares of strength within (0, 1] and its arms not negative. */
export function validSimbicon(settings: SimbiconSettings): boolean {
  const values = Object.values(settings) as number[];
  const { seconds, longest, settle, stance, swing, ankle, pelvis, hold, turn, swerve, turnRate, speedup, slowdown, arms, run, leg } = settings;
  return values.length === Object.keys(SIMBICON).length && values.every(Number.isFinite)
    && seconds > 0 && longest > seconds && [settle, pelvis, turn, swerve, turnRate, speedup, slowdown, run, leg].every((x) => x > 0)
    && [stance, swing, ankle, hold].every((x) => x > 0 && x <= 1) && arms >= 0 && [0, 0.5, 1].includes(settings.hasted);
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
  /** Whether it may run (`Locomotion.runs`), and whether it runs (`runCycle`). */
  may: boolean;
  running: boolean;
  /** Whether the walk is one a run gave way to, which holds the arms as the run does, unswung, until it stands (`carried`). */
  carried: boolean;
  /** The leg that bears, and which of its two states it is in, and for how long it has been, s. */
  stance: Side;
  late: boolean;
  time: number;
  /** The heading it walks toward, rad, and its turn, rad/s; and the face asked at the last step, rad. */
  heading: number;
  spin: number;
  face: number;
  /** The pace asked, m/s, the walk asked forward, and the walk it is the speed of, forward and to the right of the heading. */
  pace: number;
  asked: number;
  forward: number;
  right: number;
  /** The pelvis's turn as the last step found it, for its spin; and whether there was one. */
  root: Quaternion;
  read: boolean;
  /** The same, for what it asks of the body's assist (`gaitAssist`). */
  assisted: GaitAssistMemory;
  /** Asked to stand: the walk asked is brought to rest, and the legs go back to the stance as a swinging foot lands once the body is slow. */
  stopping: boolean;
  /** Setting off: the stance shifting the weight onto the first stance foot before it lifts the other. */
  shifting: boolean;
  /** Shifting, how far the capture point was short of the first stance sole across the heading at the last step, m. */
  short: number;
  /** How long the walk asked forward has stood at the run's pace, s (`RUN_SWITCH.top`). */
  capped: number;
  /** How many times the run has landed since it began (`RUN_SWITCH.landings`). */
  ran: number;
  /** The time since the walk set off, s; the centre of mass's x and z and that time at the last two landings, the earlier first; and how many it has. */
  clock: number;
  landings: number[];
  landed: number;
  /** The centre of mass's mean velocity over the last stride, x and z, m/s, once there has been one. */
  stride: number[];
  /** The landing's trims, forward and to the right of the heading, m (`SimbiconSettings.trim`). */
  trim: number[];
  /** The walk asked forward and to the right at the last two landings, the earlier first, m/s. */
  trimAsked: number[];
}

/**
 * Setting off, how near over the first stance sole's middle the centre of mass is brought across
 * the heading before the other foot lifts, m; the slowest its capture point may close on it, m/s,
 * after the shift's first `least` s, since the stance holds its centre of mass inside its soles'
 * outline drawn in (`SUPPORT_INSET`), short of the sole's middle; and the longest the shift takes, s:
 * the stance's width leaves the body falling toward a foot lifted from the middle.
 */
const SHIFT = { near: 0.03, closing: 0.03, least: 0.1, longest: 1.5 } as const;

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
 * A walk asked faster than the body held that way in a fifth of its trials (its envelope's, where it
 * has one: `paceToward`, `REACH`) is taken at that: how much a pace risks is the mind's to weigh. Asked to go forward faster than `run`, it walks at `run` (the walk asked to the side brought down
 * with it), and once the body has come up to it runs from the next landing, tracking a person's run
 * cycle (`runCycle`), and walks again from a landing once the pace asked has come down under it and
 * the body has slowed to it. Running, it goes straight ahead, turning only by
 * its heading. Told it may not run (`may`, `Locomotion.runs`), it walks forward no faster than
 * `run`, and running, walks again from a landing once the walk asked has come down to it; its envelope is
 * the walk's (`simbiconEnvelope`), and the run's (`simbiconRunEnvelope`) while it may run.
 *
 * The settings, each way's and the run's are taken scaled to the body's leg (`scaledGait`, `legOf`)
 * from the leg they were set for (`SimbiconSettings.leg`), and quickened by its haste (`quickness`),
 * as its envelopes are (`quickened`).
 *
 * Standing, and asked to place the feet, the legs are the stance's (`locomotion`): it walks from
 * the stance's stand, shifting the weight onto the first stance foot before the other lifts, and
 * asked to stand while walking it brings the walk asked to rest and gives the legs back to the
 * stance as a swinging foot lands once the body is slow, the stance resumed from the body as it is.
 */
export function simbicon(body: Body, given: SimbiconSettings = SIMBICON, givenWays: SimbiconWays = SIMBICON_WAYS, givenRun: RunCycleSettings = RUN_CYCLE, may = true): Locomotion {
  if (!validSimbicon(given)) throw new Error("a SIMBICON gait needs every setting finite, its times, turn, swerve, turn's change, speed-up, run and leg positive, and its shares of strength within (0, 1]");
  if (!validWays(givenWays)) throw new Error("a SIMBICON gait needs each way to give every setting a way changes, finite");
  if (!validRunCycle(givenRun)) throw new Error("a run cycle needs every setting finite, its times and the cycle's positive and its shares of strength within (0, 1]");
  const k = legOf(body.built.spec) / given.leg, quick = quickness(hasteOver(body.built.spec), given.hasted);
  const settings = scaledGait(given, k, quick), running = scaledGait(givenRun, k, quick), cycle = runCycle(body, running, legOf(body.built.spec), quick);
  const steady = gaitAssist(body.assist, [...body.built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0)), aim = { heading: 0, lean: 0, bank: 0 };
  const ways: SimbiconWays = { side: scaledGait(givenWays.side, k, quick), back: scaledGait(givenWays.back, k, quick) };
  const walkEnvelope = body.envelope ? quickened(simbiconEnvelope(body.built.spec), quick) : null;
  const runEnvelope = body.envelope ? quickened(simbiconRunEnvelope(body.built.spec), quick) : null;
  const legs = locomotion(walkEnvelope, settings.turn), muscles = body.muscles, dynamics = muscles.dynamics;
  const limbOf = (side: Side): Leg => {
    const names = {
      hip: [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`] as const,
      knee: `knee.${side} flexion`, ankle: [`ankle.${side} dorsiflexion`, `ankle.${side} inversion`] as const,
    };
    return { names, hip: [muscles.channel(names.hip[0]), muscles.channel(names.hip[1]), muscles.channel(names.hip[2])],
      knee: muscles.channel(names.knee), ankle: [muscles.channel(names.ankle[0]), muscles.channel(names.ankle[1])] };
  };
  const leg = { left: limbOf("left"), right: limbOf("right") };
  const memory: SimbiconMemory = { walking: false, may, running: false, carried: false, stance: "left", late: false, time: 0, heading: 0, spin: 0, face: 0, pace: 0, asked: 0, forward: 0, right: 0,
    root: new Quaternion(), read: false, assisted: { root: new Quaternion(), read: false }, stopping: false, shifting: false, short: 0, capped: 0, ran: 0, clock: 0, landings: [0, 0, 0, 0, 0, 0], landed: 0, stride: [0, 0], trim: [0, 0], trimAsked: [0, 0, 0, 0] };
  const state = { legs: legs.state, gait: memory, run: cycle.state };
  // A walk a run gave way to holds the arms as the run does, unswung (`RUN_ARMS`): the guard's, taken up at once, throw a body slowing from a run.
  const carried: Pose = Object.freeze({ "shoulder.left flexion": 0, "shoulder.right flexion": 0, "shoulder.left abduction": RUN_ARMS.abduction,
    "shoulder.right abduction": RUN_ARMS.abduction, "elbow.left flexion": givenRun.elbow, "elbow.right flexion": givenRun.elbow });
  const scratch = { target: new Quaternion(), pitch: new Quaternion(), error: new Vector3(), spin: new Vector3(), up: new Vector3(),
    relative: new Vector3(), speeds: [0, 0, 0] as [number, number, number] };
  // The stance leg's servo: its six freedoms' Jacobian at the centre of mass, the twist asked of it, the free entries' marks and the speeds.
  const servo = { J: new Float64Array(36), twist: new Float64Array(6), free: new Float64Array(6).fill(Number.NaN), speeds: new Float64Array(6), channels: [0, 0, 0, 0, 0, 0], work: fixedWork(6, 6) };
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
    memory.carried = false;
    memory.stance = right > 0 ? "left" : right < 0 ? "right" : near("left") <= near("right") ? "left" : "right";
    memory.late = false;
    memory.time = 0;
    memory.heading = heading;
    memory.spin = 0;
    memory.face = heading;
    memory.read = false;
    memory.stopping = false;
    memory.shifting = true;
    memory.clock = 0;
    memory.capped = 0;
    memory.landed = 0;
    memory.trim[0] = 0;
    memory.trim[1] = 0;
  };
  /**
   * The stance's stand with the centre of mass asked over the first stance sole; null once the
   * centre of mass, going on as it goes, would come within `SHIFT.near` of it across the heading (its
   * capture point, Pratt et al. 2006), or has stopped closing on it, or the shift has taken its longest.
   */
  const shift = (view: BodyView, dt: number, lower?: number): LegsDrive | null => {
    const s = view.stance, sole = s.soles[memory.stance], h = memory.heading, rx = cos(h), rz = -sin(h);
    memory.time += dt;
    const height = s.centre.y - sole.y, omega = height > 0 ? Math.sqrt(-body.built.physics.gravity[1] / height) : 0;
    const across = (sole.x - s.centre.x) * rx + (sole.z - s.centre.z) * rz, toward = s.velocity.x * rx + s.velocity.z * rz;
    const short = omega > 0 ? (across - toward / omega) * Math.sign(across) : 0;
    const stalled = memory.time >= SHIFT.least && memory.short - short < SHIFT.closing * dt;
    memory.short = short;
    if (short <= SHIFT.near || stalled || memory.time >= SHIFT.longest) { memory.shifting = false; memory.time = 0; return null; }
    const goal = legs.goal(view, null, h, dt, lower);
    return { kind: "stance", goal: goal && { ...goal, centre: [sole.x, sole.z] } };
  };
  const stand = (view: BodyView): void => {
    steady.rest(memory.assisted);
    memory.walking = false;
    memory.running = false;
    memory.carried = false;
    memory.stopping = false;
    memory.shifting = false;
    memory.spin = 0;
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
    memory.clock += dt;
    memory.capped = memory.forward >= settings.run ? memory.capped + dt : 0;
    if (!memory.late && memory.time >= settings.seconds) memory.late = true;
    else if (memory.late && (s.touching[swing] || memory.time >= settings.longest)) {
      const along = v.x * sin(h) + v.z * cos(h);
      if (memory.stopping && memory.forward === 0 && memory.right === 0 && Math.abs(along) <= SETTLED.forward && v.x * v.x + v.z * v.z <= SETTLED.all * SETTLED.all) {
        stand(view);
        return { kind: "stance", goal: legs.goal(view, null, h, dt) };
      }
      // The walk over the stride that ends as this foot lands, from the landing two before it.
      const marks = memory.landings;
      if (memory.landed >= 2) {
        const sx = (c.x - marks[0]!) / (memory.clock - marks[2]!), sz = (c.z - marks[1]!) / (memory.clock - marks[2]!), most = settings.trimMost, keep = 1 - settings.trimLeak;
        memory.stride[0] = sx;
        memory.stride[1] = sz;
        const trims = memory.trim, was = memory.trimAsked;
        if (Math.abs(memory.forward - was[0]!) + Math.abs(memory.right - was[1]!) > TRIM_STEADY) { trims[0] = 0; trims[1] = 0; }
        else {
          trims[0] = Math.max(-most, Math.min(most, keep * trims[0]! + current.trim * (memory.forward - sx * sin(h) - sz * cos(h))));
          trims[1] = Math.max(-most, Math.min(most, keep * trims[1]! + current.trimSide * (memory.right - sx * cos(h) + sz * sin(h))));
        }
      }
      const was = memory.trimAsked;
      was[0] = was[2]!; was[1] = was[3]!; was[2] = memory.forward; was[3] = memory.right;
      marks[0] = marks[3]!; marks[1] = marks[4]!; marks[2] = marks[5]!;
      marks[3] = c.x; marks[4] = c.z; marks[5] = memory.clock;
      memory.landed += 1;
      memory.stance = swing;
      memory.late = false;
      memory.time = 0;
      // The run takes over as a foot lands, taking up the pace the body goes and speeding up from it.
      memory.running = memory.may && memory.asked > settings.run + RUN_SWITCH.past && memory.forward >= settings.run && (along >= settings.run - RUN_SWITCH.short || memory.capped >= RUN_SWITCH.top);
      if (memory.running) {
        memory.forward = Math.min(memory.forward, along);
        memory.ran = 0;
        cycle.begin(view, h, swing);
        return run(view, dt);
      }
    }
    blendWays(settings, ways, memory.forward, memory.right, current);
    const gait = current;
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
    const late = memory.late;
    // The inverted pendulum's landing: the sole set where the centre of mass, going on as it goes, comes to rest over it; a
    // stance sole above the hip, as in a fall, gives the pendulum no height.
    const p = dynamics.pivot(sw.hip[0]), height = Math.max(0, p[1] - s.soles[memory.stance].y), g = -body.built.physics.gravity[1];
    const rest = (u: number): number => u * Math.sqrt(height / g + u * u / (4 * g * g));
    const vf = v.x * fx + v.z * fz, vr = v.x * rx + v.z * rz, hx = c.x - p[0], hz = c.z - p[2];
    const landF = atan2(hx * fx + hz * fz + rest(vf) - current.lead * memory.forward - memory.trim[0]!, height);
    const short = memory.right * out > 0 ? current.leadOut : gait.leadSide;
    const landOut = atan2((hx * rx + hz * rz + rest(vr) - short * memory.right - memory.trim[1]!) * out + gait.width, height);
    const thigh = (late ? gait.swingHipLate + gait.landing * landF : gait.swingHip) + (late ? gait.cdLate : gait.cd) * ahead + (late ? gait.cvLate : gait.cv) * forward;
    const spread = gait.swingSpread + gait.landing * landOut + gait.cdSide * aside + gait.cvSide * outward;
    // The stance leg's servo, while it bears and does not push off: with the sole planted, the pelvis moves at minus the
    // Jacobian's twist of the leg's speeds, so the speeds that carry the centre of mass on by `on` are the solve's of minus that.
    const extra = servo.speeds;
    extra.fill(0);
    if ((current.vf !== 0 || current.vfSide !== 0) && memory.landed > 2) {
      const sx = memory.stride[0]!, sz = memory.stride[1]!;
      const ef = current.vf * (memory.forward - sx * fx - sz * fz), er = current.vfSide * (memory.right - sx * rx - sz * rz);
      let ox = ef * fx + er * rx, oz = ef * fz + er * rz;
      const size = Math.sqrt(ox * ox + oz * oz);
      if (size > current.vfMost) { ox = ox * current.vfMost / size; oz = oz * current.vfMost / size; }
      const ch = servo.channels;
      ch[0] = st.hip[0]; ch[1] = st.hip[1]; ch[2] = st.hip[2]; ch[3] = st.knee; ch[4] = st.ankle[0]; ch[5] = st.ankle[1];
      jacobianTo(ch, c, muscles, servo.J);
      servo.twist.fill(0);
      servo.twist[3] = -ox; servo.twist[5] = -oz;
      fixedSolveTo(servo.work, servo.J, servo.twist, 6, 6, servo.free, LEG_DAMPING, extra);
    }
    const pushes: MusclePush[] = [];
    const drive = (name: string, i: number, goal: number, level: number, more = 0): void => {
      const u = (goal - muscles.angle(i)) / gait.settle + more;
      pushes.push({ channel: name, sense: u >= 0 ? 1 : -1, level, speed: u });
    };
    drive(sw.names.hip[0], sw.hip[0], thigh + pitch, gait.swing);
    drive(sw.names.hip[1], sw.hip[1], spread + out * roll, gait.swing);
    drive(sw.names.hip[2], sw.hip[2], 0, gait.swing);
    drive(sw.names.knee, sw.knee, late ? gait.swingKneeLate : gait.swingKnee, gait.swing);
    drive(sw.names.ankle[0], sw.ankle[0], late ? gait.swingAnkleLate : gait.swingAnkle, gait.swing);
    drive(sw.names.ankle[1], sw.ankle[1], 0, gait.swing);
    // The stance knee and ankle, toward their angles under the body's weight.
    drive(st.names.knee, st.knee, memory.late ? current.stanceKneeLate : current.stanceKnee, gait.stance, extra[3]);
    drive(st.names.ankle[0], st.ankle[0], gait.stanceAnkle - gait.cvAnkle * forward, gait.ankle, extra[4]);
    drive(st.names.ankle[1], st.ankle[1], gait.cvAnkleSide * outward, gait.ankle, extra[5]);

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
      const u = speeds[k]! + extra[k]!;
      pushes.push({ channel: st.names.hip[k]!, sense: u >= 0 ? 1 : -1, level: gait.hold, speed: u });
    }
    return { kind: "drive", posture: memory.carried ? carried : {}, pushes };
  };

  /**
   * Running (`runCycle`): the run toward the walk asked forward along the heading; as a foot lands
   * once the walk asked has come down under the run's pace and the body has slowed to it, or, told
   * it may not run, once the walk asked has come down to it, the walk takes over from that foot,
   * taking up the pace the body goes and slowing from it.
   */
  const run = (view: BodyView, dt: number): LegsDrive => {
    const v = view.stance.velocity, h = memory.heading;
    memory.clock += dt;
    const driven = cycle.drive(view, dt, h, memory.forward), along = v.x * sin(h) + v.z * cos(h);
    // Its landings are marked as the walk's are, so that a walk it gives way to measures its stride from the first.
    if (driven.landed) {
      const c = view.stance.centre, marks = memory.landings;
      if (memory.landed >= 2) { memory.stride[0] = (c.x - marks[0]!) / (memory.clock - marks[2]!); memory.stride[1] = (c.z - marks[1]!) / (memory.clock - marks[2]!); }
      marks[0] = marks[3]!; marks[1] = marks[4]!; marks[2] = marks[5]!;
      marks[3] = c.x; marks[4] = c.z; marks[5] = memory.clock;
      memory.landed += 1;
      memory.ran += 1;
    }
    if (driven.landed && memory.ran >= RUN_SWITCH.landings && (memory.may ? memory.asked < settings.run - RUN_SWITCH.below && along <= settings.run : memory.forward <= settings.run)) {
      memory.running = false;
      memory.carried = true;
      memory.forward = Math.max(memory.forward, along);
      memory.stance = driven.landed;
      memory.late = false;
      memory.time = 0;
    }
    return { kind: "drive", posture: driven.posture, pushes: driven.pushes };
  };

  /** The envelope it walks by now: the run's while it may run. */
  const envelopeNow = (): StanceEnvelope | null => memory.may ? runEnvelope : walkEnvelope;

  return {
    state,
    get envelope() { return envelopeNow(); },
    runs(may) { memory.may = may; },
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
        const goal = legs.goal(view, null, asked ? legs.heading : face, dt, lower);
        // The stance's stand until a walk is asked, the body is up and the stance takes no step of its own; the walk sets off the way the body faces.
        if (!asked || !goal || view.down || view.stance.own || view.stance.phase !== "stand") return { kind: "stance", goal };
        begin(view, view.stance.facing, asked[1]);
      }
      if (view.down) { stand(view); return { kind: "stance", goal: legs.goal(view, null, face, dt, lower) }; }
      memory.stopping = asked === null;
      // A walk asked past what the body held that way in `REACH` of its tries is taken at that (`paceToward`).
      const speed = asked ? Math.sqrt(asked[0] * asked[0] + asked[1] * asked[1]) : 0, envelope = envelopeNow(), holds = asked && envelope ? paceToward(envelope, asked[0], asked[1], REACH) : Infinity;
      // Facing far from the way asked (`SET_OFF`), it slows to a stop and steps where it stands while its heading turns.
      const v = view.stance.velocity, moving = Math.sqrt(v.x * v.x + v.z * v.z);
      const held = speed > holds ? holds / speed : 1, square = Math.abs(wrap(face - memory.heading)) <= (moving > TURN_ROUND ? SET_OFF.round : SET_OFF.set);
      const forward = asked && square ? asked[0] * held : 0, right = asked && square ? asked[1] * held : 0;
      // The heading turns once the weight has shifted: the shift brings the centre of mass over the sole across the heading,
      // and a heading that turns under it shifts it toward a moving mark.
      // Turning round, the heading waits for the body to slow to `TURN_ROUND`: braking and turning at once throws it.
      const turning = wrap(face - memory.face) / dt;
      memory.face = face;
      if (asked && !memory.shifting && (square || moving <= TURN_ROUND)) {
        const going = Math.max(memory.pace, moving), turn = wrap(face - memory.heading);
        const most = Math.min(settings.turn, going > 0 ? settings.swerve / going : Infinity), closing = Math.sqrt(2 * settings.turnRate * Math.abs(turn));
        // The turn wanted: the face's own, and on to close on it as fast as a turn slowing at `turnRate` stops on it. A faster
        // turn the same way is taken at once; a slower one, or one the other way, is come to at that.
        const wanted = Math.max(-most, Math.min(most, Math.max(-most, Math.min(most, turning)) + (turn < 0 ? -closing : closing)));
        const change = settings.turnRate * dt;
        if (wanted * memory.spin >= 0 && Math.abs(wanted) >= Math.abs(memory.spin)) memory.spin = wanted;
        else memory.spin += Math.max(-change, Math.min(change, wanted - memory.spin));
        const step = memory.spin * dt;
        // A step that would pass the face asked lands on it.
        if (turn > 0 ? step >= turn : turn < 0 ? step <= turn : true) { memory.heading += turn; memory.spin = turn / dt; }
        else memory.heading += step;
      } else memory.spin = 0;
      memory.pace = Math.sqrt(forward * forward + right * right);
      memory.asked = forward;
      // The walk the feedback asks for follows the walk asked, or rest, at up to `speedup` faster and `slowdown` slower: walking, or running
      // when it may not, no faster forward than the run's pace, its way kept; running, straight ahead, a run turning only by its heading,
      // the run following it at no more than its own rates (`RunCycleSettings.accel`, `brake`).
      // Capped, forward is the run's pace itself: a product that rounds a bit under it would never count as held there (`capped`).
      const capping = (!memory.running || !memory.may) && forward > settings.run, scale = capping ? settings.run / forward : 1;
      const toward = capping ? settings.run : forward, side = memory.running ? 0 : right * scale;
      const slowing = toward * toward + side * side < memory.forward * memory.forward + memory.right * memory.right;
      // At the rates of the way it goes: speeding up, the way asked; slowing, the way it walks.
      blendWays(settings, ways, slowing ? memory.forward : toward, slowing ? memory.right : side, current);
      const most = (slowing ? current.slowdown : current.speedup) * dt;
      const df = toward - memory.forward, dr = side - memory.right, change = Math.sqrt(df * df + dr * dr);
      if (change <= most) { memory.forward = toward; memory.right = side; }
      else { memory.forward += df * most / change; memory.right += dr * most / change; }
      if (memory.shifting) {
        if (memory.stopping) { stand(view); return { kind: "stance", goal: legs.goal(view, null, face, dt, lower) }; }
        const shifted = shift(view, dt, lower);
        if (shifted) return shifted;
      }
      const driven = memory.running ? run(view, dt) : walk(view, dt);
      if (driven.kind === "drive") {
        // What the body's balance gives a gait that drives the legs (`gaitAssist`): the walk's pelvis, or the run's as its stance hip last held it.
        aim.heading = memory.heading;
        aim.lean = memory.running ? cycle.state.lean : current.lean;
        aim.bank = memory.running ? cycle.state.bank : 0;
        steady.ask(view, aim, memory.assisted, dt);
      }
      return driven;
    },
  };
}
