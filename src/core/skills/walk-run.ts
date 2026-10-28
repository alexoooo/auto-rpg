import { Quaternion } from "@babylonjs/core/Maths/math.vector.js";
import type { Body, BodyView } from "../body.ts";
import { paceToward, quickened, walkRunEnvelope, type StanceEnvelope } from "../control/stance-envelope.ts";
import { hasteOver } from "../human/attributes.ts";
import type { Side } from "../spec/body.ts";
import { atan2, cos, sin } from "../math/real.ts";
import { wrap } from "../math/turn.ts";
import { locomotion, type LegsDrive, type Locomotion } from "./locomotion.ts";
import { gaitAssist, type GaitAssistMemory } from "./gait-assist.ts";
import { runCycle, validRunCycle, type RunCycleSettings } from "./cycle-run.ts";
import { legOf, quickness, scaledGait } from "./gait-scale.ts";
import { ALL_MET, fieldsOf, maskOf, setIn, type LegsField } from "./skill.ts";

/** **The walk and run's settings** (`walkRun`): when it runs, and how its heading turns running. */
export interface WalkRunSettings {
  /** The walk asked forward past which it runs (`runCycle`), m/s. */
  readonly run: number;
  /**
   * Running, the heading's fastest turn, rad/s, and no faster than swings the body's velocity round
   * at `swerve`, m/s²; it slows its turn, or turns it the other way, by no more than `turnRate`
   * rad/s each second, stopping on the face asked.
   */
  readonly turn: number;
  readonly swerve: number;
  readonly turnRate: number;
  /**
   * The leg the settings were set for, m: the hip's centre to the ankle's in the reference pose
   * (`legOf`). A body whose leg is another length takes them scaled to it (`scaledGait`).
   */
  readonly leg: number;
  /** How a hasted body's gait is timed (`hasteOver`): its times go as one over its haste over a person's to this power, 0, 1/2 or 1. */
  readonly hasted: number;
}

/**
 * The walk and run as they are taken unless told otherwise: the run from the pace the run's search
 * set it at (`WALK_RUN_CYCLE`), and its heading turning as the run was searched turning, set for
 * the Warrior's leg.
 */
export const WALK_RUN: WalkRunSettings = Object.freeze({ run: 0.8614, turn: 2, swerve: 1.6, turnRate: 2, leg: 0.8815024260685317, hasted: 0 });

/**
 * The run the walk and run takes unless told otherwise, set for the Warrior's leg: the best of a
 * search from SIMBICON's (`RUN_CYCLE`) on the walk and run's handover, with the pace it begins at
 * (`WALK_RUN.run`; `research/run-cycle-search.mjs`, Node stand, Rapier, 120 Hz, measuring on, in
 * the guard; 30 generations of 28 over the Warrior, the Rogue and the skeleton asked 1.4, 3 and 4.5
 * m/s and 2.4 m/s then to stop at 8 s, empty and with the club, still and in a gust of seed 5, 14 s,
 * `--fallen 0.5`; its lateral, lean, stance, swing and timing settings, the rest SIMBICON's).
 */
export const WALK_RUN_CYCLE: RunCycleSettings = Object.freeze({
  blend: 0.4708, gainsFrom: 4.3006, swingGain: 0.0932, cadenceGain: 0.0777, short: 0.1548, period: 0.985, accel: 1.115, brake: 0.473, ahead: 0.4603,
  lean: 0.3425, pelvis: 0.1941, leanGain: 0.1545, leanMost: 0.113, bank: 0.526, hold: 0.9742, settle: 0.1323, stance: 0.7308, swing: 0.8783, ankle: 0.7883,
  cv: 0.2649, cd: 0.0183, late: 0.798, paceGain: 0.0461, paceMost: 0.0228,
  contact: 0.1263, gainSide: 0.0513, width: 0.1861, cdSide: 0.2159, cvAnkleSide: -0.1302,
  kneeAdd: -0.152, ankleAdd: 0.0165, hipAdd: 0.0376, early: 0.2686, wait: 0.0051, arms: 0.6842, elbow: 1.5504,
});

/** Whether `settings` are a walk and run's: each finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1. */
export function validWalkRun(settings: WalkRunSettings): boolean {
  const { run, turn, swerve, turnRate, leg, hasted } = settings;
  return Object.keys(settings).length === Object.keys(WALK_RUN).length && [run, turn, swerve, turnRate, leg].every((x) => Number.isFinite(x) && x > 0)
    && [0, 0.5, 1].includes(hasted);
}

/**
 * How fast the walk and run states it stops while it may run, m/s² (`Locomotion.stopping`): under
 * its run's `brake`, since the run goes faster than the pace asked and slows from it late. Set by
 * its overshoot at a place goal 8, 15 and 30 m off: at 0.2 each body stops within 0.45 m past it,
 * at 0.25 the Warrior runs 0.75 m past and at 0.3 1.24 (`docs/reference/locomotion.md#the-walk-and-run`).
 */
const RUN_STOPPING = 0.2;

/**
 * Changing between the walk and the run as a foot lands, m/s: the run begins once the walk asked
 * is `past` over the run's pace, the body has faced the way asked within `facing` rad for `settled`
 * s, its pelvis's facing taken over the walk's sway (followed with the time constant `sway` s: a
 * walk swings the pelvis round past `facing` at every stride), and its pelvis faces it within
 * `swayed` rad as the foot lands (a run goes where its pelvis faces, and one begun with the body
 * still turning onto it falls), and goes that way no slower than `short` under the run's pace, or
 * under the walk's own pace where the walk's envelope holds it slower, or the walk asked has stood
 * there `top` s with the body facing that way (a walk whose legs cap it under its envelope's pace;
 * a body still turning round has not been capped, and a run begun from it standing falls); and, once it
 * has landed `landings` times, gives way to the walk once the pace asked has come down `below`
 * under it, or it is told it may not run, and the body's ground speed, across its heading as well
 * as along it, has slowed to the run's pace, its landings braking it until then: a walk handed a
 * body going faster than it walks cannot catch it, nor one still going sideways off a run that drifted. A run
 * that gives way at its first landing hands the walk a body just come down from the run's first
 * flight.
 */
const RUN_SWITCH = { past: 0.05, short: 0.1, below: 0.2, top: 2, landings: 2, facing: 0.15, settled: 0.6, sway: 0.5, swayed: 0.2 } as const;

/**
 * The farthest the way asked may be from the face asked for the walk and run to run it, rad: the
 * walk turns the body to face that way as it comes up to the run, and the run goes it. Farther round,
 * to the side and back, the body walks at the walk's own pace, facing as it is asked.
 */
const RUN_WAY = Math.PI / 3;

/**
 * Running, the farthest the face asked may be from the run's heading for it to run on, rad: past
 * it, the run brakes, and the walk turns the body round.
 */
const RUN_ROUND = Math.PI / 2;

/**
 * The least share of its trials a pace must have held that way for the run to take it asked
 * (`paceToward`): a mind may ask a pace it risks falling at, and the most it gets is one the body
 * held in a fifth of its tries.
 */
const REACH = 0.2;

/** **What the walk and run remembers**, besides the stance's legs' own (`locomotion`) and the run's (`runCycle`). */
interface WalkRunMemory {
  /** Whether it may run (`Locomotion.runs`, and a run that goes faster forward than the walk), and whether it runs. */
  may: boolean;
  running: boolean;
  /** The foot the stance's walk swung at its last step until that sole is on the ground, its landing; null once it is. */
  swinging: Side | null;
  /** How long the walk asked has stood past the run's pace a way it runs (`RUN_WAY`), s; and how long of it the body has faced that way (`RUN_SWITCH.settled`, `RUN_SWITCH.top`). */
  capped: number;
  faced: number;
  /** The pelvis's facing over the walk's sway, rad: followed with the time constant `RUN_SWITCH.sway` while the walk asked stands past the run's pace, the pelvis's own until then. */
  facing: number;
  /** How many times the run has landed since it began (`RUN_SWITCH.landings`), and the sole that landed last: a sole that
   * touches down again before the other has landed has bounced in its stance, and has not landed. */
  ran: number;
  landed: Side;
  /** Running: the heading, rad, its turn, rad/s, and the way asked at the last step, rad; and the pace it is asked, m/s. */
  heading: number;
  spin: number;
  face: number;
  pace: number;
  /** The pelvis's turn as the last step found it, for what the run asks of the body's assist (`gaitAssist`). */
  assisted: GaitAssistMemory;
  /** What the run left undone of its last goal (`Locomotion.unmet`, `RUN_LEAVES`). */
  unmet: { fields: readonly LegsField[]; centre: number; height: number };
}

/** The fields of a legs goal the run does not carry out: it holds no carriage, gait by name or stance of the stance's. */
const RUN_LEAVES = maskOf(["carriage", "gait", "feet", "height", "heading", "centre", "pose", "swing", "halt"]);

/**
 * **The walk and the run**: a locomotion skill (`Locomotion`) that walks by the stance's own walk
 * (`locomotion`: capture-point steps it plans itself) and runs by a run that tracks a person's
 * cycle (`runCycle`), driving the legs itself (`LegsDrive`).
 *
 * Asked past `run` a way near enough the face asked (`RUN_WAY`, and told it may run, `Locomotion.runs`),
 * the walk turns the body to face that way and goes it at what its legs and its envelope hold, and once
 * the body faces it and has come up to that pace or the run's, or the walk asked has stood past it
 * `RUN_SWITCH.top` s, the run takes over as the stance's next step lands, from that foot, at the pace
 * the body goes; running, it goes the way asked, turning only by its heading, and a run landing gives
 * the legs back to the stance's walk once the pace asked has come down under the run's, or the way
 * asked has gone round past `RUN_WAY`, or it is told it may not run, and the body has slowed to it (`RUN_SWITCH`).
 * The stance takes the body up as it is, moving (`Locomotion.resume`). Asked to stand while
 * running, the run brakes and the walk stops the body.
 *
 * Its envelope is the stance's walk's (`Body.envelope`), and its own while it may run (`walkRunEnvelope`); it
 * states it stops at its walk's rate, and while it may run at `RUN_STOPPING`. Its
 * settings and the run's are taken scaled to the body's leg (`scaledGait`, `legOf`) from the leg
 * they were set for, and quickened by its haste (`quickness`), as the run's envelope is.
 */
export function walkRun(body: Body, given: WalkRunSettings = WALK_RUN, givenRun: RunCycleSettings = WALK_RUN_CYCLE, may = true): Locomotion {
  if (!validWalkRun(given)) throw new Error("a walk and run needs every setting finite, its run, turns and leg positive, timed to its haste to the power 0, 1/2 or 1");
  if (!validRunCycle(givenRun)) throw new Error("a run cycle needs every setting finite, its times and the cycle's positive and its shares of strength within (0, 1]");
  const k = legOf(body.built.spec) / given.leg, quick = quickness(hasteOver(body.built.spec), given.hasted);
  const settings = scaledGait(given, k, quick), running = scaledGait(givenRun, k, quick), cycle = runCycle(body, running, legOf(body.built.spec), quick);
  const steady = gaitAssist(body.assist, [...body.built.segments.values()].reduce((sum, segment) => sum + segment.rigid.mass, 0)), aim = { heading: 0, lean: 0, bank: 0 };
  const runEnvelope = body.envelope ? quickened(walkRunEnvelope(body.built.spec), quick) : null;
  const legs = locomotion(body.envelope);
  // A run whose envelope holds it no faster forward than the walk's holds the walk is not run: the walk and run walks.
  const pays = runEnvelope === null || body.envelope === null || runEnvelope.ways.forward.value > body.envelope.ways.forward.value;
  const memory: WalkRunMemory = { may: may && pays, running: false, swinging: null, capped: 0, faced: 0, facing: 0, ran: 0, landed: "left", heading: 0, spin: 0, face: 0, pace: 0,
    assisted: { root: new Quaternion(), read: false }, unmet: { ...ALL_MET } };
  const state = { legs: legs.state, walkRun: memory, run: cycle.state };

  /** The run gives the legs back to the stance's walk, which takes the body up as it is. */
  const walkOn = (view: BodyView): void => {
    steady.rest(memory.assisted);
    memory.running = false;
    memory.swinging = null;
    memory.capped = 0;
    memory.faced = 0;
    memory.pace = 0;
    legs.resume(view);
  };
  /** The run begins from the body as it is, as the sole `landed` lands, the heading the walk's, asked the way `toward`. */
  const runFrom = (view: BodyView, landed: Side, toward: number): void => {
    memory.running = true;
    memory.ran = 0;
    memory.landed = landed;
    memory.heading = legs.heading;
    memory.spin = 0;
    memory.face = toward;
    cycle.begin(view, memory.heading, landed);
  };
  /** The run's heading this step: toward the way asked, at the turn the run takes at the pace it goes (`WalkRunSettings.turn`). */
  const turnToward = (view: BodyView, toward: number, dt: number): void => {
    const v = view.stance.velocity, going = Math.max(memory.pace, Math.sqrt(v.x * v.x + v.z * v.z)), turn = wrap(toward - memory.heading);
    const turning = wrap(toward - memory.face) / dt;
    memory.face = toward;
    const most = Math.min(settings.turn, going > 0 ? settings.swerve / going : Infinity), closing = Math.sqrt(2 * settings.turnRate * Math.abs(turn));
    // The turn wanted: the way's own, and on to close on it as fast as a turn slowing at `turnRate` stops on it. A faster turn the
    // same way is taken at once; a slower one, or one the other way, is come to at that.
    const wanted = Math.max(-most, Math.min(most, Math.max(-most, Math.min(most, turning)) + (turn < 0 ? -closing : closing)));
    const change = settings.turnRate * dt;
    if (wanted * memory.spin >= 0 && Math.abs(wanted) >= Math.abs(memory.spin)) memory.spin = wanted;
    else memory.spin += Math.max(-change, Math.min(change, wanted - memory.spin));
    const step = memory.spin * dt;
    // A step that would pass the way asked lands on it.
    if (turn > 0 ? step >= turn : turn < 0 ? step <= turn : true) { memory.heading += turn; memory.spin = turn / dt; }
    else memory.heading += step;
  };
  /**
   * The walk the stance is asked, told it may run: forward no faster than the run's pace, its way kept. A stance walk asked past
   * what it holds sets its steps for a pace it does not make, and comes up to less than it would at its own.
   */
  const walkable = (asked: readonly [number, number] | null): readonly [number, number] | null =>
    memory.may && asked && asked[0] > settings.run ? [settings.run, asked[1] * settings.run / asked[0]] : asked;
  /** Whether the way `asked` is one it runs (`RUN_WAY`). */
  const runsWay = (asked: readonly [number, number] | null): boolean => asked !== null && Math.abs(atan2(asked[1], asked[0])) <= RUN_WAY;
  /** The envelope it walks by now: the run's while it may run. */
  const envelopeNow = (): StanceEnvelope | null => memory.may ? runEnvelope : body.envelope;

  return {
    state,
    get envelope() { return envelopeNow(); },
    get stopping() { return memory.may ? RUN_STOPPING : legs.stopping; },
    runs(may) { memory.may = may && pays; },
    get heading() { return memory.running ? memory.heading : legs.heading; },
    get pace() { return memory.running ? memory.pace : legs.pace; },
    get reference() { return legs.reference; },
    get placed() { return !memory.running && legs.placed; },
    get unmet() { return memory.running ? memory.unmet : legs.unmet; },
    resume(view) { if (memory.running) walkOn(view); else legs.resume(view); },
    goal(view, goal, dt): LegsDrive {
      const s = view.stance, v = s.velocity, asked = goal.walk, face = goal.face;
      if (goal.footing) {
        if (memory.running) walkOn(view);
        return legs.goal(view, goal, dt);
      }
      if (view.down) {
        if (memory.running) walkOn(view);
        return legs.goal(view, { ...goal, walk: null }, dt);
      }
      if (!memory.running) {
        const h = legs.heading, along = v.x * sin(h) + v.z * cos(h), speed = asked ? Math.sqrt(asked[0] * asked[0] + asked[1] * asked[1]) : 0;
        memory.capped = memory.may && runsWay(asked) && speed > settings.run + RUN_SWITCH.past ? memory.capped + dt : 0;
        // A step of the stance's walk ends as its foot lands: the run takes over from that foot. A step
        // that ended late, its foot in the air, has not landed until its sole is on the ground.
        let landed: Side | null = null;
        if (s.phase === "swing") memory.swinging = s.own ? s.own.foot : null;
        else if (memory.swinging !== null && s.touching[memory.swinging]) { landed = memory.swinging; memory.swinging = null; }
        // Heading for the run, the walk turns to face the way asked and walks it forward, as the run will.
        memory.facing = memory.capped > 0 ? memory.facing + wrap(s.facing - memory.facing) * Math.min(1, dt / RUN_SWITCH.sway) : s.facing;
        const way = memory.capped > 0 ? face + atan2(asked![1], asked![0]) : face, facing = Math.abs(wrap(way - memory.facing)) <= RUN_SWITCH.facing;
        memory.faced = memory.capped > 0 && facing ? memory.faced + dt : 0;
        if (landed && memory.capped > 0 && memory.faced >= RUN_SWITCH.settled && Math.abs(wrap(way - s.facing)) <= RUN_SWITCH.swayed && (along >= Math.min(settings.run, legs.pace) - RUN_SWITCH.short || memory.faced >= RUN_SWITCH.top)) runFrom(view, landed, way);
        else return legs.goal(view, { ...goal, walk: walkable(memory.capped > 0 ? [speed, 0] : asked), face: way }, dt);
      }
      // Running: along the heading, turning toward the way asked, at what the run's envelope holds; braking to turn round past
      // `RUN_ROUND`, and, asked to stand or a way it does not run, along the heading as it is.
      const speed = asked ? Math.sqrt(asked[0] * asked[0] + asked[1] * asked[1]) : 0, envelope = envelopeNow();
      const holds = asked && envelope ? paceToward(envelope, asked[0], asked[1], REACH) : Infinity, held = speed > holds ? holds / speed : 1;
      const toward = runsWay(asked) ? face + atan2(asked![1], asked![0]) : memory.heading, on = runsWay(asked) && Math.abs(wrap(toward - memory.heading)) <= RUN_ROUND;
      // Told it may not run, it brakes to the walk's pace.
      memory.pace = on ? Math.min(speed * held, memory.may ? Infinity : settings.run - RUN_SWITCH.below) : 0;
      if (on) turnToward(view, toward, dt);
      else memory.spin = 0;
      const h = memory.heading;
      const driven = cycle.drive(view, dt, h, memory.pace);
      memory.unmet.fields = fieldsOf(setIn(goal, RUN_LEAVES));
      const landing = driven.landed !== null && driven.landed !== memory.landed;
      if (landing) { memory.landed = driven.landed!; memory.ran += 1; }
      if (landing && memory.ran >= RUN_SWITCH.landings && memory.pace <= settings.run - RUN_SWITCH.below && Math.sqrt(v.x * v.x + v.z * v.z) <= settings.run) {
        walkOn(view);
        return legs.goal(view, goal, dt);
      }
      // What the body's balance gives the run (`gaitAssist`): its pelvis as its stance hip last held it.
      aim.heading = h;
      aim.lean = cycle.state.lean;
      aim.bank = cycle.state.bank;
      steady.ask(view, aim, memory.assisted, dt);
      return { kind: "drive", posture: driven.posture, pushes: driven.pushes };
    },
  };
}
