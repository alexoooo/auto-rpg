import { constructionScope } from "../../core/construction.ts";
import { isRefused, type Refused } from "../../core/refusal.ts";
import type { PhysicsEngine } from "../../core/physics/engine.ts";
import { enlist, type Combatant } from "../combatant.ts";
import { buildBody } from "../../core/bodies/build/build-body.ts";
import { builtAngles, createMind, warmApart } from "../../minds/seat/create-mind.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import { withLoadoutChecked, type Loadout } from "../../core/bodies/items/held.ts";
import { resolveCharacterChecked, type BodyModel, type ResolvedCharacter } from "../../core/bodies/models.ts";
import { modelLoadout } from "../model-loadouts.ts";
import type { AttributeOverrides } from "../../core/bodies/character-attributes.ts";
import { configuredSpawn } from "./attribute-placement.ts";
import type { MindConfig } from "../../minds/catalog/config.ts";
import { MODEL_DISPLAY } from "../appearance/models.ts";
import { createSenses, type SensesHub } from "../../core/world/senses.ts";
import { watchBlows, type BlowWatch, type LandedBlow } from "../../combat/blows.ts";
import { levelsOf, stirs, type LevelAsk, type LevelRule } from "../levels.ts";
import { reactionSteps, rulebook } from "../../combat/rulebook.ts";
import { seedOf } from "../../core/math/random.ts";
import { phaseOf } from "../../minds/seat/host.ts";
import { cryptModel } from "./actors.ts";
import { createWorld, type World } from "../../core/world/world.ts";
import type { MindPlace } from "../../minds/seat/apart.ts";
import { isBody } from "../../core/bodies/read-body.ts";
import { canSee, cellKey, clearSegment, distance, explorationGoal, findPath, reveal, routeLength, sightIndex, walkable,
  type DungeonMap, type Point, type SightIndex } from "./map.ts";
import type { PlayerLead } from "../player-input.ts";
import { dungeonSolids } from "./solids.ts";
import { CAMERA_PITCH } from "./bearing.ts";
import { companionSpawn } from "./party-placement.ts";
import { generateEncounterLevel } from "./encounters.ts";
import type { NavigationReport } from "../../skills/framework/navigation.ts";
import type { Skills } from "../../skills/framework/skills.ts";
import type { Orders } from "../../minds/orders.ts";
import { STAND_ORDERS } from "../../minds/orders.ts";
import type { CommanderConfig } from "../../minds/command/kind.ts";
import { createCommander } from "../../minds/command/commander.ts";
import { releaseCombatApproach } from "../../minds/command/delivery.ts";

/** Each side's Commander where a run names none: the person's party, and a mob. */
export const RUN_COMMANDERS: Readonly<Record<"party" | "enemies", CommanderConfig>> = Object.freeze({ party: Object.freeze({ kind: "party" }), enemies: Object.freeze({ kind: "mob" }) });
import type { Commander, MemberReport, MemberView, SensedBody, TeamLevel, TeamView } from "../../minds/command/team.ts";
import type { Command } from "../../minds/command/commands.ts";
import { doorApproach } from "./door-approach.ts";
import type { GameContext } from "../arena/context.ts";

/**
 * **A crypt run**: the level's colliders are fixed boxes in a world
 * (`dungeonSolids`), and the party and the enemies are bodies (`src/core/`), each under a mind
 * that carries out its team's orders. Each side is a team under a Commander (`src/minds/command/`):
 * the party under the person's (`partyCommander`), whose commands reach it only as `Command`s
 * and live movement input (`PlayerLead`), unless the run is given another
 * (`DungeonRunOptions.party`: the `clearer` plays the party by itself); the enemies under a mob
 * (`mobCommander`) unless given another (`DungeonRunOptions.enemies`). The run is their host: it answers for the map
 * (`TeamLevel`), asks the party's Commander and then the enemies' once a step, before every mind,
 * has the enemies look when the party looks, and gives each mind the orders its Commander gave.
 * The run keeps the map, who is built, each body's level, the doors that open, and its status.
 *
 * - **The hero** is the Warrior unless the page picks another, **the companions** whom the page names,
 *   **the enemies** the map's encounters; point-only maps supply skeletons. Model defaults
 *   provide each body's mind, and its equipment where the run gives no loadout.
 * - **The minds** carry out the orders. Humanoids attack the target's head;
 *   a reptile receives the nearest sensed collider surface within its mouth's reach.
 * - **Wounds** are the core's blows (`watchBlows`) under the dungeon's rulebook. A fighter is out
 *   of the fight once its pool has ended; a fallen body stays in the fight while it gets up. An eliminated body goes limp:
 *   nothing drives its muscles again, and a step costs it only what the solver takes.
 * - **An enemy is built** once a standing party member comes within `WAKE_METRES` of where it waits,
 *   beyond its sight, and not before: every body built costs each step its control and solve.
 * - **Each body's level** is the core's rule's (`levelsOf`, `LEVELS`): an enemy waiting at its
 *   home with the party far off and nobody walking near is held, fixed where it stands with
 *   nothing driving it, until the party or a walker comes near again; and the dead, once they
 *   have lain long enough for their fall to end, are held where they lie while nobody walks near.
 *
 * The run is lost when the whole party has fallen and won when a standing member reaches the exit.
 */

/** The map a run of `options` plays: its layout, or the encounter level its seed generates. */
export function runMap(options: Pick<DungeonRunOptions, "seed" | "layout">): DungeonMap | Refused {
  if (options.layout) return options.layout;
  const generated = generateEncounterLevel(options.seed);
  return isRefused(generated) ? generated : generated.map;
}
const heroOf = (options: Pick<DungeonRunOptions, "hero">): BodyModel => options.hero ?? "workshop-fighter";
const enemyAt = (map: DungeonMap, options: Pick<DungeonRunOptions, "enemy">, i: number): BodyModel =>
  options.enemy?.(i) ?? map.encounters?.[i]?.model ?? "crypt-skeleton";
/** Every body a run of `options` on `map` fields, as its mind is chosen (`DungeonRunOptions.mind`): the hero, the companions, then the enemies. */
export function runParticipants(map: DungeonMap, options: Pick<DungeonRunOptions, "hero" | "companions" | "enemy">): Participant[] {
  return [{ id: "hero", side: "party", model: heroOf(options) },
    ...(options.companions ?? []).map((model, i): Participant => ({ id: `ally-${i}`, side: "party", model })),
    ...map.spawns.map((_, i): Participant => ({ id: `enemy-${i}`, side: "enemy", model: enemyAt(map, options, i) }))];
}
/** Every model a run of `options` on `map` fields, each once: the party's, then the enemies'. */
export function runModels(map: DungeonMap, options: Pick<DungeonRunOptions, "hero" | "companions" | "enemy">): BodyModel[] {
  return [...new Set(runParticipants(map, options).map((participant) => participant.model))];
}

/** Who stands for each model in the party list and the target panel. */
export const actorName = (model: BodyModel): string => MODEL_DISPLAY[model].label.toLowerCase();

/** Who a body of the run is, by which its mind is chosen (`DungeonRunOptions.mind`): its id, its side and its model. */
export type Participant = Pick<DungeonActor, "id" | "side" | "model">;

export interface DungeonActor {
  readonly character: ResolvedCharacter;
  readonly attackMetres: number;
  readonly id: string;
  readonly name: string;
  readonly model: BodyModel;
  readonly side: "party" | "enemy";
  /** The body, its mind (`minded`) and its pool, once built; an enemy waits unbuilt until the party is near (`WAKE_METRES`). */
  fighter: Combatant | null;
  /**
   * Where the body stands on the ground: its centre of mass over the floor; where its root lies,
   * limp; or where it waits unbuilt. A living body that is held reads where it stood, which is
   * where it stands.
   */
  feet(): Point;
  /** Whether it still fights under the crypt's wound and fall rules. */
  readonly alive: boolean;
  /** Whether its body lies limp: out of the fight, with nothing driving its muscles (`DungeonRun.levels`). */
  readonly limp: boolean;
  /** Whether its body is held: fixed where it is, with nothing driving it (`LEVELS`). */
  readonly held: boolean;
  /** The run's clock when it was first found out of the fight, s; null while it is in it. */
  outAt: number | null;
  /** Its pool's bar: 1 whole, 0 spent. */
  readonly vitality: number;
  /** The body it fights, as its team's Commander says (`MemberReport.target`); null when none. */
  readonly target: DungeonActor | null;
  /** Where it was placed: where an enemy waits, and a party member's start. */
  readonly home: Point;
  /** Its footprint's radius on the map, m (`cryptModel`). */
  readonly radius: number;
  /** Navigation feedback and geometric route from its selected Mind, where it exposes the role. */
  readonly navigation: NavigationReport | null;
  /** The skills its Mind runs, where it runs the game's: the way its legs face and the limits they state. */
  readonly skills: Skills | null;
}

/** How near a standing party member comes before an enemy is built: beyond its sight, so it is standing when it can
 * first see. */
export const WAKE_METRES = 16;
/**
 * The levels' rule (`levelsOf`): an enemy is let go with a party
 * member within `wake`, before it could see one, or a body going somewhere within `company`,
 * before that body could reach it; waiting, it is held with the party beyond `rest` and nobody
 * going anywhere within `clear`. A body out of the fight is held by the last two once it has
 * lain `settle` seconds, longer than a fall takes to end. Each pair's gap (`wake` and `rest`,
 * `company` and `clear`) keeps a body on the line from being held and let go by turns.
 */
export const LEVELS: LevelRule = Object.freeze({ wake: WAKE_METRES, rest: 18, company: 4, clear: 5, settle: 10 });
/**
 * How much farther than the levels' lines that let a held enemy go (`LevelRule.wake`, `company`)
 * an enemy is built, held where it waits until they let it go: a second or more before it is
 * wanted, at the party's walk, so the run builds at most one body a step.
 */
const AHEAD_METRES = 2;
/** How near its home an enemy with nothing to do counts as waiting there, m. */
const HOME_METRES = 0.5;
/** Who sees whom is read every `perceive`, s, and at once after a party member's plan is reset. */
const RUN_TIMING = Object.freeze({ perceive: 0.2 });
/** How near the exit a standing party member wins the run, m. */
const EXIT_METRES = 1.1;
/** A run goes on until its party has fallen or one of it stands at the exit. */
export type RunStatus = "playing" | "won" | "dead";

export interface DungeonRunOptions {
  readonly prepared?: PreparedDungeonCharacters;
  /** Resolved before placement, including for enemies that wake later. */
  readonly attributes?: (participant: Participant) => AttributeOverrides | null;
  /** What each participant holds in each hand; its model's (`modelLoadout`) where this gives none. */
  readonly loadout?: (participant: Participant) => Loadout | null;
  /** The level's seed (`generateLevel`), unless `layout` is given. */
  readonly seed: number;
  readonly engine: PhysicsEngine;
  readonly layout?: DungeonMap;
  readonly hero?: BodyModel;
  readonly companions?: readonly BodyModel[];
  /** Each spawn's model; the skeleton unless given. */
  readonly enemy?: (i: number) => BodyModel;
  /** Each participant's mind, the party's and the enemies' alike; its model's own (`defaultMind`) where this gives none. */
  readonly mind?: (participant: Participant) => MindConfig | null;
  /** Hears each blow as it lands. */
  readonly onBlow?: (blow: LandedBlow) => void;
  /** The actor and its world, before its first step: presentation can subscribe even during run construction. */
  readonly onBuilt?: (actor: DungeonActor, world: World) => void;
  /** The levels' rule; `LEVELS` unless given. */
  readonly levels?: LevelRule;
  /** The party's Commander; the person's (`party`) unless given. */
  readonly party?: CommanderConfig;
  /** The enemies' Commander; a mob (`mob`) unless given. */
  readonly enemies?: CommanderConfig;
  /** Where its minds run (`World.minds`); in the world's thread unless given. */
  readonly minds?: MindPlace;
}

/** Resolve every actor and its placement before allocating a world or replacing a running scene. */
export interface PreparedDungeonCharacters {
  readonly characters: Map<string, ResolvedCharacter>;
  /** Each participant's body: its character's, holding its loadout. */
  readonly specs: Map<string, BodySpec>;
  readonly homes: Map<string, Point>;
}

export function prepareDungeonCharacters(map: DungeonMap, options: Pick<DungeonRunOptions, "hero" | "companions" | "enemy" | "attributes" | "loadout">): PreparedDungeonCharacters | Refused {
  const characters = new Map<string, ResolvedCharacter>(), specs = new Map<string, BodySpec>();
  for (const participant of runParticipants(map, options)) {
    const character = resolveCharacterChecked({ model: participant.model, attributes: options.attributes?.(participant) ?? {} });
    if (isRefused(character)) return character;
    const spec = withLoadoutChecked(character.spec, options.loadout?.(participant) ?? modelLoadout(participant.model));
    if (isRefused(spec)) return spec;
    characters.set(participant.id, character); specs.set(participant.id, spec);
  }
  const heroModel = heroOf(options), hero = cryptModel(heroModel, characters.get("hero")!.spec);
  const geometryChanged = (id: string) => {
    const a = characters.get(id)!.config.attributes; return a.size !== 1 || a.weight !== 1;
  };
  if (geometryChanged("hero") && (!walkable(map, map.start, hero.radius, true) || !findPath(map, map.start, map.exit, hero.radius).length))
    return { refused: "Configured hero does not fit the dungeon's start or route to the exit." };
  const homes = new Map<string, Point>(), occupied = [{ ...map.start, radius: hero.radius }];
  const encounters = map.spawns.map((_, i) => cryptModel(enemyAt(map, options, i), characters.get(`enemy-${i}`)!.spec));
  for (const [i, at] of map.spawns.entries()) {
    const id = `enemy-${i}`, info = encounters[i]!;
    const remaining = map.spawns.slice(i + 1).map((point, k) => ({ ...point, radius: encounters[i + 1 + k]!.radius }));
    const home = geometryChanged(id) ? configuredSpawn(map, at, info.radius, [...occupied, ...remaining]) : at;
    if (isRefused(home)) return home;
    homes.set(id, home); occupied.push({ ...home, radius: info.radius });
  }
  const partyTaken = [{ ...map.start, radius: hero.radius }];
  for (const [i, model] of (options.companions ?? []).entries()) {
    const id = `ally-${i}`, info = cryptModel(model, characters.get(id)!.spec), at = companionSpawn(map, partyTaken, info.radius);
    if (!at) return { refused: `No floor beside the start for companion ${i + 1}` };
    partyTaken.push({ ...at, radius: info.radius }); homes.set(id, at);
  }
  return { characters, specs, homes };
}

/** A constructed run consumes placements that pure admission has accepted. */
export type AdmittedDungeonRunOptions = DungeonRunOptions & { readonly layout: DungeonMap; readonly prepared: PreparedDungeonCharacters };

/** Admit geometry and participants before allocating any runtime resources. */
export function createDungeonRun(options: DungeonRunOptions, context: GameContext): DungeonRun | Refused {
  const layout = runMap(options);
  if (isRefused(layout)) return layout;
  const prepared = options.prepared ?? prepareDungeonCharacters(layout, options);
  if (isRefused(prepared)) return prepared;
  return new DungeonRun({ ...options, layout, prepared }, context);
}

interface ActorMemory {
  outAt: number | null;
  readonly home: Point;
  fighter: { readonly body: object; readonly mind: object; readonly pool: object; readonly built: object } | null;
}

export class DungeonRun {
  readonly state = {
    map: null as DungeonMap | null, world: null as object | null, senses: null as object | null,
    team: null as object | null, foes: null as object | null, watch: null as object | null,
    actors: {} as Record<string, ActorMemory>, lead: { keys: null, walk: false } as PlayerLead,
    blows: [] as LandedBlow[], explored: new Set<number>(), visible: new Set<number>(),
    status: "playing" as RunStatus, nextPerception: 0, given: new Map<string, Orders>(),
  };
  get map(): DungeonMap { return this.state.map!; }
  /** Live movement of the controlled party member. */
  get lead(): PlayerLead { return this.state.lead; }
  set lead(value: PlayerLead) { this.state.lead = value; }
  /** The world every body and collider is in. */
  readonly world: World;
  /** The level built: its floor, walls and doors, drawn, and their colliders in `world`. */
  readonly level: ReturnType<typeof dungeonSolids>;
  readonly actors: DungeonActor[] = [];
  readonly hero: DungeonActor;
  /** The bodies one person orders: the hero first, then the companions. */
  readonly party: DungeonActor[] = [];
  readonly enemies: DungeonActor[] = [];
  /** Every blow and clash so far. */
  get blows(): LandedBlow[] { return this.state.blows; }
  get explored(): Set<number> { return this.state.explored; }
  get visible(): Set<number> { return this.state.visible; }
  set visible(visible: Set<number>) { this.state.visible = visible; }
  get status(): RunStatus { return this.state.status; }
  set status(status: RunStatus) { this.state.status = status; }
  /** The camera's elevation, which decides where on a wall in front of the hero the cut-away falls. The page sets it. */
  pitch = CAMERA_PITCH;
  private get nextPerception(): number { return this.state.nextPerception; }
  private set nextPerception(time: number) { this.state.nextPerception = time; }
  /** The map's sight index, and how many of its doors were open when it was made: `sight` makes it again when another has opened. */
  private seeing: { index: SightIndex; opened: number } | null = null;
  private watch: BlowWatch | null = null;
  private readonly rules = rulebook("dungeon");
  private readonly options: AdmittedDungeonRunOptions;
  private readonly senses: SensesHub;
  /** The party's Commander and the enemies', and the orders each last gave by member id: a body given none stands. */
  private readonly team: Commander;
  private readonly foes: Commander;
  private get given(): Map<string, Orders> { return this.state.given; }
  /** The levels' rule with its lines that let a held body go `AHEAD_METRES` farther: where an enemy is built (`wake`). */
  private readonly ahead: LevelRule;

  private readonly lifetime = constructionScope();
  private readonly context: GameContext;

  constructor(options: AdmittedDungeonRunOptions, context: GameContext) {
    this.context = context;
    this.options = options;
    const rule = options.levels ?? LEVELS;
    this.ahead = { ...rule, wake: rule.wake + AHEAD_METRES, company: rule.company + AHEAD_METRES };
    this.state.map = options.layout;
    const { characters, homes } = options.prepared;
    this.world = this.lifetime.own(createWorld(options.engine, options.minds ? { minds: options.minds } : {}));
    let completed = false;
    try {
    this.state.world = this.world.state;
    this.senses = this.lifetime.own(createSenses(this.world, reactionSteps(this.rules.reaction.value, this.world.hz)));
    this.state.senses = this.senses.state;
    this.level = this.lifetime.own(dungeonSolids(this.map, this.world.physics));
    this.team = createCommander(context.commanders, { level: this.ground((places) => { this.visible = this.sight(places); }) }, options.party ?? RUN_COMMANDERS.party);
    this.foes = createCommander(context.commanders, { level: this.ground(() => {}) }, options.enemies ?? RUN_COMMANDERS.enemies);
    this.state.team = this.team.state; this.state.foes = this.foes.state;
    // As the step is prepared, before any body's own hooks, so each body's mind reads this step's orders.
    this.lifetime.own(this.world.prepare(() => this.plan()));
    const run = this;
    const create = (id: string, model: BodyModel, at: Point, side: DungeonActor["side"]): DungeonActor => {
      const character = characters.get(id)!, info = cryptModel(model, character.spec);
      const memory: ActorMemory = { outAt: null, home: { ...at }, fighter: null };
      this.state.actors[id] = memory;
      const actor: DungeonActor = {
        id, name: actorName(model), model, character, attackMetres: info.attackMetres, side, fighter: null, get outAt() { return memory.outAt; }, set outAt(time) { memory.outAt = time; },
        feet() {
          if (!this.fighter) return { x: this.home.x, z: this.home.z };
          // A limp body's view is of the step its control left at; its root is where it lies now.
          const c = this.limp ? this.fighter.body.muscles.dynamics.root.segment.pose.position : this.fighter.body.physical.centre;
          return { x: c.x, z: c.z };
        },
        get alive() { return this.fighter === null || this.fighter.pool.ending() === null &&
          (!cryptModel(this.model).fallEndsFight || !this.fighter.body.down); },
        get limp() { return !this.alive && this.fighter!.body.level !== "full"; },
        get held() { return this.fighter?.body.level === "held"; },
        get vitality() { return this.fighter?.pool.bar() ?? 1; },
        get target() { const id = run.report(this).target; return id === null ? null : run.actors.find((other) => other.id === id) ?? null; },
        get home() { return memory.home; }, radius: info.radius,
        get navigation() { return this.fighter?.minded.report?.navigation ?? null; },
        get skills() { return (this.fighter?.minded as { readonly skills?: Skills } | undefined)?.skills ?? null; },
      };
      this.actors.push(actor); return actor;
    };
    this.hero = create("hero", heroOf(options), this.map.start, "party");
    this.party.push(this.hero);
    this.map.spawns.forEach((_, i) => this.enemies.push(create(`enemy-${i}`, enemyAt(this.map, options, i), homes.get(`enemy-${i}`)!, "enemy")));
    for (const [i, model] of (options.companions ?? []).entries()) {
      this.party.push(create(`ally-${i}`, model, homes.get(`ally-${i}`)!, "party"));
    }
    for (const member of this.party) this.build(member);
    this.warm(options.engine);
    this.wake(Infinity);
    this.visible = this.sight(this.party.map(member => member.home));
    this.lifetime.own({ dispose: () => this.watch?.dispose() });
    completed = true;
    } finally { if (!completed) { this.watch?.dispose(); this.lifetime.dispose(); } }
  }

  /** Seconds since the run began: the world's clock. */
  get clock(): number { return this.world.time; }

  /**
   * Build `actor`'s body where it waits, holding what its model holds, under its mind (the one the run
   * was given for it, `DungeonRunOptions.mind`, else its model's) with
   * the assist its character's balance gives it, and watch its blows with everybody's. The mind
   * carries out the orders its team's Commander gives it (`delivered`), its target as the foe.
   * Facing remains independent of movement. It is asked only
   * while its body is at `full` (`levels`).
   */
  private build(actor: DungeonActor): void {
    actor.fighter = enlist(this.world, {
      id: actor.id, side: actor.side, spec: this.specOf(actor), at: [actor.home.x, 0, actor.home.z],
      rules: this.rules, senses: this.senses, out: () => actor.fighter?.pool.ending() !== null && actor.fighter !== null,
      solids: () => this.level.sensedSolids,
      mind: this.mindOf(actor), catalog: this.context.catalog, name: `crypt ${actor.side}`, seed: seedOf(this.options.seed, actor.id),
      phase: phaseOf(this.actors.indexOf(actor)),
      contactIdentity: other => {
        if (!other) return { kind: "world" };
        for (const candidate of [...this.party, ...this.enemies]) for (const segment of candidate.fighter?.built.segments.values() ?? []) {
          if (isBody(other, segment.body)) return { kind: "body", body: candidate.id, segment: segment.spec.name,
            guard: candidate.fighter!.built.spec.marks.guards.includes(segment.spec.name) };
        }
        return null;
      },
      orders: () => this.delivered(actor),
    });
    this.lifetime.own(actor.fighter.body);
    this.state.actors[actor.id]!.fighter = { body: actor.fighter.body.state, mind: actor.fighter.minded.state, pool: actor.fighter.pool.state, built: { strength: actor.fighter.built.strength, toes: actor.fighter.built.toes, configurations: actor.fighter.built.configurations.state } };
    this.watch?.dispose();
    // The party first: a touch is read from the fighter given first (`watchBlows`), and the party's bodies are the fewer.
    const fighters = [...this.party, ...this.enemies].flatMap((a) => a.fighter ? [a.fighter] : []);
    this.watch = watchBlows(this.world, fighters, this.rules, (blow) => { this.blows.push(blow); this.options.onBlow?.(blow); });
    this.state.watch = this.watch.state;
    this.options.onBuilt?.(actor, this.world);
  }

  /**
   * What the run says of each built body, for its level: the actors, and their asks in the same
   * order. A body is out from the step it is found out of the fight, before `levels` marks it.
   */
  private asks(): { actors: DungeonActor[]; asks: LevelAsk[] } {
    const actors = this.actors.filter(actor => actor.fighter);
    return {
      actors,
      asks: actors.map(actor => ({
        level: actor.fighter!.body.level, side: actor.side, at: actor.feet(),
        out: actor.alive ? null : this.clock - (actor.outAt ?? this.clock), waiting: this.waiting(actor),
      })),
    };
  }

  /** Whether `actor` waits: an enemy in the fight with no target, not alerted, standing at its home. */
  private waiting(actor: DungeonActor): boolean {
    return actor.side === "enemy" && actor.alive && this.foes.idle(actor.id, this.clock) &&
      distance(actor.feet(), actor.home) < HOME_METRES;
  }

  /** `actor`'s body: its character's, holding its loadout (`PreparedDungeonCharacters.specs`). */
  private specOf(actor: DungeonActor): BodySpec {
    return this.options.prepared.specs.get(actor.id)!;
  }

  /** `actor`'s mind: the one the run was given for it, else its model's in the Crypt. */
  private mindOf(actor: DungeonActor): MindConfig {
    return this.options.mind?.(actor) ?? this.context.defaultMind(actor.model);
  }

  /**
   * A body and mind of each enemy the run may build, made in a world of their own and let go: what a
   * mind derives from its spec and config alone is derived as the run loads, so the run's first foe
   * of a model is built as fast as its next. Where its minds run apart, they are warmed there too
   * (`warmApart`).
   */
  private warm(engine: PhysicsEngine): void {
    const apart = this.options.minds;
    const made = new Map<BodySpec, Set<MindConfig>>(), world = createWorld(engine, apart ? { minds: apart } : {});
    try {
      for (const enemy of this.enemies) {
        const spec = this.specOf(enemy), mind = this.mindOf(enemy);
        let minds = made.get(spec);
        if (!minds) made.set(spec, minds = new Set());
        if (minds.has(mind)) continue;
        minds.add(mind);
        const built = buildBody(spec, world, { position: [0, 0, 0], joints: builtAngles(this.context.catalog, spec, mind) });
        const wiring = { name: "warm", orders: () => STAND_ORDERS, rules: this.rules };
        try {
          if (apart) warmApart(this.context.catalog, built, world, mind, wiring);
          else {
            const body = createMind(this.context.catalog, built, world, mind, wiring);
            body.body.dispose();
          }
        } finally { built.dispose(); }
      }
    } finally { world.dispose(); }
  }

  /**
   * Build an enemy that a party member, or a body going somewhere, has come within `AHEAD_METRES`
   * of stirring (`stirs`), `most` of them, and hold it where it waits: the levels let it go as they
   * let go any held body, when it is stirred (`levels`).
   */
  private wake(most = 1): void {
    const { asks } = this.asks();
    let built = 0;
    for (const enemy of this.enemies) {
      if (built >= most) return;
      if (enemy.fighter || !stirs(enemy.home, enemy.side, asks, this.ahead)) continue;
      this.build(enemy);
      enemy.fighter!.body.setLevel("held");
      built++;
    }
  }

  /**
   * Put each body at its level (`levelsOf`). One found out of the fight, for good, is out from now:
   * its assist is withdrawn, and the rule lets it go limp, so it lies as the blow or the fall left
   * it, wherever its mind had it.
   */
  private levels(): void {
    for (const actor of this.actors) if (actor.fighter && actor.outAt === null && !actor.alive) {
      actor.outAt = this.clock;
      actor.fighter.body.assist.withdraw();
    }
    const { actors, asks } = this.asks();
    levelsOf(asks, this.options.levels ?? LEVELS).forEach((level, i) => actors[i]!.fighter!.body.setLevel(level));
  }

  /** What the party sees from where its members stand: every member's cells, one set, a cell one member sees not looked at for the next. */
  private sight(from: readonly Point[]): Set<number> {
    const index = this.sightIndex(), visible = new Set<number>();
    for (const at of from) reveal(this.map, at, this.explored, 12, index, visible);
    return visible;
  }

  /** The party member the camera follows and the page reports: the hero while it stands, then the first companion that does. */
  get leader(): DungeonActor { return this.party.find(member => member.alive) ?? this.hero; }

  /** Which party members the person's commands go to, by id, as the party's Commander says. */
  get selected(): ReadonlySet<string> { return new Set(this.party.filter((member) => this.team.report(member.id).selected).map((member) => member.id)); }

  /** Sends the person's next commands to these party members, or to everybody when `ids` is null. Unknown ids are dropped. */
  select(ids: readonly string[] | null): void {
    this.command({ kind: "select", members: ids ?? this.party.map((member) => member.id) });
  }

  /** The person's command, heard by the party's Commander at once and carried out on the members selected. */
  command(command: Command): void { this.team.hear(command, this.partyView(false)); }

  /** What `actor`'s team's Commander says of it: whom it fights, what it is doing (`MemberReport`). */
  report(actor: DungeonActor): MemberReport { return (actor.side === "party" ? this.team : this.foes).report(actor.id); }

  /** What the party's Commander tells the person of the party's movement, or "". */
  get notice(): string { return this.team.notice; }

  /** The run's part of a step, before the bodies': who is built, each body's level, doors, each team's orders, and the status. */
  private plan(): void {
    if (this.status === "playing") this.wake();
    this.levels();
    if (this.status !== "playing") {
      this.given.clear();
      return;
    }
    this.level.openNearby(this.actors.filter(a => a.fighter && a.alive).map(a => a.feet()));
    const party = this.team.decide(this.partyView(this.clock >= this.nextPerception));
    if (party.looked) this.nextPerception = this.clock + RUN_TIMING.perceive;
    for (const [id, orders] of party.orders) this.given.set(id, orders);
    for (const [id, orders] of this.foes.decide(this.view(this.enemies, this.party, party.looked, null)).orders) this.given.set(id, orders);
    // A recovering party member keeps the run alive; reaching the exit requires an upright body.
    const alive = this.party.filter(member => member.alive);
    if (!alive.length) this.status = "dead";
    else if (alive.some(member => !member.fighter?.body.down && distance(member.feet(), this.map.exit) < EXIT_METRES)) this.status = "won";
  }

  /**
   * The ground as a team of the run knows it (`TeamLevel`): the map's, its doors as they stand, its
   * exit once the party has seen its cell; `look` is what the team's look reveals. A route's length
   * is kept for the step it was asked at, so a decision that asks one again is answered without a
   * search.
   */
  private ground(look: TeamLevel["look"]): TeamLevel {
    const map = this.map, routes = new Map<string, number | null>();
    let asked = -1;
    this.world.onLoad(() => { this.senses.show(); routes.clear(); asked = -1; this.seeing = null; this.level.refresh(); });
    return {
      sees: (from, to, metres) => canSee(map, from, to, metres, this.sightIndex()),
      look,
      fits: (at, radius) => walkable(map, at, radius, true),
      passes: (from, to, radius) => clearSegment(map, from, to, radius, true),
      reaches: (from, to, radius) => findPath(map, from, to, radius).length > 0,
      frontier: (from, radius) => explorationGoal(map, from, this.explored, radius),
      doorway: (from, to, radius) => doorApproach(map, this.level.sensedSolids, from, to, radius),
      open: (door) => map.doors.find((d) => d.id === door)?.open ?? false,
      exit: () => this.explored.has(cellKey(map, map.exit)) ? { x: map.exit.x, z: map.exit.z } : null,
      route: (from, to, radius) => {
        if (asked !== this.clock) { routes.clear(); asked = this.clock; }
        const key = `${from.x} ${from.z} ${to.x} ${to.z} ${radius}`;
        let metres = routes.get(key);
        if (metres === undefined) routes.set(key, metres = routeLength(map, from, to, radius));
        return metres;
      },
    };
  }

  /** What the party senses now, with live movement as its lead. */
  private partyView(look: boolean): TeamView {
    return this.view(this.party, this.enemies, look, this.lead);
  }

  /** What a team of `members` senses now: its built members, and every built body of `foes`. */
  private view(members: readonly DungeonActor[], foes: readonly DungeonActor[], look: boolean, lead: TeamView["lead"]): TeamView {
    const built = (actor: DungeonActor) => actor.fighter !== null;
    return {
      time: this.clock, look, lead,
      members: members.filter(built).map((actor): MemberView => {
        const report = actor.fighter?.minded.report;
        // What its mind says is read when asked: a mind just made apart is waited for only by a Commander that reads it.
        // The menu is built at its first read and kept for the view's other readers.
        let menu: MemberView["menu"] | undefined;
        return { id: actor.id, at: actor.feet(), fighting: actor.alive, held: actor.held, vitality: actor.vitality, radius: actor.radius,
          reach: actor.attackMetres, home: actor.home, get navigation() { return actor.navigation; }, get gaits() { return report?.gaits ?? null; },
          get heading() { return report?.heading ?? null; }, get kit() { return report?.kit ?? null; },
          get actions() { return report?.actions ?? null; }, get ended() { return report?.ended ?? null; }, get menu() { return menu === undefined ? menu = report?.menu ?? null : menu; },
          get prospects() { return report?.prospects ?? null; } };
      }),
      others: foes.filter(built).map((actor): SensedBody => ({ id: actor.id, at: actor.feet(), fighting: actor.alive, down: actor.fighter!.body.down, life: actor.vitality })),
    };
  }

  /**
   * The orders `actor`'s mind is given now: its Commander's, but with no movement once it stands
   * within the band of the foe it attacks, where its mind's own footwork takes over.
   */
  private delivered(actor: DungeonActor): Orders {
    const orders = this.given.get(actor.id) ?? STAND_ORDERS;
    const foe = orders.foe === undefined ? undefined : this.actors.find((other) => other.id === orders.foe);
    return releaseCombatApproach(orders, actor.feet(), foe ? { id: foe.id, at: foe.feet() } : null);
  }

  /** The map's sight index, made again once another door has opened. */
  private sightIndex(): SightIndex {
    let opened = 0;
    for (const door of this.map.doors) if (door.open) opened++;
    if (this.seeing?.opened !== opened) this.seeing = { index: sightIndex(this.map), opened };
    return this.seeing.index;
  }

  /** `n` steps of the world, each running the run's plan and then every body. */
  step(n = 1): void { this.world.step(n); }

  /** The steps owed after `seconds` of real time, no more than `most` (`World.advance`); none once the run is over. */
  advance(seconds: number, most?: number): number { return this.status === "playing" ? this.world.advance(seconds, most) : 0; }

  dispose(): void { this.lifetime.dispose(); }
}
