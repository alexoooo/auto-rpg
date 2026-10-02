import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import { airOf, hearTouches } from "../audio/body-sounds.ts";
import { impactCue, surfaceOf, voiceOf, type SoundCue, type SoundPoint } from "../audio/cues.ts";
import type { Body } from "../core/body.ts";
import type { BuiltBody, BuiltSegment } from "../core/build/build-body.ts";
import { contactMass } from "../core/build/contact-mass.ts";
import type { World } from "../core/world.ts";
import type { ClubLanding } from "./club-blow.ts";
import { CATCH_UP_MS } from "./player.ts";

/**
 * **What the lab's body sounded of**, kept against the mind's time (`BodyView.time`): the time a
 * scenario's readout gives for the frame shown, so the page plays what the frame it shows sounded
 * of, live or from the recording. A replay plays the same sounds again; a pause, a scrub and a
 * seek play nothing.
 *
 * A sound of step k is stamped with the time the body's mind saw at that step, which is the time
 * the frame recorded after step k shows (`history.ts`): the log and the recording agree.
 *
 * What is logged is what the world says (`logSounds`: the body's touches and its air,
 * `src/audio/body-sounds.ts`), and the cue of each of the lab's two instruments that are no
 * contact: the page's hand shoving the body (`shoveSound`), and the Blow scenario's mark
 * (`landingCue`).
 *
 * This module has no page-only imports, so the Node stand can run it (`tests/lab-sound.test.mjs`).
 */
export interface SoundLog {
  /** `cue` sounded at `time`, s. */
  note(time: number, cue: SoundCue): void;
  /** The body's air at `time`: its fastest point's speed, m/s, and where it is. */
  air(time: number, speed: number, at: SoundPoint): void;
  /**
   * What is heard as the time shown goes from `last` to `now`: the cues noted after `last`, and
   * after `now` less what one page frame plays (`CATCH_UP_MS`), up to `now`. None going back.
   */
  passed(last: number, now: number): readonly SoundCue[];
  /** The air at `time`, or null if that step's is not held. */
  airAt(time: number): { readonly speed: number; readonly at: SoundPoint } | null;
}

/** The cues a log holds, the latest: a numeric setting, many times what the longest recording sounds of. */
const CAPACITY = 1024;

/** A log for a world of step `dt`, s, holding the air of the last `seconds`. */
export function createSoundLog(dt: number, seconds: number): SoundLog {
  const cues: { readonly time: number; readonly cue: SoundCue }[] = [];
  const slots = Math.round(seconds / dt);
  // The air's ring: a step's slot is its step's number, and holds its time, so one rolled past reads as not held.
  const times = new Float64Array(slots).fill(NaN), speeds = new Float64Array(slots), xs = new Float64Array(slots), zs = new Float64Array(slots);
  const slotOf = (time: number): number => ((Math.round(time / dt) % slots) + slots) % slots;
  return {
    note(time, cue) {
      cues.push({ time, cue });
      if (cues.length > CAPACITY) cues.shift();
    },
    air(time, speed, at) {
      const slot = slotOf(time);
      times[slot] = time; speeds[slot] = speed; xs[slot] = at.x; zs[slot] = at.z;
    },
    passed(last, now) {
      const from = Math.max(last, now - CATCH_UP_MS / 1000);
      return cues.filter((entry) => entry.time > from && entry.time <= now).map((entry) => entry.cue);
    },
    airAt(time) {
      const slot = slotOf(time);
      return Math.abs(times[slot]! - time) < dt / 2 ? { speed: speeds[slot]!, at: { x: xs[slot]!, z: zs[slot]! } } : null;
    },
  };
}

/** What the lab's one body is keyed by in a cue, and its air by. */
export const LAB_BODY = "body";

/**
 * Log what `body` sounds of in `world` into `log`: its touches (`hearTouches`) and, after every
 * step, its air (`airOf`), each at the time its mind saw at that step. `heard` logs a cue of an
 * instrument's at the same time; it is good before the solver steps and after.
 */
export function logSounds(world: World, body: Body, log: SoundLog): { heard(cue: SoundCue | null): void; dispose(): void } {
  const heard = (cue: SoundCue | null): void => { if (cue) log.note(body.view.time, cue); };
  const touches = hearTouches(world, [{ id: LAB_BODY, built: body.built }], heard);
  const air = airOf(body.built), at = new Vector3();
  const airing = world.afterStep(() => log.air(body.view.time, air(at), at));
  return { heard, dispose() { touches.dispose(); airing.dispose(); } };
}

/**
 * **A shove's sound**: the page's hand on `built` is an impulse and no contact, so it says its own
 * cue. The hand is flesh. Its energy is what the impulse J gives the mass m it meets, from rest:
 * J squared over 2 m, with m the body's at the point pushed, along the push (`contactMass`).
 */
export function shoveSound(built: BuiltBody): (segment: BuiltSegment, impulse: Vector3, at: Vector3) => SoundCue | null {
  const mass = contactMass(built);
  return (segment, impulse, at) => {
    mass.update();
    const kg = mass.along(segment, [at.x, at.y, at.z], [impulse.x, impulse.y, impulse.z]);
    return impactCue(`${LAB_BODY}:hand`, voiceOf("flesh", surfaceOf(built, segment)), impulse.lengthSquared() / (2 * kg), at);
  };
}

/**
 * **A club blow's landing on the Blow scenario's mark**, which is no body and so no touch: what
 * `hand` of `built` holds on a head of the body's own kind, with the energy the landing read.
 */
export function landingCue(built: BuiltBody, hand: "left" | "right", landed: ClubLanding): SoundCue | null {
  const club = surfaceOf(built, built.segments.get(`hand.${hand}`)!), head = surfaceOf(built, built.segments.get("head")!);
  return impactCue(`${LAB_BODY}:mark`, voiceOf(club, head), landed.energy, { x: landed.point[0], z: landed.point[2] });
}
