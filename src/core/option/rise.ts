import type { TargetRef } from "../skills/framework/action.ts";
import type { Side } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { sideEffector } from "../recovery/ground/skills.ts";
import { tumbling, type GroundReading, type Position } from "../control/ground-reading.ts";
import { isWayUp, type TechniquePart } from "../recovery/ground/technique.ts";
import { REPOSITION, STAND_UP } from "../recovery/ground/stand-up.ts";
import { edgeExpected } from "../skills/framework/profile.ts";
import { anyBody, slotOne, type KeysOf, type PartConfig } from "../parts/parts.ts";
import { WHOLE, type Status } from "../mind/choice.ts";
import { downTerms, type DownModel } from "./down.ts";
import { brace } from "./rest.ts";
import { asking, blocked, READY, type Option, type Situation, type Step } from "./option.ts";
import { around } from "./strike.ts";
import { onFeet, STEADY_TRY } from "./rise-memory.ts";
import { recorded, type OptionRecord, type Prior, type Tried } from "./record.ts";
import type { OptionKindPart, OptionsGiven } from "./kinds.ts";

/** What a way up is taken to do where no drill measured it (`Prior`), set by hand: it runs 5 s and stands the body seven times in ten. */
const WAY_PRIOR: Prior = deepFreeze({ seconds: 5, done: .7 });

/** What the steady is taken to do, set by hand: it stands a body on its feet ready in its try (`STEADY_TRY`) nine times in ten. */
const STEADY_PRIOR: Prior = deepFreeze({ seconds: STEADY_TRY, done: .9 });

/** What a brace saves a tumbling body, s: its first second tumbling, before a way up is begun on it moving. */
const BRACED = 1;

/** A ground action's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/** What a way up is expected to do from where it is begun: run `seconds` s, and in `done` of its tries reach where it goes; the rest come to rest where `ends` say, by share (where it began, short of them). */
export interface Way {
  readonly seconds: number;
  readonly done: number;
  readonly ends: readonly { readonly at: string; readonly share: number }[];
}

/** An edge a way up takes the body by: from a posture to another (`TechniquePart.edges`). */
type Edge = TechniquePart["edges"][number];

/** **A way up's route**: the edges it takes the body by, and what it is expected to do from where each begins (`Way`): what a rise is priced over (`risePrices`). */
export interface Route {
  readonly edges: readonly Edge[];
  way(from: Position): Way;
}

/** `way` as `tried` moves it (`recorded`): its share done, and its failures in proportion, the unaccounted resting where it began, `from`. */
function recordedWay(way: Way, tried: Tried | undefined, from: Position): Way {
  if (!tried || tried.tries === 0) return way;
  const done = recorded(way.done, tried), failed = 1 - way.done;
  if (failed <= 0) return { ...way, done, ends: [{ at: from, share: 1 - done }] };
  return { ...way, done, ends: way.ends.map((end) => ({ at: end.at, share: end.share * (1 - done) / failed })) };
}

/**
 * **What a rise from each posture is priced at** over `routes` (`DownModel`): its expected seconds
 * to standing, the least, over the edges from it, of a try's seconds, then the rise on from where
 * it ends, in the share it reaches there and the shares its failures rest elsewhere, over the share
 * that does not rest where it began; found again until none falls, and again only as `record`
 * changes. None where no edge's route stands it.
 */
export function risePrices(routes: readonly Route[], record: OptionRecord): (posture: Position) => DownModel | null {
  const prices = new Map<Position, number>();
  let pricedFor: string | null = null;
  const price = (): ReadonlyMap<Position, number> => {
    const key = JSON.stringify(record.state.tried);
    if (pricedFor === key) return prices;
    pricedFor = key; prices.clear(); prices.set("standing", 0);
    const at = (posture: string): number => prices.get(posture as Position) ?? Infinity;
    for (let round = 0, fell = true; fell && round < 32; round++) {
      fell = false;
      for (const route of routes) for (const edge of route.edges) {
        const way = route.way(edge.from);
        let sum = way.seconds + way.done * at(edge.to), again = 0;
        for (const end of way.ends) if (end.at === edge.from || !Number.isFinite(at(end.at))) again += end.share; else sum += end.share * at(end.at);
        const seconds = again >= 1 - 1e-9 ? Infinity : sum / (1 - again);
        if (seconds < at(edge.from) - 1e-9) { prices.set(edge.from, seconds); fell = true; }
      }
    }
    return prices;
  };
  return (posture) => {
    const seconds = price().get(posture) ?? Infinity;
    return Number.isFinite(seconds) ? { seconds, stands: 1, shelter: 0 } : null;
  };
}

/**
 * Where a way up's failures most come to rest, as a rise's price counts them (`risePrices`): one
 * that comes to rest where no rise is priced counts as resting where it began, `from`, as does the
 * share no end names.
 */
function restOf(way: Way, from: Position, rise: (posture: Position) => DownModel | null): Position {
  const shares = new Map<Position, number>();
  for (const end of way.ends) {
    const at = rise(end.at as Position) ? end.at as Position : from;
    shares.set(at, (shares.get(at) ?? 0) + end.share);
  }
  let best: Position = from, share = 0;
  for (const [at, one] of shares) if (one > share) { share = one; best = at; }
  return best;
}

/**
 * **The route on through `way` from `from` to `to`** (`DownModel`): its seconds and, in its share
 * done, the rise's on from `to` (`Predictions.rise`), standing in that share, the rest down where
 * its failures come to rest (`restOf`); where no rise on from `to` is priced, the way alone,
 * leaving the body down there.
 */
function routeOf(now: Situation, way: Way, from: Position, to: Position): { readonly model: DownModel; readonly posture: Position } {
  const rise = now.predictions.rise, onward = rise(to);
  return onward ? { model: { seconds: way.seconds + way.done * onward.seconds, stands: way.done, shelter: 0 }, posture: restOf(way, from, rise) }
    : { model: { seconds: way.seconds, stands: 0, shelter: 0 }, posture: to };
}

/** Whether a way up may be begun on the body: not tumbling, or braced its while (`BRACED`, `Situation.tumbled`) since its rise began or its last try ended. */
const calm = (now: Situation, g: GroundReading): boolean => !tumbling(g) || now.tumbled >= BRACED;

/** The ground as the body's rise reads it: none where no rise runs. */
const risen = (now: Situation): GroundReading | null => now.rising ? now.sight.view.ground : null;

/** A ground option's memory: the action it asks (none until its first step), the side it asks it on, and where its try began (none where it keeps no record). */
interface Asking { id: number | null; side: Side; from: Position | null }

/** The action `memory` asks, as the skills last reported it; none before it is asked, or once it is gone. */
const liveOf = (now: Situation, memory: Asking) => memory.id === null ? undefined : now.sight.report.actions.find((action) => action.id === memory.id);

/** **A ground option's step**: the ground action `action` (`sideEffector`), asked on the side `memory` keeps, from the step it is first asked. */
function asks(now: Situation, memory: Asking, action: string): Step {
  memory.id ??= now.sight.instance();
  const asked = { move: null, face: now.sight.report.heading, actions: [{ id: memory.id, action, effector: sideEffector(memory.side), target: HERE }] };
  return { asked, holds: asking(now, asked) };
}

/**
 * **A try of the ground skill `part`** over the whole body (`WHOLE`), named as it: on offer where
 * the body's rise runs, its position read (`GroundReading.settled`) and calm unless its entry reads
 * motion (`calm`, `TechniquePart.moving`), an edge of `edges` from where it lies (raw where its
 * entry reads motion, as last settled else; `toward` says where it goes from there), on the side it
 * lies on first, then left, then right, where its skill admits it there (`Sight.readiness`). Begun,
 * it runs until its action ends, yielding while the action is prepared; its try noted in `record`
 * as it ends (`OptionRecord.note`), done where the action ended done. Priced as the route on
 * through it (`routeOf`), what it is expected to do from where it is begun (`way`).
 */
function attempt(part: TechniquePart, edges: readonly Edge[], toward: (from: Position, g: GroundReading) => Position | null,
  way: (from: Position) => Way, record: OptionRecord, extra: { readonly route?: Route; readonly priced?: Option["priced"] }): Option {
  const name = part.defaults.kind as string, memory: Asking = { id: null, side: "left", from: null };
  const UNOFFERED = blocked(`${name} does not admit the body as it lies`);
  const fromOf = (g: GroundReading): Position => part.moving && edges.some((edge) => edge.from === g.raw) ? g.raw : g.position;
  const sideOf = (now: Situation, g: GroundReading): Side | null => {
    for (const side of [g.side, "left", "right"] as const)
      if (side && part.sides.includes(side) && now.sight.readiness(now.sight.view, name, sideEffector(side), HERE, around(now.sight)).kind !== "blocked") return side;
    return null;
  };
  const note = (done: boolean): void => { if (memory.from !== null) record.note(name, memory.from, done); memory.from = null; };
  return {
    name, claims: WHOLE, state: memory, ...extra,
    entry(now) {
      // Begun, it runs on until it ends, however the body is read.
      if (memory.id !== null) return READY;
      const g = risen(now);
      if (!g) return UNOFFERED;
      return g.settled && (part.moving || calm(now, g)) && toward(fromOf(g), g) !== null && sideOf(now, g) !== null ? READY : UNOFFERED;
    },
    status(now): Status {
      // Begun, it is asked at its first step.
      if (memory.id === null) return "committed";
      const live = liveOf(now, memory);
      if (!live) { note(false); return "over"; }
      if (live.stage.startsWith("ended:")) { note(live.stage === "ended:done"); return "over"; }
      return live.phase === "prepare" ? "yields" : "committed";
    },
    model(now) {
      const g = now.sight.view.ground;
      if (!g) return downTerms({ seconds: WAY_PRIOR.seconds, stands: WAY_PRIOR.done, shelter: 0 })(now);
      const from = memory.from ?? fromOf(g), to = toward(from, g) ?? from;
      const route = routeOf(now, way(from), from, to);
      return downTerms(route.model, route.posture)(now);
    },
    begin(now) {
      memory.id = null;
      const g = now.sight.view.ground;
      memory.from = g ? fromOf(g) : null;
      memory.side = g ? sideOf(now, g) ?? "left" : "left";
    },
    end() { note(false); memory.id = null; },
    step: (now) => asks(now, memory, name),
  };
}

/** The share a way of `prior`, measured as `profile` where it is, is taken at from `from` (`recordedWay`) by `name`'s record. */
const wayBy = (name: string, prior: Prior, profile: Way | null, record: OptionRecord) => (from: Position): Way =>
  recordedWay(profile ?? { ...prior, ends: [] }, record.of(name, from), from);

/** A way up's `attempt` of `part` over `edges`, its route those edges (`Route`), priced by its profile on the body where one is measured (`edgeExpected`), by hand else (`WAY_PRIOR`). */
function wayUp(given: OptionsGiven, config: GroundConfig<string>, part: TechniquePart, edges: readonly Edge[]): Option {
  const { expected, priced } = edgeExpected(given.spec, config.technique, given.hz, given.delay, given.tables.edges);
  const way = wayBy(part.defaults.kind as string, WAY_PRIOR, expected, given.record), route: Route = { edges, way };
  return attempt(part, edges, (from) => edges.find((edge) => edge.from === from)?.to ?? null, way, given.record,
    { route, priced: () => expected ? "measured" : `by hand, ${priced}` });
}

/** **A kind of ground option's config**: its kind, and the technique it runs (`TechniquePart`): a way up, or a mode of the ground. */
export interface GroundConfig<K extends string> { readonly kind: K; readonly technique: PartConfig }

/**
 * A kind of ground option, `kind`, labelled `label`, running the technique its config names (a way
 * up where `wayUp`, else a mode of the ground; `technique` unless given), made by `make` where that
 * technique fits the body, none else.
 */
function groundKind<K extends string>(kind: K, label: string, technique: string, wayUp: boolean,
  make: (given: OptionsGiven, config: GroundConfig<K>, part: TechniquePart) => readonly Option[]): OptionKindPart<GroundConfig<K>> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [slotOne("technique", "Technique", "technique")],
    defaults: { kind, technique: { kind: technique } }, keys: { kind: true, technique: true } as KeysOf<GroundConfig<K>>, fits: anyBody,
    faults: (config: GroundConfig<K>, parts) => isWayUp(parts.of("technique", config.technique)) === wayUp ? [] : [`technique: ${wayUp ? "a way up" : "a mode of the ground"}`],
    make: (config: GroundConfig<K>, given: OptionsGiven) => {
      const part = given.parts.of("technique", config.technique);
      return part.fits(given.spec, config.technique, given.parts) === null ? make(given, config, part) : [];
    } });
}

/** **A way up** (`attempt`): its technique's edges, priced by its profile, else by hand. */
export const WAY_UP_OPTION = groundKind("way-up", "Way up", "staged-roll", true, (given, config, part) => [wayUp(given, config, part, part.edges)]);

/**
 * **A reposition**: a way up from a posture no route made before it begins from (`Option.route`),
 * as the game's Stand up repositions only where no way up stands the body: the body it leaves is not
 * one the ways up were made from.
 */
export const REPOSITION_OPTION = groundKind("reposition", "Reposition", "roll", true, (given, config, part) => {
  const routed = new Set(given.made.flatMap((option) => option.route ? option.route.edges.map((edge) => edge.from) : []));
  return [wayUp(given, config, part, part.edges.filter((edge) => !routed.has(edge.from)))];
});

/** **Flatten** (`attempt`): the body laid flat on the side it lies on, priced as a way up by hand to that lie. */
export const FLATTEN_OPTION = groundKind("flattening", "Flatten", "flatten", false, (given, _config, part) => {
  const way = wayBy(part.defaults.kind as string, WAY_PRIOR, null, given.record);
  return [attempt(part, [], (_from, g) => g.lie, way, given.record, {})];
});

/**
 * **The steady**, on its feet while its rise runs (`onFeet`), over the whole body, yielding: priced as
 * a way up from where it stands (`STEADY_PRIOR`), its try's seconds left (`Situation.steadied`); its
 * route from a crouch to standing. Its try is noted in the record as it ends: done where its rise is
 * over, not where its try ran out with the rise still on.
 */
export const STEADY_OPTION = groundKind("steadying", "Steady", "steady", false, (given, _config, part) => {
  const name = part.defaults.kind as string, record = given.record, way = wayBy(name, STEADY_PRIOR, null, record);
  const memory = { id: null as number | null, side: "left" as Side, from: null, steadied: 0 }, NOT_ON_FEET = blocked("not on its feet in a rise");
  const route: Route = { edges: [{ from: "crouch", to: "standing" }], way };
  return [{
    name: "steady", claims: WHOLE, state: memory, route,
    entry: (now) => { const g = risen(now); return g && onFeet(g) ? READY : NOT_ON_FEET; },
    status(now): Status {
      if (now.rising) return "yields";
      if (memory.id !== null) { record.note(name, now.posture, true); memory.id = null; }
      return "over";
    },
    model(now) {
      const g = now.sight.view.ground, from: Position = g?.position ?? "standing", expected = way(from);
      return downTerms({ seconds: Math.max(0, expected.seconds - now.steadied), stands: expected.done, shelter: 0 }, from)(now);
    },
    begin() { memory.id = null; memory.steadied = 0; },
    end() { memory.id = null; },
    step(now) {
      // Its try ran out with the rise still on: noted, and begun afresh.
      if (now.steadied < memory.steadied) record.note(name, now.posture, false);
      memory.steadied = now.steadied;
      return asks(now, memory, name);
    },
  }];
});

/** **Landing**: the command carried on while the body, in its rise and off its feet, lands calm, its position not yet read; priced as holding where it is a step. */
export const LAND_OPTION = groundKind("landing", "Land", "land", false, (given, _config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, side: "left" as Side, from: null }, NOT_LANDING = blocked("not landing");
  return [{
    name, claims: WHOLE, state: memory,
    entry: (now) => { const g = risen(now); return g && !onFeet(g) && !g.settled && calm(now, g) ? READY : NOT_LANDING; },
    status: () => "yields",
    model: (now) => downTerms({ seconds: 1 / given.hz, stands: 0, shelter: 0 }, now.sight.view.ground?.position ?? "between")(now),
    begin() { memory.id = null; }, end() { memory.id = null; },
    step: (now) => asks(now, memory, name),
  }];
});

/**
 * **Brace while tumbling**, in its rise off its feet and not calm (`calm`): a body on its feet is the
 * stance's to catch, and bracing it would fold the legs under it. Priced as holding where it is for
 * what is left of what a brace saves (`BRACED`).
 */
export const BRACE_TUMBLING_OPTION = groundKind("brace-tumbling", "Brace while tumbling", "brace", false, (given, _config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, side: "left" as Side, from: null }, NOT_TUMBLING = blocked("not tumbling unbraced");
  return [{
    name: "brace while tumbling", claims: WHOLE, state: memory,
    entry: (now) => { const g = risen(now); return g && !onFeet(g) && !calm(now, g) ? READY : NOT_TUMBLING; },
    status: () => "yields",
    model: (now) => downTerms({ seconds: Math.max(1 / given.hz, BRACED - now.tumbled), stands: 0, shelter: 0 }, now.sight.view.ground?.position ?? "between")(now),
    begin() { memory.id = null; }, end() { memory.id = null; },
    step: (now) => asks(now, memory, name),
  }];
});

/**
 * **Brace**, down (`brace`), a rest option: by the ground's brace where it fits the body, priced as
 * the rise from where the body lies (`Predictions.rise`), else from its back, else by hand
 * (`WAY_PRIOR`), with none of it standing.
 */
export const BRACE_OPTION: OptionKindPart<GroundConfig<"brace-down">> = deepFreeze({ ...groundKind("brace-down", "Brace", "brace", false, () => []),
  make: (config: GroundConfig<"brace-down">, given: OptionsGiven) => {
    const part = given.parts.of("technique", config.technique), by = part.fits(given.spec, config.technique, given.parts) === null
      ? { action: part.defaults.kind as string, effector: sideEffector("left") } : null;
    const lying = (now: Situation): DownModel => {
      const g = now.sight.view.ground, rise = now.predictions.rise;
      return (g ? rise(g.position) : null) ?? rise("back") ?? { seconds: WAY_PRIOR.seconds, stands: WAY_PRIOR.done, shelter: 0 };
    };
    return [brace(lying, by)];
  } });

/** The way-up options of `techniques`, each a way up of its own (`WAY_UP_OPTION`). */
const waysUp = (kind: "way-up" | "reposition", techniques: readonly PartConfig[]): readonly PartConfig[] => techniques.map((technique) => ({ kind, technique }));

/**
 * **The rise**, as options in rank order: brace while tumbling, the steady, a way up of each of the
 * game's Stand up's techniques (`STAND_UP`), a reposition by each of its repositions
 * (`REPOSITION`), flatten and landing.
 */
export const RISE_OPTIONS: readonly PartConfig[] = deepFreeze([BRACE_TUMBLING_OPTION.defaults, STEADY_OPTION.defaults, ...waysUp("way-up", STAND_UP),
  ...waysUp("reposition", REPOSITION), FLATTEN_OPTION.defaults, LAND_OPTION.defaults]);

/** Whether `option` is a way up (`WAY_UP_OPTION`). */
const wayUpOf = (option: PartConfig): option is GroundConfig<"way-up"> => option.kind === WAY_UP_OPTION.defaults.kind;

/** **The techniques the ways up of `options` run** (`WAY_UP_OPTION`), in rank order. */
export const waysUpIn = (options: readonly PartConfig[]): readonly PartConfig[] => options.flatMap((option) => wayUpOf(option) ? [option.technique] : []);

/**
 * **`options` rising by `techniques`**: its ways up (`WAY_UP_OPTION`) replaced by a way up of each,
 * where its first stood, and none of its repositions (`REPOSITION_OPTION`) by one of them, a
 * technique being a way up or a reposition, not both.
 */
export function withWaysUp(options: readonly PartConfig[], techniques: readonly PartConfig[]): readonly PartConfig[] {
  const kinds = new Set(techniques.map((technique) => technique.kind)), first = options.findIndex(wayUpOf);
  return options.flatMap((option, i) => i === first ? waysUp("way-up", techniques)
    : wayUpOf(option) || option.kind === REPOSITION_OPTION.defaults.kind && kinds.has((option as GroundConfig<string>).technique.kind) ? [] : [option]);
}
