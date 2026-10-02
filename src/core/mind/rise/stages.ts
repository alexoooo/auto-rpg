/**
 * **A rise, as data** (`Recipe`): what a body that is down does to stand, stage by stage, and what
 * it bears on while it does. The player (`stagedRise`, `staged.ts`) knows the kinds of stage and of
 * limb, and no body; a recipe names the channels, segments and joints of the bodies it is for.
 */
import type { BodySpec, JointSpec } from "../../spec/body.ts";
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

/**
 * **A stage that is a bearing**: the body borne on `on` by the bearing solve
 * (`src/core/control/bearing.ts`), its centre of mass carried to a place over them.
 */
export interface BearStage {
  readonly kind: "bear";
  readonly name: string;
  /**
   * The limbs that bear, by the recipe's names, each with its share of the place the centre of
   * mass is held over: the middle of their points, weighed so. The shares sum to 1.
   */
  readonly on: readonly { readonly limb: string; readonly share: number }[];
  /**
   * The limbs it leaves, by the recipe's names: each bears where it is until the centre of mass
   * is over the limbs of `on`, which can then bear the body alone, and from then is the servo's,
   * driven toward the posture. The stage is not done until it has let them go.
   */
  readonly leave: readonly string[];
  /**
   * The centre of mass's height over the ground, as a part of its standing height
   * (`Uprightness.standing`); null where the limbs it bears on leave the body none of its own (a
   * body on its shins is as high as its thighs' turn puts it), and its rise and fall are damped.
   */
  readonly height: number | null;
  /** The pelvis's pitch forward from upright, about the level axis across the way it faces, rad. */
  readonly pitch: number;
  /**
   * What every freedom the bearing limbs' tasks do not take is driven toward: a posture, or the
   * body's reference pose, which no posture names since the bodies' differ.
   */
  readonly posture: Posture | "reference";
  /** The time constant of its aims, s. */
  readonly seconds: number;
  /** The longest it may take, s: past it the attempt is over. */
  readonly limit: number;
}

/** A stage of a rise, by kind. */
export type Stage = PoseStage | BearStage;

/**
 * **A capsule segment, bearing where it touches the ground**: a point, a radius under its lower
 * end's centre, or under its middle when it lies on both its ends.
 */
export interface EndLimb {
  readonly kind: "end";
  /** What the stages call it. */
  readonly name: string;
  readonly segment: string;
  /** The joint its own chain begins at; the joints before it, from the root, are its stem (`Limb.stem`). */
  readonly from: string;
  /**
   * The channels of its chain that take its point's task, three or more: of the motions that give
   * the task, theirs is the one nearest the stage's posture. The chain's others are driven toward
   * the posture.
   */
  readonly takes: readonly string[];
}

/**
 * **A capsule segment on one of its ends, propped at the other by a foot that hangs from it**: a
 * shank on its knee, its ankle held up by the foot on its toes. It bears from the end's point to
 * the foot's front edge, as a sole of no width.
 */
export interface ProppedLimb {
  readonly kind: "propped";
  readonly name: string;
  readonly segment: string;
  /** Which end it is on: the one nearer the joint that carries the segment, or the farther. */
  readonly end: "near" | "far";
  readonly from: string;
  /** The channels of its chain that take its task, the point's and its tilt's, four or more; as an end's. */
  readonly takes: readonly string[];
  /** The foot that props it: a foot the stance stands on, hanging from `segment`. */
  readonly prop: string;
}

/** What a body may bear on, by kind. */
type LimbSpec = EndLimb | ProppedLimb;

/**
 * **A rise**: the limbs its bearing stages may name, the stages that turn the body onto its front
 * from each other way it lies, and the stages that stand it up from its front. It names channels,
 * segments and joints of the bodies it is for, and nothing in the player does.
 */
export interface Recipe {
  /** In the order the riser's memory keeps them. */
  readonly limbs: readonly LimbSpec[];
  readonly roll: Readonly<Record<Exclude<Lie, "front">, readonly PoseStage[]>>;
  readonly rise: readonly Stage[];
}

const SIDES = ["left", "right"] as const;
type Side = (typeof SIDES)[number];

/** `posture` with each channel written `name.@ motion` given to both sides. */
function bothSides(posture: Posture): Posture {
  return Object.fromEntries(Object.entries(posture).flatMap(([name, angle]) =>
    name.includes("@") ? SIDES.map((side) => [name.replace("@", side), angle]) : [[name, angle]]));
}

/**
 * `posture` for a roll over the body's `over` side: a channel written `name.near motion` is that
 * side's, the one that goes under, and `name.far motion` the other's, which comes over the top.
 */
function rollingOver(over: Side, posture: Posture): Posture {
  const far = over === "left" ? "right" : "left";
  return Object.fromEntries(Object.entries(posture).map(([name, angle]) => [name.replace(".near ", `.${over} `).replace(".far ", `.${far} `), angle]));
}

/**
 * The far leg raised and out to its own side, the near arm laid overhead, out of the roll's way
 * (`docs/reference/rising.md#the-roll`).
 */
const WIND = { "hip.far flexion": 1.2, "hip.far abduction": 0.54, "hip.near flexion": 0.2, "shoulder.near flexion": 2.8 };
/**
 * The far leg and the far arm swung across the body, the pelvis curled off the ground, the near
 * leg set out to its side and the near arm swept out from overhead: the body turns onto its near
 * side (`docs/reference/rising.md#the-roll`).
 */
const SWING = {
  "hip.far flexion": 0.8, "hip.far internal rotation": 0.6, "hip.near abduction": 0.2, "lumbar flexion": 0.8,
  "shoulder.far flexion": 1.4, "shoulder.near flexion": 1.2, "shoulder.near abduction": 2,
};
/**
 * The trunk and the near leg laid straight, the near arm overhead, and the far leg kept ahead:
 * the body goes on over its near side onto its front (`docs/reference/rising.md#the-roll`).
 */
const OVER = { "hip.far flexion": 1.2, "hip.far abduction": 0.54, "shoulder.near flexion": 2.8 };
/**
 * The legs laid straight, the near arm kept overhead and the far hand set down beside the chest:
 * the body lies on its front as the rise finds it (`docs/reference/rising.md#the-roll`).
 */
const FLAT = { "shoulder.near flexion": 2.8, "shoulder.far internal rotation": -0.8, "elbow.far flexion": 2.1 };

/** The stages that turn a body on its back onto its front, over its `over` side. */
const rollOver = (over: Side): PoseStage[] => [
  { kind: "pose", name: "wind", posture: rollingOver(over, WIND), seconds: 0.5 },
  { kind: "pose", name: "swing", posture: rollingOver(over, SWING), seconds: 1 },
  { kind: "pose", name: "over", posture: rollingOver(over, OVER), seconds: 0.5 },
  { kind: "pose", name: "flat", posture: rollingOver(over, FLAT), seconds: 1 },
];

/**
 * The arms folded, the hands beside the chest, and the feet pointed, so that the knees slide
 * under the body (`docs/reference/rising.md#stages`).
 */
const FOLD = { "shoulder.@ flexion": 0.9, "shoulder.@ abduction": 0.7, "elbow.@ flexion": 2.4, "ankle.@ dorsiflexion": -0.85 };
/** The knees drawn under the body, the trunk curled over them (`docs/reference/rising.md#stages`). */
const TUCK = { ...FOLD, "hip.@ flexion": 2.1, "knee.@ flexion": 2.5, "lumbar flexion": 0.7, "thoracic flexion": 0.3 };
/**
 * The arms reached ahead, the hands turned palm down, and the toes tucked under, so that each shin
 * is propped on its foot (`docs/reference/rising.md#stages`).
 */
const PROP = {
  ...TUCK, "lumbar flexion": 0.4, "shoulder.@ flexion": 1.3, "shoulder.@ internal rotation": -0.4, "elbow.@ flexion": 1,
  "wrist.@ flexion": -1.2, "ankle.@ dorsiflexion": 0.38,
};
/**
 * On knees and hands: the trunk near level, the arms near straight under the shoulders, the hips
 * over the knees (`docs/reference/rising.md#stages`).
 */
const FOURS = {
  "lumbar flexion": 0.3, "thoracic flexion": 0.2, "shoulder.@ flexion": 1.9, "shoulder.@ abduction": 0.3, "shoulder.@ internal rotation": -0.4,
  "elbow.@ flexion": 0.3, "wrist.@ flexion": -0.8, "hip.@ flexion": 1.9, "knee.@ flexion": 2.4, "ankle.@ dorsiflexion": 0.38,
};

/**
 * The game's recipe, for a human and the skeleton, whose channels, segments and joints have the
 * same names (`docs/reference/rising.md#stages`: each stage's numbers, and the stand's reading of
 * each).
 */
export const RISE: Recipe = deepFreeze({
  limbs: SIDES.flatMap((side): LimbSpec[] => [
    // A body on its knees: the shank on its upper end, the toes tucked under and holding the ankle up.
    { kind: "propped", name: `shin.${side}`, segment: `shank.${side}`, end: "near", from: `hip.${side}`, prop: `foot.${side}`,
      takes: [`hip.${side} flexion`, `hip.${side} abduction`, `hip.${side} internal rotation`, `knee.${side} flexion`] },
    // A hand hangs from the trunk, which both arms share: its stem. Its wrist is the posture's.
    { kind: "end", name: `hand.${side}`, segment: `hand.${side}`, from: `shoulder.${side}`,
      takes: [`shoulder.${side} flexion`, `shoulder.${side} abduction`, `shoulder.${side} internal rotation`, `elbow.${side} flexion`] },
  ]),
  // From its back a body rolls over its right side; on a side, it goes on over that side.
  roll: { back: rollOver("right"), left: rollOver("left").slice(2), right: rollOver("right").slice(2) },
  rise: [
    { kind: "pose", name: "fold", posture: bothSides(FOLD), seconds: 1 },
    // The pelvis comes off the ground over the shins.
    { kind: "pose", name: "tuck", posture: bothSides(TUCK), seconds: 2 },
    // The arms prop the trunk.
    { kind: "pose", name: "prop", posture: bothSides(PROP), seconds: 1.5 },
    // The shins bear two thirds of the body and the hands a third: the centre of mass is held
    // that far between them. The shins leave the body no height of its own.
    {
      kind: "bear", name: "fours", on: SIDES.flatMap((side) => [{ limb: `shin.${side}`, share: 0.33 }, { limb: `hand.${side}`, share: 0.17 }]),
      leave: [], height: null, pitch: 1.3, posture: bothSides(FOURS), seconds: 0.4, limit: 5,
    },
  ],
});

/** Every stage of `recipe`: each roll's, then the rise's. */
export const stagesOf = (recipe: Recipe): readonly Stage[] => [...recipe.roll.back, ...recipe.roll.left, ...recipe.roll.right, ...recipe.rise];

/** `joint`'s freedoms as channel names. */
const channelsOf = (joint: JointSpec): string[] => joint.dofs.map((dof) => `${joint.name} ${dof.positive}`);

/** The joints of `spec` from its root out to the segment named `segment`, root first. */
function chainOf(spec: BodySpec, segment: string): JointSpec[] {
  const chain: JointSpec[] = [];
  for (let at = segment, joint = spec.joints.find((j) => j.child === at); joint; at = joint.parent, joint = spec.joints.find((j) => j.child === at)) {
    chain.unshift(joint);
  }
  return chain;
}

/**
 * The channels `limb`'s own chain has on `spec`, root outward, and its stem's; null if the body
 * has no such limb (`limbFaults` says why).
 */
export function limbChannels(limb: LimbSpec, spec: BodySpec): { readonly chain: string[]; readonly stem: string[] } | null {
  const joints = chainOf(spec, limb.segment);
  if (joints.length === 0) return null;
  switch (limb.kind) {
    case "end":
    case "propped": {
      const first = joints.findIndex((joint) => joint.name === limb.from);
      return first < 0 ? null : { chain: joints.slice(first).flatMap(channelsOf), stem: joints.slice(0, first).flatMap(channelsOf) };
    }
    default: return unknownLimb(limb);
  }
}

function unknownLimb(limb: never): never {
  throw new Error(`a limb of no known kind: ${JSON.stringify(limb)}`);
}

function unknownStage(stage: never): never {
  throw new Error(`a stage of no known kind: ${JSON.stringify(stage)}`);
}

/** The segments a stance's feet are (`footStatesOf`). */
const FEET: readonly string[] = SIDES.map((side) => `foot.${side}`);

/** What is wrong with `recipe`'s limbs for `spec`, in words. */
function limbFaults(recipe: Recipe, spec: BodySpec): string[] {
  const faults: string[] = [];
  recipe.limbs.forEach((limb, at) => {
    if (recipe.limbs.findIndex((other) => other.name === limb.name) !== at) faults.push(`limb ${limb.name} is named twice`);
    const segment = spec.segments.find((s) => s.name === limb.segment);
    if (!segment) {
      faults.push(`limb ${limb.name} is on ${limb.segment}, which ${spec.model} lacks`);
      return;
    }
    /** A limb on a capsule's end: the capsule, its chain, and the channels that take its task of `rows` rows, its chain's, each once. */
    const onEnd = (on: EndLimb | ProppedLimb, rows: number): void => {
      if (segment.shape.kind !== "capsule") faults.push(`limb ${on.name} bears on an end of ${on.segment}, a ${segment.shape.kind}`);
      const channels = limbChannels(on, spec);
      if (!channels) {
        faults.push(`limb ${on.name} begins at ${on.from}, which is not on the way to ${on.segment}`);
        return;
      }
      on.takes.forEach((channel, k) => {
        if (!channels.chain.includes(channel)) faults.push(`limb ${on.name} takes ${channel}, which is not a freedom of its chain`);
        else if (on.takes.indexOf(channel) !== k) faults.push(`limb ${on.name} takes ${channel} twice`);
      });
      if (on.takes.length < rows) faults.push(`limb ${on.name} takes ${on.takes.length} channels, and its task has ${rows} rows`);
    };
    switch (limb.kind) {
      case "end":
        onEnd(limb, 3);
        return;
      case "propped":
        onEnd(limb, 4);
        if (!FEET.includes(limb.prop)) faults.push(`limb ${limb.name} is propped on ${limb.prop}, which is not a foot a stance stands on`);
        else if (!chainOf(spec, limb.prop).some((joint) => joint.child === limb.segment)) faults.push(`limb ${limb.name} is propped on ${limb.prop}, which does not hang from ${limb.segment}`);
        return;
      default: unknownLimb(limb);
    }
  });
  return faults;
}

/** How far a bearing stage's shares may sum from 1: rounding, a numeric setting. */
const SHARES_SUM = 1e-9;

/** What is wrong with `recipe` for `spec`, in words; none if it can be played. */
export function stageFaults(recipe: Recipe, spec: BodySpec): string[] {
  const faults = limbFaults(recipe, spec);
  // Each channel's range from its own zero.
  const ranges = new Map<string, readonly [number, number]>();
  for (const joint of spec.joints) {
    for (const dof of joint.dofs) ranges.set(`${joint.name} ${dof.positive}`, [dof.min.value + dof.bind.value, dof.max.value + dof.bind.value]);
  }
  const postureFaults = (stage: Stage, posture: Posture): void => {
    for (const channel of Object.keys(posture)) {
      if (!ranges.has(channel)) faults.push(`stage ${stage.name} asks ${channel}, which ${spec.model} lacks`);
    }
    for (const [channel, [min, max]] of ranges) {
      const angle = posture[channel] ?? 0;
      if (angle < min || angle > max) faults.push(`stage ${stage.name} asks ${channel} for ${angle} rad, outside its range, ${min} to ${max}`);
    }
  };
  for (const stage of stagesOf(recipe)) {
    if (!(stage.seconds > 0)) faults.push(`stage ${stage.name} lasts ${stage.seconds} s`);
    switch (stage.kind) {
      case "pose":
        postureFaults(stage, stage.posture);
        break;
      case "bear": {
        if (stage.posture !== "reference") postureFaults(stage, stage.posture);
        if (!(stage.limit > 0)) faults.push(`stage ${stage.name} may take ${stage.limit} s`);
        // Each limb it drives, to bear on or to leave, with its channels where the body has it.
        const driven: { readonly name: string; readonly channels: readonly string[] }[] = [];
        const drive = (name: string, does: string): void => {
          const limb = recipe.limbs.find((other) => other.name === name);
          if (!limb) {
            faults.push(`stage ${stage.name} ${does} ${name}, which the recipe lacks`);
            return;
          }
          const channels = limbChannels(limb, spec);
          for (const other of driven) {
            const shared = channels?.chain.find((channel) => other.channels.includes(channel));
            if (shared !== undefined) faults.push(`stage ${stage.name} drives ${other.name} and ${name}, which share ${shared}`);
          }
          driven.push({ name, channels: channels?.chain ?? [] });
        };
        for (const { limb } of stage.on) drive(limb, "bears on");
        for (const limb of stage.leave) drive(limb, "leaves");
        const sum = stage.on.reduce((total, { share }) => total + share, 0);
        if (!(Math.abs(sum - 1) <= SHARES_SUM)) faults.push(`stage ${stage.name}'s shares sum to ${sum}`);
        break;
      }
      default: unknownStage(stage);
    }
  }
  return faults;
}
