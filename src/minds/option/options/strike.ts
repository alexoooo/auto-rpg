import { sameRegion, type Spot } from "../../../skills/framework/menu.ts";
import type { Readiness, Resource, TargetRef, Window } from "../../../skills/framework/action.ts";
import { heldBeside, placeInWindow, SIDES, windowHolds, windowSpot, type Side } from "../../../skills/intent/action-window.ts";
import { orderAllows, orderedTargets } from "../../orders.ts";
import type { ActionConfig, ExecutorEntry } from "../../../skills/config.ts";
import { changes, measuredOn, strikeSkill } from "../../../skills/framework/profile/lookup.ts";
import { type Expected, type ProfileReading } from "../../../skills/framework/profile/reading.ts";
import { staler } from "../../../skills/framework/profile/source.ts";
import { type Asked as StartAsked, type Postures, type Measured } from "../../../skills/framework/profile/profile.ts";
import type { ActOutcomes } from "../../../skills/framework/outcomes.ts";
import { standIn } from "../predictions/by-hand.ts";
import type { OptionContext, Walker } from "../contract/context.ts";
import type { GuessedStrike, Guesses } from "../contract/predictors.ts";
import { asking, blocked, READY, standing } from "./readiness.ts";
import { exitOutcomes } from "./outcomes.ts";
import type { Asked, Option, Site } from "../contract/option.ts";
import type { Situation } from "../contract/situation.ts";
import { startOf } from "../situation/start.ts";
import { threatened } from "../situation/reach-memory.ts";
import type { Terms } from "../contract/terms.ts";
import type { BodySpec } from "../../../core/bodies/spec/body.ts";
import { claimsLegs } from "../../../skills/framework/intent.ts";
import { hypot } from "../../../core/math/real.ts";
import { handSet } from "../../../core/hand-set.ts";

/** How long a strike may wait to be admitted before it is given up, s. */
const PATIENCE = handSet({
  name: "PATIENCE", sort: "own",
  says: "How long a strike the Mind chose may wait to be admitted before the Mind gives it up, s.",
  value: 2,
});

/**
 * What a strike's profile is looked up by: the body throwing it, the question a profile read by it
 * answers (`measuredOn`: its skill as the body holds it, `strikeSkill`, and its limb; no reaction
 * time: the senses give it at each decision), and what its mind's outcome model has of it
 * (`OutcomeModel.act`), null where it has nothing.
 */
interface StrikeMeasure {
  readonly spec: BodySpec;
  readonly measured: Measured;
  readonly act: ActOutcomes | null;
}

/**
 * The measure (`StrikeMeasure`) of `action`, carried out by one of `executors`, thrown with its one
 * limb by a body of `spec` at `hz` whose mind decides at `rate` Hz (its world's unless given) and
 * whose command is `delay` steps late, asked of `outcomes`.
 */
export const strikeMeasure = ({ spec, outcomes, hz, rate = hz, delay }: Pick<OptionContext, "spec" | "outcomes" | "hz" | "rate" | "delay">, executors: readonly ExecutorEntry[], action: ActionConfig): StrikeMeasure => {
  const measured = measuredOn(spec, { skill: strikeSkill(spec, executors, action), limb: action.effectors[0] ?? null }, { hz, reaction: null, rate, delay });
  return { spec, measured, act: outcomes.act("strikes", measured) };
};

/**
 * **A strike option** (`strike`): what its model reads (`Option.reads`); its sites
 * (`Option.sites`), the spots in its window; what it deals a second (`Option.rate`), the most any
 * cell of its profile takes at the focus's phase from any start (`ProfileReading.peak`) where its
 * model reads its profile now, else its guess's (`Guesses.strike`), 0 with neither; and the strike its body is modelled by
 * (`Option.modelled`), the profiles its outcome model answers it from (`ActOutcomes.read`).
 */
type StrikeOption = Option & Required<Pick<Option, "reads" | "rate" | "sites" | "modelled">>;

/**
 * **A strike's site as last read with the body up**, for the focus `focus` standing at `foe` (x, z):
 * a body down reads no window, so its site there is this spot moved as its focus has moved since,
 * and where it is in the window (`place`), as it was.
 */
interface Stood { readonly focus: string; readonly spot: Spot; readonly place: [number, number] | null; readonly foe: readonly [number, number]; readonly through: number }

/** What a strike is made of (`strike`): its action, the walker, how many blows it throws, its outcome model, what its Mind guesses where nothing is measured (null where it guesses nothing) and its name. */
interface Striking { readonly action: ActionConfig; readonly walk: Walker; readonly throws: number; readonly measure: StrikeMeasure; readonly guesses: Guesses | null; readonly name: string }

/**
 * **Strike**: `action` at the focus with the first of its limbs that is ready, named `name`, on
 * offer where one is (its executor's readiness, which refuses a body down and a target out of its band). It
 * never walks: where no limb is ready and the first with a window says where it could begin (its
 * readiness's `position`), its sites are the spots in that window, one each side of the body its
 * target is on where that body lies (`windowSpot`, `SIDES`, each side's place held while it holds),
 * which a walk goes to (`Option.sites`). A blow that leaves the legs to a walk (its needs name no
 * legs, `onTheWay`) is thrown on the way there: its sites stay while a limb is ready, in that limb's
 * window, and while its blow is under way, the spot last read moved as the focus has moved since,
 * so the walk it is thrown on goes on to it. It asks for the blow once
 * the limb is ready, and goes on asking until the blow is over: then it has run its course. A blow
 * asked for and refused, every limb out of its entry, or `PATIENCE` s without a blow also end it.
 * It yields until its blow is committed (let go, the blow is dropped) and again from its exit, its
 * stroke's end (the blow's `release`): there, given up, it asks no more and its executor may hand
 * the arm to the guard; kept, it strikes again, its blow let go and the next asked of the first
 * limb ready. It claims what its blow needs with the limb it strikes with (`SkillsActions.needs`): its blow
 * under way's, else the limb ready's, else the first with a window's; and holds what its blow holds
 * (`asking`). Its legs are kept out of every fallen body's reach but the focus's (`Walker.kept`). The region struck is what the
 * orders name on the focus, else the first of the action's regions the focus has; orders at the
 * focus that name a skill or a limb admit only its limbs of that skill (its executor, named by its
 * kind) and limb (`orderAllows`). Firm orders at the focus (`Orders.firm`, a drill's) are carried
 * out, never weighed (`Option.bound`): it is asked for where a limb of it is ready as they name,
 * and, its blow under way, while they allow that blow's limb at its region. A mind fighting by
 * itself has no firm orders, and weighs it.
 *
 * Its model, where its mind's outcome model answers it (`StrikeMeasure`: against the focus's body,
 * read at the senses' reaction time): what it expects at the range
 * (to its reach), the start's velocity (`startOf`) and the focus's phase: the focus's life its blows took, how long
 * it ran until its limb was back (`Expected.recovers`), and its chance of ending down; through the blow coming, and the focus's pressure while it
 * runs, past the focus's latency (`threatened`, `graceAt`); and, its blow
 * begun and not yet committed, what letting it go cost there at its progress (`Expected.letGo`).
 * Else its guess (`Guesses.strike`), read the same way, where its Mind has guesses; with neither
 * it has no model there and is not on offer. It leaves the body up where it strikes from in
 * the share of its trials that ended where they began (`Expected.exit`'s `stays`), else as much
 * further from the focus as those that did not moved (`moved`), on the line from the focus through
 * it, facing the focus (`along`); where its trials do not say, where it strikes from. Down in its
 * chance of ending down. Its trials' heads say nothing of it: at a strike's end a head leans or
 * has just been struck.
 *
 * At a state where the body stands (`standing`), where it stands now its entry says whether it is
 * on offer; elsewhere, at one of its sites (`atSite`), or where the spot it stands at is within its
 * window now, ready or not (`windowAny`, `windowHolds`), its model there as it would be here.
 */
export function strike({ action, walk, throws, measure, guesses, name }: Striking): StrikeOption {
  const state = { target: null as TargetRef | null, id: null as number | null, since: 0, over: false, began: null as number | null,
    // Each side's place beside a body lying (`HeldBeside`), and its spot as last read: at what time, for what focus, and where in its window (`placeInWindow`);
    // and the spot last read with the body up (`Stood`).
    sides: SIDES.map(() => ({ beside: heldBeside(), time: NaN, focus: null as string | null, spot: null as Spot | null, place: null as [number, number] | null, stood: null as Stood | null })),
    // Where in its window its blow under way was asked (`placeInWindow`), null with none.
    place: null as [number, number] | null,
    // Whether its blow leaves the legs to a walk (`onTheWay`), null until it is first read.
    leaves: null as boolean | null };
  const { measured, act } = measure, read = act?.read ?? [];
  /** Where its reading comes from where its outcome model answers nothing of it: its Mind's guess, else nothing. */
  const NEVER_MEASURED = standIn(guesses, "strike", "no fight measured it");
  /** What its outcome model answers against the body of `now`'s focus, the body standing as `postures`; null where it answers nothing. */
  const readingOf = (now: Situation, postures?: Postures): ProfileReading | null => act?.reading(now.focus?.spec ?? null, measure.spec, postures) ?? null;
  /**
   * What its profile expects begun where the body stands now, as it moves (`startOf`) and at
   * `place` in its window (`placeInWindow`; its middle unless given), and, its motion `progress` s
   * under way, what letting it go there costs (`ProfileReading.expect`); null where none prices it.
   */
  const expected = (now: Situation, place?: readonly [number, number] | null, progress?: number): Expected | null => {
    const focus = now.focus, reading = focus ? readingOf(now, { own: "standing", target: now.foePosture }) : null;
    if (!reading || !focus) return null;
    const start: StartAsked & { readonly progress?: number } = { range: Math.min(now.apart, reading.reach(now.phase)), phase: now.phase, velocity: startOf(now), stance: now.stances,
      ...(place ? { window: place } : {}), ...(progress === undefined ? {} : { progress }) };
    return reading.expect(start, focus.spec);
  };
  /** Where it may strike the situation's focus: each of its regions the focus has, as orders put them (`orderedTargets`). */
  const targetsOf = (now: Situation): readonly TargetRef[] => {
    const focus = now.focus;
    return focus && action.regions ? orderedTargets(now.orders ?? null, focus, action.regions) : [];
  };
  const readiness = (now: Situation, limb: string, target: TargetRef): Readiness =>
    now.sight.actions.readiness(now.sight.view, action.name, limb, target, now.sight.actions.around);
  type Limb = { readonly limb: string; readonly readiness: Readiness };
  /**
   * The first limb ready at `target`, and the first with a window to walk to (`position`) where none
   * is: what a walk into it goes to (`window`); and whether every limb read finds the target outside
   * what the skill strikes (`beyond`).
   */
  const scan = (now: Situation, target: TargetRef): { ready: Limb | null; placed: Limb | null; beyond: boolean } => {
    let placed: Limb | null = null, read = 0, beyond = 0;
    for (const limb of action.effectors) {
      if (target.kind === "body" && !orderAllows(now.orders ?? null, target.body, action.executor, limb)) continue;
      const ready = readiness(now, limb, target);
      if (ready.kind === "ready") return { ready: { limb, readiness: ready }, placed: null, beyond: false };
      if (ready.kind === "position") placed ??= { limb, readiness: ready };
      read++; if (ready.kind === "beyond") beyond++;
    }
    return { ready: null, placed, beyond: read > 0 && beyond === read };
  };
  /**
   * What its entry reads of its limbs at its target, once a step for each focus: the first of its
   * targets (`targetsOf`) its skill strikes (none `beyond`), else the first; the chooser weighs every foe's situation in a step, each with its own focus.
   * It is kept against the body's reading of that step (`StepReading`), so it is no state: a time
   * comes round again in a bout put back to a save, and what was read at it before is stale.
   */
  const offers = new Map<string | null, { stamp: number; time: number; target: TargetRef | null; ready: Limb | null; placed: Limb | null }>();
  const offer = (now: Situation) => {
    const focus = now.focus?.id ?? null, stamp = now.sight.view.reading.stamp;
    let offered = offers.get(focus);
    if (!offered) offers.set(focus, offered = { stamp: -1, time: NaN, target: null, ready: null, placed: null });
    if (offered.stamp === stamp && offered.time === now.time) return offered;
    offered.stamp = stamp; offered.time = now.time; offered.target = null; offered.ready = null; offered.placed = null;
    for (const target of targetsOf(now)) {
      const scanned = scan(now, target);
      if (offered.target !== null && scanned.beyond) continue;
      offered.target = target; offered.ready = scanned.ready; offered.placed = scanned.placed;
      if (!scanned.beyond) break;
    }
    return offered;
  };
  /** Where it strikes the situation's focus now (`offer`), null where nowhere. */
  const targetOf = (now: Situation): TargetRef | null => offer(now).target;
  const live = (now: Situation) => state.id === null ? undefined : now.sight.report.actions.find((a) => a.id === state.id);
  const UNFIT = blocked("no focus to strike"), UNAIMED = blocked("the focus has none of its regions"), UNREADY = blocked("no limb in its entry");
  /** Whether the focus and its blow under way leave it a target to strike. */
  const unfit = (now: Situation): boolean => !now.focus || state.target !== null && state.target.body !== now.focus.id;
  /**
   * What it claims (`Option.claims`), as its entry last read it: what its blow needs with the limb it strikes with. A reading,
   * not memory: every entry reads it again, and the list is the actions' own, which a load writing into `state` would overwrite.
   */
  const claimed = { claims: Object.freeze([]) as readonly Resource[] };
  const claim = (now: Situation, limb: string | undefined): void => { if (limb !== undefined) claimed.claims = now.sight.actions.needs(action.name, limb); };
  const entry = (now: Situation): Readiness => {
    const running = live(now);
    if (running) { claim(now, running.effector); return READY; }
    if (unfit(now)) return UNFIT;
    const { target, ready, placed } = offer(now);
    if (target === null) return UNAIMED;
    claim(now, ready?.limb ?? placed?.limb);
    return ready?.readiness ?? UNREADY;
  };
  /** Whether firm orders at the focus ask for it at `now` (`Option.bound`). */
  const bound = (now: Situation): boolean => {
    const orders = now.orders, focus = now.focus;
    if (!orders?.firm || !focus || orders.foe !== focus.id) return false;
    const running = live(now);
    if (!running) return offer(now).ready !== null;
    return orderAllows(orders, focus.id, action.executor, running.effector)
      && (orders.region === undefined || running.target.kind === "body" && sameRegion(running.target.region, orders.region));
  };
  /**
   * Its model (`Terms`) at `at`, begun at `place` in its window (`placeInWindow`; its blow under
   * way's where one is). Its blow under way, short of its exit, it is priced from where it
   * is: the time its motion has left, and its payoff unless its blow has met the target. Its chance
   * of ending down is its profile's where one measures it (its trials' falls, in a clinch or not),
   * else its guess's. Null where no profile prices it there and its Mind has no guess.
   */
  const priceOf = (at: Situation, place: readonly [number, number] | null): Terms | null => {
    const running = live(at), under = running !== undefined && running.phase !== "release";
    const progress = under && state.began !== null ? at.time - state.began : 0, met = under && running.contacts.lastTarget !== null;
    const preparing = running?.phase === "prepare", e = expected(at, running ? state.place : place, preparing ? progress : undefined) ?? guesses?.strike(at, guessed, progress) ?? null;
    if (!e) return null;
    const duration = Math.max(0, e.seconds + e.recovers - progress);
    const terms: { -readonly [K in keyof Terms]: Terms[K] } = { duration, dealt: met ? 0 : e.dealt, taken: at.predictions.danger + threatened(at, duration), orders: 0,
      outcomes: exitOutcomes(at, e.exit, e.down) };
    if (preparing && e.letGo) terms.letGo = e.letGo;
    return terms;
  };
  /** What its guess reads of it (`GuessedStrike`). */
  const guessed: GuessedStrike = { action, throws, target: targetOf };
  /** Whether its blow leaves the legs to a walk: what it needs with its first limb names no legs (`SkillsActions.needs`), read once, its skill's for good. */
  const onTheWay = (at: Situation): boolean => state.leaves ??= action.effectors.length > 0 && !claimsLegs(at.sight.actions.needs(action.name, action.effectors[0]!));
  /**
   * Its site on `side` (`Site`): where no limb is ready, the spot on that side in the window of the
   * first limb that has one (`windowSpot`), read once a step for each focus; none with a limb ready
   * or its blow under way, unless its blow leaves the legs to a walk (`onTheWay`): then the spot in
   * the window of the limb ready, and, its blow under way, the spot last read, moved as its focus
   * has moved since.
   */
  const siteOn = (side: Side, k: number): Site => ({
    name: k === 0 ? `${name}'s window` : `${name}'s window, the other side`,
    spot(at) {
      const running = live(at) !== undefined;
      if (unfit(at) || running && !onTheWay(at)) return null;
      const kept = state.sides[k]!, foe = at.focus, focus = foe?.id ?? null;
      if (kept.time !== at.time || kept.focus !== focus) {
        kept.time = at.time; kept.focus = focus;
        if (at.sight.view.down || running) {
          const stood = kept.stood?.focus === focus ? kept.stood : null;
          kept.spot = stood && foe ? { x: stood.spot.x + foe.centre.x - stood.foe[0], z: stood.spot.z + foe.centre.z - stood.foe[1], face: stood.spot.face,
            ...(stood.spot.facing === undefined ? {} : { facing: stood.spot.facing }) } : null;
          // Its blow live, the walk is sent its window's `through` past the spot toward the focus, so the body travels into the blow.
          if (kept.spot && foe && stood && stood.through > 0 && running && !at.sight.view.down) {
            const dx = foe.centre.x - kept.spot.x, dz = foe.centre.z - kept.spot.z, apart = hypot(dx, dz);
            if (apart > 0) kept.spot = { ...kept.spot, x: kept.spot.x + dx / apart * stood.through, z: kept.spot.z + dz / apart * stood.through };
          }
          kept.place = stood ? stood.place : null;
        } else {
          const { ready, placed } = offer(at);
          const window = ready === null ? placed?.readiness.kind === "position" ? placed.readiness.window : null
            : onTheWay(at) && ready.readiness.kind === "ready" ? ready.readiness.window ?? null : null;
          kept.spot = window ? windowSpot(at.sight.view, window, at.sight.report.legs.heading, side, kept.beside) : null;
          kept.place = window && kept.spot ? placeInWindow(window, kept.spot.x, kept.spot.z, kept.spot.face) : null;
          if (kept.spot && foe) kept.stood = { focus: foe.id, spot: { x: kept.spot.x, z: kept.spot.z, face: kept.spot.face, ...(kept.spot.facing === undefined ? {} : { facing: kept.spot.facing }) },
            place: kept.place, foe: [foe.centre.x, foe.centre.z], through: window?.through ?? 0 };
        }
      }
      return kept.spot;
    },
  });
  const sites = SIDES.map(siteOn);
  /** Where in the window of its limb ready the body stands now (`placeInWindow`), as its limbs are; null where none is ready, or its readiness names no window. */
  const placeOf = (now: Situation): [number, number] | null => {
    const ready = offer(now).ready?.readiness, where = now.where;
    return ready?.kind === "ready" && ready.window ? placeInWindow(ready.window, where.x, where.z, where.face) : null;
  };
  /** Where the body stands for it now, ready or not: the window of its limb ready, else of the first limb that has one; null where a blow of its own is under way or none has one. */
  const windowAny = (now: Situation): Window | null => {
    if (live(now) || unfit(now)) return null;
    const { ready, placed } = offer(now);
    const readied = ready?.readiness.kind === "ready" ? ready.readiness.window : undefined;
    return readied ?? (placed?.readiness.kind === "position" ? placed.readiness.window : null);
  };
  /**
   * The site the body stands at, of its sites as last read for the focus (`siteOn`), else undefined:
   * a site is where it begins, though the window it was read in moves with each stride.
   */
  const atSite = (at: Situation) => {
    const focus = at.focus?.id ?? null, where = at.where;
    return state.sides.find((kept) => kept.time === at.time && kept.focus === focus && kept.spot !== null
      && kept.spot.x === where.x && kept.spot.z === where.z && kept.spot.face === where.face);
  };
  return {
    name, kind: "strike", get claims() { return claimed.claims; }, state,
    modelled: { name, limbs: action.effectors, profiles: read },
    entry, bound,
    status: (now) => { if (state.over) return "over"; const phase = live(now)?.phase; return phase === "release" ? "exit" : phase === "commit" ? "committed" : "yields"; },
    sites,
    begin(now) { state.target = targetOf(now); state.id = null; state.since = now.time; state.over = false; state.began = null; state.place = null; },
    end() { state.id = null; state.target = null; state.began = null; state.place = null; },
    reads(now) {
      const reading = readingOf(now);
      // Its profile was found without the senses' reaction time (`StrikeMeasure`), so what has changed is read here, at the time they have now.
      return [{ what: name, source: reading ? staler(reading.source(now.focus?.spec ?? null), changes(reading.profile, { ...measured, reaction: now.reaction })) : NEVER_MEASURED }];
    },
    model(at) {
      if (!at.focus || !standing(at)) return null;
      const where = at.where, centre = at.sight.view.stance.centre;
      if (where.x === centre.x && where.z === centre.z) return entry(at).kind === "ready" ? priceOf(at, placeOf(at)) : null;
      const site = atSite(at);
      if (site) return priceOf(at, site.place);
      const window = windowAny(at);
      return window && windowHolds(window, where.x, where.z, where.face) ? priceOf(at, placeInWindow(window, where.x, where.z, where.face)) : null;
    },
    rate(now) {
      const focus = now.focus;
      if (!focus) return 0;
      const reading = readingOf(now, { own: "standing", target: now.foePosture });
      if (reading && expected(now)) return reading.peak(now.phase, focus.spec);
      const guess = guesses?.strike(now, guessed, 0) ?? null;
      return guess && guess.seconds > 0 ? guess.dealt / guess.seconds : 0;
    },
    step(now) { const asked = walk.kept(now, ask(now), now.focus?.id ?? null); return { asked, holds: asking(now, asked) }; },
  };
  /** What it asks this step: its blow, asked once a limb is ready and continued until it is over. */
  function ask(now: Situation): Asked {
    const face = walk.facing(now), still = { move: null, face, actions: [] };
    const running = live(now);
    // Kept at its exit, it strikes again: the blow under way is let go, and the next is asked once a limb is ready.
    if (running?.phase === "release") { state.id = null; state.since = now.time; state.began = null; state.place = null; return still; }
    if (running) state.began ??= now.time;
    if (running) return { ...still, actions: [{ id: running.id, action: running.action, effector: running.effector, target: structuredClone(running.target) }] };
    if (state.id !== null || !state.target || now.time - state.since >= PATIENCE) { state.over = true; return still; }
    const chosen = scan(now, state.target).ready;
    if (!chosen) { state.over = true; return still; }
    state.place = placeOf(now);
    state.id = now.sight.actions.instance();
    return { ...still, actions: [{ id: state.id, action: action.name, effector: chosen.limb, target: structuredClone(state.target) }] };
  }
}
