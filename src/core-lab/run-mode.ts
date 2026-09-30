import { createBody, type BodyCommand, type CoreBody } from "../core/body.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { Pose } from "../core/control/motor.ts";
import { paceRound, turnAt } from "../core/control/stance-envelope.ts";
import type { World } from "../core/world.ts";
import { stanceLegs } from "./legs.ts";
import { GUARD, SERVO_SECONDS, STEER, TURN_LEAD } from "./routine.ts";
import type { Track } from "./track.ts";

/**
 * **The core lab's run mode**: a human on its own feet under the core stance, going round a
 * `Track` as fast as the lab asks a walk to go, guard up. The core has no run gait: this is the
 * stance's walk at its fastest.
 *
 * Each control step it finds itself on the track (`Track.nearest`, from where it last was), aims at
 * the track's point `STEER.metres` ahead of that, and turns its heading toward the aim no faster
 * than the body's fastest turn, as the stance turns only while it walks. It turns not at all for its first
 * `TURN_LEAD`: the Routine found that a turn begun over feet still planted for the walk's first
 * weight shift fell. Its pace is the body's fastest walk, but no faster than its turn carries it
 * round the tightest bend within `STEER.metres` either way. Both are the body's own
 * (`CoreBody.envelope`, what the stance was measured to hold with it, its turn at each speed of
 * walk, `turnAt` and `paceRound`): on Rapier the Warrior walks 0.7 m/s and the Rogue 0.5; the
 * Warrior turns 4 rad/s to 0.4 m/s and 2 at 0.5 and 0.7, the Rogue 4 to 0.4 and 2 at 0.5; the
 * Warrior takes the shuttle's 0.3 m half-turns at 0.6 m/s and the Rogue at 0.5, where its turn
 * carries it round.
 * It slows before a bend and keeps the bend's pace a metre past it, for its heading lags the
 * track's: sped up at the arc's end, the Warrior asked 0.5 m/s was still 0.9 rad short of the way
 * back and went 45.6 cm off the shuttle; kept slow, 31.7 cm. The stance's own acceleration takes it
 * from one pace to the other. Nothing here names a pace that held
 * on one engine: a change of engine re-measures the envelope, and the run asks for what it says.
 *
 * This module has no page-only imports, so the Node stand can run it (`tests/core-lab-run.test.mjs`).
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
  /** Whether it has fallen (`StanceLegs.fallen`). */
  readonly fallen: boolean;
}

export interface RunSession {
  readonly body: CoreBody;
  readonly track: Track;
  frame(): RunFrame;
  dispose(): void;
}

const wrap = (a: number): number => a - 2 * Math.PI * Math.ceil((a - Math.PI) / (2 * Math.PI));

/** The tightest radius of `track` within `metres` of `s` either way, m (Infinity on a straight). */
function tightest(track: Track, s: number, metres: number): number {
  let most = 0;
  for (let d = -metres; d <= metres; d += 0.05) most = Math.max(most, Math.abs(track.at(s + d).curvature));
  return most === 0 ? Infinity : 1 / most;
}

/** Run `built`, a human in its reference pose at the track's start facing along it, round `track`. */
export function startRun(built: BuiltBody, world: World, track: Track): RunSession {
  const body = createBody(built, world, { servoSeconds: SERVO_SECONDS });
  const envelope = body.envelope!, fastest = envelope.walk.value;
  const legs = stanceLegs();
  const posture: Pose = { ...GUARD };
  const command: { -readonly [K in keyof BodyCommand]: BodyCommand[K] } =
    { posture, hands: { left: null, right: null }, pushes: [], stance: null };
  let heading = 0, along = 0, travelled = 0, laps = 0, lapFrom = 0, lastLap: number | null = null;
  let pace = 0, bending = false, aim: [number, number] = [0, 0], setOff: number | null = null;

  body.drive((view, dt) => {
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
      const to = track.at(along + STEER.metres);
      aim = [to.x, to.z];
      if (view.time - setOff >= TURN_LEAD) {
        const rate = turnAt(envelope, pace) * dt;
        heading += Math.max(-rate, Math.min(rate, wrap(Math.atan2(to.x - c.x, to.z - c.z) - heading)));
      }
      const bend = paceRound(envelope, tightest(track, along, STEER.metres));
      bending = bend < fastest;
      pace = Math.min(fastest, bend);
    }
    const goal = legs.goal(view, heading, [pace, 0]);
    if (!goal) return command;
    command.stance = goal;
    return command;
  });

  const frame = (): RunFrame => {
    const s = body.view.stance, on = track.at(along), time = body.view.time;
    const running = setOff === null ? 0 : time - setOff;
    return {
      time, heading, along, travelled, laps, lastLap, pace, bending,
      speed: Math.hypot(s.velocity.x, s.velocity.z), mean: running > 0 ? travelled / running : 0,
      off: Math.hypot(s.centre.x - on.x, s.centre.z - on.z), aim, fallen: legs.fallen,
    };
  };

  return { body, track, frame, dispose: () => body.dispose() };
}
