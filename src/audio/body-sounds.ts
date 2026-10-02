import { Quaternion, Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { lowsOf } from "../core/control/ground.ts";
import { centreOfToRef, turnOfToRef } from "../core/control/support.ts";
import { watchTouches, type Touch, type TouchWatch } from "../core/touches.ts";
import type { World } from "../core/world.ts";
import { impactCue, substanceOf, voiceOf, type SoundCue } from "./cues.ts";

/**
 * **What a body sounds of**, read from the world and nothing else: its touches, and its air. No
 * scenario, stance or strike says when a sound is due.
 *
 * - **A touch** (`hearTouches`): a segment meeting another body, or something fixed, that it was
 *   not in contact with, while closing on it (`src/core/touches.ts`, lasting as long as the
 *   contact). It is as loud as the energy it carries and in the voice of the softer of the two
 *   that met (`impactCue`, `voiceOf`, `src/audio/cues.ts`). A footfall is a foot meeting the
 *   ground; a fall is the trunk, the head and the limbs meeting it; a blow is one body's segment,
 *   or what it holds, meeting another's.
 * - **Air** (`airOf`): how fast the body's fastest extremity moves, which its one air voice
 *   follows (`GameAudio.swish`).
 *
 * This module has no page-only imports, so the Node stand can run it
 * (`tests/audio-bodies.test.mjs`). A listener only reads: a bout with none is the same bout.
 */

/** A body that is heard: its key in a cue, and what it was built as. */
interface Heard {
  readonly id: string;
  readonly built: BuiltBody;
}

/** What a touch of something fixed is keyed by, beside the body's id. */
const GROUND = "ground";

/**
 * Hear `bodies` in `world`: every segment's new touch with another of them or with something
 * fixed, as its cue. A pair of bodies is heard once, from the earlier of the two, and a body's
 * touch with itself never. Everything fixed is stone. A touch too quiet for a cue is not heard.
 * `beside` are bodies another listener hears: a touch of one of `bodies` on one of them is heard
 * here, and their own touches with anything else are not.
 */
export function hearTouches<B extends Heard>(world: World, bodies: readonly B[], heard: (cue: SoundCue, touch: Touch<B>) => void, beside: readonly B[] = []): { dispose(): void } {
  const place = new Map([...bodies, ...beside].map((body, i) => [body, i]));
  const watch: TouchWatch<B> = watchTouches(world, [...place.keys()], {
    reads: (body) => place.get(body)! < bodies.length,
    lasts: "contact",
    counts: (of, on) => on === null || place.get(on.body)! > place.get(of.body)!,
  }, (touch) => {
    const { of, on } = touch;
    const kind = voiceOf(substanceOf(of.body.built, of.segment), on ? substanceOf(on.body.built, on.segment) : "stone");
    const cue = impactCue(`${of.body.id}:${on ? on.body.id : GROUND}`, kind, watch.priced(touch).energy, { x: touch.point[0], z: touch.point[2] });
    if (cue) heard(cue, touch);
  });
  return { dispose: () => watch.dispose() };
}

/**
 * **`built`'s air**: the speed of its fastest point now, m/s, with where that point is written
 * into `at`. The points are those of its extremities: the segments that are no joint's parent,
 * with what they hold, each shape's ends or corners (`lowsOf`). A point moves at its segment's
 * velocity, which is its centre of mass's, and its spin across the lever from that centre. No end
 * is chosen ahead: the fastest is found each time it is asked.
 */
export function airOf(built: BuiltBody): (at: Vector3) => number {
  const parents = new Set([...built.joints.values()].map((joint) => joint.parent));
  const leaves = [...built.segments.values()].filter((segment) => !parents.has(segment)).map((segment) => {
    const centre = segment.rigid.centre;
    // Each point's lever from the centre of mass, in the reference pose's axes.
    const levers = segment.rigid.shapes.flatMap((shape) => lowsOf(shape, segment.frame))
      .map(({ at }) => new Vector3(at[0] - centre[0], at[1] - centre[1], at[2] - centre[2]));
    return { segment, levers };
  });
  const turn = new Quaternion(), velocity = new Vector3(), spin = new Vector3(), centre = new Vector3(), lever = new Vector3(), across = new Vector3();
  return (at) => {
    let fastest = 0;
    at.setAll(0);
    for (const { segment, levers } of leaves) {
      segment.body.linearVelocityToRef(velocity);
      segment.body.angularVelocityToRef(spin);
      turnOfToRef(segment, turn);
      centreOfToRef(segment, centre);
      for (const from of levers) {
        from.applyRotationQuaternionToRef(turn, lever);
        const speed = Vector3.CrossToRef(spin, lever, across).addInPlace(velocity).length();
        if (speed > fastest) { fastest = speed; centre.addToRef(lever, at); }
      }
    }
    return fastest;
  };
}
