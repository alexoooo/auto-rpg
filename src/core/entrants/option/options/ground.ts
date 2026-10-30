import type { TargetRef } from "../../../skills/action.ts";
import type { BodySpec, Side } from "../../../spec/body.ts";
import { deepFreeze } from "../../../state.ts";
import { sideEffector, type GroundExecutor } from "../../../mind/ground/held.ts";
import type { GroundReading, Position } from "../../../mind/ground/reading.ts";
import { standReady, tumbling } from "../../../mind/ground/reading.ts";
import type { TechniqueConfig, TechniquePart, TechniqueRun } from "../../../mind/ground/technique.ts";
import { edgeExpected, type Profile } from "../../../mind/profile.ts";
import { downTerms, type DownModel } from "./down.ts";
import { brace } from "./rest.ts";
import { asking, blocked, READY, WHOLE, type Option, type Situation, type Status } from "./option.ts";
import type { Sight } from "../../../mind/tactics.ts";

/**
 * What a way up is taken to do where no drill measured it, the owner's decision: an edge runs 5 s
 * and stands the body seven times in ten (`edge`); the steady stands a body on its feet ready in
 * 2 s nine times in ten (`steady`). A profile, measured or by hand, counts as `weight` attempts
 * against the rise's own record of them (`recorded`). What a brace saves a tumbling body: its
 * first `braced` s tumbling, before a way up is begun on it moving.
 */
const BY_HAND = deepFreeze({ edge: { seconds: 5, done: .7 }, steady: { seconds: 2, done: .9 }, weight: 2, braced: 1 });

/** A body standing ready this long (`standReady`) has risen, s: its rise is over. */
const READY_HOLD = .1;

/** A ground action's target: none; the body acts on itself. */
const HERE: TargetRef = deepFreeze({ kind: "point", at: [0, 0, 0] });

/** What a way up is expected to do from where it is begun: run `seconds` s, and in `done` of its tries reach where it goes; the rest come to rest where `ends` say, by share (where it began, short of them). */
interface Way {
  readonly seconds: number;
  readonly done: number;
  readonly ends: readonly { readonly at: string; readonly share: number }[];
}

/** One way up's attempts in this rise from one posture: how many were begun, and how many reached where it goes. */
interface Tried { readonly name: string; readonly from: Position; tries: number; done: number }

/** A technique on the ground: its part (none for `flatten`), its run, and its profile on this body (`edgeExpected`), or none. */
interface Technique { readonly name: string; readonly part: TechniquePart | null; readonly run: TechniqueRun; readonly profile: Way | null }

/**
 * **The ground's options and what they read**: the options (`Option`), the rise's price from each
 * posture (`riseFrom`), and the seconds the rise leaves the body unbraced (`unbraced`).
 */
export interface Ground {
  readonly options: readonly Option[];
  /** The rest option down (`brace`): the ground's brace, priced as the rise from where the body lies that never stands. */
  readonly rest: Option;
  /** How the rise is priced, a sentence: each edge measured, or not and why (`edgeExpected`). */
  readonly priced: string;
  /** Its memory (`src/core/state.ts`). */
  readonly state: object;
  /** What a rise from `posture` is priced at (`DownModel`): its expected seconds to standing over its ways up (`price`); null where none stands it. */
  riseFrom(posture: Position): DownModel | null;
  /** The seconds until the body is braced: on its feet while its rise runs, the steady's left; else none. */
  unbraced(sight: Sight): number;
}

/** `way` as the rise's record of it says (`Tried`): its share done moved toward what its attempts did, a profile worth `BY_HAND.weight` attempts; its failures in proportion, the unaccounted resting where it began. */
function recorded(way: Way, tried: Tried | undefined, from: Position): Way {
  if (!tried || tried.tries === 0) return way;
  const done = (way.done * BY_HAND.weight + tried.done) / (BY_HAND.weight + tried.tries), failed = 1 - way.done;
  if (failed <= 0) return { ...way, done, ends: [{ at: from, share: 1 - done }] };
  return { ...way, done, ends: way.ends.map((end) => ({ at: end.at, share: end.share * (1 - done) / failed })) };
}

/** Where a way up's failures most come to rest: `from` where none is named. */
function restOf(way: Way, from: Position): Position {
  let best: Position = from, share = 0;
  for (const end of way.ends) if (end.share > share) { share = end.share; best = end.at as Position; }
  return best;
}

/**
 * **The rise as options**, each over the whole body and carried out by the ground executor
 * (`groundExecutor`) as its action: each technique of `techniques`, in their order (their rank), the
 * repositions and `flatten`; brace while the body tumbles, the steady on its feet (`steady`) and the
 * commands carried on while the body lands (`land`); and, at rest, brace (`Ground.rest`). A rise
 * runs from the step the body goes down until it stands ready (`READY_HOLD`) with nothing under
 * way and the steady not climbing.
 *
 * Each technique is on offer where its own entry admits the body as it lies
 * (`TechniqueRun.admits`, on the side the body lies on first, from its position as read, or raw
 * where its entry reads motion, `TechniquePart.moving`), once its position is read
 * (`GroundReading.settled`); one whose entry reads no motion, not on a body tumbling for less than
 * what a brace saves (`BY_HAND.braced`, `calm`). Begun, it runs to its end, yielding where its run
 * says it may (`TechniqueRun.yields`). Brace is on offer while the body tumbles off its feet for
 * less than what a brace saves (`calm`), the steady on its feet, landing while the body's position
 * is not yet read; brace, the rest option, takes the body where nothing else is worth more.
 *
 * Each is worth where it leaves the body, by the position value: an edge, its expected seconds, and
 * the posture it reaches in its share done, standing or another (`Place.posture`), the rest down
 * where its failures come to rest (`restOf`); a lying posture is worth the rise from it
 * (`riseFrom`). A way's share done is its profile's, by hand where none is measured
 * (`BY_HAND`), moved by the rise's record of its attempts from that posture (`recorded`): a way that
 * fails from there is priced the dearer for it, and another taken. The steady is priced as a way
 * from where it stands, its seconds left; landing, as holding where it is. The rise from a posture
 * is the least expected seconds to standing over the edges from it and the steady's (`price`).
 *
 * Its memory is the rise's: whether it runs, how long the body has stood ready, the steady's time,
 * how long it has braced tumbling, the attempt under way and the record of attempts.
 */
export function groundOptions(spec: BodySpec, hz: number, executor: GroundExecutor, techniques: readonly TechniqueConfig[],
  registry: Readonly<Record<string, TechniquePart>>, edges: readonly Profile[]): Ground {
  const order: readonly string[] = techniques.map((technique) => technique.kind), runs = executor.runs, dt = 1 / hz;
  const named = [...order, ...Object.keys(registry).filter((name) => !order.includes(name))].filter((name) => runs[name] !== undefined);
  const unpriced: string[] = [];
  const all: Technique[] = named.map((name) => {
    const { expected, priced: why } = edgeExpected(spec, techniques.find((technique) => technique.kind === name) ?? { kind: name }, hz, edges);
    if (!expected && order.includes(name)) unpriced.push(`${name}: ${why}`);
    return { name, part: registry[name]!, run: runs[name]!, profile: expected };
  });
  all.push({ name: "flatten", part: null, run: runs.flatten!, profile: null });
  const routed = all.filter((one) => one.part !== null);
  const state = { active: false, ready: 0, steady: 0, tumbled: 0, current: null as { name: string; from: Position; id: number | null } | null, tried: [] as Tried[] };
  const triedOf = (name: string, from: Position): Tried | undefined => state.tried.find((one) => one.name === name && one.from === from);
  const wayOf = (one: Technique, from: Position): Way => recorded(one.profile ?? { ...BY_HAND.edge, ends: [] }, triedOf(one.name, from), from);
  const steadyWay = (from: Position): Way => recorded({ ...BY_HAND.steady, ends: [] }, triedOf("steady", from), from);
  /** The ways a rise is priced over: each technique's edges, and the steady's, from a crouch to standing. */
  const routes = [...routed.map((one) => ({ edges: one.part!.edges, way: (from: Position) => wayOf(one, from) })),
    { edges: [{ from: "crouch" as Position, to: "standing" as Position }], way: steadyWay }];

  /**
   * **Each posture's expected seconds to standing** (`docs/reference/rising.md#routes-priced`): the
   * least, over the edges from it, of a try's seconds, then the rise on from where it ends, in the
   * share it reaches there and the shares its failures rest elsewhere, over the share that does not
   * rest where it began; found again until none falls. Infinity where no edge's route stands it.
   */
  const prices = new Map<Position, number>();
  let pricedFor: string | null = null;
  const price = (): ReadonlyMap<Position, number> => {
    // Priced again only as the record changes.
    const record = JSON.stringify(state.tried);
    if (pricedFor === record) return prices;
    pricedFor = record; prices.clear(); prices.set("standing", 0);
    const at = (posture: string): number => prices.get(posture as Position) ?? Infinity;
    for (let round = 0, fell = true; fell && round < 32; round++) {
      fell = false;
      for (const one of routes) for (const edge of one.edges) {
        const way = one.way(edge.from);
        let sum = way.seconds + way.done * at(edge.to), again = 0;
        for (const end of way.ends) if (end.at === edge.from || !Number.isFinite(at(end.at))) again += end.share; else sum += end.share * at(end.at);
        const seconds = again >= 1 - 1e-9 ? Infinity : sum / (1 - again);
        if (seconds < at(edge.from) - 1e-9) { prices.set(edge.from, seconds); fell = true; }
      }
    }
    return prices;
  };
  const riseAt = (posture: Position): DownModel | null => {
    const seconds = price().get(posture) ?? Infinity;
    return Number.isFinite(seconds) ? { seconds, stands: 1, shelter: 0 } : null;
  };
  const back = riseAt("back");
  const why = unpriced.length ? `; unmeasured ${unpriced.join("; ")}` : "";
  const pricedBy = back ? `measured from the back${why}` : `by hand, no route measured to standing${why}`;

  /** On its feet: read standing or crouched, or its feet bearing it (`GroundReading.onFeet`) while its position is read between. */
  const onFeet = (g: GroundReading): boolean => g.onFeet || g.position === "standing" || g.position === "crouch";
  /** Whether a way up may be begun on the body: not tumbling, or braced its while (`BY_HAND.braced`, `state.tumbled`) since the rise began or its last attempt ended. */
  const calm = (g: GroundReading): boolean => !tumbling(g) || state.tumbled >= BY_HAND.braced;
  /**
   * What happened since the last step, once a step: the attempt under way ended or was let go, and
   * its try recorded; the rise begun as the body went down, or over as it stood ready with nothing
   * under way.
   */
  let seenAt = -Infinity;
  const since = (sight: Sight): void => {
    if (seenAt === sight.view.time) return;
    seenAt = sight.view.time;
    const view = sight.view, current = state.current;
    if (current && current.id !== null) {
      const live = sight.report.actions.find((action) => action.id === current.id);
      if (!live || live.stage.startsWith("ended:")) {
        let tried = triedOf(current.name, current.from);
        if (!tried) state.tried.push(tried = { name: current.name, from: current.from, tries: 0, done: 0 });
        tried.tries += 1;
        if (live?.stage === "ended:done") tried.done += 1;
        state.current = null; state.tumbled = 0;
      }
    }
    if (!state.active && view.down) { state.active = true; state.tried.length = 0; state.current = null; state.ready = 0; state.steady = 0; state.tumbled = 0; }
    if (!state.active) return;
    // Standing ready is counted with nothing under way: a body a technique stood is steadied before its rise is over.
    state.ready = !state.current && standReady(view) ? state.ready + dt : 0;
    if (!state.current && state.ready >= READY_HOLD && !executor.steady.climb.on) { state.active = false; state.tried.length = 0; }
  };
  /** The side `one` is begun on as the body lies: the side it lies on first, then left, then right; null where none admits it. */
  const sideOf = (one: Technique, g: GroundReading): Side | null => {
    const sides: readonly Side[] = one.part ? one.part.sides : [g.side ?? "left"];
    for (const side of [g.side, "left", "right"] as const) if (side && sides.includes(side) && one.run.admits(g, side)) return side;
    return null;
  };
  /** Where `one` is begun from as the body is read: raw where its entry reads motion. */
  const fromOf = (one: Technique, g: GroundReading): Position => one.part?.moving ? g.raw : g.position;
  /** Where `one` goes from `from`: its edge from there (flatten, the lie); null where it has none. */
  const toOf = (one: Technique, from: Position, g: GroundReading): Position | null => one.part ? one.part.edges.find((edge) => edge.from === from)?.to ?? null : g.lie;

  /**
   * An option that asks the ground action `name` on the side `side` gives, doing what `begin` and
   * `step` do as it is begun and each step; named `label` where the action's name does not say it.
   * The side is read as the action is issued and kept while it runs: an action's effector is its identity.
   */
  const acting = (name: string, side: (now: Situation) => Side, entry: (now: Situation) => ReturnType<Option["entry"]>, status: (now: Situation, ended: boolean) => Status,
    model: Option["model"], begin?: (now: Situation) => void, step?: (now: Situation) => void, label = name): Option => {
    const memory = { id: null as number | null, side: "left" as Side };
    const live = (now: Situation) => memory.id === null ? undefined : now.sight.report.actions.find((action) => action.id === memory.id);
    return {
      name: label, claims: WHOLE, state: memory, entry, model,
      status: (now) => status(now, live(now)?.stage.startsWith("ended:") ?? false),
      begin(now) { memory.id = null; begin?.(now); },
      end() { memory.id = null; },
      step(now) {
        since(now.sight);
        step?.(now);
        if (memory.id === null) {
          memory.id = now.sight.instance(); memory.side = side(now);
          if (state.current?.name === name && state.current.id === null) state.current.id = memory.id;
        }
        const asked = { move: null, face: now.sight.report.heading, actions: [{ id: memory.id, action: name, effector: sideEffector(memory.side), target: HERE }] };
        return { asked, holds: asking(now, asked) };
      },
    };
  };
  const live = (now: Situation): GroundReading | null => { since(now.sight); return state.active ? now.sight.view.ground : null; };

  const technique = (one: Technique): Option => {
    const UNOFFERED = blocked(`${one.name} does not admit the body as it lies`);
    return acting(one.name,
      (now) => { const g = now.sight.view.ground; return g ? sideOf(one, g) ?? "left" : "left"; },
      (now) => {
        const g = live(now);
        // Begun, it runs on until it ends, however the body is read.
        if (state.current?.name === one.name) return READY;
        if (!g) return UNOFFERED;
        return g.settled && (one.part?.moving || calm(g)) && toOf(one, fromOf(one, g), g) !== null && sideOf(one, g) !== null ? READY : UNOFFERED;
      },
      (_now, ended) => ended ? "over" : one.run.yields ? "yields" : "committed",
      (now) => {
        const g = now.sight.view.ground;
        if (!g) return downTerms({ seconds: BY_HAND.edge.seconds, stands: BY_HAND.edge.done, shelter: 0 })(now);
        const from = state.current?.name === one.name ? state.current.from : fromOf(one, g), to = toOf(one, from, g) ?? from, way = wayOf(one, from);
        const standing = to === "standing";
        return downTerms({ seconds: way.seconds, stands: standing ? way.done : 0, shelter: 0 }, standing ? restOf(way, from) : to)(now);
      },
      // Its attempt, recorded as it ends (`since`).
      (now) => { const g = now.sight.view.ground; if (g) state.current = { name: one.name, from: fromOf(one, g), id: null }; });
  };

  const NOT_ON_FEET = blocked("not on its feet in a rise"), NOT_LANDING = blocked("not landing"), NOT_TUMBLING = blocked("not tumbling unbraced");
  const steady = acting("steady", () => "left",
    (now) => { const g = live(now); return g && onFeet(g) ? READY : NOT_ON_FEET; },
    () => "yields",
    (now) => {
      const g = now.sight.view.ground, from: Position = g?.position ?? "standing";
      const way = steadyWay(from);
      return downTerms({ seconds: Math.max(0, way.seconds - state.steady), stands: way.done, shelter: 0 }, from)(now);
    },
    () => { state.steady = 0; },
    (now) => {
      // The steady's try is over once its seconds have run: stood, the rise is over; else recorded, to be priced again.
      state.steady += dt;
      const g = now.sight.view.ground;
      if (state.steady < BY_HAND.steady.seconds || !g) return;
      let tried = triedOf("steady", g.position);
      if (!tried) state.tried.push(tried = { name: "steady", from: g.position, tries: 0, done: 0 });
      tried.tries += 1; state.steady = 0;
      if (g.position === "standing" && !now.sight.view.down) { tried.done += 1; state.active = false; state.tried.length = 0; }
    });
  const land = acting("land", () => "left",
    (now) => { const g = live(now); return g && !onFeet(g) && !g.settled && calm(g) ? READY : NOT_LANDING; },
    () => "yields",
    (now) => downTerms({ seconds: dt, stands: 0, shelter: 0 }, now.sight.view.ground?.position ?? "between")(now));
  // A body on its feet is the stance's to catch: bracing it would fold the legs under it.
  const bracing = acting("brace", () => "left",
    (now) => { const g = live(now); return g && !onFeet(g) && !calm(g) ? READY : NOT_TUMBLING; },
    () => "yields",
    (now) => downTerms({ seconds: Math.max(dt, BY_HAND.braced - state.tumbled), stands: 0, shelter: 0 }, now.sight.view.ground?.position ?? "between")(now),
    undefined, () => { state.tumbled += dt; }, "brace while tumbling");

  /** The rise from where the body lies now that never stands: what brace is priced at. */
  const lying = (now: Situation): DownModel => {
    const g = now.sight.view.ground, rise = g ? riseAt(g.position) : null;
    return rise ?? back ?? { seconds: BY_HAND.edge.seconds, stands: BY_HAND.edge.done, shelter: 0 };
  };
  const options = [bracing, steady, ...all.map(technique), land];
  return {
    options, rest: brace(lying, { action: "brace", effector: sideEffector("left") }), priced: pricedBy,
    state: { rise: state, options: options.map((one) => one.state) },
    riseFrom: riseAt,
    unbraced(sight) { since(sight); return state.active && !sight.view.down ? Math.max(0, BY_HAND.steady.seconds - state.steady) : 0; },
  };
}
