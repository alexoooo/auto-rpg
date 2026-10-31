/**
 * **A shove**: one level impulse at a segment's centre of mass, given one side's body once in a bout
 * (`DuelRecipe.shove`), a drill's. It comes at a time on the bout's clock, or, where it names a
 * limb, the first step from then that the limb's segment moves at a speed against another of the
 * body's: a shove mid-strike comes as the striking hand flies from the chest, whenever the mind
 * throws it. Given in the step's sensing phase,
 * before every mind, from what the last step left; when it came is the bout's (`Duel.shoved`).
 */
import { Vector3 } from "@babylonjs/core/Maths/math.vector.js";
import type { BuiltBody } from "../core/build/build-body.ts";
import { cos, sin } from "../core/math/real.ts";
import type { Side } from "../core/spec/body.ts";
import type { Hook, World } from "../core/world.ts";

/**
 * **A shove**: the side shoved, the segment it meets (`middleTrunk`), its size, N s, and the way it
 * pushes, `degrees` about the vertical from +z toward +x; the bout's second it comes at, and, where
 * `limb` names one, no sooner than the step that segment's centre of mass moves at `speed` m/s
 * against the centre of mass of the segment `against`.
 */
export interface Shove {
  readonly side: Side;
  readonly segment: string;
  readonly impulse: number;
  readonly degrees: number;
  readonly at: number;
  readonly limb?: { readonly segment: string; readonly against: string; readonly speed: number };
}

/** Why `shove` is no shove for `built`, the body of its side: a list of faults, empty for one. */
export function shoveFaults(shove: Shove, built: BuiltBody): string[] {
  const finite = (...values: number[]) => values.every(Number.isFinite);
  return [
    ...shove.side === "left" || shove.side === "right" ? [] : ["side: left or right"],
    ...built.segments.has(shove.segment) ? [] : [`segment: the body has no ${shove.segment}`],
    ...finite(shove.impulse) && shove.impulse >= 0 ? [] : ["impulse: a finite size, N s, not negative"],
    ...finite(shove.degrees, shove.at) && shove.at >= 0 ? [] : ["degrees and at: finite, at not negative"],
    ...!shove.limb ? [] : [
      ...[shove.limb.segment, shove.limb.against].flatMap((name) => built.segments.has(name) ? [] : [`limb: the body has no ${name}`]),
      ...finite(shove.limb.speed) && shove.limb.speed >= 0 ? [] : ["limb: a finite speed, m/s, not negative"]],
  ];
}

/**
 * Gives `built` `shove` once, as `clock` (the bout's seconds) and its limb say, writing the bout's
 * second it came at into `state.at`; the hook that does it.
 */
export function shoveOnCue(world: World, built: BuiltBody, shove: Shove, state: { at: number | null }, clock: () => number): Hook {
  const segment = built.segments.get(shove.segment)!, limb = shove.limb ? built.segments.get(shove.limb.segment)! : null;
  const against = shove.limb ? built.segments.get(shove.limb.against)! : null;
  const way = shove.degrees * Math.PI / 180, impulse = new Vector3(shove.impulse * sin(way), 0, shove.impulse * cos(way));
  const point = new Vector3(), velocity = new Vector3(), other = new Vector3(), limit = shove.limb ? shove.limb.speed * shove.limb.speed : 0;
  return world.sense(() => {
    if (state.at !== null || clock() < shove.at) return;
    if (limb && limb.body.linearVelocityToRef(velocity).subtractInPlace(against!.body.linearVelocityToRef(other)).lengthSquared() < limit) return;
    const node = segment.body.node, centre = segment.body.massProperties.centre;
    point.set(centre[0], centre[1], centre[2]).applyRotationQuaternionToRef(node.rotationQuaternion!, point).addInPlace(node.position);
    segment.body.applyImpulse(impulse, point);
    state.at = clock();
  });
}
