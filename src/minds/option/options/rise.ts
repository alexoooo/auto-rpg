import { refused, type TargetRef } from "../../../skills/framework/action.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import type { ConfigFor, PartLookup } from "../../../parts/lookup.ts";
import { deepFreeze } from "../../../core/state.ts";
import { BRACED, standIn } from "../predictions/by-hand.ts";
import { byHand, given, notPriced, type Source } from "../../../skills/framework/profile/source.ts";
import { tumbling, type GroundReading, type Position } from "../../../control/ground-reading.ts";
import { isWayUp, type TechniqueName, type TechniquePart } from "../../../skills/recovery/shared/technique.ts";
import { edgeExpected } from "../../../skills/recovery/data/profiles.ts";
import { anyBody, slotSkill, type KeysOf, type PartConfig } from "../../../parts/parts.ts";
import { WHOLE, asking, blocked, READY } from "./readiness.ts";
import type { Status, Option, Step } from "../contract/option.ts";
import { brace } from "./rest.ts";
import type { Situation } from "../contract/situation.ts";
import { onFeet } from "../situation/rise-memory.ts";
import type { OptionContext, Tried } from "../contract/context.ts";
import { recorded } from "../situation/record.ts";
import type { GuessedWay } from "../contract/predictors.ts";
import { NO_BLOW, STAYS, STILL, UNMOVED } from "./outcomes.ts";
import type { Outcome, Terms, TermSources } from "../contract/terms.ts";
import type { NamedSkills, OptionPart } from "../contract/parts.ts";

/** The selected technique owns the physical binding for each opaque beginning token. */
function bindingSegments(part: TechniquePart, spec: BodySpec, config: PartConfig): (start: string) => string {
  const bindings = part.bindings(spec, config);
  return start => {
    const binding = bindings.find(binding => binding.start === start);
    if (!binding) throw new Error(`${config.kind} declares no body binding`);
    return binding.segment;
  };
}

/** A ground action's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/**
 * **The terms of `seconds` s down where `at` lies**, ending as `outcomes` say: each second costing
 * what a second down in its posture costs (`Predictions.downRate`), and the blow coming; its
 * answers come from where `from` says. A search calls it for every state it prices lying, so it
 * takes its arguments by place and no argument object is made.
 */
const downTerms = (at: Situation, seconds: number, outcomes: readonly Outcome[], from: TermSources): Terms => ({ duration: seconds, dealt: 0, orders: 0, outcomes,
  taken: at.predictions.danger + at.predictions.downRate(at.posture) * seconds, from });

/**
 * Where each answer of a price down comes from (`Terms.from`), where its seconds and where it
 * leaves the body are read from `source`: it throws no blow, and what it takes is the focus's pressure.
 */
const downSources = (source: Source): TermSources => Object.freeze({ duration: source, dealt: NO_BLOW, taken: "pressure", leaves: source });

/** Lying where it is for one step: priced over that step, moving nothing. */
const A_STEP: TermSources = Object.freeze({ duration: given("it is priced over one step"), dealt: NO_BLOW, taken: "pressure", leaves: STAYS });

/** Tumbling under a brace: how long the brace is held for is set by hand (`BRACED`), and where the tumble leaves the body is not priced. */
const TUMBLING: TermSources = Object.freeze({
  duration: byHand(["BRACED"], "no drill measured how long a body tumbles under a brace"), dealt: NO_BLOW, taken: "pressure",
  leaves: notPriced("where its tumble leaves the body"),
});

/**
 * What a way up is expected to do from where it is begun: run `seconds` s, and in `done` of its
 * tries reach where it goes; the rest come to rest where `ends` say, by share (where it began,
 * short of them). And where a price built from it gets its answers (`from`).
 */
interface Way {
  readonly seconds: number;
  readonly done: number;
  readonly ends: readonly { readonly at: string; readonly share: number }[];
  readonly from: TermSources;
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
  memory.id ??= now.sight.actions.instance();
  const asked = { move: null, face: now.sight.report.legs.heading, actions: [{ id: memory.id, action, effector: sides(memory.start), target: HERE }] };
  return { asked, holds: asking(now, asked) };
}

/**
 * **A try of the ground skill `part`** over the whole body (`WHOLE`), named as it: on offer where
 * the body's rise runs (`Situation.ground`), its position read (`GroundReading.settled`) and calm
 * unless its entry reads motion (`calm`, `TechniquePart.moving`), an edge of `edges` from where it
 * lies (raw where its entry reads motion, as last settled else; `toward` says where it goes from
 * there), on the side it lies on first, then left, then right, where its skill admits it there
 * (`SkillsActions.readiness`). Begun, it runs until its action ends, yielding while the action is
 * prepared; its try noted in `record` as it ends (`OptionRecord.note`), done where the action ended
 * done. Priced as what it is expected to do from where it is begun (`way`): its seconds down
 * (`downTerms`), ending where it goes in the share done and where its failures come to rest
 * (`endings`); with nothing expected from there (`way` answers null) it has no model and is not on
 * offer. At a state an Option leaves the body in, where no ground is read, it is on offer
 * lying in a posture `toward` goes from.
 */
function attempt(given: OptionContext, part: TechniquePart, skill: PartConfig, edges: readonly Edge[], toward: (from: Position, g: GroundReading | null) => Position | null,
  way: (from: Position) => Way | null, extra: { readonly reads?: Option["reads"] }): Option {
  const name = part.defaults.kind as string, memory: Asking = { id: null, start: part.starts[0]!, from: null }, record = given.record, sides = bindingSegments(part, given.spec, skill);
  const UNOFFERED = blocked(`${name} does not admit the body as it lies`);
  const fromOf = (g: GroundReading): Position => part.moving && edges.some((edge) => edge.from === g.raw) ? g.raw : g.position;
  const beginningOf = (now: Situation, g: GroundReading): string | null => {
    for (const start of [g.side, ...part.starts])
      if (start && part.starts.includes(start) && !refused(now.sight.actions.readiness(now.sight.view, name, sides(start), HERE, now.sight.actions.around))) return start;
    return null;
  };
  const note = (done: boolean): void => { if (memory.from !== null) record.note(name, memory.from, done); memory.from = null; };
  return {
    name, kind: "way up", claims: WHOLE, state: memory, ...extra,
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
      return expected && downTerms(at, expected.seconds, endings(expected, from, to), expected.from);
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
 * its Mind's guess of its `kind` (`Guesses.way`), either moved by the record of its tries
 * (`recordedWay`); null with neither. And what it reads, with where that comes from (`reads`,
 * `Option.reads`): its profile on the body, else its Mind's guess. A way says where a price built
 * from it gets its answers (`Way.from`): its profile, begun where a trial of its drill begins,
 * and its Mind's guess begun anywhere else.
 */
function groundWay(given: OptionContext, skill: PartConfig, name: string, kind: GuessedWay): { readonly way: (from: Position) => Way | null; readonly reads: NonNullable<Option["reads"]> } {
  const { expected, source } = edgeExpected(skill, given), guess = given.guesses?.way(kind) ?? null;
  const read = Object.freeze([{ what: name, source: source.kind === "none" ? standIn(given.guesses, kind, source.why) : source }]);
  const measured = downSources(source);
  const guessed: Way | null = guess ? Object.freeze({ ...guess, ends: Object.freeze([]),
    from: downSources(standIn(given.guesses, kind, source.kind === "none" ? source.why : "no trial of its drill begins where it lies")) }) : null;
  return {
    way: (from) => {
      const read = expected?.(from) ?? null, base: Way | null = read ? { seconds: read.seconds, done: read.done, ends: read.ends, from: measured } : guessed;
      return base && recordedWay(base, given.record.of(name, from), from);
    },
    reads: () => read,
  };
}

/** A way up's `attempt` of `part` over `edges`, priced by its profile on the body where one is measured, by its Mind's guess of a way up else (`groundWay`). */
function wayUp(given: OptionContext, config: GroundConfig<string>, part: TechniquePart, edges: readonly Edge[]): Option {
  const { way, reads } = groundWay(given, skillOf(config), part.defaults.kind as string, "way");
  return attempt(given, part, skillOf(config), edges, (from) => edges.find((edge) => edge.from === from)?.to ?? null, way, { reads });
}

/**
 * **A kind of ground option's config**: its kind, and the technique it runs (`skill`, a
 * `TechniquePart`): a way up, or a mode of the ground. A way up or reposition that names none
 * stands for every registered technique of its purpose (`TechniquePart.purpose`, `each`).
 */
interface GroundConfig<K extends string> { readonly kind: K; readonly skill?: ConfigFor<"technique"> }

/** The technique `config` runs: every config a mind is built of names one (`optionsOf`). */
function skillOf(config: GroundConfig<string>): ConfigFor<"technique"> {
  if (!config.skill) throw new Error(`a ${config.kind} naming no technique is read before it is resolved (\`optionsOf\`)`);
  return config.skill;
}

/** Whether the technique `config` names fits a body of `spec`. */
const fitting = (config: GroundConfig<string>, spec: BodySpec, parts: PartLookup): boolean => parts.of("technique", skillOf(config)).fits(spec, skillOf(config), parts) === null;

/**
 * A kind of ground option, `kind`, labelled `label`, running the technique its config names (a way
 * up of `purpose` where it has one, else the mode of the ground `technique`), made by `make`
 * where that technique fits the body, none else. A way up's config that names none stands for every
 * registered technique of its purpose, in the order registered.
 */
function groundKind<K extends string>(kind: K, label: string, technique: TechniqueName | null, routing: { readonly purpose: "ascent" | "fallback" } | null,
  make: (given: OptionContext, config: GroundConfig<K>, part: TechniquePart) => readonly Option[]): OptionPart<GroundConfig<K>> {
  const wayUp = routing !== null;
  return deepFreeze<OptionPart<GroundConfig<K>>>({ role: "option", label, stands: true, ...(routing ? { recovery: { purpose: routing.purpose, technique: (config: GroundConfig<K>) => skillOf(config) } } : {}), fields: [],
    // A way up's technique may be left unnamed: it then runs every registered one of its purpose (`supplies`).
    slots: [{ ...slotSkill("skill", "Technique", "technique"), optional: routing !== null }],
    ...(routing ? { supplies: (config: GroundConfig<K>, parts: PartLookup) => config.skill ? []
      : techniquesFor(routing.purpose, parts).map((skill) => ({ role: "technique" as const, config: skill })) } : {}),
    defaults: technique === null ? { kind } : { kind, skill: { kind: technique } }, keys: { kind: true, skill: true } as KeysOf<GroundConfig<K>>, fits: anyBody,
    faults: (config: GroundConfig<K>, parts: PartLookup) => config.skill === undefined ? (wayUp ? [] : ["skill: a mode of the ground"])
      : isWayUp(parts.of("technique", config.skill)) === wayUp ? [] : [`skill: ${wayUp ? "a way up" : "a mode of the ground"}`],
    skills: (config: GroundConfig<K>, spec: BodySpec, parts: PartLookup): NamedSkills | null => fitting(config, spec, parts) ? { technique: skillOf(config) } : null,
    make: (config: GroundConfig<K>, given: OptionContext) => fitting(config, given.spec, given.parts) ? make(given, config, given.parts.of("technique", skillOf(config))) : [] });
}

/** Every registered technique of `purpose` (`TechniquePart.purpose`), in the order registered. */
const techniquesFor = (purpose: "ascent" | "fallback", parts: PartLookup): readonly ConfigFor<"technique">[] =>
  parts.candidates("technique").filter((one) => parts.of("technique", one).purpose === purpose);

/** What a way up's config of `kind` stands for (`OptionPart.each`): itself, or, naming no technique, one of each technique of `purpose` (`techniquesFor`). */
const every = (kind: "way-up" | "reposition", purpose: "ascent" | "fallback") => (config: GroundConfig<string>, parts: PartLookup): readonly ConfigFor<"option">[] =>
  waysUp(kind, config.skill ? [config.skill] : techniquesFor(purpose, parts));

/** **A way up** (`attempt`): its technique's edges, priced by its profile, else by its Mind's guess of a way up. */
export const WAY_UP_OPTION = deepFreeze({ ...groundKind("way-up", "Way up", null, { purpose: "ascent" }, (given, config, part) => [wayUp(given, config, part, part.edges)]),
  each: every("way-up", "ascent") });

/** Every enabled reposition's own transitions, competing with ascent choices through the chooser. */
export const REPOSITION_OPTION = deepFreeze({ ...groundKind("reposition", "Reposition", null, { purpose: "fallback" }, (given, config, part) => [wayUp(given, config, part, part.edges)]),
  each: every("reposition", "fallback") });

/** **Flatten** (`attempt`): the body laid flat on the side it lies on, priced as a way up to that lie: by its profile where one is measured, by its Mind's guess of a way up else (`groundWay`). */
export const FLATTEN_OPTION = groundKind("flattening", "Flatten", "flatten", null, (given, config, part) => {
  const { way, reads } = groundWay(given, skillOf(config), part.defaults.kind as string, "way");
  return [attempt(given, part, skillOf(config), [], (_from, g) => g?.lie ?? null, way, { reads })];
});

/**
 * **The regain**, on its feet while its rise runs (`onFeet`), over the whole body, yielding: priced as
 * a way up from where it stands to standing, by its profile where one is measured, by its Mind's
 * guess of a regain else (`groundWay`), its try's seconds left (`Situation.regained`); its route from a
 * crouch to standing. Its try is noted in the record as it ends: done where its rise is over, not
 * where its try ran out with the rise still on.
 */
export const REGAIN_OPTION = groundKind("regaining", "Regain", "regain", null, (given, config, part) => {
  const name = part.defaults.kind as string, record = given.record, { way, reads } = groundWay(given, skillOf(config), name, "regain");
  const memory = { id: null as number | null, start: part.starts[0]!,  from: null, regained: 0 }, sides = bindingSegments(part, given.spec, skillOf(config)), NOT_ON_FEET = blocked("not on its feet in a rise");
  return [{
    name: "regain", kind: "regain", claims: WHOLE, state: memory, reads,
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
      return expected && downTerms(at, Math.max(0, expected.seconds - at.regained), endings(expected, g.position, "standing"), expected.from);
    },
    begin() { memory.id = null; memory.regained = 0; },
    end() { memory.id = null; },
    step(now) {
      // Its try ran out with the rise still on: noted, and begun afresh.
      if (now.regained < memory.regained) record.note(name, now.posture, false);
      memory.regained = now.regained;
      return asks(now, memory, name, sides);
    },
  }];
});

/** **Landing**: the command carried on while the body, in its rise and off its feet, lands calm, its position not yet read; priced as lying where it is a step. */
export const LAND_OPTION = groundKind("landing", "Land", "land", null, (given, config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, start: part.starts[0]!,  from: null }, sides = bindingSegments(part, given.spec, skillOf(config)), NOT_LANDING = blocked("not landing");
  return [{
    name, kind: "land", claims: WHOLE, state: memory,
    entry: (now) => { const g = now.ground; return g && !onFeet(g) && !g.settled && calm(now, g) ? READY : NOT_LANDING; },
    status: () => "yields",
    model: (at) => at.ground ? downTerms(at, 1 / given.hz, UNMOVED, A_STEP) : null,
    begin() { memory.id = null; }, end() { memory.id = null; },
    step: (now) => asks(now, memory, name, sides),
  }];
});

/**
 * **Brace while tumbling**, in its rise off its feet and moving: not calm (`calm`), or lying, its
 * position read, where one of its mind's ways up (`waysUpIn`) begins but none admits the body yet
 * (`SkillsActions.readiness`: too fast for it). A body on its feet is the stance's to catch, and bracing it
 * would fold the legs under it. Priced as lying where it is: tumbling, for what is left of what a
 * brace saves (`BRACED`); else until a way up admits it, where the body is then, by its profile from
 * where it lies where one is measured, by its Mind's guess of a brace else (`groundWay`).
 */
export const BRACE_TUMBLING_OPTION = groundKind("brace-tumbling", "Brace while tumbling", "brace", null, (given, config, part) => {
  const name = part.defaults.kind as string, memory = { id: null as number | null, start: part.starts[0]!,  from: null }, sides = bindingSegments(part, given.spec, skillOf(config)), NOT_MOVING = blocked("not moving unbraced");
  const ways = waysUpIn(given.parts, given.spec, given.options).flatMap((skill) => {
    const way = given.parts.of("technique", skill);
    return way.fits(given.spec, skill, given.parts) === null ? [{ part: way, config: skill }] : [];
  });
  const { way: settling, reads } = groundWay(given, skillOf(config), "brace while tumbling", "settle");
  /** Whether `g` lies where one of the ways up begins and none admits the body on any of its sides. */
  const unready = (now: Situation, g: GroundReading): boolean => {
    let begins = false;
    for (const { part: way, config } of ways) {
      if (!way.edges.some((edge) => edge.from === g.position || edge.from === g.raw)) continue;
      begins = true;
      for (const binding of way.bindings(given.spec, config))
        if (!refused(now.sight.actions.readiness(now.sight.view, config.kind, binding.segment, HERE, now.sight.actions.around))) return false;
    }
    return begins;
  };
  return [{
    name: "brace while tumbling", kind: "brace", claims: WHOLE, state: memory, reads,
    entry: (now) => { const g = now.ground; return g && !onFeet(g) && (!calm(now, g) || g.settled && unready(now, g)) ? READY : NOT_MOVING; },
    status: () => "yields",
    model(at) {
      const g = at.ground;
      if (!g) return null;
      if (!calm(at, g)) return downTerms(at, Math.max(1 / given.hz, BRACED - at.tumbled), UNMOVED, TUMBLING);
      const expected = settling(g.position);
      return expected && downTerms(at, expected.seconds, endings(expected, g.position, g.position), expected.from);
    },
    begin() { memory.id = null; }, end() { memory.id = null; },
    step: (now) => asks(now, memory, name, sides),
  }];
});

/** **Brace**, down (`brace`), a rest option: by the ground's brace where it fits the body, priced as lying where it lies; on offer on every body. */
export const BRACE_OPTION = deepFreeze<OptionPart<GroundConfig<"brace-down">>>({ ...groundKind("brace-down", "Brace", "brace", null, () => []),
  skills: (config: GroundConfig<"brace-down">, spec: BodySpec, parts: PartLookup): NamedSkills => fitting(config, spec, parts) ? { technique: skillOf(config) } : {},
  make: (config: GroundConfig<"brace-down">, given: OptionContext) =>
    [brace(fitting(config, given.spec, given.parts) ? { action: skillOf(config).kind, effector: bindingSegments(given.parts.of("technique", skillOf(config)), given.spec, skillOf(config))(given.parts.of("technique", skillOf(config)).starts[0]!) } : null)] });

/** The way-up options of `techniques`, each a way up of its own (`WAY_UP_OPTION`). */
const waysUp = (kind: "way-up" | "reposition", techniques: readonly ConfigFor<"technique">[]): readonly ConfigFor<"option">[] => techniques.map((skill) => ({ kind, skill }));

/** The Option's declared recovery purpose and configured technique, null where its kind is no way off the ground. */
function recoveryOf(parts: PartLookup, option: PartConfig) {
  const part = parts.of("option", option);
  return part.recovery ? { purpose: part.recovery.purpose, technique: part.recovery.technique(option) } : null;
}

/** The applicable techniques of declared ordinary ascent choices, in configured order. */
export const waysUpIn = (parts: PartLookup, spec: BodySpec, options: readonly PartConfig[]): readonly ConfigFor<"technique">[] => options.flatMap(option => {
  if (recoveryOf(parts, option)?.purpose !== "ascent") return [];
  const technique = parts.of("option", option).skills?.(option, spec, parts, options)?.technique;
  return technique && isWayUp(parts.of("technique", technique)) ? [technique] : [];
});

/** Replace declared ascent choices, excluding fallback transitions whose technique is now an ascent. */
export function withWaysUp(parts: PartLookup, options: readonly ConfigFor<"option">[], techniques: readonly ConfigFor<"technique">[]): readonly ConfigFor<"option">[] {
  const kinds = new Set(techniques.map((technique) => technique.kind)), declared = options.map(option => recoveryOf(parts, option));
  const first = declared.findIndex(one => one?.purpose === "ascent");
  return options.flatMap((option, i) => i === first ? waysUp("way-up", techniques)
    : declared[i]?.purpose === "ascent" || declared[i]?.purpose === "fallback" && kinds.has(declared[i]!.technique.kind) ? [] : [option]);
}

/** The techniques of `options`' declared ascent choices, in their order, whether or not they fit a body. */
export const declaredWaysUp = (parts: PartLookup, options: readonly PartConfig[]): readonly ConfigFor<"technique">[] =>
  options.flatMap((option) => { const recovery = recoveryOf(parts, option); return recovery?.purpose === "ascent" ? [recovery.technique] : []; });

/**
 * **`options` with the way up `first` ranked before the others they declare** (`withWaysUp`), the
 * others in their order: by rank it runs wherever it is on offer, and the others carry the body to
 * where it begins.
 */
export const withWayUpFirst = (parts: PartLookup, options: readonly ConfigFor<"option">[], first: ConfigFor<"technique">): readonly ConfigFor<"option">[] =>
  withWaysUp(parts, options, [first, ...declaredWaysUp(parts, options).filter((technique) => technique.kind !== first.kind)]);

declare module "../contract/parts.ts" {
  interface OptionConfigs {
    readonly "way-up": GroundConfig<"way-up">;
    readonly reposition: GroundConfig<"reposition">;
    readonly flattening: GroundConfig<"flattening">;
    readonly regaining: GroundConfig<"regaining">;
    readonly landing: GroundConfig<"landing">;
    readonly "brace-tumbling": GroundConfig<"brace-tumbling">;
    readonly "brace-down": GroundConfig<"brace-down">;
  }
}
