import type { Body } from "../core/body.ts";
import { paceRound, type StanceEnvelope } from "../core/control/stance-envelope.ts";
import { NO_COVER, type Intent } from "../core/mind/intent.ts";
import { wrap } from "../core/skills/locomotion.ts";
import type { Tactics } from "../core/mind/tactics.ts";
import type { Actor } from "./actor.ts";
import type { Track } from "./track.ts";

/**
 * **The lab's run mode**: a human on its own feet under the core stance, going round a
 * `Track` as fast as it can walk, guard up, driven by tactics (`trackTactics`). The core has no run
 * gait: this is the stance's walk at its fastest.
 *
 * Each control step the tactics find the body on the track (`Track.nearest`, from where it last
 * was), face the track's point `AIM_AHEAD` ahead of that, and walk forward. The locomotion skill
 * (`src/core/skills/locomotion.ts`) turns the heading toward it no faster than the body turns at
 * the pace it walks. Its pace is the body's fastest walk, but no
 * faster than its turn carries it round the tightest bend within `AIM_AHEAD` either way. Both
 * are the body's own (`Body.envelope`, what the stance was measured to hold with it, its turn
 * at each speed of walk, `turnAt` and `paceRound`).
 *
 * It slows before a bend and keeps the bend's pace a metre past it, for its heading lags the
 * track's: sped up at the arc's end, it leaves the bend short of the way back and drifts off the
 * track. The stance's own acceleration takes it from one pace to the other. Nothing here names a
 * pace: a change of engine re-measures the envelope, and the run asks for what it says.
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
  /** The centre of mass's speed across the ground, m/s, and the mean speed along the track since it set off. */
  readonly speed: number;
  readonly mean: number;
  /** The centre of mass's distance from the track, m. */
  readonly off: number;
  /** The point it aims at, across the ground (x, z). */
  readonly aim: readonly [number, number];
  /** Whether it is down (`BodyView.down`). */
  readonly fallen: boolean;
}

interface RunSession {
  readonly body: Body;
  readonly track: Track;
  frame(): RunFrame;
  dispose(): void;
}

/**
 * **How far along a track a walker faces**, m: the point its heading turns toward, so a walker
 * that has drifted off the track steers back onto it. Walking on the path's own heading lets the
 * drift add up loop after loop. Set: `docs/reference/lab.md#aim-ahead`.
 */
const AIM_AHEAD = 1;

/** The tightest radius of `track` within `metres` of `s` either way, m (Infinity on a straight). */
function tightest(track: Track, s: number, metres: number): number {
  let most = 0;
  for (let d = -metres; d <= metres; d += 0.05) most = Math.max(most, Math.abs(track.at(s + d).curvature));
  return most === 0 ? Infinity : 1 / most;
}

/**
 * **The Run's tactics**: round `track` as fast as the body's walk and turns take it; given a `gait`,
 * walking no faster than its `pace` (m/s) and turning no faster than its `turn` (rad/s: it asks to
 * face no further round than that from the heading it has).
 */
interface TrackTactics extends Tactics {
  frame(time: number): Omit<RunFrame, "speed" | "off" | "time" | "heading" | "fallen">;
}

export function trackTactics(track: Track, envelope: StanceEnvelope, gait?: { readonly pace: number; readonly turn: number }): TrackTactics {
  const fastest = Math.min(envelope.walk.value, gait?.pace ?? Infinity), turn = gait?.turn ?? Infinity;
  let along = 0, travelled = 0, laps = 0, lapFrom = 0, lastLap: number | null = null;
  let pace = 0, bending = false, aim: [number, number] = [0, 0], face = 0, setOff: number | null = null;
  return {
    name: "track",
    decide({ view, report }, dt): Intent {
      const c = view.stance.centre;
      if (view.time > 0) {
        setOff ??= view.time;
        const s = track.nearest(c.x, c.z, along);
        // How far round it went this step: the change in `s`, across the track's wrap.
        let ds = s - along;
        if (ds < -track.length / 2) ds += track.length;
        if (ds > track.length / 2) ds -= track.length;
        travelled += ds;
        along = s;
        if (travelled >= (laps + 1) * track.length) {
          laps++;
          lastLap = view.time - lapFrom;
          lapFrom = view.time;
        }
        const to = track.at(along + AIM_AHEAD);
        aim = [to.x, to.z];
        face = Math.atan2(to.x - c.x, to.z - c.z);
        if (gait) face = report.heading + Math.max(-turn * dt, Math.min(turn * dt, wrap(face - report.heading)));
        const radius = tightest(track, along, AIM_AHEAD), bend = Math.min(paceRound(envelope, radius), turn * radius);
        bending = bend < fastest;
        pace = Math.min(fastest, bend);
      }
      return { move: [pace, 0], face, guard: NO_COVER, attack: null };
    },
    frame(time) {
      const running = setOff === null ? 0 : time - setOff;
      return { along, travelled, laps, lastLap, pace, bending, mean: running > 0 ? travelled / running : 0, aim };
    },
  };
}

/** Run `actor`'s body, a human in its reference pose at the track's start facing along it, round `track`. */
export function startRun(actor: Actor, track: Track): RunSession {
  const { body } = actor;
  const tactics = trackTactics(track, body.envelope!);
  const { report } = actor.drive(tactics);
  const frame = (): RunFrame => {
    const s = body.view.stance, time = body.view.time, f = tactics.frame(time), on = track.at(f.along);
    return { ...f, time, heading: report.heading, fallen: body.view.down, speed: Math.hypot(s.velocity.x, s.velocity.z), off: Math.hypot(s.centre.x - on.x, s.centre.z - on.z) };
  };
  return { body, track, frame, dispose: () => actor.dispose() };
}
