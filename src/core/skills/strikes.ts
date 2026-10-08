import measured from "../../../assets/core/strikes.json" with { type: "json" };
import { effectorAim } from "../control/effectors.ts";
import type { Pose } from "../control/motor.ts";
import type { Side, BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";

/**
 * **The strikes a body knows** (`assets/core/strikes.json`, written by
 * `research/core-strike-repertoire.mjs` from the strike searches): each a recipe found by search
 * for one body, one thing held, one height band and the right hand, thrown from standing in the
 * guard. The strike skill (`strike.ts`) chooses one of its body's by what the hand holds and how
 * high its target is, and throws it. A recipe is its body's and no other's: its pushes are that
 * body's muscles' over that body's lengths, and thrown by another it passes its target
 * (`docs/reference/blows.md#another-bodys-recipe`).
 *
 * A recipe is valid only from the start it was searched from: standing still in the guard `STAND`
 * seconds, with the target at its place from the head (`Recipe.place`). The strike skill brings
 * the body to that start before it throws.
 */

/**
 * **The height bands a recipe is searched in**: what a foe of the striker's own build has at
 * each, and so the part a target body there is the mass and the surface of
 * (`research/core-blow.mjs`), and the part a fighter that aims by what pays attacks
 * (`seekFoe`, `src/core/mind/recipe-tactics.ts`).
 */
export const BANDS = Object.freeze({ high: "head", middle: "upperTrunk" } as const);

export type Band = keyof typeof BANDS;

/** The bands, in the table's order. */
export const BAND_NAMES = Object.freeze(Object.keys(BANDS) as Band[]);

/** A push of a strike: `channel` driven its `sense` way at `level`, from `from` to `to` s after the chamber. */
interface StrikePush {
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
  readonly hand: Side;
  readonly chamber?: { readonly seconds: number; readonly pose: Pose };
  readonly pushes: readonly StrikePush[];
}

/** Where a target stands from a recipe's place (`Recipe.place`), m: `along` the heading, farther ahead, `across` it, to the right, and `up`. */
export interface StandOff {
  readonly along: number;
  readonly across: number;
  readonly up: number;
}

/**
 * **Where a recipe lands**: each way, the stand-offs (m) from its place at which it was measured to
 * land at nearly its full reading (`research/core-strike-window.mjs`, whose rule and harness
 * `assets/core/strikes.json` names). A strike does not land evenly about its place: the Warrior's
 * straight lands to the left of it.
 */
export interface StrikeWindow {
  readonly along: readonly [number, number];
  readonly across: readonly [number, number];
  /** Above the recipe's place, m. */
  readonly up: readonly [number, number];
}

/** A searched strike and where it lands. */
interface Recipe {
  /** The body it was searched on. */
  readonly model: string;
  /** What the hand holds: `FIST`, or the held item's name. */
  readonly held: string;
  /** The height band it was searched in (`BANDS`). */
  readonly band: Band;
  /** The right hand's; the left's is `mirrored`. */
  readonly strike: Strike;
  /** Where its target stood: its centre straight ahead of the striker's head, and above it, m. */
  readonly place: { readonly ahead: number; readonly up: number };
  /** How it was searched. */
  readonly found: string;
  /** Where about its place it lands, the three ways. */
  readonly window: StrikeWindow;
  /** What it read on replay: hit points done less hit points cost, the mean of eight (`research/core-blow.mjs`). */
  readonly net: number;
}

export type Repertoire = readonly Recipe[];

/** An empty hand. */
export const FIST = "fist";

/** The searched repertoire, frozen deep: a table nothing writes. */
export const REPERTOIRE: Repertoire = deepFreeze(measured.recipes as unknown as Repertoire);

/** What `hand` of `spec` holds: the item's name, or `FIST`. */
export function heldIn(spec: BodySpec, hand: Side): string {
  return spec.held?.find((h) => h.segment === `hand.${hand}`)?.item.name ?? FIST;
}

/** A strike chosen for a hand: the recipe, and the strike and its window for that hand. */
export interface Chosen {
  readonly recipe: Recipe;
  readonly strike: Strike;
  readonly window: StrikeWindow;
}

/**
 * Every recipe `spec`'s `hand` may throw with what it holds, as that hand throws it: those
 * searched on its body with that held, in the repertoire's order.
 */
export function recipesFor(repertoire: Repertoire, spec: BodySpec, hand: Side): Chosen[] {
  const held = heldIn(spec, hand);
  return repertoire.filter((r) => r.held === held && r.model === spec.model).map((recipe) => {
    const own = hand === recipe.strike.hand;
    return { recipe, strike: own ? recipe.strike : mirrored(recipe.strike), window: own ? recipe.window : mirroredWindow(recipe.window) };
  });
}

/** Whether `chosen`'s window holds a target `up` m above the head. */
export function holdsAt(chosen: Chosen, up: number): boolean {
  const off = up - chosen.recipe.place.up;
  return chosen.recipe.window.up[0] <= off && off <= chosen.recipe.window.up[1];
}

/**
 * Of `known` (`recipesFor`), the one thrown at a target `up` m above the head: the one whose
 * window holds that height (`holdsAt`), and of several that do, the one whose place is nearest it
 * in height, the first of equals. Its place among `known`; -1 if none holds it.
 */
export function recipeAt(known: readonly Chosen[], up: number): number {
  let best = -1;
  for (let k = 0; k < known.length; k++) {
    const off = up - known[k]!.recipe.place.up;
    if (!holdsAt(known[k]!, up)) continue;
    if (best < 0 || Math.abs(off) < Math.abs(up - known[best]!.recipe.place.up)) best = k;
  }
  return best;
}

/**
 * The recipe `spec`'s `hand` throws, with what it holds, at a target `up` m above its head
 * (`recipesFor`, `recipeAt`). Null if no recipe's window holds that height.
 */
export function recipeFor(repertoire: Repertoire, spec: BodySpec, hand: Side, up: number): Chosen | null {
  const known = recipesFor(repertoire, spec, hand), at = recipeAt(known, up);
  return at < 0 ? null : known[at]!;
}

/**
 * What `known` (`recipesFor`) nets in each band (`Recipe.net`); null for a band with none.
 */
export function netsOf(known: readonly Chosen[]): Readonly<Record<Band, number | null>> {
  const net = (band: Band): number | null => known.find((chosen) => chosen.recipe.band === band)?.recipe.net ?? null;
  return Object.freeze(Object.fromEntries(BAND_NAMES.map((band) => [band, net(band)])) as Record<Band, number | null>);
}

/** A recipe's window for the other hand: the same along the heading and up, turned over across it. */
export const mirroredWindow = (window: StrikeWindow): StrikeWindow =>
  ({ along: window.along, across: [-window.across[1], -window.across[0]], up: window.up });

/**
 * Whether `hand` of `spec` closes into its fist to strike: it has a fist pose and a point on it to
 * strike with (`strike`), and holds nothing. Every skill set closes such a hand for its blow
 * (`recipeSkills`, `combatSkills`).
 */
export function closesToStrike(spec: BodySpec, hand: Side): boolean {
  const segment = spec.segments.find((s) => s.name === `hand.${hand}`);
  return !!segment?.handPoses && !!segment.points?.strike && !spec.held?.some((h) => h.segment === segment.name);
}

/** The point `hand` of `spec` strikes with: a hand that closes to strike, its fist's `strike`; else its effector's (`effectorAim`). */
export function aimOf(spec: BodySpec, hand: Side): string {
  return closesToStrike(spec, hand) ? "strike" : effectorAim(spec, `hand.${hand}`);
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
 * is measured, not assumed (`tests/lab-routine.test.mjs`).
 */
export function mirrored(strike: Strike): Strike {
  const sided = (channel: string): boolean => SIDED.some((s) => channel.endsWith(s));
  const hand: Side = strike.hand === "right" ? "left" : "right";
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
