import type { Body } from "../core/body.ts";
import { carried, paceRound, turnAt, type StanceEnvelope } from "../core/control/stance-envelope.ts";
import { NO_COVER, type Intent } from "../core/mind/intent.ts";
import { wrap } from "../core/math/turn.ts";
import type { Tactics } from "../core/mind/tactics.ts";
import type { Actor } from "./actor.ts";
import { startGaitMeter, type GaitReading } from "./gait-meter.ts";
import type { Track } from "./track.ts";
import { startWind, type WindSettings } from "./wind.ts";

/**
 * **The lab's run mode**: a human on its own feet going round a `Track`, guard up, driven by
 * tactics (`trackTactics`), as fast as it is asked and its legs take it. Whatever locomotion skill
 * its mind has carries the walk out.
 *
 * Each control step the tactics find the body on the track (`Track.nearest`, from where it last
 * was) and aim at the track's point `AIM_AHEAD` ahead of that. On a track walked facing along it,
 * they face that point and walk forward; the locomotion skill turns the heading toward it no faster
 * than the body turns at the pace it walks. On a track walked facing one way (`TrackInfo.facing`,
 * the square), they face that way and walk toward the point in the body's own frame: forward,
 * sideways or back.
 *
 * Their pace is the body's fastest walk (`Sight.envelope`, what its locomotion was measured to hold
 * with it), or the pace the lab asks (`RunOptions.top`), which may be past it: a locomotion skill
 * takes a walk asked past what the body holds that way at the most it holds (`paceToward`). Either
 * way it is no faster than the body's turn carries it round each bend (`turnAt` and `paceRound`;
 * past the envelope's fastest walk, at the turn it held there), and a corner is taken at
 * `CORNER_PACE`.
 *
 * It brakes for a bend or a corner ahead at `BRAKE`, so as to reach it at its pace. Facing along
 * the track, it is no faster than its turns carry it round the arc from its heading to the point it
 * aims at: its heading lags the track's, and sped up at a bend's end before it has come round, it
 * would leave the bend short of the way back and drift off the track; run wide, it comes back onto
 * it at a pace it turns at. The locomotion skill's own acceleration takes it from one pace to the
 * other.
 *
 * Wind may blow on it (`wind.ts`), and its feet are metered (`gait-meter.ts`).
 *
 * This module has no page-only imports, so the Node stand can run it (`tests/lab-run.test.mjs`).
 */

/** What the page shows of a run, as the last control step left it. */
export interface RunFrame {
  readonly time: number;
  /** The pelvis's heading, rad about up: 0 faces +z, and it grows to the right. */
  readonly heading: number;
  /** Where it is along the track, m from its start, and how far it has gone round since it set off. */
  readonly along: number;
  readonly travelled: number;
  /** Laps done, and the last one's time, s (null before the first). */
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
  /** Whether it is down (`BodyView.down`). */
  readonly fallen: boolean;
  /** What its feet have done (`startGaitMeter`). */
  readonly gait: GaitReading;
  /** The wind's force on it in the last step, N, world (x, z), and its gusts so far. */
  readonly wind: readonly [number, number];
  readonly gusts: number;
}

interface RunSession {
  readonly body: Body;
  readonly track: Track;
  frame(): RunFrame;
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
 * How hard the Run slows for a bend or a corner, m/s²: about as hard as the body slows, which is
 * less than the walk asked of the SIMBICON walk's feedback changes (`SimbiconSettings.speedup`):
 * slowed harder, the body comes to a bend going faster than its pace there, and swings wide of it,
 * or carries on past a corner while its walk swings round to the next way.
 */
const BRAKE = 0.3;
/** The pace the Run takes a corner at, m/s: the slowest pace the envelopes measure. */
const CORNER_PACE = 0.2;

/** How far ahead of `s` the next corner of `track` is, m (Infinity on a track with none). */
function toCorner(track: Track, s: number): number {
  let least = Infinity;
  for (const at of track.corners) least = Math.min(least, ((at - s) % track.length + track.length) % track.length);
  return least;
}

/** How finely the Run reads the track ahead for its bends, m. */
const LOOK_STEP = 0.05;

/**
 * The fastest pace no faster than `top` at which `envelope`'s turns carry the body round a bend of
 * `radius` m, m/s (`paceRound`); past the envelope's fastest walk, at the turn it held there
 * (`turnAt`). A body with no envelope (one measured, or under an experiment's stance tuning) is not slowed.
 */
function paceRoundTo(envelope: StanceEnvelope | null, radius: number, top: number | undefined): number {
  if (!envelope) return Infinity;
  const within = paceRound(envelope, radius);
  if (top === undefined || top <= envelope.walk.value) return within;
  return Math.max(within, Math.min(top, carried(turnAt(envelope, top), radius)));
}

/** How the Run's tactics go round. */
interface TrackOptions {
  /** The fastest pace asked, m/s, in place of the envelope's fastest walk. */
  readonly top?: number;
  /** A gait of their own: a pace, m/s, and a turn, rad/s, they ask no more than. */
  readonly pace?: number;
  readonly turn?: number;
  /** The heading they face throughout, rad (`TrackInfo.facing`); none faces along the track. */
  readonly facing?: number;
}

/**
 * **The Run's tactics**: round `track` as fast as the body's walk and turns take it, or as `top`
 * asks; given a gait, walking no faster than its `pace` and turning no faster than its `turn` (it
 * asks to face no further round than that from the heading it has).
 */
interface TrackTactics extends Tactics {
  frame(time: number): Omit<RunFrame, "speed" | "off" | "time" | "heading" | "fallen" | "walking" | "gait" | "wind" | "gusts">;
}

export function trackTactics(track: Track, { top, pace: most, turn, facing }: TrackOptions = {}): TrackTactics {
  const turning = turn ?? Infinity;
  let along = 0, travelled = 0, laps = 0, lapFrom = 0, lastLap: number | null = null;
  let pace = 0, bending = false, aim: [number, number] = [0, 0], face = facing ?? 0, move: [number, number] = [0, 0];
  let setOff: number | null = null, last: number | null = null;
  // Each piece's distance along the track and time on it, by its order.
  const onPiece = track.lengths.map(() => ({ metres: 0, seconds: 0 }));
  return {
    name: "track",
    decide({ view, report, envelope }, dt): Intent {
      const c = view.stance.centre, fastest = Math.min(top ?? envelope?.walk.value ?? 0, most ?? Infinity);
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
        const to = track.at(along + AIM_AHEAD);
        aim = [to.x, to.z];
        const toward = Math.atan2(to.x - c.x, to.z - c.z);
        // Each bend as far ahead as it takes to brake from the fastest pace, at its pace and braking to it; the next corner likewise.
        let bend = Infinity;
        for (let d = 0; d <= fastest * fastest / (2 * BRAKE); d += LOOK_STEP) {
          const k = Math.abs(track.at(along + d).curvature), radius = k === 0 ? Infinity : 1 / k;
          const at = Math.min(paceRoundTo(envelope, radius, top), carried(turning, radius));
          bend = Math.min(bend, Math.sqrt(at * at + 2 * BRAKE * d));
        }
        const corner = Math.max(CORNER_PACE, Math.sqrt(2 * BRAKE * toCorner(track, along)));
        // Facing along the track, no faster than its turns carry it round the arc from its heading to the point it aims at.
        if (facing === undefined) {
          const lag = Math.abs(wrap(toward - report.heading)), reach = Math.sqrt((to.x - c.x) * (to.x - c.x) + (to.z - c.z) * (to.z - c.z));
          const radius = lag === 0 ? Infinity : reach / (2 * (lag < Math.PI / 2 ? Math.sin(lag) : 1));
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
          move = [pace * Math.cos(off), pace * Math.sin(off)];
        }
      }
      return { move: facing === undefined ? [pace, 0] : move, face, guard: NO_COVER, attack: null };
    },
    frame(time) {
      const running = setOff === null ? 0 : time - setOff;
      const pieces = onPiece.flatMap((on, i) => track.lengths[i]! > 0 ? [on.seconds > 0 ? on.metres / on.seconds : null] : []);
      return { along, travelled, laps, lastLap, pace, bending, mean: running > 0 ? travelled / running : 0, pieces, aim };
    },
  };
}

/** What the lab asks of a run beyond its track. */
interface RunOptions {
  /** The fastest pace it asks, m/s; none, the body's fastest walk (`Sight.envelope`), which a body with none must be given. */
  readonly top?: number;
  /** The heading it faces throughout (`TrackInfo.facing`). */
  readonly facing?: number;
  /** The wind's settings and seed; none blows no wind. */
  readonly wind?: { readonly settings: WindSettings; readonly seed: number };
}

/** Run `actor`'s body, a human in its reference pose at the track's start facing along it, round `track`. */
export function startRun(actor: Actor, track: Track, { top, facing, wind }: RunOptions = {}): RunSession {
  const { body, world } = actor;
  const tactics = trackTactics(track, { top, facing });
  const { report } = actor.drive(tactics);
  const meter = startGaitMeter(body.built, world);
  const blowing = startWind(body.built, world, wind?.settings ?? { rate: 0, strength: 0 }, wind?.seed ?? 0);
  const frame = (): RunFrame => {
    const s = body.view.stance, time = body.view.time, f = tactics.frame(time), on = track.at(f.along);
    return {
      ...f, time, heading: report.heading, fallen: body.view.down, walking: report.pace,
      speed: Math.hypot(s.velocity.x, s.velocity.z), off: Math.hypot(s.centre.x - on.x, s.centre.z - on.z),
      gait: meter.reading(), wind: blowing.state.force, gusts: blowing.state.count,
    };
  };
  return {
    body, track, frame,
    get wind() { return blowing.settings; },
    set wind(settings) { blowing.settings = settings; },
    dispose: () => { meter.dispose(); blowing.dispose(); actor.dispose(); },
  };
}
