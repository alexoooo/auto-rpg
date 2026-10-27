import type { HostedBody } from "../core/body.ts";
import { carried, paceRound, turnAt, type StanceEnvelope } from "../core/control/stance-envelope.ts";
import { NO_COVER, type Intent } from "../core/mind/intent.ts";
import { wrap } from "../core/math/turn.ts";
import type { Tactics } from "../core/mind/tactics.ts";
import type { Actor } from "./actor.ts";
import { startGaitMeter, type GaitReading } from "./gait-meter.ts";
import { ARRIVED, type Commands } from "./commands.ts";
import type { Track } from "./track.ts";
import { startWind, type WindSettings } from "./wind.ts";
import { atan2, cos, hypot, sin } from "../core/math/real.ts";

/**
 * **The lab's locomotion mode**: a human on its own feet going round a `Track`, or from one
 * destination to the next of random `Commands`, guard up, driven by tactics (`trackTactics`,
 * `commandsTactics`), as fast as it is asked and its legs take it. Whatever locomotion skill its
 * mind has carries the walk out.
 *
 * Each control step the tactics find the body on the track (`Track.nearest`, from where it last
 * was) and aim at the track's point ahead of that. On a track walked facing along it, they face
 * the point `AIM_ALONG` ahead and walk forward; the locomotion skill turns the heading toward it no faster
 * than the body turns at the pace it walks. On a track walked facing one way (`TrackInfo.facing`,
 * the square), they face that way and walk toward the point `AIM_AHEAD` ahead in the body's own
 * frame: forward, sideways or back.
 *
 * Their pace is the body's fastest walk (`Sight.envelope`, what its locomotion was measured to hold
 * with it: forward, on a course walked facing along it, and the fastest of its ways on one walked
 * facing one way, `fastestOf`), or the pace the lab asks (`LocomotionOptions.top`), which may be
 * past it: a locomotion skill takes a walk asked past what the body holds that way at the most it
 * holds (`paceToward`). Either
 * way it is no faster than the body's turn carries it round each bend (`turnAt` and `paceRound`;
 * past the envelope's fastest walk, at the turn it held there), and a corner is taken at
 * `CORNER_PACE`.
 *
 * It brakes for a bend or a corner ahead at `BRAKE`, so as to reach it at its pace, and for a bend
 * `LEAD` early at the body's own speed. Facing along
 * the track, it is no faster than its turns carry it round the arc from its heading to the point it
 * aims at: its heading lags the track's, and sped up at a bend's end before it has come round, it
 * would leave the bend short of the way back and drift off the track; run wide, it comes back onto
 * it at a pace it turns at. The locomotion skill's own acceleration takes it from one pace to the
 * other.
 *
 * Sent to a destination, the tactics face it and walk forward, as on a track walked facing along it,
 * and brake to arrive at `CORNER_PACE`, telling the locomotion how far it has to go (`Intent.destination`);
 * there, they stand as long as the command says.
 *
 * Wind may blow on it (`wind.ts`), and its feet are metered (`gait-meter.ts`).
 *
 * This module has no page-only imports, so the Node stand can run it.
 */

/** What the page shows of a run, as the last control step left it. */
export interface LocomotionFrame {
  readonly time: number;
  /** The pelvis's heading, rad about up: 0 faces +z, and it grows to the right. */
  readonly heading: number;
  /** Where it is along the track, m from its start, and how far it has gone round since it set off. */
  readonly along: number;
  readonly travelled: number;
  /** Laps done, and the last one's time, s (null before the first): on random commands, destinations reached, and the last walk's time. */
  readonly laps: number;
  readonly lastLap: number | null;
  /** The pace asked, m/s; whether a bend has slowed it. */
  readonly pace: number;
  readonly bending: boolean;
  /** The pace the locomotion skill walks at, m/s: what it takes of the pace asked. */
  readonly walking: number;
  /** The centre of mass's speed across the ground, m/s, and the mean speed along the track since it set off. */
  readonly speed: number;
  readonly mean: number;
  /** For each piece of the track with a length, in order: its mean speed along the track while on it, m/s (null before it is reached). */
  readonly pieces: readonly (number | null)[];
  /** The centre of mass's distance from the track, m. */
  readonly off: number;
  /** The point it aims at, across the ground (x, z). */
  readonly aim: readonly [number, number];
  /**
   * On random commands, the walk under way: from where it set off to the destination, across the
   * ground (x, z), and which command it is; none on a track.
   */
  readonly leg: { readonly from: readonly [number, number]; readonly to: readonly [number, number]; readonly index: number } | null;
  /** Whether it is down (`BodyView.down`). */
  readonly fallen: boolean;
  /** What its feet have done (`startGaitMeter`). */
  readonly gait: GaitReading;
  /** The wind's force on it in the last step, N, world (x, z), and its gusts so far. */
  readonly wind: readonly [number, number];
  readonly gusts: number;
}

interface LocomotionSession {
  readonly body: HostedBody;
  frame(): LocomotionFrame;
  /** The wind's settings: changed, they hold from the next step. */
  wind: WindSettings;
  dispose(): void;
}

/**
 * **How far along a track a walker faces**, m: the point its heading turns toward, so a walker
 * that has drifted off the track steers back onto it. Walking on the path's own heading lets the
 * drift add up loop after loop. Set: `docs/reference/lab.md#aim-ahead`.
 */
const AIM_AHEAD = 1;
/**
 * How far along a track a walker facing along it faces, m: further than `AIM_AHEAD`, so that it
 * turns into a bend over a wider arc, at a pace its turns carry round it. Set:
 * `docs/reference/lab.md#aim-ahead`.
 */
const AIM_ALONG = 1.25;

/**
 * How hard the tactics slow for a bend or a corner, m/s²: about as hard as the body slows;
 * slowed harder, the body comes to a bend going faster than its pace there, and swings wide of it,
 * or carries on past a corner while its walk swings round to the next way.
 */
const BRAKE = 0.3;
/**
 * How long the body's speed trails the walk asked, s: slowed for a bend, it goes on at about the
 * speed it had for this long, so the tactics brake for a bend as if it were as much nearer as the body
 * goes in that time.
 */
const LEAD = 0.3;
/** The pace the tactics take a corner at, m/s: the slowest pace the envelopes measure. */
const CORNER_PACE = 0.2;

/** How far ahead of `s` the next corner of `track` is, m (Infinity on a track with none). */
function toCorner(track: Track, s: number): number {
  let least = Infinity;
  for (const at of track.corners) least = Math.min(least, ((at - s) % track.length + track.length) % track.length);
  return least;
}

/** How finely the tactics read the track ahead for its bends, m. */
const LOOK_STEP = 0.05;

/**
 * The fastest pace no faster than `top` at which `envelope`'s turns carry the body round a bend of
 * `radius` m, m/s (`paceRound`); past the envelope's fastest walk, at the turn it held there
 * (`turnAt`). A body with no envelope (one measured, or under an experiment's stance tuning) is not slowed.
 */
function paceRoundTo(envelope: StanceEnvelope | null, radius: number, top: number | undefined): number {
  if (!envelope) return Infinity;
  const within = paceRound(envelope, radius);
  if (top === undefined || top <= envelope.ways.forward.value) return within;
  return Math.max(within, Math.min(top, carried(turnAt(envelope, top), radius)));
}

/**
 * The fastest walk `envelope` holds, m/s: forward, for a walker facing the way it goes (`facing`
 * none), and the fastest of its ways for one facing one way, whose locomotion skill takes each way at
 * the most it holds (`paceToward`). With no envelope, none.
 */
function fastestOf(envelope: StanceEnvelope | null, facing: number | undefined): number {
  if (!envelope) return 0;
  const { forward, right, back, left } = envelope.ways;
  return facing === undefined ? forward.value : Math.max(forward.value, right.value, back.value, left.value);
}

/** How the track's tactics go round. */
interface TrackOptions {
  /** The fastest pace asked, m/s, in place of the envelope's fastest walk (`fastestOf`). */
  readonly top?: number;
  /** A gait of their own: a pace, m/s, and a turn, rad/s, they ask no more than. */
  readonly pace?: number;
  readonly turn?: number;
  /** The heading they face throughout, rad (`TrackInfo.facing`); none faces along the track. */
  readonly facing?: number;
}

/**
 * **The track's tactics**: round `track` as fast as the body's walk and turns take it, or as `top`
 * asks; given a gait, walking no faster than its `pace` and turning no faster than its `turn` (it
 * asks to face no further round than that from the heading it has).
 */
interface CourseTactics extends Tactics {
  /** What the tactics know of the course at `time`, with the centre of mass at (x, z). */
  frame(time: number, x: number, z: number): Omit<LocomotionFrame, "speed" | "time" | "heading" | "fallen" | "walking" | "gait" | "wind" | "gusts">;
}

export function trackTactics(track: Track, { top, pace: most, turn, facing }: TrackOptions = {}): CourseTactics {
  const turning = turn ?? Infinity;
  let along = 0, travelled = 0, laps = 0, lapFrom = 0, lastLap: number | null = null;
  let pace = 0, bending = false, aim: [number, number] = [0, 0], face = facing ?? 0, move: [number, number] = [0, 0];
  let setOff: number | null = null, last: number | null = null;
  // Each piece's distance along the track and time on it, by its order.
  const onPiece = track.lengths.map(() => ({ metres: 0, seconds: 0 }));
  return {
    name: "track",
    decide({ view, report, envelope }, dt): Intent {
      const c = view.stance.centre, v = view.stance.velocity, fastest = Math.min(top ?? fastestOf(envelope, facing), most ?? Infinity);
      if (view.time > 0) {
        setOff ??= view.time;
        const s = track.nearest(c.x, c.z, along);
        // How far round it went this step: the change in `s`, across the track's wrap.
        let ds = s - along;
        if (ds < -track.length / 2) ds += track.length;
        if (ds > track.length / 2) ds -= track.length;
        travelled += ds;
        along = s;
        const on = onPiece[track.piece(s)]!;
        on.metres += ds;
        if (last !== null) on.seconds += view.time - last;
        last = view.time;
        if (travelled >= (laps + 1) * track.length) {
          laps++;
          lastLap = view.time - lapFrom;
          lapFrom = view.time;
        }
        const to = track.at(along + (facing === undefined ? AIM_ALONG : AIM_AHEAD));
        aim = [to.x, to.z];
        const toward = atan2(to.x - c.x, to.z - c.z);
        // Each bend as far ahead as it takes to brake from the fastest pace, at its pace and braking to it from `LEAD` early; the next
        // corner likewise.
        let bend = Infinity;
        const early = LEAD * Math.sqrt(v.x * v.x + v.z * v.z);
        for (let d = 0; d <= early + fastest * fastest / (2 * BRAKE); d += LOOK_STEP) {
          const k = Math.abs(track.at(along + d).curvature), radius = k === 0 ? Infinity : 1 / k;
          const at = Math.min(paceRoundTo(envelope, radius, top), carried(turning, radius));
          bend = Math.min(bend, Math.sqrt(at * at + 2 * BRAKE * Math.max(0, d - early)));
        }
        const corner = Math.max(CORNER_PACE, Math.sqrt(2 * BRAKE * toCorner(track, along)));
        // Facing along the track, no faster than its turns carry it round the arc from its heading to the point it aims at.
        if (facing === undefined) {
          const lag = Math.abs(wrap(toward - report.heading)), reach = Math.sqrt((to.x - c.x) * (to.x - c.x) + (to.z - c.z) * (to.z - c.z));
          const radius = radiusTo(lag, reach);
          bend = Math.min(bend, paceRoundTo(envelope, radius, top), carried(turning, radius));
        }
        bending = Math.min(bend, corner) < fastest;
        pace = Math.min(fastest, bend, corner);
        if (facing === undefined) {
          face = turn === undefined ? toward : report.heading + Math.max(-turn * dt, Math.min(turn * dt, wrap(toward - report.heading)));
          move = [pace, 0];
        } else {
          // Toward the point in the body's own frame: forward along its heading, and to its right.
          const off = toward - report.heading;
          move = [pace * cos(off), pace * sin(off)];
        }
      }
      return { move: facing === undefined ? [pace, 0] : move, face, guard: NO_COVER, actions: [] };
    },
    frame(time, x, z) {
      const running = setOff === null ? 0 : time - setOff, on = track.at(along);
      const pieces = onPiece.flatMap((on, i) => track.lengths[i]! > 0 ? [on.seconds > 0 ? on.metres / on.seconds : null] : []);
      return { along, travelled, laps, lastLap, pace, bending, mean: running > 0 ? travelled / running : 0, pieces, aim,
        off: hypot(x - on.x, z - on.z), leg: null };
    },
  };
}

/** The radius of the arc from a heading `lag` rad off the way to a point `reach` m away to that point, m: a half turn or more, the arc of half the reach. */
function radiusTo(lag: number, reach: number): number {
  return lag === 0 ? Infinity : reach / (2 * (lag < Math.PI / 2 ? sin(lag) : 1));
}

/**
 * **The random commands' tactics**: to each of `commands`' destinations in turn, facing it and as
 * fast as the body's walk and turns take it, or as `top` asks, braking to arrive at
 * `CORNER_PACE`; arrived (`ARRIVED`), standing as long as the command says. Their mean speed is
 * the straight distance from each place set off from to its destination, over the time spent walking.
 */
function commandsTactics(commands: Commands, { top }: { readonly top?: number } = {}): CourseTactics {
  let index = 0, reached = 0, lastLeg: number | null = null, legFrom = 0, done = 0, walked = 0, last: number | null = null;
  let pace = 0, bending = false, face = 0, standUntil: number | null = null, from: [number, number] = [0, 0], progress = 0;
  const stand = (): Intent => ({ move: null, face, guard: NO_COVER, actions: [] });
  return {
    name: "commands",
    decide({ view, report, envelope }): Intent {
      if (view.time <= 0) return stand();
      const c = view.stance.centre, v = view.stance.velocity, dt = last === null ? 0 : view.time - last;
      last = view.time;
      if (standUntil !== null) {
        if (view.time < standUntil) return stand();
        standUntil = null;
        index++;
        from = [c.x, c.z];
        legFrom = view.time;
      }
      walked += dt;
      const to = commands.at(index), dx = to.x - c.x, dz = to.z - c.z, d = Math.sqrt(dx * dx + dz * dz);
      const length = hypot(to.x - from[0], to.z - from[1]);
      progress = Math.max(0, Math.min(length, length - d));
      if (d < ARRIVED) {
        reached++;
        done += length;
        progress = 0;
        lastLeg = view.time - legFrom;
        standUntil = view.time + to.stand;
        pace = 0;
        bending = false;
        return stand();
      }
      const fastest = top ?? fastestOf(envelope, undefined), toward = atan2(dx, dz);
      // Braking to arrive at the corner's pace, from `LEAD` early at the body's own speed; no faster than its turns carry it round to the destination.
      const early = LEAD * Math.sqrt(v.x * v.x + v.z * v.z);
      const arrive = Math.sqrt(CORNER_PACE * CORNER_PACE + 2 * BRAKE * Math.max(0, d - ARRIVED - early));
      const turning = paceRoundTo(envelope, radiusTo(Math.abs(wrap(toward - report.heading)), d), top);
      bending = Math.min(arrive, turning) < fastest;
      pace = Math.min(fastest, arrive, turning);
      face = toward;
      return { move: [pace, 0], face, guard: NO_COVER, actions: [], destination: d };
    },
    frame(_time, x, z) {
      const to = commands.at(index);
      // Off the straight from where it set off to the destination, m.
      const ux = to.x - from[0], uz = to.z - from[1], length = hypot(ux, uz);
      const off = length === 0 ? hypot(x - from[0], z - from[1]) : Math.abs((x - from[0]) * uz - (z - from[1]) * ux) / length;
      return { along: progress, travelled: done + progress, laps: reached, lastLap: lastLeg, pace, bending,
        mean: walked > 0 ? (done + progress) / walked : 0, pieces: [], aim: [to.x, to.z], off, leg: { from, to: [to.x, to.z], index } };
    },
  };
}

/** What the lab asks of a run beyond its course. */
interface LocomotionOptions {
  /** The fastest pace it asks, m/s; none, the body's fastest walk (`fastestOf`), which a body with none must be given. */
  readonly top?: number;
  /** The heading it faces throughout, on a track (`TrackInfo.facing`). */
  readonly facing?: number;
  /** The wind's settings and seed; none blows no wind. */
  readonly wind?: { readonly settings: WindSettings; readonly seed: number };
}

/** Whether `course` is random commands rather than a track. */
const isCommands = (course: Track | Commands): course is Commands => "area" in course;

/**
 * Run `actor`'s body, a human in its reference pose at the origin facing +z, round `course`: a
 * track, which starts there facing along it, or random commands.
 */
export function startLocomotion(actor: Actor, course: Track | Commands, { top, facing, wind }: LocomotionOptions = {}): LocomotionSession {
  const { body, world } = actor;
  const tactics = isCommands(course) ? commandsTactics(course, { top }) : trackTactics(course, { top, facing });
  const { report } = actor.drive(tactics);
  const meter = startGaitMeter(body.built, world);
  const blowing = startWind(body.built, world, wind?.settings ?? { rate: 0, strength: 0 }, wind?.seed ?? 0);
  const frame = (): LocomotionFrame => {
    const s = body.view.stance, time = body.view.time;
    return {
      ...tactics.frame(time, s.centre.x, s.centre.z), time, heading: report.heading, fallen: body.view.down, walking: report.pace ?? 0,
      speed: hypot(s.velocity.x, s.velocity.z), gait: meter.reading(), wind: blowing.state.force, gusts: blowing.state.count,
    };
  };
  return {
    body, frame,
    get wind() { return blowing.settings; },
    set wind(settings) { blowing.settings = settings; },
    dispose: () => { meter.dispose(); blowing.dispose(); actor.dispose(); },
  };
}
