import type { CommanderConfig } from "../core/command/kind.ts";
import type { MemberReport } from "../core/command/team.ts";
import { teamOfOne, type TeamOfOne } from "./team.ts";
import { solidSenses, type SolidSense } from "../core/mind/object-senses.ts";
import type { ContactTarget } from "../core/control/effector-feedback.ts";
import type { AssistCeiling } from "../core/control/assist.ts";
import { modelHolding, modelLoadout, resolveCharacter, type BodyModel } from "../core/models.ts";
import { FIGHT_ENTRY, type EntryRule, modelRefusal, defaultMind, GAME } from "../entrants/game.ts";
import type { AttributeOverrides } from "../core/character-attributes.ts";
import { EMPTY_LOADOUT, withLoadout, type Loadout } from "../core/items/held.ts";
import { combatantRecordingIdentity, enlist, type Combatant } from "../core/combatant.ts";
import type { SheetLog } from "../core/mind/sheets.ts";
import type { MindConfig } from "../core/mind/config.ts";
import { isOrders, sameOrders, type Orders } from "../core/intent/orders.ts";
import { createSenses, type SensesHub } from "../core/mind/senses.ts";
import { watchBlows, type BlowWatch, type LandedBlow } from "../core/rules/blows.ts";
import type { Pool } from "../core/rules/pool.ts";
import { seedOf } from "../core/math/random.ts";
import { reactionSteps, rulebook, type Rulebook, type RulebookOverride } from "../core/rules/rulebook.ts";
import type { BodySpec, Side } from "../core/spec/body.ts";
import { derive, type Vec3 } from "../core/spec/quantity.ts";
import type { BuiltBody } from "../core/build/build-body.ts";
import { loadState, saveState, type Saved } from "../core/state.ts";
import type { Hook, World } from "../core/world.ts";
import { sensedBounds } from "../core/navigation/sensed-bounds.ts";
import { arenaSolids } from "./room.ts";
import { levelDefinition, levelSpawn, spawnClearanceFaults, type ArenaLevel } from "./levels.ts";
import { endRuleOf, GAME_ENDS, type EndRule, type EndRuleConfig } from "./end-rule.ts";
import { carryOnRail, railFaults, type Rail } from "./rail.ts";
import { BUILD_IDENTITY } from "../build-identity.ts";
import { recordingIdentity, requireRecordingIdentity, type RecordingIdentity } from "../core/recording.ts";
import { otherSide } from "../core/spec/body.ts";

/**
 * **A bout in the arena**: two bodies, each carrying what the recipe names (`DuelRecipe.loadouts`,
 * `loadoutIn`), each under a
 * mind made from its config (`createMind`; its model's, `modelInfo`, unless the recipe names
 * another), wounded by the core's blows under the arena's rulebook, and judged.
 *
 * - **They stand** the recipe's gap apart (the level's default unless it says) across the arena's
 *   centre, both facing +z as every body is built; each turns a quarter to the other, so neither
 *   starts ahead.
 * - **Each side, left to itself**, does as its mind decides: a planner picks its foe from the
 *   bodies it senses (`targets.ts`) and closes on it, strikes or holds off as its parts choose.
 *   What each sees of the other is the bout's senses'
 *   (`createSenses`): both see the same moment, `DuelRecipe.senseDelay` old, the rulebook's
 *   reaction time unless the recipe gives its own.
 * - **A side given orders** (`Duel.order`) does what it is ordered and nothing else, until it is
 *   handed back to itself or is out of the fight. Every order is kept with the step it was given
 *   before (`Duel.tape`), so the recipe and the tape are the whole of what made a bout, and
 *   `Duel.play` gives a tape again as the bout steps.
 * - **A side is out** by the recipe's end rules, the game's unless it names its own (`GAME_ENDS`:
 *   its pool ended, or its life drained, `DRAIN_END`); a side down stays in the fight while its
 *   mind tries to rise. The other side wins; both out on one step is a draw.
 * - **Its life** (`Duel.life`) is its bar less what the end rules have drained: what the page's
 *   bar, the senses and the verdict read.
 * - **At the cap** (`CAP_SECONDS`) the fuller life wins, and equal lives draw; under the game's
 *   rules the drain has ended the bout by then.
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

/** How long a bout runs before the bars decide it, s (`docs/reference/play.md#the-bout`). */
export const CAP_SECONDS = 120;

export const SIDES: readonly Side[] = Object.freeze(["left", "right"]);

/** How a bout ended: as the end rule that put the loser out names it (`EndRule.out`: `fatal`, `fallen`), or `time`, the bars at the cap (`endingText`). */
export type DuelEnding = string;

export interface Verdict {
  /** Null is a draw. */
  readonly winner: Side | null;
  readonly ending: DuelEnding;
  /** The world's clock when it was decided, s. */
  readonly time: number;
}

interface Duelist extends Combatant {
  readonly side: Side;
  readonly model: BodyModel;
  /** Its pool not ended and its body not down. */
  readonly standing: boolean;
}

/**
 * **What a bout is, as plain data**: enough to build the same bout again in another world, on
 * another thread. Nothing here is a function or a live object.
 */
export interface DuelRecipe {
  readonly left: BodyModel;
  readonly right: BodyModel;
  /** Each character's attributes; a stored recipe carries their resolved values. */
  readonly attributes?: Readonly<Record<Side, AttributeOverrides>>;
  /** Physical stage and its spawn policy; the open stage unless given. */
  readonly level?: ArenaLevel;
  /** How far apart the two stand, m; the level's default unless given. */
  readonly gap?: number;
  /** `CAP_SECONDS` unless given. */
  readonly capSeconds?: number;
  /** How old what each side sees of the other is, s, in place of the rulebook's reaction time (`Rulebook.reaction`, `senseDelayOf`). */
  readonly senseDelay?: number;
  /** The bout's seed, a 32-bit word, each side's mind drawing from its own (`seedOf` with the side); 0 unless given (`boutSeedOf`). */
  readonly seed?: number;
  /** Each side's balance, per cent of its weight, in place of its character's (`AttributeSpec.balance`): an experiment's, or a link's. */
  readonly balance?: { readonly left: number; readonly right: number };
  /** Each side's haste, per cent over a person's, in place of its character's (`AttributeSpec.haste`), where its model takes one (`modelHastes`): an experiment's, or a link's. */
  readonly haste?: Readonly<Partial<Record<Side, number>>>;
  /** What a per cent of balance is, in place of the rulebook's (`Rulebook.balance`): a sweep's. */
  readonly balancePercent?: AssistCeiling;
  /** Each side's mind, in place of its model's (`modelInfo`): an experiment's, or a table's row. */
  readonly minds?: Readonly<Record<Side, MindConfig>>;
  /** Seconds continuously down before a fall ends the bout; null continues until injury or the cap. Zero is the reference fall rule. */
  readonly recoverySeconds?: number | null;
  /** What each hand of each fighter holds (`loadoutIn`). */
  readonly loadouts?: Readonly<Record<Side, Loadout>>;
  /** The arena's rules with these in their place (`rulebook`'s override): an experiment's. */
  readonly rules?: RulebookOverride;
  /** For each segment named, what its surface's stiffness is times, on both sides: a sensitivity sweep's. */
  readonly surfaces?: Readonly<Record<string, number>>;
  /** What a mind must do beyond fitting its body to enter (`EntryRule`): a fight's (`FIGHT_ENTRY`) unless given. */
  readonly entry?: readonly EntryRule[];
  /** What puts a side out, in order (`EndRuleConfig`, `END_RULES`): the game's (`GAME_ENDS`: damage, then a fall) unless given. */
  readonly ends?: readonly EndRuleConfig[];
  /** Where a side stands at the start, on the floor (x, z, m), and which way it faces (rad, zero facing +z), in place of its level's spawn (`levelSpawn`): a scenario's arrangement. */
  readonly start?: Readonly<Partial<Record<Side, { readonly at?: readonly [number, number]; readonly heading?: number }>>>;
  /** The Commander that leads a side as a team of one (`teamOfOne`), giving its orders: a drill's. A side named none is left to its mind. */
  readonly commanders?: Readonly<Partial<Record<Side, CommanderConfig>>>;
  /** The rail that carries a side's body as a moving target (`Rail`): a drill's. */
  readonly rail?: Rail;
}

/** How old what each side of a bout of `recipe` sees of the other is, s: the recipe's, or its rules' reaction time. */
export const senseDelayOf = (recipe: Pick<DuelRecipe, "senseDelay" | "rules">): number => recipe.senseDelay ?? rulebook("arena", recipe.rules).reaction.value;

/** The seed of a bout of `recipe`: the recipe's, or 0. */
export const boutSeedOf = (recipe: Pick<DuelRecipe, "seed">): number => recipe.seed ?? 0;

/** What a mind must do to enter a bout of `recipe` (`DuelRecipe.entry`): the recipe's rule, or a fight's; a page with no recipe yet plays a fight. */
export const entryRules = (recipe?: Pick<DuelRecipe, "entry">): readonly EntryRule[] => recipe?.entry ?? FIGHT_ENTRY;

/** `spec` with each segment `factors` names as stiff as its own surface times its factor. */
function stiffened(spec: BodySpec, factors: Readonly<Record<string, number>>): BodySpec {
  for (const name of Object.keys(factors)) if (!spec.segments.some((segment) => segment.name === name)) throw new Error(`${spec.model} has no segment ${name} to stiffen`);
  return {
    ...spec,
    segments: spec.segments.map((segment) => {
      const factor = factors[segment.name];
      if (factor === undefined) return segment;
      const times = derive("1", "the recipe's factor on this surface", [], () => factor);
      return { ...segment, surface: { ...segment.surface, stiffness: derive("N/m", "the surface's stiffness, times the recipe's factor", [segment.surface.stiffness, times], (k, f) => k * f) } };
    }),
  };
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

/** External orders carry a reachable step, one side and the complete public order contract. */
export function isOrdersEntry(entry: unknown): entry is OrdersEntry {
  if (typeof entry !== "object" || entry === null) return false;
  const { step, side, orders } = entry as Record<string, unknown>;
  return Number.isSafeInteger(step) && (step as number) >= 0 && (side === "left" || side === "right") && (orders === null || isOrders(orders));
}

/** The persisted order format, separate from live orders a caller queues with `Duel.play`. */
export const ORDERS_PROTOCOL = "arena-orders/3";

interface OrdersRecording {
  readonly identity: RecordingIdentity;
  readonly tape: readonly OrdersEntry[];
}

/**
 * **What `side` carries in a bout of `recipe`**: the loadout the recipe names; else, where the recipe
 * names no mind for it either, its model's (`modelLoadout`), which its model's mind fights with;
 * else empty hands.
 */
const loadoutIn = (recipe: DuelRecipe, side: Side): Loadout =>
  recipe.loadouts?.[side] ?? (recipe.minds?.[side] ? EMPTY_LOADOUT : modelLoadout(recipe[side]));

/** A bout at a step, whole: whose bout it is, the physics' bytes and every module's memory. Plain data. */
interface DuelSave {
  readonly identity: RecordingIdentity;
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
  readonly recovery?: Record<Side, number>;
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
  /** Each side's Commander's memory and its last orders, where the recipe names one (`DuelRecipe.commanders`). */
  readonly commanders?: Partial<Record<Side, TeamOfOne["state"]>>;
}

interface SideState {
  readonly body: object;
  /** Its mind's memory above its body's (`Minded.state`). */
  readonly mind: object;
  readonly pool: object;
}

/** What a page hears of a bout. */
interface DuelHooks {
  /** Collision geometry granted by the same builder that installs the physical arena. */
  readonly solids?: readonly SolidSense[];
  /** Hears each blow as it lands. */
  readonly onBlow?: (blow: LandedBlow) => void;
  /** Called with each side as its body is built, before it first steps: the page dresses it. */
  readonly onBuilt?: (duelist: Duelist, built: BuiltBody) => void;
  /** Write each side's order sheets (`Combatant.sheets`); not unless asked. */
  readonly record?: boolean;
  /** Each side's order sheets, played in place of its mind: the recipe's bout again with no mind made. */
  readonly replay?: Readonly<Record<Side, SheetLog>>;
}

/**
 * `world` as it stands before any bout, to go back to: what this returns, called with no bout in
 * the world, puts its physics and its clock back where they were, so a bout begun after another
 * plays as the same bout in a fresh world does. A disposed bout's bodies leave their slots in the
 * solver, and a later bout's bodies take them in another order.
 */
export function boutStart(world: World): () => void {
  const physics = world.physics.save(), state = saveState(world.state);
  return () => { world.physics.load(physics); loadState(world.state, state); };
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
  /** The recipe's end rules, each with its config, in order. */
  private readonly ends: readonly (readonly [EndRule, EndRuleConfig])[];
  private readonly senses: SensesHub;
  private readonly feeding: Hook;
  private readonly watch: BlowWatch;
  private readonly judging: Hook;
  private readonly identity: RecordingIdentity;
  /** The teams of one the recipe's Commanders lead (`DuelRecipe.commanders`), by side. */
  private readonly teams: Readonly<Partial<Record<Side, TeamOfOne>>>;
  /** What carries the recipe's rail, where it names one. */
  private readonly rail: Hook | null;

  constructor(world: World, recipe: DuelRecipe, hooks: DuelHooks = {}) {
    if ("held" in recipe) throw new Error("obsolete single-held recipe; name both hands in loadouts");
    if ("contactLayer" in recipe) throw new Error("obsolete contact-layer recipe; rebuild it with the current point-load rules");
    if (recipe.recoverySeconds !== undefined && recipe.recoverySeconds !== null && (!Number.isFinite(recipe.recoverySeconds) || recipe.recoverySeconds < 0))
      throw new Error("invalid recovery window");
    const characters = Object.fromEntries(SIDES.map(side => [side, resolveCharacter({ model: recipe[side], attributes: {
      ...(recipe.balance?.[side] !== undefined ? { balance: recipe.balance[side] } : {}),
      ...(recipe.haste?.[side] !== undefined ? { haste: recipe.haste[side] } : {}), ...recipe.attributes?.[side],
    } })])) as Record<Side, ReturnType<typeof resolveCharacter>>;
    for (const side of SIDES) {
      const model = recipe[side], loadout = loadoutIn(recipe, side), config = recipe.minds?.[side] ?? defaultMind(model);
      modelHolding(model, loadout, characters[side].config.attributes);
      const refused = modelRefusal(model, config, loadout, entryRules(recipe), characters[side].config.attributes);
      if (refused !== null) throw new Error(`the ${side} mind cannot play ${model} carrying ${loadout.left},${loadout.right}: ${refused}`);
    }
    this.world = world;
    this.recipe = Object.freeze({ ...recipe, attributes: Object.freeze({ left: characters.left.config.attributes, right: characters.right.config.attributes }) });
    const level = recipe.level ?? "open", gap = recipe.gap ?? levelDefinition(level).gap.default;
    const spawns = Object.fromEntries(SIDES.map((side) => {
      const spawn = levelSpawn(level, side, gap), given = recipe.start?.[side];
      if (given?.at !== undefined && !(given.at.length === 2 && given.at.every(Number.isFinite)) || given?.heading !== undefined && !Number.isFinite(given.heading))
        throw new Error(`invalid ${side} start`);
      return [side, { position: given?.at ? [given.at[0], spawn.position[1], given.at[1]] as Vec3 : spawn.position, heading: given?.heading ?? spawn.heading }];
    })) as Record<Side, { position: Vec3; heading: number }>;
    if (spawns.left.position.every((v, k) => v === spawns.right.position[k])) throw new Error("the two start on one spot");
    const railFaulted = recipe.rail ? railFaults(recipe.rail) : [];
    if (railFaulted.length) throw new Error(`invalid rail: ${railFaulted.join("; ")}`);
    this.ends = (recipe.ends ?? GAME_ENDS).map((config) => { const rule = endRuleOf(config); return [rule, { ...rule.defaults, ...config }] as const; });
    const solids = solidSenses(hooks.solids ?? arenaSolids(level));
    const effective = JSON.parse(recipeKey({ ...this.recipe, level, gap, capSeconds: recipe.capSeconds ?? CAP_SECONDS,
      senseDelay: senseDelayOf(recipe), seed: boutSeedOf(recipe), recoverySeconds: recipe.recoverySeconds === null ? null : recipe.recoverySeconds ?? 0,
      loadouts: { left: loadoutIn(recipe, "left"), right: loadoutIn(recipe, "right") },
      minds: { left: recipe.minds?.left ?? defaultMind(recipe.left), right: recipe.minds?.right ?? defaultMind(recipe.right) },
    })) as unknown;
    this.identity = recordingIdentity(BUILD_IDENTITY, ORDERS_PROTOCOL, { recipe: effective, solids,
      engine: world.physics.engine, revision: world.physics.revision, hz: world.hz, gravity: world.physics.gravity, actuation: world.actuation });
    this.rules = rulebook("arena", recipe.rules);
    const enlistments = SIDES.map(side => {
      const model = recipe[side], loadout = loadoutIn(recipe, side), config = recipe.minds?.[side] ?? defaultMind(model);
      const own = characters[side].spec, original = recipe.surfaces ? stiffened(own, recipe.surfaces) : own;
      const enlisting = { id: side, side, spec: withLoadout(original, loadout), at: spawns[side].position, heading: spawns[side].heading, rules: this.rules,
        seed: seedOf(boutSeedOf(recipe), side), life: (pool: Pool) => this.lifeOf(pool),
        ...(recipe.balancePercent ? { percent: recipe.balancePercent } : {}),
        ...((hooks.record || hooks.replay) ? { recording: { build: BUILD_IDENTITY, context: this.identity.configuration } } : {}),
      };
      return { side, model, config, enlisting };
    });
    if (hooks.replay) for (const { side, enlisting } of enlistments) {
      requireRecordingIdentity(hooks.replay[side]?.identity, combatantRecordingIdentity(world, enlisting));
    }
    const start = world.time, startStep = world.steps;
    const given: Record<Side, Orders | null> = { left: null, right: null };
    this.cap = recipe.capSeconds ?? CAP_SECONDS;
    // Each side senses when the clock gives the verdict at the latest: the cap, or a drain's end before it.
    let ends = this.cap;
    for (const [rule, config] of this.ends) ends = Math.min(ends, rule.drainedBy?.(config) ?? Infinity);
    this.senses = createSenses(world, reactionSteps(senseDelayOf(recipe), world.hz), start + ends);
    // In the step's sensing phase, after the senses and before every mind: a taped order is given
    // before the step it names.
    this.feeding = world.sense(() => {
      const { queued } = this.state;
      while (queued.length > 0 && queued[0]!.step <= this.steps) {
        const { side, orders } = queued.shift()!;
        this.order(side, orders);
      }
    });
    const contactLabels = new Map<number, ContactTarget>();
    const duelists = {} as Record<Side, Duelist>;
    for (const { side, model, config, enlisting } of enlistments) {
      const { spec } = enlisting;
      const combatant = enlist(world, {
        ...enlisting, senses: this.senses, solids,
        // A downed side remains in the fight while its recovery allowance lasts.
        out: () => this.verdict !== null || this.eliminated(side),
        mind: config, catalog: GAME,
        ...(hooks.record ? { record: true } : {}), ...(hooks.replay ? { replay: hooks.replay[side] } : {}),
        name: `arena ${side}`,
        contactIdentity: other => other ? contactLabels.get(other.id) ?? null : { kind: "world" },
        // Out of the fight it is left to itself, as a side nobody orders is.
        orders: (sensed) => sensed.out ? null : given[side],
      });
      for (const [segment, part] of combatant.built.segments) contactLabels.set(part.body.id, Object.freeze({ kind: "body", body: side, segment, guard: spec.marks.guards.includes(segment) }));
      const { pool, body } = combatant;
      duelists[side] = {
        ...combatant, side, model,
        get standing() { return pool.ending() === null && !body.down; },
      };
    }
    this.duelists = duelists;
    const spawnFaults = SIDES.flatMap(side => {
      const observer = duelists[otherSide(side)];
      const body = observer.senses().others.find(other => other.id === side)!;
      return spawnClearanceFaults(sensedBounds(body), arenaSolids(level));
    });
    if (spawnFaults.length) {
      this.feeding.dispose(); this.senses.dispose();
      for (const side of SIDES) { duelists[side].body.dispose(); duelists[side].built.dispose(); }
      throw new Error(`invalid ${level} spawn:\n${spawnFaults.join("\n")}`);
    }
    this.watch = watchBlows(world, SIDES.map((side) => duelists[side]), this.rules, hooks.onBlow);
    const sideState = ({ body, minded, pool }: Duelist): SideState => ({ body: body.state, mind: minded.state, pool: pool.state });
    // Each asked in the sensing phase after the tape's orders, as a page's team is.
    const led = SIDES.flatMap((side) => { const config = recipe.commanders?.[side]; return config ? [[side, teamOfOne(this, side, config)] as const] : []; });
    this.teams = Object.fromEntries(led);
    this.state = {
      start, startStep, verdict: null, given, tape: [], queued: [],
      ...(recipe.recoverySeconds === null || (recipe.recoverySeconds ?? 0) > 0 ? { recovery: { left: 0, right: 0 } } : {}),
      world: world.state, senses: this.senses.state, watch: this.watch.state,
      left: sideState(duelists.left), right: sideState(duelists.right),
      ...(led.length ? { commanders: Object.fromEntries(led.map(([side, team]) => [side, team.state])) } : {}),
    };
    this.judging = world.afterStep(() => this.judge());
    this.rail = recipe.rail ? carryOnRail(world, duelists[recipe.rail.side].built, recipe.rail, () => this.clock) : null;
    for (const side of SIDES) hooks.onBuilt?.(duelists[side], duelists[side].built);
  }

  /** Null while the bout is on. */
  get verdict(): Verdict | null { return this.state.verdict; }

  /** Every blow and clash so far, in the order they landed. */
  get blows(): readonly LandedBlow[] { return this.watch.blows; }

  /** Every order given, in the order given: with the recipe, the whole of what made this bout. */
  get tape(): readonly OrdersEntry[] { return this.state.tape; }

  /** A portable recording identifies its immutable build and the physical recipe that gives the orders meaning. */
  get recording(): OrdersRecording { return { identity: this.identity, tape: JSON.parse(JSON.stringify(this.tape)) as OrdersEntry[] }; }

  /** Seconds since the bout began. */
  get clock(): number { return this.world.time - this.state.start; }

  /** Steps the bout has taken. */
  get steps(): number { return this.world.steps - this.state.startStep; }

  /** What the Commander the recipe names for `side` says of it (`Commander.report`); null where none leads it. */
  commanded(side: Side): MemberReport | null { return this.teams[side]?.commander.report(side) ?? null; }

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
  save(): DuelSave { return { identity: { ...this.identity, protocol: "arena-save/1" }, recipe: this.recipe, physics: this.world.physics.save(), state: saveState(this.state) }; }

  /**
   * Put the bout where `saved` left one of this recipe: the next step is the step that followed
   * the save. The page's hooks hear nothing of it.
   */
  load(saved: DuelSave): void {
    // Two bouts of different bodies can have worlds of the same counts, which the physics would take.
    if (recipeKey(saved.recipe) !== recipeKey(this.recipe)) throw new Error("that save is of another bout's recipe");
    requireRecordingIdentity(saved.identity, { ...this.identity, protocol: "arena-save/1" });
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

  /** The side's life, a fraction of its full life: its bar less what the end rules have drained by now, never below none. */
  life(side: Side): number { return this.lifeOf(this.duelists[side].pool); }

  /** The life of a side of `pool`: what `life` reads, from the bout's first step, when its sides are not yet built. */
  private lifeOf(pool: Pool): number {
    // The state is made after the sides, whose senses read their life as they are carried: then nothing is drained.
    const seconds = this.state ? this.clock : 0;
    let drained = 0;
    for (const [rule, config] of this.ends) drained += rule.drained?.(seconds, config) ?? 0;
    return Math.max(0, pool.bar() - drained);
  }

  /** Whether the side is out under this bout's end rules (`DuelRecipe.ends`). */
  eliminated(side: Side): boolean {
    return this.outBy(side) !== null;
  }

  /** How the side is out: the ending of the first of the bout's end rules that puts it out, or null. */
  private outBy(side: Side): DuelEnding | null {
    const { pool, body, built } = this.duelists[side], one = { pool, life: this.lifeOf(pool), body, built, downFor: this.state.recovery?.[side] ?? 0 };
    for (const [rule, config] of this.ends) {
      const ending = rule.out(one, config, this.recipe);
      if (ending !== null) return ending;
    }
    return null;
  }

  private judge(): void {
    if (this.verdict) return;
    if (this.state.recovery) for (const side of SIDES)
      this.state.recovery[side] = this.duelists[side].body.down ? this.state.recovery[side] + this.world.dt : 0;
    this.state.verdict = this.decide();
    // The bout is over: neither body is given anything more.
    if (this.verdict) for (const side of SIDES) this.duelists[side].body.assist.withdraw();
  }

  /** The verdict, if this step decides the bout: frozen, so one a page holds is a record no load writes into. */
  private decide(): Verdict | null {
    const out = SIDES.filter((side) => this.eliminated(side));
    if (out.length === 2) return Object.freeze({ winner: null, ending: this.outBy("left")!, time: this.clock });
    if (out.length === 1) {
      const loser = out[0]!;
      return Object.freeze({ winner: otherSide(loser), ending: this.outBy(loser)!, time: this.clock });
    }
    if (this.clock < this.cap) return null;
    const left = this.life("left"), right = this.life("right");
    return Object.freeze({ winner: left > right ? "left" : right > left ? "right" : null, ending: "time", time: this.clock });
  }

  dispose(): void {
    for (const side of SIDES) this.teams[side]?.dispose();
    this.rail?.dispose();
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
