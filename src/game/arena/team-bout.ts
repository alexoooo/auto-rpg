import type { Hook } from "../../core/bodies/step-host.ts";
import { constructionScope } from "../../core/construction.ts";
import { solidSenses, type SolidSense } from "../../core/bodies/object-senses.ts";
import type { ContactTarget } from "../../core/bodies/contact-identity.ts";
import { modelHolding, resolveCharacter, type BodyModel } from "../../core/bodies/models.ts";
import { FIGHT_ENTRY } from "../../minds/catalog/catalog.ts";
import type { GameContext } from "./context.ts";
import { withLoadout, type Loadout } from "../../core/bodies/items/held.ts";
import { enlist, type Combatant } from "../combatant.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import { createSenses, type SensesHub } from "../../core/world/senses.ts";
import { watchBlows, type BlowWatch, type LandedBlow } from "../../combat/blows.ts";
import type { Pool } from "../../combat/pool.ts";
import { seedOf } from "../../core/math/random.ts";
import { phaseOf } from "../../minds/seat/host.ts";
import { reactionSteps, rulebook, type Rulebook } from "../../combat/rulebook.ts";
import { type BodySpec } from "../../core/bodies/spec/body.ts";
import type { Vec3 } from "../../core/quantity.ts";
import type { BuiltBody } from "../../core/bodies/build/build-body.ts";
import type { World } from "../../core/world/world.ts";
import { sensedBounds } from "../../skills/locomotion/navigation/sensed-bounds.ts";
import { arenaSolids } from "./solids.ts";
import { levelDefinition, levelSpawn, spawnClearanceFaults, type ArenaLevel } from "./levels.ts";
import { endRuleOf, GAME_ENDS, type EndRule, type EndRuleConfig } from "./end-rule.ts";
import { CAP_SECONDS, SIDES, senseDelayOf, type Verdict } from "./duel.ts";
import { otherSeat as otherSide, type ArenaSeat as Side } from "./seat.ts";

/**
 * **A team bout in the arena**: a team a side, each body under the mind its side names (its
 * model's unless the recipe names another), wounded by the core's blows under the arena's
 * rulebook, and judged as a duel judges, a side at a time.
 *
 * - **They stand** in two lines the recipe's gap apart across the arena's centre, each line
 *   `TEAM_SPACING` between bodies, all facing +z as every body is built.
 * - **Each body** is left to its mind: no Commander and no orders. A mind picks its foe among the
 *   bodies it senses on the other side (`Senses.side`).
 * - **A body is out** by the recipe's end rules, the game's unless it names its own (`GAME_ENDS`),
 *   as a duel's side is; **a side is beaten** when every body of it is out, and the other side
 *   wins; both beaten on one step is a draw.
 * - **At the cap** (`CAP_SECONDS`) the side with more life summed over its bodies wins, and equal
 *   sums draw.
 * - **Each body's assist** has the ceiling its character's balance is, withdrawn at the verdict.
 *
 * The world is the caller's, with the arena's solids already in it; the bout adds its bodies and
 * hooks and takes them away on `dispose`. Everything of it a step changes is the physics' and one
 * state (`TeamBout.state`).
 */

/** How far apart a line's neighbours stand, m: a body's breadth with room for both arms. */
export const TEAM_SPACING = 1.5;

/** The most bodies a side fields: the lines stay inside the open stage's walls. */
export const TEAM_MOST = 8;

/** One side of a team bout: how many bodies, their model, what each carries and the mind each plays. */
export interface TeamSide {
  readonly model: BodyModel;
  readonly count: number;
  readonly loadout: Loadout;
  /** Each body's mind, in place of its model's (`defaultMind`). */
  readonly mind?: MindConfig;
}

/** **What a team bout is, as plain data**: enough to build the same bout again in another world. */
export interface TeamRecipe {
  readonly left: TeamSide;
  readonly right: TeamSide;
  /** The open stage unless given. */
  readonly level?: ArenaLevel;
  /** How far apart the two lines stand, m; the level's default unless given. */
  readonly gap?: number;
  /** `CAP_SECONDS` unless given. */
  readonly capSeconds?: number;
  /** The bout's seed, a 32-bit word, each body's mind drawing from its own (`seedOf` with its id); 0 unless given. */
  readonly seed?: number;
  /** How old what each body sees is, s, in place of the rulebook's reaction time. */
  readonly senseDelay?: number;
  /** What puts a body out, in order: the game's (`GAME_ENDS`) unless given. */
  readonly ends?: readonly EndRuleConfig[];
}

/** A body of a team bout: its combatant, its side and its place in its line. */
export interface Member extends Combatant {
  readonly side: Side;
  readonly model: BodyModel;
}

/** What a page hears of a team bout. */
interface TeamHooks {
  readonly solids?: readonly SolidSense[];
  readonly onBlow?: (blow: LandedBlow) => void;
  /** Called with each body as it is built, before it first steps: the page dresses it. */
  readonly onBuilt?: (member: Member, built: BuiltBody) => void;
}

/** The id of `side`'s body at `index` in its line. */
export const memberId = (side: Side, index: number): string => `${side}-${index}`;

/** The body each of `side`'s members is: its model's, with no attributes of its own, carrying the side's loadout. */
export function teamSpec({ model, loadout }: TeamSide): BodySpec {
  const character = resolveCharacter({ model, attributes: {} });
  modelHolding(model, loadout, character.config.attributes);
  return withLoadout(character.spec, loadout);
}

/** Why `recipe` cannot be played, each a sentence; none where it can. */
export function teamFaults(context: GameContext, recipe: TeamRecipe): readonly string[] {
  const { defaultMind, modelRefusal } = context;
  return SIDES.flatMap((side) => {
    const { count, model, loadout, mind } = recipe[side];
    if (!Number.isInteger(count) || count < 1 || count > TEAM_MOST) return [`the ${side} side fields 1 to ${TEAM_MOST} bodies, not ${count}`];
    const refused = modelRefusal(model, mind ?? defaultMind(model), loadout, FIGHT_ENTRY);
    return refused === null ? [] : [`the ${side} mind cannot play ${model} carrying ${loadout.left},${loadout.right}: ${refused}`];
  });
}

export class TeamBout {
  readonly world: World;
  readonly recipe: TeamRecipe;
  readonly rules: Rulebook;
  /** Every body, the left line's then the right's, each in its line's order. */
  readonly members: readonly Member[];
  readonly state: {
    readonly start: number;
    readonly startStep: number;
    verdict: Verdict | null;
    readonly world: object;
    readonly senses: object;
    readonly watch: object;
    readonly bodies: Readonly<Record<string, { readonly body: object; readonly mind: object; readonly pool: object }>>;
  };
  private readonly cap: number;
  private readonly ends: readonly (readonly [EndRule, EndRuleConfig])[];
  private readonly senses: SensesHub;
  private readonly watch: BlowWatch;
  private readonly judging: Hook;

  constructor(world: World, recipe: TeamRecipe, context: GameContext, hooks: TeamHooks = {}) {
    const { catalog: GAME, defaultMind } = context;
    const faults = teamFaults(context, recipe);
    if (faults.length) throw new Error(faults.join("; "));
    this.world = world;
    this.recipe = recipe;
    const level = recipe.level ?? "open", gap = recipe.gap ?? levelDefinition(level).gap.default;
    this.rules = rulebook("arena");
    this.ends = (recipe.ends ?? GAME_ENDS).map((config) => { const rule = endRuleOf(config); return [rule, { ...rule.defaults, ...config }] as const; });
    this.cap = recipe.capSeconds ?? CAP_SECONDS;
    const solids = solidSenses(hooks.solids ?? arenaSolids(level));
    const start = world.time, startStep = world.steps;
    let ends = this.cap;
    for (const [rule, config] of this.ends) ends = Math.min(ends, rule.drainedBy?.(config) ?? Infinity);
    const lifetime = constructionScope();
    try {
    this.senses = lifetime.own(createSenses(world, reactionSteps(senseDelayOf(recipe), world.hz), { begins: start, ends: start + ends }));
    const contactLabels = new Map<number, ContactTarget>();
    const members: Member[] = [];
    let order = 0;
    for (const side of SIDES) {
      const { model, count, mind } = recipe[side], config = mind ?? defaultMind(model);
      const spec = teamSpec(recipe[side]), spawn = levelSpawn(level, side, gap);
      for (let index = 0; index < count; index++) {
        const id = memberId(side, index), across = (index - (count - 1) / 2) * TEAM_SPACING;
        const at: Vec3 = [spawn.position[0], spawn.position[1], spawn.position[2] + across];
        const combatant = enlist(world, {
          id, side, spec, at, heading: spawn.heading, rules: this.rules, seed: seedOf(recipe.seed ?? 0, id), phase: phaseOf(order++),
          life: (pool: Pool) => this.lifeOf(pool), senses: this.senses, solids,
          out: () => this.verdict !== null || this.eliminated(id),
          mind: config, catalog: GAME, name: `team ${id}`,
          contactIdentity: (other) => other ? contactLabels.get(other.id) ?? null : { kind: "world" },
          orders: () => null,
        });
        lifetime.own(combatant.built); lifetime.own(combatant.body);
        for (const [segment, part] of combatant.built.segments) contactLabels.set(part.body.id, Object.freeze({ kind: "body", body: id, segment, guard: spec.marks.guards.includes(segment) }));
        members.push({ ...combatant, side, model });
      }
    }
    this.members = members;
    const spawnFaults = members.flatMap((member) => {
      const observer = members.find((other) => other !== member)!;
      return spawnClearanceFaults(sensedBounds(observer.senses().others.find((other) => other.id === member.id)!), arenaSolids(level));
    });
    if (spawnFaults.length) {
      throw new Error(`invalid ${level} spawn:\n${spawnFaults.join("\n")}`);
    }
    this.watch = lifetime.own(watchBlows(world, members, this.rules, hooks.onBlow));
    this.state = {
      start, startStep, verdict: null, world: world.state, senses: this.senses.state, watch: this.watch.state,
      bodies: Object.fromEntries(members.map(({ id, body, minded, pool }) => [id, { body: body.state, mind: minded.state, pool: pool.state }])),
    };
    this.judging = lifetime.own(world.afterStep(() => this.judge()));
    for (const member of members) hooks.onBuilt?.(member, member.built);
    } catch (error) { lifetime.dispose(); throw error; }
  }

  /** Null while the bout is on. */
  get verdict(): Verdict | null { return this.state.verdict; }

  /** Every blow and clash so far, in the order they landed. */
  get blows(): readonly LandedBlow[] { return this.watch.blows; }

  /** Seconds since the bout began. */
  get clock(): number { return this.world.time - this.state.start; }

  /** The body `id`'s life, a fraction of its full life, less what the end rules have drained. */
  life(id: string): number { return this.lifeOf(this.member(id).pool); }

  /** `side`'s life summed over its bodies. */
  sideLife(side: Side): number {
    let sum = 0;
    for (const member of this.members) if (member.side === side) sum += this.lifeOf(member.pool);
    return sum;
  }

  /** Whether the body `id` is out under the bout's end rules. */
  eliminated(id: string): boolean { return this.outBy(this.member(id)) !== null; }

  private member(id: string): Member {
    const found = this.members.find((member) => member.id === id);
    if (!found) throw new Error(`no body ${id} in this bout`);
    return found;
  }

  private lifeOf(pool: Pool): number {
    // The state is made after the bodies, whose senses read their life as they are carried: then nothing is drained.
    const seconds = this.state ? this.clock : 0;
    let drained = 0;
    for (const [rule, config] of this.ends) drained += rule.drained?.(seconds, config) ?? 0;
    return Math.max(0, pool.bar() - drained);
  }

  private outBy(member: Member): string | null {
    const { pool, body, built } = member, one = { pool, life: this.lifeOf(pool), body, built, downFor: 0 };
    for (const [rule, config] of this.ends) {
      const ending = rule.out(one, config, {});
      if (ending !== null) return ending;
    }
    return null;
  }

  /** How `side` is beaten: the ending of its first body, once every body of it is out; null while one is in. */
  private beaten(side: Side): string | null {
    let first: string | null = null;
    for (const member of this.members) if (member.side === side) {
      const ending = this.outBy(member);
      if (ending === null) return null;
      first ??= ending;
    }
    return first;
  }

  private judge(): void {
    if (this.verdict) return;
    this.state.verdict = this.decide();
    if (this.verdict) for (const member of this.members) member.body.assist.withdraw();
  }

  private decide(): Verdict | null {
    const left = this.beaten("left"), right = this.beaten("right");
    if (left !== null && right !== null) return Object.freeze({ winner: null, ending: left, time: this.clock });
    if (left !== null || right !== null) {
      const loser: Side = left !== null ? "left" : "right";
      return Object.freeze({ winner: otherSide(loser), ending: (left ?? right)!, time: this.clock });
    }
    if (this.clock < this.cap) return null;
    const l = this.sideLife("left"), r = this.sideLife("right");
    return Object.freeze({ winner: l > r ? "left" : r > l ? "right" : null, ending: "time", time: this.clock });
  }

  dispose(): void {
    this.judging.dispose();
    this.watch.dispose();
    this.senses.dispose();
    for (const member of this.members) { member.body.dispose(); member.built.dispose(); }
  }
}

/**
 * **The crowd fight**: five Option Mind Warriors a side, swords against clubs: what a step with ten
 * bodies is read on (`research/step-time.mjs --crowd`).
 */
export function crowdFight(context: GameContext, seed = 0): TeamRecipe {
  const mind = context.catalog.minds["option"]!.config;
  return {
    left: { model: "man", count: 5, loadout: { left: "empty", right: "sword" }, mind },
    right: { model: "man", count: 5, loadout: { left: "empty", right: "club" }, mind },
    seed,
  };
}
