/**
 * **What a trial records of its bodies**, as numbers its tool writes: the body struck
 * (`struckNumbers`), what each holds (`heldNumbers`, `startHeld`), the velocity at the start
 * (`startVelocity`) and how it exited (`trialExit`).
 */
import type { BodySpec, ItemSpec } from "../../../core/bodies/spec/body.ts";
import { hypot } from "../../../core/math/real.ts";
import { ARRIVED } from "../movement.ts";
import { remembered } from "../../../core/remembered.ts";
import { handSet } from "../../../core/hand-set.ts";
import type { BodyHeld, Exit, Held, ItemNumbers, StruckNumbers } from "./profile.ts";

/** How many decimal places a trial's numbers are written at. */
const PLACES = handSet({
  name: "PLACES", sort: "own",
  says: "How many decimal places the numbers a trial records of its bodies are written at.",
  value: 4,
});

/** `x` at the rounding a trial's numbers are written at (`PLACES`). */
const asWritten = (x: number): number => Number(x.toFixed(PLACES));

/**
 * **A trial's exit** (`Trial.exit`) from where the two stood as it ended, `exit` (head to head,
 * `range`, and centre to centre, `apart`, m), and `apart` m centre to centre as it began: its
 * range; whether it ended within `ARRIVED` of where it began, centre to centre (`stays`, 1 or 0),
 * else by how much further apart (`moved`, m). A head at an action's end leans or has been struck,
 * so a change head to head is not the bodies'. An exit with no centre gives its range alone.
 */
export function trialExit(exit: { readonly range: number; readonly apart?: number }, apart: number): Exit {
  const range = { range: asWritten(exit.range) };
  if (exit.apart === undefined) return range;
  const moved = exit.apart - apart;
  return Math.abs(moved) <= ARRIVED ? { ...range, stays: 1 } : { ...range, stays: 0, moved: asWritten(moved) };
}

/** **A body of `spec` as a trial records it struck** (`StruckNumbers`), at the 4 places a trial is written at; found once a spec. */
export const struckNumbers = remembered((spec: BodySpec): StruckNumbers => Object.freeze({ stature: asWritten(spec.stature.value), mass: asWritten(spec.mass.value),
  steadiness: spec.attributes.steadiness.value, haste: spec.attributes.haste.value }));

/** The farthest any point of `shape` lies from its frame's origin, m. */
function shapeReach(shape: ItemSpec["shapes"][number]): number {
  const norm = (v: readonly [number, number, number]): number => hypot(hypot(v[0], v[1]), v[2]);
  switch (shape.kind) {
    case "capsule": return Math.max(norm(shape.from.value), norm(shape.to.value)) + shape.radius.value;
    case "sphere": return norm(shape.centre.value) + shape.radius.value;
    case "hull": return Math.max(0, ...shape.points.map((point) => norm(point.value)));
    default: { const never: never = shape; throw new Error(`no reach of a shape ${String((never as { kind: unknown }).kind)}`); }
  }
}

/** **`item`'s numbers** (`ItemNumbers`), at the 4 places a trial is written at; found once an item. */
const itemNumbers = remembered((item: ItemSpec): ItemNumbers => Object.freeze({ mass: asWritten(item.mass.value),
  reach: asWritten(Math.max(0, ...item.shapes.map(shapeReach), ...(item.contacts ?? []).map((contact) => shapeReach(contact.shape)))) }));

/** **What a body of `spec` holds, as numbers** (`BodyHeld`); undefined where it holds nothing. Found once a spec. */
export const heldNumbers = remembered((spec: Pick<BodySpec, "held">): BodyHeld | undefined => {
  const held = spec.held ?? [];
  return held.length ? Object.freeze(Object.fromEntries(held.map(({ segment, item }) => [segment, itemNumbers(item)]))) : undefined;
});

/** Whether two bodies hold alike (`BodyHeld`): the same segments, each item's numbers the same; holding nothing is undefined. */
export function holdsAlike(a: BodyHeld | undefined, b: BodyHeld | undefined): boolean {
  const as = Object.keys(a ?? {}), bs = Object.keys(b ?? {});
  return as.length === bs.length && as.every((segment) => b?.[segment] !== undefined && a![segment]!.mass === b[segment]!.mass && a![segment]!.reach === b[segment]!.reach);
}

/** **What a trial of `own` against `target` records its bodies held** (`Start.held`); undefined where neither held anything. */
export function startHeld(own: BodySpec, target: BodySpec | null): Held | undefined {
  const mine = heldNumbers(own), its = target ? heldNumbers(target) : undefined;
  return mine || its ? { ...(mine ? { own: mine } : {}), ...(its ? { target: its } : {}) } : undefined;
}

/**
 * **A body's velocity at the start in its target's frame**, m/s: `relative`, its velocity less the
 * target's, along `to`, the ground's way from it to the target (closing, positive toward the
 * target), and across that line (positive to the body's right as it faces the target). The two
 * read the same from either body, each taken as the other's target.
 */
export function startVelocity(to: { readonly x: number; readonly z: number }, relative: { readonly x: number; readonly z: number }): [number, number] {
  const length = hypot(to.x, to.z);
  if (length === 0) return [0, 0];
  const ux = to.x / length, uz = to.z / length;
  return [relative.x * ux + relative.z * uz, relative.x * uz - relative.z * ux];
}
