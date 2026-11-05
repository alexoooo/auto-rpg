import type { TargetRef } from "../../skills/framework/action.ts";
import type { BodySpec } from "../../core/bodies/spec/body.ts";
import type { PartLookup } from "../../parts/lookup.ts";
import { deepFreeze } from "../../core/world/state.ts";
import { tumbling, type GroundReading, type Position } from "../../control/ground-reading.ts";
import { isWayUp, type TechniquePart } from "../../skills/recovery/technique.ts";
import { edgeExpected } from "../../skills/recovery/data/profiles.ts";
import { anyBody, slotSkill, type KeysOf, type PartConfig } from "../../parts/parts.ts";
import { WHOLE, type Status } from "../choice.ts";
import { downTerms } from "./down.ts";
import { brace } from "./rest.ts";
import { asking, blocked, READY, type Option, type Situation, type Step } from "./option.ts";
import { around } from "./strike.ts";
import { onFeet, STEADY_TRY } from "./rise-memory.ts";
import { recorded, type Prior, type Tried } from "./record.ts";
import { STILL, UNMOVED, type Outcome } from "./value.ts";
import type { NamedSkills } from "./skills.ts";
import { isProfileOption, type ProfileOptionPart } from "./kinds.ts";
import { PROFILE_MODEL, type ProfileOptionContext } from "./profile-contract.ts";

/** The selected technique owns the physical binding for each opaque beginning token. */
function bindingSegments(part: TechniquePart, spec: BodySpec, config: PartConfig): (start: string) => string {
  const bindings = part.bindings(spec, config);
  return start => {
    const binding = bindings.find(binding => binding.start === start);
    if (!binding) throw new Error(`${config.kind} declares no body binding`);
    return binding.segment;
  };
}

/** What a way up is taken to do where no drill measured it (`Prior`), set by hand: it runs 5 s and stands the body seven times in ten. */
const WAY_PRIOR: Prior = deepFreeze({ seconds: 5, done: .7 });

/** What the steady is taken to do, set by hand: it stands a body on its feet ready in its try (`STEADY_TRY`) nine times in ten. */
const STEADY_PRIOR: Prior = deepFreeze({ seconds: STEADY_TRY, done: .9 });

/** What bracing a body until a way up admits it is taken to do where none was measured, set by hand: a quarter second, after which one does. */
const SETTLE_PRIOR: Prior = deepFreeze({ seconds: .25, done: 1 });

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
interface Asking { id: number | null; start: string; from: Position | null }

/** The action `memory` asks, as the skills last reported it; none before it is asked, or once it is gone. */
const liveOf = (now: Situation, memory: Asking) => memory.id === null ? undefined : now.sight.report.actions.find((action) => action.id === memory.id);

/** **A ground option's step**: the ground action `action`, asked on the side `memory` keeps (its effector of `sides`, `sideEffectors`), from the step it is first asked. */
function asks(now: Situation, memory: Asking, action: string, sides: (start: string) => string): Step {
  memory.id ??= now.sight.instance();
  const asked = { move: null, face: now.sight.report.heading, actions: [{ id: memory.id, action, effector: sides(memory.start), target: HERE }] };
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
function attempt(given: ProfileOptionContext, part: TechniquePart, skill: PartConfig, edges: readonly Edge[], toward: (from: Position, g: GroundReading | null) => Position | null,
  way: (from: Position) => Way, extra: { readonly priced?: Option["priced"] }): Option {
  const name = part.defaults.kind as string, memory: Asking = { id: null, start: part.starts[0]!, from: null }, record = given.record, sides = bindingSegments(part, given.spec, skill);
  const UNOFFERED = blocked(`${name} does not admit the body as it lies`);
  const fromOf = (g: GroundReading): Position => part.moving && edges.some((edge) => edge.from === g.raw) ? g.raw : g.position;
  const beginningOf = (now: Situation, g: GroundReading): string | null => {
    for (const start of [g.side, ...part.starts])
      if (start && part.starts.includes(start) && now.sight.readiness(now.sight.view, name, sides(start), HERE, around(now.sight)).kind !== "blocked") return start;
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
      return g.settled && (part.moving || calm(now, g)) && toward(fromOf(g), g) !== null && beginningOf(now, g) !== null ? READY : UNOFFERED;
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
      memory.start = g ? beginningOf(now, g) ?? part.starts[0]! : part.starts[0]!;
    },
    end() { note(false); memory.id = null; },
    step: (now) => asks(now, memory, name, sides),
  };
}

/**
 * **What the ground technique `skill`, run as Option `name`, is expected to do from where it is
 * begun** (`way`): its profile on the body from there where one is measured (`edgeExpected`), else
 * `prior`, either moved by the record of its tries (`recordedWay`); and how it is priced from where
 * the body lies now (`priced`).
 */
function groundWay(given: ProfileOptionContext, skill: PartConfig, name: string, prior: Prior): { readonly way: (from: Position) => Way; readonly priced: (now: Situation) => string } {
  const { expected, priced } = edgeExpected(given.parts, given.spec, skill, given.hz, given.delay, given.tables.edges);
  const measured = (from: Position): Way | null => expected?.(from) ?? null;
  return {
    way: (from) => recordedWay(measured(from) ?? { ...prior, ends: [] }, given.record.of(name, from), from),
    priced: (now) => {
      const from = now.ground?.position ?? now.posture;
      return measured(from) ? "measured" : `by hand, ${expected ? `no trial begun from ${from}` : priced}`;
    },
  };
}

/** A way up's `attempt` of `part` over `edges`, priced by its profile on the body where one is measured, by hand else (`groundWay`, `WAY_PRIOR`). */
function wayUp(given: ProfileOptionContext, config: GroundConfig<string>, part: TechniquePart, edges: readonly Edge[]): Option {
  const { way, priced } = groundWay(given, config.skill, part.defaults.kind as string, WAY_PRIOR);
  return attempt(given, part, config.skill, edges, (from) => edges.find((edge) => edge.from === from)?.to ?? null, way, { priced });
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
function groundKind<K extends string>(kind: K, label: string, technique: string, routing: { readonly purpose: "ascent" | "fallback" } | null,
  make: (given: ProfileOptionContext, config: GroundConfig<K>, part: TechniquePart) => readonly Option[]): ProfileOptionPart<GroundConfig<K>> {
  const wayUp = routing !== null;
  return deepFreeze({ role: "option", model: PROFILE_MODEL, label, stage: "game", ...(routing ? { recovery: { purpose: routing.purpose, technique: (config: GroundConfig<K>) => config.skill } } : {}), fields: [], slots: [slotSkill("skill", "Technique", "technique")],
    defaults: { kind, skill: { kind: technique } }, keys: { kind: true, skill: true } as KeysOf<GroundConfig<K>>, fits: anyBody,
    faults: (config: GroundConfig<K>, parts: PartLookup) => isWayUp(parts.of("technique", config.skill)) === wayUp ? [] : [`skill: ${wayUp ? "a way up" : "a mode of the ground"}`],
    skills: (config: GroundConfig<K>, spec: BodySpec, parts: PartLookup): NamedSkills | null => fitting(config, spec, parts) ? { technique: config.skill } : null,
    make: (config: GroundConfig<K>, given: ProfileOptionContext) => fitting(config, given.spec, given.parts) ? make(given, config, given.parts.of("technique", config.skill)) : [] });
}

/** **A way up** (`attempt`): its technique's edges, priced by its profile, else by hand. */
export const WAY_UP_OPTION = groundKind("way-up", "Way up", "staged-roll", { purpose: "ascent" }, (given, config, part) => [wayUp(given, config, part, part.edges)]);

/**
 * **A reposition**: a way up from a posture none of its mind's ways up (`WAY_UP_OPTION`) that fit
 * the body begins from, as the game's Stand up repositions only where no way up stands the body:
 * the body it leaves is not one the ways up were made from.
 */
export const REPOSITION_OPTION = groundKind("reposition", "Reposition", "roll", { purpose: "fallback" }, (given, config, part) => {
  const begun = new Set(waysUpIn(given.parts, given.spec, given.options).flatMap((skill) => {
    const way = given.parts.of("technique", skill);
    return way.fits(given.spec, skill, given.parts) === null ? way.edges.map((edge) => edge.from) : [];
  }));
  return [wayUp(given, config, part, part.edges.filter((edge) => !begun.has(edge.from)))];
});

/** **Flatten** (`attempt`): the body laid flat on the side it lies on, priced as a way up to that lie: by its profile where one is measured, by hand else (`groundWay`, `WAY_PRIOR`). */
export const FLATTEN_OPTION = groundKind("flattening", "Flatten", "flatten", null, (given, config, part) => {
  const { way, priced } = groundWay(given, config.skill, part.defaults.kind as string, WAY_PRIOR);
  return [attempt(given, part, config.skill, [], (_from, g) => g?.lie ?? null, way, { priced })];
});

/**
 * **The steady**, on its feet while its rise runs (`onFeet`), over the whole body, yielding: priced as
 * a way up from where it stands to standing, by its profile where one is measured, by hand else
 * (`groundWay`, `STEADY_PRIOR`), its try's seconds left (`Situation.steadied`); its route from a
 * crouch to standing. Its try is noted in the record as it ends: done where its rise is over, not
 * where its try ran out with the rise still on.
 */
export const STEADY_OPTION = groundKind("steadying", "Steady", "steady", null, (given, config, part) => {
  const name = part.defaults.kind as string, record = given.record, { way, priced } = groundWay(given, config.skill, name, STEADY_PRIOR);
  const memory = { id: null as number | null, start: part.starts[0]!,  from: null, steadied: 0 }, sides = bindingSegments(part, given.spec, config.skill), NOT_ON_FEET = blocked("not on its feet in a rise");
  return [{
    name: "steady", claims: WHOLE, state: memory, priced,
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
export const LAND_OPTION = groundKind("landing", "Land", "land", null, (given, config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, start: part.starts[0]!,  from: null }, sides = bindingSegments(part, given.spec, config.skill), NOT_LANDING = blocked("not landing");
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
 * **Brace while tumbling**, in its rise off its feet and moving: not calm (`calm`), or lying, its
 * position read, where one of its mind's ways up (`waysUpIn`) begins but none admits the body yet
 * (`Sight.readiness`: too fast for it). A body on its feet is the stance's to catch, and bracing it
 * would fold the legs under it. Priced as lying where it is: tumbling, for what is left of what a
 * brace saves (`BRACED`); else until a way up admits it, where the body is then, by its profile from
 * where it lies where one is measured, by hand else (`groundWay`, `SETTLE_PRIOR`).
 */
export const BRACE_TUMBLING_OPTION = groundKind("brace-tumbling", "Brace while tumbling", "brace", null, (given, config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, start: part.starts[0]!,  from: null }, sides = bindingSegments(part, given.spec, config.skill), NOT_MOVING = blocked("not moving unbraced");
  const ways = waysUpIn(given.parts, given.spec, given.options).flatMap((skill) => {
    const way = given.parts.of("technique", skill);
    return way.fits(given.spec, skill, given.parts) === null ? [{ part: way, config: skill }] : [];
  });
  const { way: settling, priced } = groundWay(given, config.skill, "brace while tumbling", SETTLE_PRIOR);
  /** Whether `g` lies where one of the ways up begins and none admits the body on any of its sides. */
  const unready = (now: Situation, g: GroundReading): boolean => {
    let begins = false;
    for (const { part: way, config } of ways) {
      if (!way.edges.some((edge) => edge.from === g.position || edge.from === g.raw)) continue;
      begins = true;
      for (const binding of way.bindings(given.spec, config))
        if (now.sight.readiness(now.sight.view, config.kind, binding.segment, HERE, around(now.sight)).kind !== "blocked") return false;
    }
    return begins;
  };
  return [{
    name: "brace while tumbling", claims: WHOLE, state: memory, priced,
    entry: (now) => { const g = now.ground; return g && !onFeet(g) && (!calm(now, g) || g.settled && unready(now, g)) ? READY : NOT_MOVING; },
    status: () => "yields",
    model(at) {
      const g = at.ground;
      if (!g) return null;
      if (!calm(at, g)) return downTerms(at, Math.max(1 / given.hz, BRACED - at.tumbled), UNMOVED);
      const expected = settling(g.position);
      return downTerms(at, expected.seconds, endings(expected, g.position, g.position));
    },
    begin() { memory.id = null; }, end() { memory.id = null; },
    step: (now) => asks(now, memory, name, sides),
  }];
});

/** **Brace**, down (`brace`), a rest option: by the ground's brace where it fits the body, priced as lying where it lies; on offer on every body. */
export const BRACE_OPTION: ProfileOptionPart<GroundConfig<"brace-down">> = deepFreeze({ ...groundKind("brace-down", "Brace", "brace", null, () => []),
  skills: (config: GroundConfig<"brace-down">, spec: BodySpec, parts: PartLookup): NamedSkills => fitting(config, spec, parts) ? { technique: config.skill } : {},
  make: (config: GroundConfig<"brace-down">, given: ProfileOptionContext) =>
    [brace(fitting(config, given.spec, given.parts) ? { action: config.skill.kind, effector: bindingSegments(given.parts.of("technique", config.skill), given.spec, config.skill)(given.parts.of("technique", config.skill).starts[0]!) } : null)] });

/** The way-up options of `techniques`, each a way up of its own (`WAY_UP_OPTION`). */
const waysUp = (kind: "way-up" | "reposition", techniques: readonly PartConfig[]): readonly PartConfig[] => techniques.map((skill) => ({ kind, skill }));

/** The selected profile Option's declared recovery purpose and configured technique. */
function recoveryOf(parts: PartLookup, option: PartConfig) {
  const part = parts.of("option", option);
  return isProfileOption(part) && part.recovery ? { purpose: part.recovery.purpose, technique: part.recovery.technique(option) } : null;
}

/** The applicable techniques of declared ordinary ascent choices, in configured order. */
export const waysUpIn = (parts: PartLookup, spec: BodySpec, options: readonly PartConfig[]): readonly PartConfig[] => options.flatMap(option => {
  if (recoveryOf(parts, option)?.purpose !== "ascent") return [];
  const technique = parts.of("option", option).skills?.(option, spec, parts, options)?.technique;
  return technique && isWayUp(parts.of("technique", technique)) ? [technique] : [];
});

/** Replace declared ascent choices, excluding fallback transitions whose technique is now an ascent. */
export function withWaysUp(parts: PartLookup, options: readonly PartConfig[], techniques: readonly PartConfig[]): readonly PartConfig[] {
  const kinds = new Set(techniques.map((technique) => technique.kind)), declared = options.map(option => recoveryOf(parts, option));
  const first = declared.findIndex(one => one?.purpose === "ascent");
  return options.flatMap((option, i) => i === first ? waysUp("way-up", techniques)
    : declared[i]?.purpose === "ascent" || declared[i]?.purpose === "fallback" && kinds.has(declared[i]!.technique.kind) ? [] : [option]);
}
