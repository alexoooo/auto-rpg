import measured from "../../../assets/core/strikes.json" with { type: "json" };
import type { Hand, Pose } from "../control/motor.ts";
import type { BodySpec } from "../spec/body.ts";

/**
 * **The strikes a body knows** (`assets/core/strikes.json`, written by
 * `research/core-strike-repertoire.mjs` from the strike searches): each a recipe found by search
 * for one body, one thing held and the right hand, thrown from standing in the guard. The strike
 * skill (`strike.ts`) chooses one by what the hand holds and throws it.
 *
 * A recipe is valid from the start it was searched from, standing still in the guard `STAND`
 * seconds, with the target `distance` straight ahead of the head (the owner's option A,
 * 2026-09-30, `docs/plans/2026-09-30-minds-and-skills.md`); a strike from anywhere else is option
 * B's, next.
 */

/** A push of a strike: `channel` driven its `sense` way at `level`, from `from` to `to` s after the chamber. */
export interface StrikePush {
  readonly channel: string;
  readonly sense: 1 | -1;
  readonly from: number;
  readonly to: number;
  /** Of the muscle's full activation; 1 if not given. */
  readonly level?: number;
}

/** A strike: a chamber pose held for its time, then pushes. */
export interface Strike {
  readonly name: string;
  readonly hand: Hand;
  readonly chamber?: { readonly seconds: number; readonly pose: Pose };
  readonly pushes: readonly StrikePush[];
}

/** A searched strike and where it lands: the target's centre `distance` m straight ahead of the striker's head. */
export interface Recipe {
  /** The body it was searched on. */
  readonly model: string;
  /** What the hand holds: `FIST`, or the held item's name. */
  readonly held: string;
  /** The right hand's; the left's is `mirrored`. */
  readonly strike: Strike;
  readonly distance: number;
  /** How it was searched. */
  readonly found: string;
}

export type Repertoire = readonly Recipe[];

/** An empty hand. */
export const FIST = "fist";

/** The searched repertoire. */
export const REPERTOIRE: Repertoire = measured.recipes as unknown as Repertoire;

/** What `hand` of `spec` holds: the item's name, or `FIST`. */
export function heldIn(spec: BodySpec, hand: Hand): string {
  return spec.held?.find((h) => h.segment === `hand.${hand}`)?.item.name ?? FIST;
}

/** A strike chosen for a hand: the recipe, the strike for that hand, and whether the recipe was searched on another body. */
export interface Chosen {
  readonly recipe: Recipe;
  readonly strike: Strike;
  readonly borrowed: boolean;
}

/**
 * The recipe `spec`'s `hand` throws with what it holds: the body's own, or, where it has none, one
 * searched on another body with the same thing held (the Rogue has no club blow of its own and
 * throws the Warrior's). Null if none holds it.
 */
export function recipeFor(repertoire: Repertoire, spec: BodySpec, hand: Hand): Chosen | null {
  const held = heldIn(spec, hand);
  const fitting = repertoire.filter((r) => r.held === held);
  const recipe = fitting.find((r) => r.model === spec.model) ?? fitting[0];
  if (!recipe) return null;
  return { recipe, strike: hand === recipe.strike.hand ? recipe.strike : mirrored(recipe.strike), borrowed: recipe.model !== spec.model };
}

/** The trunk's freedoms whose positive way is to one side: mirrored, their sense and angle turn over. */
const SIDED = [" rotation right", " lateral flexion right"];

/** The channel of the other side: an arm's by its name, a trunk's the same. */
const otherSide = (channel: string): string =>
  channel.replace(/\.(right|left) /, (_, side: string) => `.${side === "right" ? "left" : "right"} `);

/**
 * **A strike thrown with the other hand**: each arm's freedom is its twin's on the other side (an
 * arm's freedoms are anatomical, so its twin's positive way is the mirror of its own,
 * `src/core/human/joints.ts`), and the trunk's rotation and lateral flexion, whose positive way is
 * to the right, are turned over. The body is taken as its own mirror; how the left's strike reads
 * is measured, not assumed (the plan's step 3).
 */
export function mirrored(strike: Strike): Strike {
  const sided = (channel: string): boolean => SIDED.some((s) => channel.endsWith(s));
  const hand: Hand = strike.hand === "right" ? "left" : "right";
  return {
    name: strike.name.replace(strike.hand, hand),
    hand,
    ...(strike.chamber ? {
      chamber: {
        seconds: strike.chamber.seconds,
        pose: Object.fromEntries(Object.entries(strike.chamber.pose).map(([c, v]) => [otherSide(c), sided(c) ? -v : v])),
      },
    } : {}),
    pushes: strike.pushes.map((p) => ({ ...p, channel: otherSide(p.channel), sense: sided(p.channel) ? -p.sense as 1 | -1 : p.sense })),
  };
}
