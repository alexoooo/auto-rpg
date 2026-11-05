import type { BodyView } from "../../control/body.ts";
import type { StanceGoal, SwingGoal } from "../../control/stance.ts";
import type { BearingEnd, BodySpec, Side } from "../../core/bodies/spec/body.ts";
import { stanceFeet } from "../../control/support.ts";
import type { GaitName } from "../locomotion/gaits.ts";
import type { CarriageName, Footing } from "../locomotion/locomotion.ts";
import type { SupportReport } from "../locomotion/support-fold.ts";

/**
 * **What every skill answers to**: the body was another mind's, and is back as `view` shows it.
 * Whatever the skill had under way is over.
 */
export interface Skill<V = BodyView> {
  resume(view: V): void;
}

/**
 * **The legs goal**: what the legs are asked this control step, a walk and the stance goal's own
 * fields in part, any of them left out. The legs complete it (`Locomotion.goal`): what it sets they
 * carry out, and what it leaves out they fill from the walk.
 *
 * - **The walk**: `walk` (forward along the legs' heading and to its right, m/s), null to stand;
 *   `face`, the heading a walk turns toward; `footing`, where each sole's middle is set, standing;
 *   `destination`, m from where the body is being taken, for its stopping. In an action's claim a
 *   walk or facing left out is the intent's: absent and a walk of none are distinct. Each foot's
 *   place is keyed by its end's name (`BearingEnd`).
 * - **The carriage** the legs hold from now on, by name (`CARRIAGES`); left out, the one they hold.
 *   **The gait** they move by, by name (`GAITS`), where their set has it; left out, their set's choice.
 * - **The stance's fields** (`StanceGoal`): `feet`, the ends that bear (`BearingEnd`, the body's
 *   own names: a human's `foot.left`), a human standing on its two feet;
 *   `height`, the centre of mass's over the soles, m; `heading`, the stance's, rad, unstored (the
 *   legs keep their own); `centre`, the centre of mass's place over the ground, world (x, z), m,
 *   null for the middle of the bearing feet; `pose`, a supported root pitch, its anchors keyed by
 *   end; `swing`, an end not bearing carried to a landing place; `halt`, a step not yet lifted not
 *   taken.
 */
export interface LegsGoal {
  readonly walk?: readonly [forward: number, right: number] | null;
  readonly face?: number;
  readonly footing?: Readonly<Record<BearingEnd, readonly [number, number]>>;
  readonly destination?: number;
  readonly carriage?: CarriageName;
  readonly gait?: GaitName;
  readonly feet?: readonly BearingEnd[];
  readonly height?: number;
  readonly heading?: number;
  readonly centre?: readonly [number, number] | null;
  readonly pose?: StanceGoal["pose"];
  readonly swing?: SwingGoal | null;
  readonly halt?: boolean;
}

/** **The ends a stance stands on**, by name, each with its side (`stanceFeet`). */
export type StanceFeet = Readonly<Record<BearingEnd, Side>>;

/** The ends `spec` names that a stance stands on (`StanceFeet`). */
export function stanceFeetOf(spec: BodySpec): StanceFeet {
  const feet: Record<BearingEnd, Side> = {};
  for (const { end, side } of stanceFeet(spec)) feet[end.name] = side;
  return Object.freeze(feet);
}

/** Every field of a legs goal, in `LegsGoal`'s order. */
export const LEGS_FIELDS = Object.freeze(["walk", "face", "footing", "destination", "carriage", "gait", "feet", "height", "heading",
  "centre", "pose", "swing", "halt"] as const satisfies readonly (keyof LegsGoal)[]);

/** A legs goal's field's name (`LEGS_FIELDS`). */
export type LegsField = typeof LEGS_FIELDS[number];

/**
 * **What the legs did not carry out** of their last goal (`Locomotion.unmet`): the fields they
 * left undone, in `LEGS_FIELDS`' order; and of the centre and height they carried out, how far the
 * stance held the centre of mass from the one asked (its place, `StanceReading.place`) and its
 * plan from the height asked (`StanceReading.plan`), m, read standing, 0 where none was asked.
 */
export interface LegsUnmet {
  readonly fields: readonly LegsField[];
  readonly centre: number;
  readonly height: number;
}

/** Legs that carried out the whole goal. */
export const ALL_MET: LegsUnmet = Object.freeze({ fields: Object.freeze([]), centre: 0, height: 0 });

/** Each field's bit in a mask of fields (`fieldsOf`). */
export const FIELD_BIT: Readonly<Record<LegsField, number>> = Object.freeze(Object.fromEntries(LEGS_FIELDS.map((field, k) => [field, 1 << k])) as Record<LegsField, number>);

/** A list of fields made once a mask: what the legs report, a cache of frozen data, not a bout's state. */
const LISTS = new Map<number, readonly LegsField[]>();

/** The fields whose bits `mask` sets (`FIELD_BIT`), as one frozen list a mask. */
export function fieldsOf(mask: number): readonly LegsField[] {
  let list = LISTS.get(mask);
  if (!list) LISTS.set(mask, list = Object.freeze(LEGS_FIELDS.filter((field) => mask & FIELD_BIT[field])));
  return list;
}

/** The mask of `fields` (`FIELD_BIT`). */
export function maskOf(fields: readonly LegsField[]): number {
  let mask = 0;
  for (const field of fields) mask |= FIELD_BIT[field];
  return mask;
}

/** The mask of the fields among `mask` that `goal` sets. */
export function setIn(goal: LegsGoal, mask: number): number {
  let set = 0;
  for (const field of LEGS_FIELDS) if (mask & FIELD_BIT[field] && goal[field] !== undefined) set |= FIELD_BIT[field];
  return set;
}

/** A legs goal with its walk and facing filled in: what the legs are given (`Locomotion.goal`). */
export type LegsAsked = LegsGoal & { readonly walk: readonly [forward: number, right: number] | null; readonly face: number };

/** **A legs goal on a stance's feet**: its footing by side (`onStanceFeet`). */
export type SidedAsk<G extends LegsGoal = LegsAsked> = Omit<G, "footing"> & { readonly footing?: Footing };

/**
 * `goal` on the stance's feet: its footing by side (`Footing`), and the mask of the fields that
 * name an end the stance does not stand on, which are left out for the legs to report unmet.
 */
export function onStanceFeet<G extends LegsGoal>(goal: G, feet: StanceFeet): { readonly goal: SidedAsk<G>; readonly refused: number } {
  let refused = 0;
  const sideOf = (end: BearingEnd): Side | undefined => Object.hasOwn(feet, end) ? feet[end] : undefined;
  const { feet: ends, footing, pose, swing, ...rest } = goal;
  const out: { -readonly [K in keyof SidedAsk]?: SidedAsk[K] } = { ...rest };
  if (ends !== undefined) {
    if (ends.every((end) => sideOf(end) !== undefined)) out.feet = ends; else refused |= FIELD_BIT.feet;
  }
  if (footing !== undefined) {
    const placed: Partial<Record<Side, readonly [number, number]>> = {};
    let fits = true;
    for (const [end, at] of Object.entries(footing)) { const side = sideOf(end); if (side === undefined || placed[side]) fits = false; else placed[side] = at; }
    if (fits && placed.left && placed.right) out.footing = { left: placed.left, right: placed.right }; else refused |= FIELD_BIT.footing;
  }
  if (pose !== undefined) {
    if (Object.keys(pose.anchors ?? {}).every((end) => sideOf(end) !== undefined)) out.pose = pose; else refused |= FIELD_BIT.pose;
  }
  if (swing !== undefined) {
    if (swing === null || sideOf(swing.foot) !== undefined) out.swing = swing; else refused |= FIELD_BIT.swing;
  }
  return { goal: out as SidedAsk<G>, refused };
}

/** What an executor reads of the skills beside it, as this step finds them. */
export interface Around {
  /** The heading the legs face, rad, and whether they have set the feet at the footing last asked. */
  readonly heading: number;
  readonly placed: boolean;
  /** How the support skill is going, or null with none. */
  readonly support: SupportReport | null;
}
