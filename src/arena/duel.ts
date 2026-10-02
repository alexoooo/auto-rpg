import type { Body } from "../core/body.ts";
import { buildBody } from "../core/build/build-body.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import { armed } from "../core/human/grip.ts";
import { modelSpec, type BodyModel } from "../core/human/spec.ts";
import { woodenClub } from "../core/items/club.ts";
import { FIGHTER, type MindConfig } from "../core/mind/config.ts";
import { createMind, type Minded } from "../core/mind/minds.ts";
import { sameOrders, type Orders } from "../core/mind/orders.ts";
import { createSenses, type SensesHub } from "../core/mind/senses.ts";
import { watchBlows, type BlowWatch, type Fighter, type LandedBlow } from "../core/rules/blows.ts";
import { createPool, type Ending } from "../core/rules/pool.ts";
import { balanceCeiling, balancePercent, rulebook, type Rulebook } from "../core/rules/rulebook.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import { loadState, saveState, type Saved } from "../core/state.ts";
import type { Hook, World } from "../core/world.ts";

/**
 * **A bout in the arena**: two bodies, each with the wooden club in its right hand, each under a
 * mind made from its config (`createMind`; the fighter, `FIGHTER`, unless the recipe names
 * another), wounded by the core's blows under the arena's rulebook, and judged.
 *
 * - **They stand** the recipe's gap apart (`GAP_METRES` unless it says) across the arena's
 *   centre, both facing +z as every body is built; each turns a quarter to the other, so neither
 *   starts ahead.
 * - **Each side, left to itself** (a fighter's `seekFoe`), walks at the body it sees of the other
 *   side until within `ATTACK_METRES` of it, then attacks its head. What each sees of the other is the bout's senses'
 *   (`createSenses`): both see the same step, `DuelRecipe.senseDelay` steps old.
 * - **A side given orders** (`Duel.order`) does what it is ordered and nothing else, until it is
 *   handed back to itself or is out of the fight. Every order is kept with the step it was given
 *   before (`Duel.tape`), so the recipe and the tape are the whole of what made a bout, and
 *   `Duel.play` gives a tape again as the bout steps.
 * - **A side is out** once its pool has ended, or while its body is down (`BodyView.down`): a
 *   body down lies where it fell. The other side wins; both out on one step is a
 *   draw.
 * - **At the cap** (`CAP_SECONDS`) the fuller bar wins, and equal bars draw.
 * - **Each side's assist** (`Assist`) has the ceiling its balance is: its character's per cent of
 *   its weight (`AttributeSpec.balance`), or the recipe's, at what the rulebook's per cent is, or the recipe's.
 *   It is withdrawn at the verdict.
 *
 * The world is the caller's, with the arena's solids already in it (`addArenaSolids`); the bout adds
 * its bodies and hooks, and takes them away again on `dispose`, so a replay is a new bout in the same world.
 *
 * Everything of a bout that a step changes is the physics' and one state (`Duel.state`,
 * `src/core/state.ts`): `Duel.save` gives both, and `Duel.load` puts a bout of the same recipe
 * there, in this world or another, to go on as the saved bout went on.
 */

/** Where the two stand, m apart across the centre, along x (`docs/reference/play.md#the-bout`). */
const GAP_METRES = 4;
/** How long a bout runs before the bars decide it, s (`docs/reference/play.md#the-bout`). */
export const CAP_SECONDS = 120;

export type Side = "left" | "right";
export const SIDES: readonly Side[] = Object.freeze(["left", "right"]);

/** How a bout ended: the loser's pool's ending, its fall, or the clock. */
export type DuelEnding = Exclude<Ending, "time"> | "fallen" | "time";

export interface Verdict {
  /** Null is a draw. */
  readonly winner: Side | null;
  readonly ending: DuelEnding;
  /** The world's clock when it was decided, s. */
  readonly time: number;
}

interface Duelist extends Fighter {
  readonly side: Side;
  readonly model: BodyModel;
  /** Its body under its mind, whatever kind the mind is; a reader of a kind's own narrows on `minded.kind`. */
  readonly minded: Minded;
  readonly body: Body;
  /** Its pool not ended and its body not down. */
  readonly standing: boolean;
}

/**
 * **What a bout is, as plain data**: enough to build the same bout again in another world, on
 * another thread. Nothing here is a function or a live object.
 */
interface DuelRecipe {
  readonly left: BodyModel;
  readonly right: BodyModel;
  /** How far apart the two stand, m; `GAP_METRES` unless given. */
  readonly gap?: number;
  /** `CAP_SECONDS` unless given. */
  readonly capSeconds?: number;
  /** How many steps old what each side sees of the other is; none unless given (`createSenses`). */
  readonly senseDelay?: number;
  /** Each side's balance, per cent of its weight, in place of its character's (`AttributeSpec.balance`): an experiment's, or a link's. */
  readonly balance?: { readonly left: number; readonly right: number };
  /** What a per cent of balance is, in place of the rulebook's (`Rulebook.balance`): a sweep's. */
  readonly balancePercent?: AssistCeiling;
  /** Each side's mind, in place of the fighter every body has (`FIGHTER`): an experiment's, or a table's row. */
  readonly minds?: Readonly<Record<Side, MindConfig>>;
}

/** A recipe as JSON with every object's keys in order: two recipes that say the same in it are one bout's, however each was written. */
const recipeKey = (recipe: DuelRecipe): string => JSON.stringify(recipe, (_, value: unknown) =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);

/** An order given: before which of the bout's steps, to which side, and what. Null hands the side back to itself. */
export interface OrdersEntry {
  readonly step: number;
  readonly side: Side;
  readonly orders: Orders | null;
}

/** A bout at a step, whole: whose bout it is, the physics' bytes and every module's memory. Plain data. */
interface DuelSave {
  readonly recipe: DuelRecipe;
  readonly physics: Uint8Array;
  readonly state: Saved;
}

/**
 * **What a bout remembers**, and the root every module's memory hangs on: the world's, the senses',
 * the blow watch's, and each side's body's, mind's and pool's.
 */
interface DuelState {
  /** The world's clock and step when the bout began. */
  readonly start: number;
  readonly startStep: number;
  verdict: Verdict | null;
  /** What each side is ordered; null leaves it to itself. */
  readonly given: Record<Side, Orders | null>;
  readonly tape: OrdersEntry[];
  /** Orders still to give (`play`), in the order of their steps. */
  readonly queued: OrdersEntry[];
  readonly world: object;
  readonly senses: object;
  readonly watch: object;
  readonly left: SideState;
  readonly right: SideState;
}

interface SideState {
  readonly body: object;
  /** Its mind's memory above its body's (`Minded.state`). */
  readonly mind: object;
  readonly pool: object;
}

/** What a page hears of a bout. */
interface DuelHooks {
  /** Hears each blow as it lands. */
  readonly onBlow?: (blow: LandedBlow) => void;
  /** Called with each side as its body is built, before it first steps: the page dresses it. */
  readonly onBuilt?: (duelist: Duelist, built: BuiltBody) => void;
}

export class Duel {
  readonly world: World;
  /** The bout's recipe, as it was given. */
  readonly recipe: DuelRecipe;
  readonly rules: Rulebook;
  readonly duelists: Readonly<Record<Side, Duelist>>;
  /** Its memory, and every module's under it: what `save` copies and `load` fills. */
  readonly state: DuelState;
  private readonly cap: number;
  private readonly senses: SensesHub;
  private readonly feeding: Hook;
  private readonly watch: BlowWatch;
  private readonly judging: Hook;

  constructor(world: World, recipe: DuelRecipe, hooks: DuelHooks = {}) {
    this.world = world;
    this.recipe = Object.freeze({ ...recipe });
    this.rules = rulebook("arena");
    const start = world.time, startStep = world.steps;
    const given: Record<Side, Orders | null> = { left: null, right: null };
    this.cap = recipe.capSeconds ?? CAP_SECONDS;
    const gap = recipe.gap ?? GAP_METRES;
    this.senses = createSenses(world, recipe.senseDelay ?? 0);
    // In the step's sensing phase, after the senses and before every mind: a taped order is given
    // before the step it names.
    this.feeding = world.sense(() => {
      const { queued } = this.state;
      while (queued.length > 0 && queued[0]!.step <= this.steps) {
        const { side, orders } = queued.shift()!;
        this.order(side, orders);
      }
    });
    const duelists = {} as Record<Side, Duelist>;
    for (const side of SIDES) {
      const model = recipe[side];
      const spec = armed(modelSpec(model), "right", woodenClub());
      const x = (side === "left" ? -1 : 1) * gap / 2;
      const built = buildBody(spec, world, { position: [x, 0, 0] });
      const pool = createPool(spec, this.rules);
      // Out to the other side once the bout is decided, its pool has ended or it is down.
      const senses = this.senses.add({ id: side, side, built, out: () => this.verdict !== null || !duelists[side].standing });
      const assist = balanceCeiling(recipe.balance?.[side] ?? spec.attributes.balance.value, recipe.balancePercent ?? balancePercent(this.rules));
      const minded = createMind(built, world, recipe.minds?.[side] ?? FIGHTER, {
        name: `arena ${side}`, senses, assist,
        // Out of the fight it is left to itself, as a side nobody orders is.
        orders: (sensed) => sensed.out ? null : given[side],
      });
      const { body } = minded;
      duelists[side] = {
        id: side, side, model, built, pool, minded, body,
        get standing() { return pool.ending() === null && !body.view.down; },
      };
    }
    this.duelists = duelists;
    this.watch = watchBlows(world, SIDES.map((side) => duelists[side]), this.rules, hooks.onBlow);
    const sideState = ({ body, minded, pool }: Duelist): SideState => ({ body: body.state, mind: minded.state, pool: pool.state });
    this.state = {
      start, startStep, verdict: null, given, tape: [], queued: [],
      world: world.state, senses: this.senses.state, watch: this.watch.state,
      left: sideState(duelists.left), right: sideState(duelists.right),
    };
    this.judging = world.afterStep(() => this.judge());
    for (const side of SIDES) hooks.onBuilt?.(duelists[side], duelists[side].built);
  }

  /** Null while the bout is on. */
  get verdict(): Verdict | null { return this.state.verdict; }

  /** Every blow and clash so far, in the order they landed. */
  get blows(): readonly LandedBlow[] { return this.watch.blows; }

  /** Every order given, in the order given: with the recipe, the whole of what made this bout. */
  get tape(): readonly OrdersEntry[] { return this.state.tape; }

  /** Seconds since the bout began. */
  get clock(): number { return this.world.time - this.state.start; }

  /** Steps the bout has taken. */
  get steps(): number { return this.world.steps - this.state.startStep; }

  /** Order `side` from its next step on, or with null hand it back to itself. An order that repeats the last is not recorded. */
  order(side: Side, orders: Orders | null): void {
    if (sameOrders(this.state.given[side], orders)) return;
    // The side is given its orders as JSON carries them (a negative zero is zero there), so a tape
    // that has been through a file or a link gives the orders this bout gave.
    const given = JSON.parse(JSON.stringify(orders)) as Orders | null;
    this.state.given[side] = given;
    this.state.tape.push({ step: this.steps, side, orders: given });
  }

  /**
   * Give `tape`'s orders as the bout steps, each before the step it was given before, in place
   * of any tape still queued: with the bout's recipe, the same bout again, whoever steps the world.
   * The bout queues its own copies: a load writes into what is queued, and never into `tape`.
   */
  play(tape: readonly OrdersEntry[]): void {
    const { queued } = this.state;
    queued.splice(0, queued.length, ...tape.map(({ step, side, orders }) => ({ step, side, orders: JSON.parse(JSON.stringify(orders)) as Orders | null })));
  }

  /** The bout as the last step left it: what `load` puts back, here or in any bout of this recipe. */
  save(): DuelSave { return { recipe: this.recipe, physics: this.world.physics.save(), state: saveState(this.state) }; }

  /**
   * Put the bout where `saved` left one of this recipe: the next step is the step that followed
   * the save. The page's hooks hear nothing of it.
   */
  load(saved: DuelSave): void {
    // Two bouts of different bodies can have worlds of the same counts, which the physics would take.
    if (recipeKey(saved.recipe) !== recipeKey(this.recipe)) throw new Error("that save is of another bout's recipe");
    this.world.physics.load(saved.physics);
    loadState(this.state, saved.state);
    this.senses.show();
  }

  /** Step the world until the verdict, or `seconds` more; returns the verdict, if there is one. */
  run(seconds = Infinity): Verdict | null {
    const until = this.clock + seconds;
    while (!this.verdict && this.clock < until) this.world.step();
    return this.verdict;
  }

  private judge(): void {
    if (this.verdict) return;
    this.state.verdict = this.decide();
    // The bout is over: neither body is given anything more.
    if (this.verdict) for (const side of SIDES) this.duelists[side].body.assist.withdraw();
  }

  /** The verdict, if this step decides the bout: frozen, so one a page holds is a record no load writes into. */
  private decide(): Verdict | null {
    const out = SIDES.filter((side) => !this.duelists[side].standing);
    if (out.length === 2) return Object.freeze({ winner: null, ending: this.ending("left"), time: this.clock });
    if (out.length === 1) {
      const loser = out[0];
      return Object.freeze({ winner: loser === "left" ? "right" : "left", ending: this.ending(loser), time: this.clock });
    }
    if (this.clock < this.cap) return null;
    const left = this.duelists.left.pool.bar(), right = this.duelists.right.pool.bar();
    return Object.freeze({ winner: left > right ? "left" : right > left ? "right" : null, ending: "time", time: this.clock });
  }

  private ending(side: Side): DuelEnding {
    const ending = this.duelists[side].pool.ending();
    return ending === null || ending === "time" ? "fallen" : ending;
  }

  dispose(): void {
    this.judging.dispose();
    this.feeding.dispose();
    this.watch.dispose();
    this.senses.dispose();
    for (const side of SIDES) {
      this.duelists[side].body.dispose();
      this.duelists[side].built.dispose();
    }
  }
}
