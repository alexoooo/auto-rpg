import type { ActionAround, Readiness, Resource, TargetRef, Window } from "../skills/framework/action.ts";
import { STANCE_LOWER } from "../skills/locomotion/locomotion.ts";
import { regionSegments } from "../intent/action-aim.ts";
import { heldBeside, placeInWindow, SIDES, windowHolds, windowSpot, type Side, type Spot } from "../intent/action-window.ts";
import { orderAllows, orderedTarget } from "../intent/orders.ts";
import type { ActionConfig, ExecutorEntry } from "../skills/config.ts";
import type { PartLookup } from "../parts/lookup.ts";
import { measuredOn, profileFor, readProfile, skillDigest, staleness, type Expected, type Measured, type Profile } from "../skills/framework/profile.ts";
import type { Sight } from "../mind/decider.ts";
import { along, asking, blocked, READY, standing, type Asked, type Option, type Site, type Situation } from "./option.ts";
import { startOf, threatened } from "./percepts.ts";
import { clinched, record, upOrDown, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";
import type { BodySpec } from "../spec/body.ts";

/** How long a strike may wait to be admitted before it is given up, s. */
const PATIENCE = 2;

/** What an action's executor reads of the skills beside it, as the last step left them. */
export const around = (sight: Sight): ActionAround => ({ heading: sight.report.heading, placed: sight.view.stance.phase === "stand",
  support: sight.report.support ?? null, walk: null, lower: STANCE_LOWER });

/**
 * What a strike's profile is looked up by: the body throwing it, what a profile read by it must
 * have been measured on (`measuredOn`, no reaction time: the senses give it at each decision), and
 * the strikes' profiles it is looked up among (`ProfileTables.strikes`).
 */
interface StrikeMeasure {
  readonly spec: BodySpec;
  readonly measured: Measured;
  readonly profiles: readonly Profile[];
}

/** The measure (`StrikeMeasure`) of `action`, carried out by one of `executors`, thrown by a body of `spec` at `hz` whose mind decides at `rate` Hz and whose command is `delay` steps late, looked up among `profiles`. */
export const strikeMeasure = (parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], action: ActionConfig, hz: number, profiles: readonly Profile[], rate: number, delay: number): StrikeMeasure =>
  ({ spec, measured: measuredOn(spec, skillDigest(parts, spec, executors, action), hz, null, rate, delay), profiles });

/** The profile of the strike `measure` names, where one is measured as its body reads it (its reaction time aside: the senses give it); null where none is. */
function measuredProfile(measure: StrikeMeasure): Profile | null {
  const found = profileFor(measure.profiles, measure.measured);
  return found && found.stale === null ? found.profile : null;
}

/**
 * **A strike option** (`strike`): how its model is priced (`Option.priced`); its sites
 * (`Option.sites`), the spots in its window; what it deals a second (`Option.rate`), the most any
 * cell of its profile takes at the focus's phase from any start (`ProfileReading.peak`) where its
 * model reads its profile now, else its prior's (`priorOf`); and the strike its body is modelled by
 * (`Option.modelled`), its profile where one is measured as its body reads it (`measuredProfile`).
 */
type StrikeOption = Option & Required<Pick<Option, "priced" | "rate" | "sites" | "modelled">>;

/**
 * **Strike**: `action` at the focus with the first of its limbs that is ready, named `name` (the
 * action's unless given), on offer where one
 * is (its executor's readiness, which refuses a body down and a target out of its band). It
 * never walks: where no limb is ready and the first with a window says where it could begin (its
 * readiness's `position`), its sites are the spots in that window, one each side of the body its
 * target is on where that body lies (`windowSpot`, `SIDES`, each side's place held while it holds),
 * which a walk goes to (`Option.sites`). It asks for the blow once
 * the limb is ready, and goes on asking until the blow is over: then it has run its course. A blow
 * asked for and refused, every limb out of its entry, or `PATIENCE` s without a blow also end it.
 * It yields until its blow is committed (let go, the blow is dropped) and again from its exit, its
 * stroke's end (the blow's `release`): there, given up, it asks no more and its executor may hand
 * the arm to the guard; kept, it strikes again, its blow let go and the next asked of the first
 * limb ready. It claims what its blow needs with the limb it strikes with (`Sight.needs`): its blow
 * under way's, else the limb ready's, else the first with a window's; and holds what its blow holds
 * (`asking`). Its legs are kept out of every fallen body's reach but the focus's (`Walker.kept`). The region struck is what the
 * orders name on the focus, else the first of the action's regions the focus has; orders at the
 * focus that name a skill or a limb admit only its limbs of that skill (its executor, named by its
 * kind) and limb (`orderAllows`).
 *
 * Its model, where its drill measured it as it is read now (its profile among its measure's,
 * found by `measure`, read at the senses' reaction time): what the profile expects at the range
 * (to its reach), the start's velocity (`startOf`) and the focus's phase (`readProfile`): the focus's life its blows took, how long
 * it ran until its limb was back (`Expected.recovers`), and its chance of ending down; through the blow coming, and the focus's pressure while it
 * runs, past the focus's latency (`threatened`, `graceAt`); and, its blow
 * begun and not yet committed, what letting it go cost there at its progress (`Expected.letGo`).
 * Else its prior (`priorOf`), read the same way. It leaves the body up at the range its
 * trials came back at (`Expected.exit`), else where it strikes from, on the line from the focus through
 * it, facing the focus (`along`); and down in its chance of ending down.
 *
 * At a state where the body stands (`standing`), where it stands now its entry says whether it is
 * on offer; elsewhere, at one of its sites (`atSite`), or where the spot it stands at is within its
 * window now, ready or not (`windowAny`, `windowHolds`), its model there as it would be here.
 */
export function strike(action: ActionConfig, walk: Walker, throws: number, measure: StrikeMeasure, name = action.name): StrikeOption {
  const state = { limb: null as string | null, target: null as TargetRef | null, id: null as number | null, since: 0, over: false, began: null as number | null,
    // Each side's place beside a body lying (`HeldBeside`), and its spot as last read: at what time, for what focus, and where in its window (`placeInWindow`).
    sides: SIDES.map(() => ({ beside: heldBeside(), time: NaN, focus: null as string | null, spot: null as Spot | null, place: null as [number, number] | null })),
    // Where in its window its blow under way was asked (`placeInWindow`), null with none.
    place: null as [number, number] | null };
  const { measured } = measure, found = profileFor(measure.profiles, measured);
  /** Its profile, where it is read now: measured as the body reads it, its senses as late. */
  const profileNow = (now: Situation): Profile | null =>
    found && staleness(found.profile, { ...measured, reaction: now.reaction }) === null ? found.profile : null;
  /**
   * What its profile expects begun where the body stands now, as it moves (`startOf`) and at
   * `place` in its window (`placeInWindow`; its middle unless given), and, its motion `progress` s
   * under way, what letting it go there costs (`ProfileReading.expect`); null where none prices it.
   */
  const expected = (now: Situation, place?: readonly [number, number] | null, progress?: number): Expected | null => {
    const profile = profileNow(now), focus = now.focus;
    if (!profile || !focus) return null;
    const reading = readProfile(profile, measure.spec, { own: "standing", target: now.foePosture });
    return reading.expect({ range: Math.min(now.apart, reading.reach(now.phase)), phase: now.phase, velocity: startOf(now),
      ...(place ? { window: place } : {}), ...(progress === undefined ? {} : { progress }) }, focus.spec);
  };
  const targetOf = (now: Situation): TargetRef | null => {
    const focus = now.focus;
    return focus && action.regions ? orderedTarget(now.orders ?? null, focus, action.regions) : null;
  };
  const readiness = (now: Situation, limb: string, target: TargetRef): Readiness =>
    now.sight.readiness(now.sight.view, action.name, limb, target, around(now.sight));
  type Limb = { readonly limb: string; readonly readiness: Readiness };
  /** The first limb ready at `target`, and the first with a window to walk to (`position`) where none is: what a walk into it goes to (`window`). */
  const scan = (now: Situation, target: TargetRef): { ready: Limb | null; placed: Limb | null } => {
    let placed: Limb | null = null;
    for (const limb of action.effectors) {
      if (target.kind === "body" && !orderAllows(now.orders ?? null, target.body, action.executor, limb)) continue;
      const ready = readiness(now, limb, target);
      if (ready.kind === "ready") return { ready: { limb, readiness: ready }, placed: null };
      if (ready.kind === "position") placed ??= { limb, readiness: ready };
    }
    return { ready: null, placed };
  };
  /**
   * What its entry reads of its limbs at the target the situation names (`targetOf`), once a step
   * for each focus: the chooser weighs every foe's situation in a step, each with its own focus.
   */
  const offers = new Map<string | null, { time: number; target: TargetRef | null; ready: Limb | null; placed: Limb | null }>();
  const offer = (now: Situation) => {
    const focus = now.focus?.id ?? null;
    let offered = offers.get(focus);
    if (!offered) offers.set(focus, offered = { time: NaN, target: null, ready: null, placed: null });
    if (offered.time === now.time) return offered;
    offered.time = now.time; offered.target = targetOf(now);
    const scanned = offered.target === null ? { ready: null, placed: null } : scan(now, offered.target);
    offered.ready = scanned.ready; offered.placed = scanned.placed;
    return offered;
  };
  const live = (now: Situation) => state.id === null ? undefined : now.sight.report.actions.find((a) => a.id === state.id);
  const UNFIT = blocked("no focus to strike"), UNAIMED = blocked("the focus has none of its regions"), UNREADY = blocked("no limb in its entry");
  /** Whether the focus and its blow under way leave it a target to strike. */
  const unfit = (now: Situation): boolean => !now.focus || state.target !== null && state.target.body !== now.focus.id;
  /** What it claims (`Option.claims`), as its entry last read it: what its blow needs with the limb it strikes with. */
  const claimed = { claims: Object.freeze([]) as readonly Resource[] };
  const claim = (now: Situation, limb: string | undefined): void => { if (limb !== undefined) claimed.claims = now.sight.needs(action.name, limb); };
  const entry = (now: Situation): Readiness => {
    const running = live(now);
    if (running) { claim(now, running.effector); return READY; }
    if (unfit(now)) return UNFIT;
    const { target, ready, placed } = offer(now);
    if (target === null) return UNAIMED;
    claim(now, ready?.limb ?? placed?.limb);
    return ready?.readiness ?? UNREADY;
  };
  /**
   * Its model (`Terms`) at `at`, begun at `place` in its window (`placeInWindow`; its blow under
   * way's where one is). Its blow under way, short of its exit, it is priced from where it
   * is: the time its motion has left, and its payoff unless its blow has met the target. Its chance
   * of ending down is its profile's where one measures it (its trials' falls, in a clinch or not),
   * else the clinch's (`clinched`).
   */
  const priceOf = (at: Situation, place: readonly [number, number] | null): Terms => {
    const apart = at.range;
    const running = live(at), under = running !== undefined && running.phase !== "release";
    const progress = under && state.began !== null ? at.time - state.began : 0, met = under && running.contacts.lastTarget !== null;
    const preparing = running?.phase === "prepare", measured = expected(at, running ? state.place : place, preparing ? progress : undefined), e = measured ?? priorOf(at);
    const duration = Math.max(0, e.seconds + e.recovers - progress);
    const letGo = preparing && e.letGo ? { letGo: e.letGo } : {};
    return { duration, dealt: met ? 0 : e.dealt, taken: at.predictions.danger + threatened(at, duration), orders: 0,
      outcomes: upOrDown({ where: along(at, e.exit?.range ?? apart) }, Math.max(e.down, measured ? 0 : clinched(at, duration, at.apart))), ...letGo };
  };
  /**
   * Its prior, where no profile prices it, read as a profile is (`Expected`): `throws` blows
   * from its stronger limb at the segment its region strikes (`blowLife`), each landing as often as its record says (`record`, of its action
   * with its limbs), as long as its record says it runs.
   */
  const priorOf = (now: Situation): Expected => {
    const { lands, seconds } = record(now.sight.report.ledger, action);
    const target = targetOf(now), segment = target?.kind === "body" && now.focus ? regionSegments(now.focus.spec, target.region)[0] : undefined;
    const struck = segment ?? now.focus?.spec.marks.high ?? "";
    const blow = Math.max(...action.effectors.map((limb) => now.predictions.blows(limb, struck)));
    return { done: lands, dealt: throws * lands * blow, seconds, recovers: 0, down: 0, ends: [] };
  };
  /**
   * Its site on `side` (`Site`), where no blow of its own is under way: where no limb is ready, the
   * spot on that side in the window of the first limb that has one (`windowSpot`), read once a step
   * for each focus.
   */
  const siteOn = (side: Side, k: number): Site => ({
    name: k === 0 ? `${name}'s window` : `${name}'s window, the other side`,
    spot(at) {
      if (live(at) || unfit(at)) return null;
      const kept = state.sides[k]!, focus = at.focus?.id ?? null;
      if (kept.time !== at.time || kept.focus !== focus) {
        const { ready, placed } = offer(at), window = ready === null && placed?.readiness.kind === "position" ? placed.readiness.window : null;
        kept.time = at.time; kept.focus = focus; kept.spot = window ? windowSpot(at.sight.view, window, at.sight.report.heading, side, kept.beside) : null;
        kept.place = window && kept.spot ? placeInWindow(window, kept.spot.x, kept.spot.z, kept.spot.face) : null;
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
    name, get claims() { return claimed.claims; }, state,
    modelled: { name, limbs: action.effectors, profile: measuredProfile(measure) },
    entry,
    status: (now) => { if (state.over) return "over"; const phase = live(now)?.phase; return phase === "release" ? "exit" : phase === "commit" ? "committed" : "yields"; },
    sites,
    begin(now) { state.limb = null; state.target = targetOf(now); state.id = null; state.since = now.time; state.over = false; state.began = null; state.place = null; },
    end() { state.id = null; state.limb = null; state.target = null; state.began = null; state.place = null; },
    priced(now) {
      if (!found) return "by hand, no drill measured it";
      const stale = staleness(found.profile, { ...measured, reaction: now.reaction });
      if (stale !== null) return `by hand, ${stale}`;
      if (!expected(now)) return "by hand, no trial of its profile reads here";
      const scaled = readProfile(found.profile, measure.spec).scaled(now.focus?.spec ?? null);
      return scaled === null ? "measured" : `measured, ${scaled}`;
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
      const profile = profileNow(now), focus = now.focus;
      if (!focus) return 0;
      if (profile && expected(now)) return readProfile(profile, measure.spec, { own: "standing", target: now.foePosture }).peak(now.phase, focus.spec);
      const prior = priorOf(now);
      return prior.seconds > 0 ? prior.dealt / prior.seconds : 0;
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
    state.limb = chosen.limb; state.place = placeOf(now);
    state.id = now.sight.instance();
    return { ...still, actions: [{ id: state.id, action: action.name, effector: chosen.limb, target: structuredClone(state.target) }] };
  }
}
