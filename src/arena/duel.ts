import { createBody, SERVO_SECONDS, type Body } from "../core/body.ts";
import { buildBody } from "../core/build/build-body.ts";
import { armed } from "../core/human/grip.ts";
import { modelSpec, type BodyModel } from "../core/human/spec.ts";
import { woodenClub } from "../core/items/club.ts";
import { fighterTactics, seekFoe } from "../core/mind/fighter.ts";
import { sameOrders, type Orders } from "../core/mind/orders.ts";
import { createSenses, type SensesHub } from "../core/mind/senses.ts";
import { driveBy } from "../core/mind/tactics.ts";
import { watchBlows, type BlowWatch, type Fighter, type LandedBlow } from "../core/rules/blows.ts";
import { createPool, type Ending } from "../core/rules/pool.ts";
import { rulebook, type Rulebook } from "../core/rules/rulebook.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import type { Skills } from "../core/skills/skills.ts";
import type { Hook, World } from "../core/world.ts";

/**
 * **A bout in the arena**: two bodies, each with the wooden club in its right hand, each driven
 * by a fighter's tactics (`fighterTactics`), wounded by the core's blows under the arena's rulebook, and
 * judged.
 *
 * - **They stand** the recipe's gap apart (`GAP_METRES` unless it says) across the arena's
 *   centre, both facing +z as every body is built; each turns a quarter to the other, so neither
 *   starts ahead.
 * - **Each side's tactics** (`seekFoe`) walk at the body they see of the other side until within
 *   `ATTACK_METRES` of it, then attack its head. What each sees of the other is the bout's senses'
 *   (`createSenses`): both see the same step, `DuelRecipe.senseDelay` steps old.
 * - **A side given orders** (`Duel.order`) does what it is ordered and nothing else, until it is
 *   handed back to itself or is out of the fight. Every order is kept with the step it was given
 *   before (`Duel.tape`), so the recipe and the tape are the whole of what made a bout, and
 *   `Duel.play` gives a tape again as the bout steps.
 * - **A side is out** once its pool has ended, or once its body has fallen (`SkillReport.fallen`): the
 *   core has no rising, so a body down stays down. The other side wins; both out on one step is a
 *   draw.
 * - **At the cap** (`CAP_SECONDS`) the fuller bar wins, and equal bars draw.
 *
 * The world is the caller's, with the arena's solids already in it (`addArenaSolids`); the bout adds
 * its bodies and hooks, and takes them away again on `dispose`, so a replay is a new bout in the same world.
 */

/** Where the two stand, m apart across the centre, along x. */
const GAP_METRES = 4;
/** How long a bout runs before the bars decide it, s. */
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
  readonly body: Body;
  readonly skills: Skills;
  /** Its pool not ended and its body not fallen. */
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
}

/** An order given: before which of the bout's steps, to which side, and what. Null hands the side back to itself. */
interface OrdersEntry {
  readonly step: number;
  readonly side: Side;
  readonly orders: Orders | null;
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
  readonly blows: LandedBlow[] = [];
  /** Null while the bout is on. */
  verdict: Verdict | null = null;
  /** Every order given, in the order given: with the recipe, the whole of what made this bout. */
  readonly tape: OrdersEntry[] = [];
  /** What each side is ordered; null leaves it to its own tactics (`seekFoe`). */
  private readonly given: Record<Side, Orders | null> = { left: null, right: null };
  /** Orders still to give (`play`), in the order of their steps. */
  private readonly queued: OrdersEntry[] = [];
  private readonly start: number;
  private readonly startStep: number;
  private readonly cap: number;
  private readonly senses: SensesHub;
  private readonly feeding: Hook;
  private readonly watch: BlowWatch;
  private readonly judging: Hook;

  constructor(world: World, recipe: DuelRecipe, hooks: DuelHooks = {}) {
    this.world = world;
    this.recipe = Object.freeze({ ...recipe });
    this.rules = rulebook("arena");
    this.start = world.time;
    this.startStep = world.steps;
    this.cap = recipe.capSeconds ?? CAP_SECONDS;
    const gap = recipe.gap ?? GAP_METRES;
    this.senses = createSenses(world, recipe.senseDelay ?? 0);
    // In the step's sensing phase, after the senses and before every mind: a taped order is given
    // before the step it names.
    this.feeding = world.sense(() => {
      while (this.queued.length > 0 && this.queued[0]!.step <= this.steps) {
        const { side, orders } = this.queued.shift()!;
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
      // Out to the other side once the bout is decided, its pool has ended or it has fallen.
      const senses = this.senses.add({ id: side, side, built, out: () => this.verdict !== null || !duelists[side].standing });
      const body = createBody(built, world, { servoSeconds: SERVO_SECONDS, senses });
      const skills = driveBy(body, fighterTactics(`arena ${side}`, (sight) => {
        const orders = this.given[side];
        // Out of the fight it stands, as a side nobody orders does.
        return orders && !sight.view.senses.out ? orders : seekFoe(sight);
      }));
      duelists[side] = {
        id: side, side, model, built, pool, body, skills,
        get standing() { return pool.ending() === null && !skills.report.fallen; },
      };
    }
    this.duelists = duelists;
    this.watch = watchBlows(world, SIDES.map((side) => duelists[side]), this.rules, (blow) => {
      this.blows.push(blow);
      hooks.onBlow?.(blow);
    });
    this.judging = world.afterStep(() => this.judge());
    for (const side of SIDES) hooks.onBuilt?.(duelists[side], duelists[side].built);
  }

  /** Seconds since the bout began. */
  get clock(): number { return this.world.time - this.start; }

  /** Steps the bout has taken. */
  get steps(): number { return this.world.steps - this.startStep; }

  /** Order `side` from its next step on, or with null hand it back to itself. An order that repeats the last is not recorded. */
  order(side: Side, orders: Orders | null): void {
    if (sameOrders(this.given[side], orders)) return;
    this.given[side] = orders;
    this.tape.push({ step: this.steps, side, orders });
  }

  /**
   * Give `tape`'s orders as the bout steps, each before the step it was given before, in place
   * of any tape still queued: with the bout's recipe, the same bout again, whoever steps the world.
   */
  play(tape: readonly OrdersEntry[]): void { this.queued.splice(0, this.queued.length, ...tape); }

  /** Step the world until the verdict, or `seconds` more; returns the verdict, if there is one. */
  run(seconds = Infinity): Verdict | null {
    const until = this.clock + seconds;
    while (!this.verdict && this.clock < until) this.world.step();
    return this.verdict;
  }

  private judge(): void {
    if (this.verdict) return;
    const out = SIDES.filter((side) => !this.duelists[side].standing);
    if (out.length === 2) {
      this.verdict = { winner: null, ending: this.ending("left"), time: this.clock };
    } else if (out.length === 1) {
      const loser = out[0];
      this.verdict = { winner: loser === "left" ? "right" : "left", ending: this.ending(loser), time: this.clock };
    } else if (this.clock >= this.cap) {
      const left = this.duelists.left.pool.bar(), right = this.duelists.right.pool.bar();
      this.verdict = { winner: left > right ? "left" : right > left ? "right" : null, ending: "time", time: this.clock };
    }
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
