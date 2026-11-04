import type { TargetRef } from "../skills/framework/action.ts";
import type { BodySpec, Side } from "../spec/body.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { deepFreeze } from "../state.ts";
import { sideEffectors } from "../recovery/ground/skills.ts";
import { tumbling, type GroundReading, type Position } from "../control/ground-reading.ts";
import { isWayUp, type TechniquePart } from "../recovery/ground/technique.ts";
import { REPOSITION, STAND_UP } from "../recovery/ground/stand-up.ts";
import { edgeExpected } from "../skills/framework/profile.ts";
import { anyBody, slotSkill, type KeysOf, type PartConfig } from "../parts/parts.ts";
import { WHOLE, type Status } from "../mind/choice.ts";
import { downTerms } from "./down.ts";
import { brace } from "./rest.ts";
import { asking, blocked, READY, type Option, type Situation, type Step } from "./option.ts";
import { around } from "./strike.ts";
import { onFeet, STEADY_TRY } from "./rise-memory.ts";
import { recorded, type OptionRecord, type Prior, type Tried } from "./record.ts";
import { STILL, UNMOVED, type Outcome } from "./value.ts";
import type { NamedSkills, OptionKindPart, OptionsGiven } from "./kinds.ts";

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

/** `way` as `tried` moves it (`recorded`): its share done, and its failures in proportion, the unaccounted resting where it began, `from`. */
function recordedWay(way: Way, tried: Tried | undefined, from: Position): Way {
  if (!tried || tried.tries === 0) return way;
  const done = recorded(way.done, tried), failed = 1 - way.done;
  if (failed <= 0) return { ...way, done, ends: [{ at: from, share: 1 - done }] };
  return { ...way, done, ends: way.ends.map((end) => ({ at: end.at, share: end.share * (1 - done) / failed })) };
}

/**
 * **Where a try of `way` from `from` leaves the body**, each lying in a posture or standing, still:
 * where it goes, `to`, in the share it is done; where those not done came to rest (`Way.ends`), each
 * in its share; and where it began in the share no end names. Shares that sum past the whole are
 * read in proportion.
 */
function endings(way: Way, from: Position, to: Position): readonly Outcome[] {
  const shares = new Map<Position, number>([[to, way.done]]);
  let total = way.done;
  for (const end of way.ends) { const at = end.at as Position; shares.set(at, (shares.get(at) ?? 0) + end.share); total += end.share; }
  if (total < 1) shares.set(from, (shares.get(from) ?? 0) + 1 - total);
  const whole = Math.max(1, total), outcomes: Outcome[] = [];
  for (const [posture, share] of shares) if (share > 0) outcomes.push({ leaves: { posture, velocity: STILL }, chance: share / whole });
  return outcomes;
}

/** Whether a way up may be begun on the body: not tumbling, or braced its while (`BRACED`, `Situation.tumbled`) since its rise began or its last try ended. */
const calm = (now: Situation, g: GroundReading): boolean => !tumbling(g) || now.tumbled >= BRACED;


/** A ground option's memory: the action it asks (none until its first step), the side it asks it on, and where its try began (none where it keeps no record). */
interface Asking { id: number | null; side: Side; from: Position | null }

/** The action `memory` asks, as the skills last reported it; none before it is asked, or once it is gone. */
const liveOf = (now: Situation, memory: Asking) => memory.id === null ? undefined : now.sight.report.actions.find((action) => action.id === memory.id);

/** **A ground option's step**: the ground action `action`, asked on the side `memory` keeps (its effector of `sides`, `sideEffectors`), from the step it is first asked. */
function asks(now: Situation, memory: Asking, action: string, sides: Readonly<Record<Side, string>>): Step {
  memory.id ??= now.sight.instance();
  const asked = { move: null, face: now.sight.report.heading, actions: [{ id: memory.id, action, effector: sides[memory.side], target: HERE }] };
  return { asked, holds: asking(now, asked) };
}

/**
 * **A try of the ground skill `part`** over the whole body (`WHOLE`), named as it: on offer where
 * the body's rise runs (`Situation.ground`), its position read (`GroundReading.settled`) and calm
 * unless its entry reads motion (`calm`, `TechniquePart.moving`), an edge of `edges` from where it
 * lies (raw where its entry reads motion, as last settled else; `toward` says where it goes from
 * there), on the side it lies on first, then left, then right, where its skill admits it there
 * (`Sight.readiness`). Begun, it runs until its action ends, yielding while the action is
 * prepared; its try noted in `record` as it ends (`OptionRecord.note`), done where the action ended
 * done. Priced as what it is expected to do from where it is begun (`way`): its seconds down
 * (`downTerms`), ending where it goes in the share done and where its failures come to rest
 * (`endings`). At a state an Option leaves the body in, where no ground is read, it is on offer
 * lying in a posture `toward` goes from.
 */
function attempt(given: OptionsGiven, part: TechniquePart, edges: readonly Edge[], toward: (from: Position, g: GroundReading | null) => Position | null,
  way: (from: Position) => Way, extra: { readonly priced?: Option["priced"] }): Option {
  const name = part.defaults.kind as string, memory: Asking = { id: null, side: "left", from: null }, record = given.record, sides = sideEffectors(given.spec);
  const UNOFFERED = blocked(`${name} does not admit the body as it lies`);
  const fromOf = (g: GroundReading): Position => part.moving && edges.some((edge) => edge.from === g.raw) ? g.raw : g.position;
  const sideOf = (now: Situation, g: GroundReading): Side | null => {
    for (const side of [g.side, "left", "right"] as const)
      if (side && part.sides.includes(side) && now.sight.readiness(now.sight.view, name, sides[side], HERE, around(now.sight)).kind !== "blocked") return side;
    return null;
  };
  const note = (done: boolean): void => { if (memory.from !== null) record.note(name, memory.from, done); memory.from = null; };
  return {
    name, claims: WHOLE, state: memory, ...extra,
    entry(now) {
      // Begun, it runs on until it ends, however the body is read.
      if (memory.id !== null) return READY;
      const g = now.ground;
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
    model(at) {
      const g = at.ground, from = g ? memory.from ?? fromOf(g) : at.down ? at.posture : null, to = from === null ? null : toward(from, g);
      if (from === null || to === null) return null;
      const expected = way(from);
      return downTerms(at, expected.seconds, endings(expected, from, to));
    },
    begin(now) {
      memory.id = null;
      const g = now.sight.view.ground;
      memory.from = g ? fromOf(g) : null;
      memory.side = g ? sideOf(now, g) ?? "left" : "left";
    },
    end() { note(false); memory.id = null; },
    step: (now) => asks(now, memory, name, sides),
  };
}

/** The share a way of `prior`, measured as `profile` where it is, is taken at from `from` (`recordedWay`) by `name`'s record. */
const wayBy = (name: string, prior: Prior, profile: Way | null, record: OptionRecord) => (from: Position): Way =>
  recordedWay(profile ?? { ...prior, ends: [] }, record.of(name, from), from);

/** A way up's `attempt` of `part` over `edges`, priced by its profile on the body where one is measured (`edgeExpected`), by hand else (`WAY_PRIOR`). */
function wayUp(given: OptionsGiven, config: GroundConfig<string>, part: TechniquePart, edges: readonly Edge[]): Option {
  const { expected, priced } = edgeExpected(given.spec, config.skill, given.hz, given.delay, given.tables.edges);
  const way = wayBy(part.defaults.kind as string, WAY_PRIOR, expected, given.record);
  return attempt(given, part, edges, (from) => edges.find((edge) => edge.from === from)?.to ?? null, way,
    { priced: () => expected ? "measured" : `by hand, ${priced}` });
}

/** **A kind of ground option's config**: its kind, and the technique it runs (`skill`, a `TechniquePart`): a way up, or a mode of the ground. */
export interface GroundConfig<K extends string> { readonly kind: K; readonly skill: PartConfig }

/** Whether the technique `config` names fits a body of `spec`. */
const fitting = (config: GroundConfig<string>, spec: BodySpec, parts: PartLookup): boolean => parts.of("technique", config.skill).fits(spec, config.skill, parts) === null;

/**
 * A kind of ground option, `kind`, labelled `label`, running the technique its config names (a way
 * up where `wayUp`, else a mode of the ground; `technique` unless given), made by `make` where that
 * technique fits the body, none else.
 */
function groundKind<K extends string>(kind: K, label: string, technique: string, wayUp: boolean,
  make: (given: OptionsGiven, config: GroundConfig<K>, part: TechniquePart) => readonly Option[]): OptionKindPart<GroundConfig<K>> {
  return deepFreeze({ role: "option", label, stage: "game", fields: [], slots: [slotSkill("skill", "Technique", "technique")],
    defaults: { kind, skill: { kind: technique } }, keys: { kind: true, skill: true } as KeysOf<GroundConfig<K>>, fits: anyBody,
    faults: (config: GroundConfig<K>, parts: PartLookup) => isWayUp(parts.of("technique", config.skill)) === wayUp ? [] : [`skill: ${wayUp ? "a way up" : "a mode of the ground"}`],
    skills: (config: GroundConfig<K>, spec: BodySpec, parts: PartLookup): NamedSkills | null => fitting(config, spec, parts) ? { technique: config.skill } : null,
    make: (config: GroundConfig<K>, given: OptionsGiven) => fitting(config, given.spec, given.parts) ? make(given, config, given.parts.of("technique", config.skill)) : [] });
}

/** **A way up** (`attempt`): its technique's edges, priced by its profile, else by hand. */
export const WAY_UP_OPTION = groundKind("way-up", "Way up", "staged-roll", true, (given, config, part) => [wayUp(given, config, part, part.edges)]);

/**
 * **A reposition**: a way up from a posture none of its mind's ways up (`WAY_UP_OPTION`) that fit
 * the body begins from, as the game's Stand up repositions only where no way up stands the body:
 * the body it leaves is not one the ways up were made from.
 */
export const REPOSITION_OPTION = groundKind("reposition", "Reposition", "roll", true, (given, config, part) => {
  const begun = new Set(waysUpIn(given.options).flatMap((skill) => {
    const way = given.parts.of("technique", skill);
    return way.fits(given.spec, skill, given.parts) === null ? way.edges.map((edge) => edge.from) : [];
  }));
  return [wayUp(given, config, part, part.edges.filter((edge) => !begun.has(edge.from)))];
});

/** **Flatten** (`attempt`): the body laid flat on the side it lies on, priced as a way up by hand to that lie. */
export const FLATTEN_OPTION = groundKind("flattening", "Flatten", "flatten", false, (given, _config, part) => {
  const way = wayBy(part.defaults.kind as string, WAY_PRIOR, null, given.record);
  return [attempt(given, part, [], (_from, g) => g?.lie ?? null, way, {})];
});

/**
 * **The steady**, on its feet while its rise runs (`onFeet`), over the whole body, yielding: priced as
 * a way up from where it stands to standing (`STEADY_PRIOR`), its try's seconds left
 * (`Situation.steadied`); its route from a crouch to standing. Its try is noted in the record as it
 * ends: done where its rise is over, not where its try ran out with the rise still on.
 */
export const STEADY_OPTION = groundKind("steadying", "Steady", "steady", false, (given, _config, part) => {
  const name = part.defaults.kind as string, record = given.record, way = wayBy(name, STEADY_PRIOR, null, record);
  const memory = { id: null as number | null, side: "left" as Side, from: null, steadied: 0 }, sides = sideEffectors(given.spec), NOT_ON_FEET = blocked("not on its feet in a rise");
  return [{
    name: "steady", claims: WHOLE, state: memory,
    entry: (now) => { const g = now.ground; return g && onFeet(g) ? READY : NOT_ON_FEET; },
    status(now): Status {
      if (now.rising) return "yields";
      if (memory.id !== null) { record.note(name, now.posture, true); memory.id = null; }
      return "over";
    },
    model(at) {
      const g = at.ground;
      if (!g || !onFeet(g)) return null;
      const expected = way(g.position);
      return downTerms(at, Math.max(0, expected.seconds - at.steadied), endings(expected, g.position, "standing"));
    },
    begin() { memory.id = null; memory.steadied = 0; },
    end() { memory.id = null; },
    step(now) {
      // Its try ran out with the rise still on: noted, and begun afresh.
      if (now.steadied < memory.steadied) record.note(name, now.posture, false);
      memory.steadied = now.steadied;
      return asks(now, memory, name, sides);
    },
  }];
});

/** **Landing**: the command carried on while the body, in its rise and off its feet, lands calm, its position not yet read; priced as lying where it is a step. */
export const LAND_OPTION = groundKind("landing", "Land", "land", false, (given, _config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, side: "left" as Side, from: null }, sides = sideEffectors(given.spec), NOT_LANDING = blocked("not landing");
  return [{
    name, claims: WHOLE, state: memory,
    entry: (now) => { const g = now.ground; return g && !onFeet(g) && !g.settled && calm(now, g) ? READY : NOT_LANDING; },
    status: () => "yields",
    model: (at) => at.ground ? downTerms(at, 1 / given.hz, UNMOVED) : null,
    begin() { memory.id = null; }, end() { memory.id = null; },
    step: (now) => asks(now, memory, name, sides),
  }];
});

/**
 * **Brace while tumbling**, in its rise off its feet and not calm (`calm`): a body on its feet is the
 * stance's to catch, and bracing it would fold the legs under it. Priced as lying where it is for
 * what is left of what a brace saves (`BRACED`).
 */
export const BRACE_TUMBLING_OPTION = groundKind("brace-tumbling", "Brace while tumbling", "brace", false, (given, _config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, side: "left" as Side, from: null }, sides = sideEffectors(given.spec), NOT_TUMBLING = blocked("not tumbling unbraced");
  return [{
    name: "brace while tumbling", claims: WHOLE, state: memory,
    entry: (now) => { const g = now.ground; return g && !onFeet(g) && !calm(now, g) ? READY : NOT_TUMBLING; },
    status: () => "yields",
    model: (at) => at.ground ? downTerms(at, Math.max(1 / given.hz, BRACED - at.tumbled), UNMOVED) : null,
    begin() { memory.id = null; }, end() { memory.id = null; },
    step: (now) => asks(now, memory, name, sides),
  }];
});

/** **Brace**, down (`brace`), a rest option: by the ground's brace where it fits the body, priced as lying where it lies; on offer on every body. */
export const BRACE_OPTION: OptionKindPart<GroundConfig<"brace-down">> = deepFreeze({ ...groundKind("brace-down", "Brace", "brace", false, () => []),
  skills: (config: GroundConfig<"brace-down">, spec: BodySpec, parts: PartLookup): NamedSkills => fitting(config, spec, parts) ? { technique: config.skill } : {},
  make: (config: GroundConfig<"brace-down">, given: OptionsGiven) =>
    [brace(fitting(config, given.spec, given.parts) ? { action: config.skill.kind, effector: sideEffectors(given.spec).left } : null)] });

/** **The righting**: the ways up a body on its paws rights itself by, its recipe where it has one, then its routes (`src/core/reptile/righting.ts`). */
const RIGHTING: readonly PartConfig[] = deepFreeze([{ kind: "righting-recipe" }, { kind: "righting-routes" }]);

/** The way-up options of `techniques`, each a way up of its own (`WAY_UP_OPTION`). */
const waysUp = (kind: "way-up" | "reposition", techniques: readonly PartConfig[]): readonly PartConfig[] => techniques.map((skill) => ({ kind, skill }));

/**
 * **The rise**, as options in rank order: brace while tumbling, the steady, a way up of each of the
 * game's Stand up's techniques (`STAND_UP`) and of the righting's (`RIGHTING`), a reposition by
 * each of its repositions (`REPOSITION`), flatten and landing.
 */
export const RISE_OPTIONS: readonly PartConfig[] = deepFreeze([BRACE_TUMBLING_OPTION.defaults, STEADY_OPTION.defaults, ...waysUp("way-up", [...STAND_UP, ...RIGHTING]),
  ...waysUp("reposition", REPOSITION), FLATTEN_OPTION.defaults, LAND_OPTION.defaults]);

/** Whether `option` is a way up (`WAY_UP_OPTION`). */
const wayUpOf = (option: PartConfig): option is GroundConfig<"way-up"> => option.kind === WAY_UP_OPTION.defaults.kind;

/** **The techniques the ways up of `options` run** (`WAY_UP_OPTION`), in rank order. */
export const waysUpIn = (options: readonly PartConfig[]): readonly PartConfig[] => options.flatMap((option) => wayUpOf(option) ? [option.skill] : []);

/**
 * **`options` rising by `techniques`**: its ways up (`WAY_UP_OPTION`) replaced by a way up of each,
 * where its first stood, and none of its repositions (`REPOSITION_OPTION`) by one of them, a
 * technique being a way up or a reposition, not both.
 */
export function withWaysUp(options: readonly PartConfig[], techniques: readonly PartConfig[]): readonly PartConfig[] {
  const kinds = new Set(techniques.map((technique) => technique.kind)), first = options.findIndex(wayUpOf);
  return options.flatMap((option, i) => i === first ? waysUp("way-up", techniques)
    : wayUpOf(option) || option.kind === REPOSITION_OPTION.defaults.kind && kinds.has((option as GroundConfig<string>).skill.kind) ? [] : [option]);
}
