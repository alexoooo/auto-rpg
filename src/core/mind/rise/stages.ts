/**
 * **A rise, as data** (`Recipe`): what a body that is down does to stand, stage by stage. The
 * player (`stagedRise`, `staged.ts`) knows the kinds of stage and no body; a recipe names the
 * channels of the bodies it is for.
 */
import type { BodySpec } from "../../spec/body.ts";
import { deepFreeze } from "../../state.ts";

/** How a body lies: on its front, its back, or a side (the side that is down). */
export type Lie = "front" | "back" | "left" | "right";

/**
 * **A posture**: goal angles by channel name, rad, each from its freedom's own zero (a human's,
 * the anatomical position: `DofSpec.bind`), so it is the same shape on bodies whose reference
 * poses differ. A channel it does not name goes to that zero.
 */
type Posture = Readonly<Record<string, number>>;

/** **A stage that is a pose**: every freedom driven toward `posture` for `seconds`. */
export interface PoseStage {
  readonly kind: "pose";
  readonly name: string;
  readonly posture: Posture;
  readonly seconds: number;
}

/** A stage of a rise, by kind. */
export type Stage = PoseStage;

/**
 * **A rise**: the stages that turn the body onto its front from each other way it lies, and the
 * stages that stand it up from its front. It names channels of the bodies it is for, and nothing
 * in the player does.
 */
export interface Recipe {
  readonly roll: Readonly<Record<Exclude<Lie, "front">, readonly PoseStage[]>>;
  readonly rise: readonly Stage[];
}

/** `posture` with each channel written `name.@ motion` given to both sides. */
function bothSides(posture: Posture): Posture {
  return Object.fromEntries(Object.entries(posture).flatMap(([name, angle]) =>
    name.includes("@") ? ["left", "right"].map((side) => [name.replace("@", side), angle]) : [[name, angle]]));
}

/**
 * The arms folded, the hands beside the chest, and the feet pointed, so that the shins lie flat
 * (`docs/reference/rising.md#stages`).
 */
const FOLD = { "shoulder.@ flexion": 0.9, "shoulder.@ abduction": 0.7, "elbow.@ flexion": 2.4, "ankle.@ dorsiflexion": -0.85 };
/** The knees drawn under the body (`docs/reference/rising.md#stages`). */
const KNEES = { "hip.@ flexion": 2.1, "knee.@ flexion": 2.5 };

/**
 * The game's recipe, for a human and the skeleton, whose channels have the same names
 * (`docs/reference/rising.md#stages`: each stage's numbers, and the stand's reading of each).
 */
export const RISE: Recipe = deepFreeze({
  roll: { back: [], left: [], right: [] },
  rise: [
    { kind: "pose", name: "fold", posture: bothSides(FOLD), seconds: 1 },
    // The trunk curled over the knees: the pelvis comes off the ground over the shins.
    { kind: "pose", name: "tuck", posture: bothSides({ ...FOLD, ...KNEES, "lumbar flexion": 0.7, "thoracic flexion": 0.3 }), seconds: 2 },
    // The arms reached ahead and straightened, to prop the trunk.
    { kind: "pose", name: "prop", posture: bothSides({ ...FOLD, ...KNEES, "lumbar flexion": 0.4, "shoulder.@ flexion": 1.3, "elbow.@ flexion": 1 }), seconds: 1.5 },
  ],
});

/** Every stage of `recipe`: each roll's, then the rise's. */
export const stagesOf = (recipe: Recipe): readonly Stage[] => [...recipe.roll.back, ...recipe.roll.left, ...recipe.roll.right, ...recipe.rise];

/** What is wrong with `recipe` for `spec`, in words; none if it can be played. */
export function stageFaults(recipe: Recipe, spec: BodySpec): string[] {
  const faults: string[] = [];
  // Each channel's range from its own zero.
  const ranges = new Map<string, readonly [number, number]>();
  for (const joint of spec.joints) {
    for (const dof of joint.dofs) ranges.set(`${joint.name} ${dof.positive}`, [dof.min.value + dof.bind.value, dof.max.value + dof.bind.value]);
  }
  for (const stage of stagesOf(recipe)) {
    if (!(stage.seconds > 0)) faults.push(`stage ${stage.name} lasts ${stage.seconds} s`);
    for (const channel of Object.keys(stage.posture)) {
      if (!ranges.has(channel)) faults.push(`stage ${stage.name} asks ${channel}, which ${spec.model} lacks`);
    }
    for (const [channel, [min, max]] of ranges) {
      const angle = stage.posture[channel] ?? 0;
      if (angle < min || angle > max) faults.push(`stage ${stage.name} asks ${channel} for ${angle} rad, outside its range, ${min} to ${max}`);
    }
  }
  return faults;
}
