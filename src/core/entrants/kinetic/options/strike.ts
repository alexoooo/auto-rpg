import type { ActionAround, Readiness, Region, TargetRef, Window } from "../../../skills/action.ts";
import { STANCE_LOWER } from "../../../skills/locomotion.ts";
import { regionSegments } from "../../../mind/action-aim.ts";
import type { ActionConfig, ExecutorEntry } from "../../../mind/config.ts";
import type { PartLookup } from "../../../mind/lookup.ts";
import { dataOf } from "../../../data/store.ts";
import { measuredOn, profileFor, readProfile, skillDigest, staleness, type Expected, type Measured, type Profile } from "../../../mind/profile.ts";
import type { Sight } from "../../../mind/tactics.ts";
import { asking, blocked, READY, type Asked, type Situation, type Option } from "./option.ts";
import { threatened } from "./percepts.ts";
import { clinched, record, type Terms } from "./value.ts";
import { fromHere, type Going } from "./position.ts";
import type { Walker } from "./walk.ts";
import type { BodySpec, Side } from "../../../spec/body.ts";

/** How long a strike may wait to be admitted before it is given up, s. */
const PATIENCE = 2;

/** What an action's executor reads of the skills beside it, as the last step left them. */
export const around = (sight: Sight): ActionAround => ({ heading: sight.report.heading, placed: sight.view.stance.phase === "stand",
  support: sight.report.support ?? null, walk: null, lower: STANCE_LOWER });

/** What a strike's profile is looked up by: the body throwing it, and what a profile read by it must have been measured on (`measuredOn`, no reaction time: the senses give it at each decision). */
export interface StrikeMeasure {
  readonly spec: BodySpec;
  readonly measured: Measured;
}

/** The measure (`StrikeMeasure`) of `action`, carried out by one of `executors`, thrown by a body of `spec` at `hz`. */
export const strikeMeasure = (parts: PartLookup, spec: BodySpec, executors: readonly ExecutorEntry[], action: ActionConfig, hz: number): StrikeMeasure =>
  ({ spec, measured: measuredOn(spec, skillDigest(parts, executors, action), hz, null) });

/** The profile of the strike `measure` names, where one is measured as its body reads it (its reaction time aside: the senses give it); null where none is. */
export function measuredProfile(measure: StrikeMeasure): Profile | null {
  const found = profileFor(dataOf("strike-profiles"), measure.measured);
  return found && found.stale === null ? found.profile : null;
}

/** **A strike option** (`strike`), which says how its model is priced. */
export interface StrikeOption extends Option {
  /**
   * How its model is priced now, a sentence: measured, where a cell of its profile prices it (and
   * why scaled, `ProfileReading.scaled`); else by hand, and why: no drill measured it, its profile
   * is stale (`staleness`), or no cell reads where it stands.
   */
  priced(now: Situation): string;
  /**
   * The window its legs are to be brought to for it now (`Readiness`'s `position`): the first of
   * its limbs' that has one, where none is ready and no blow of its own is under way; null where a
   * limb is ready, or none has a window. What a walk into it goes to (`toWindow`).
   */
  window(now: Situation): Window | null;
  /** Its model walked into its window first by `going`, wherever the body stands, braced there before it strikes: what a walk into it is worth (`toWindow`). */
  through(now: Situation, going: Going): Terms;
}

/**
 * **Strike**: `action` at the focus, a standing foe, with the first of its limbs that is ready. It
 * never walks: a walk into its window is another option's (`toWindow`). It asks for the blow once
 * the limb is ready, and goes on asking until the blow is over: then it has run its course. A blow
 * asked for and refused, every limb out of its entry, or `PATIENCE` s without a blow also end it.
 * It yields until its blow is committed (let go, the blow is dropped) and again from its exit, its
 * stroke's end (the blow's `release`): there, given up, it asks no more and its executor may hand
 * the arm to the guard; kept, it strikes again, its blow let go and the next asked of the first
 * limb ready. It claims the legs and the trunk, and holds what its blow holds (`asking`): a limb is
 * its blow's as it asks it, and a cover of it is dropped (`stepSet`). The region struck is what the
 * orders name on the focus, else the first of the action's regions the focus has.
 *
 * Its model, where its drill measured it as it is read now (its profile among `STRIKE_PROFILES`,
 * found by `measure`, read at the senses' reaction time): what the profile expects at the range
 * (to its reach) and the focus's phase (`readProfile`): the focus's life its blows took, its own
 * the drill took (the foe's reply while it struck), how long it ran and its chance of ending down;
 * through the blow coming, and the focus's pressure within its reach (`threatened`); and, its blow
 * begun and not yet committed, what letting it go cost there at its progress (`Expected.letGo`).
 * Else its prior (`priorOf`), read the same way. It leaves the body at the range its cell's trials
 * ended at (`Expected.exit`), else where it strikes from.
 * What a walk into its window first is worth is `through`'s.
 */
export function strike(action: ActionConfig, walk: Walker, throws: number, measure: StrikeMeasure): StrikeOption {
  const state = { limb: null as string | null, target: null as TargetRef | null, id: null as number | null, since: 0, over: false, began: null as number | null };
  const { measured } = measure, found = profileFor(dataOf("strike-profiles"), measured);
  /** Its profile, where it is read now: measured as the body reads it, its senses as late. */
  const profileNow = (now: Situation): Profile | null =>
    found && staleness(found.profile, { ...measured, reaction: now.reaction }) === null ? found.profile : null;
  /** What its profile expects where the body stands now, `progress` s into its motion (`ProfileReading.expect`); null where none prices it. */
  const expected = (now: Situation, progress: number): Expected | null => {
    const profile = profileNow(now), focus = now.focus;
    if (!profile || !focus) return null;
    const reading = readProfile(profile, measure.spec);
    return reading.expect({ range: Math.min(now.apart, reading.reach(now.phase)), phase: now.phase, progress }, focus.spec);
  };
  const targetOf = (now: Situation): TargetRef | null => {
    const focus = now.focus;
    if (!focus || !action.regions) return null;
    const ordered = now.orders?.foe === focus.id && now.orders.region !== undefined ? [{ kind: "segment", segment: now.orders.region } as Region] : action.regions;
    const region = ordered.find((r) => regionSegments(focus.spec, r).length > 0);
    return region ? { kind: "body", body: focus.id, region } : null;
  };
  const readiness = (now: Situation, limb: string, target: TargetRef): Readiness =>
    now.sight.readiness(now.sight.view, action.name, limb, target, around(now.sight));
  type Limb = { readonly limb: string; readonly readiness: Readiness };
  /** The first limb ready at `target`, and the first with a window to walk to (`position`) where none is: what a walk into it goes to (`window`). */
  const scan = (now: Situation, target: TargetRef): { ready: Limb | null; placed: Limb | null } => {
    let placed: Limb | null = null;
    for (const limb of action.effectors) {
      const ready = readiness(now, limb, target);
      if (ready.kind === "ready") return { ready: { limb, readiness: ready }, placed: null };
      if (ready.kind === "position") placed ??= { limb, readiness: ready };
    }
    return { ready: null, placed };
  };
  /** What its entry reads of its limbs at the target the situation names (`targetOf`), once a step. */
  const offered = { time: NaN, target: null as TargetRef | null, ready: null as Limb | null, placed: null as Limb | null };
  const offer = (now: Situation): typeof offered => {
    if (offered.time === now.time) return offered;
    offered.time = now.time; offered.target = targetOf(now);
    const scanned = offered.target === null ? { ready: null, placed: null } : scan(now, offered.target);
    offered.ready = scanned.ready; offered.placed = scanned.placed;
    return offered;
  };
  const live = (now: Situation) => state.id === null ? undefined : now.sight.report.actions.find((a) => a.id === state.id);
  const UNFIT = blocked("no standing focus to strike"), UNAIMED = blocked("the focus has none of its regions"), UNREADY = blocked("no limb in its entry");
  /** Whether the body, the focus and its blow under way leave it a target to strike. */
  const unfit = (now: Situation): boolean => now.down || !now.focus || now.focus.down || state.target !== null && state.target.body !== now.focus.id;
  const entry = (now: Situation): Readiness => {
    if (live(now)) return READY;
    if (unfit(now)) return UNFIT;
    const { target, ready } = offer(now);
    if (target === null) return UNAIMED;
    return ready?.readiness ?? UNREADY;
  };
  /**
   * Its model (`Terms`), walked into its window first where `walks`, by `going` where it names a
   * gait, and braced there. Its blow under way, short of its exit, it is priced from where it is:
   * the time its motion has left, and its payoff unless its blow has met the target.
   */
  const priceOf = (now: Situation, walks: boolean, going?: Going): Terms => {
    const apart = now.range, { theirs, mine } = now.reach, pace = walk.pace(now, going?.gait), braced = going?.braced ?? 0, fell = going?.down ?? 0;
    const walking = walks ? Math.max(0, apart - mine) / pace + braced : 0, walkingInReach = walks ? Math.max(0, Math.min(apart, theirs) - mine) / pace : 0;
    const running = live(now), under = running !== undefined && running.phase !== "release";
    const progress = under && state.began !== null ? now.time - state.began : 0, met = under && running.contacts.lastTarget !== null;
    const from = walks ? Math.min(apart, mine) : apart, e = expected(now, progress) ?? priorOf(now, from);
    const left = Math.max(0, e.seconds - progress), share = e.seconds > 0 ? left / e.seconds : 0, duration = walking + left;
    const letGo = running?.phase === "prepare" && e.letGo ? { letGo: e.letGo } : {};
    return { duration, dealt: met ? 0 : e.dealt, taken: now.predictions.danger + e.taken * share + threatened(now, walkingInReach, from),
      orders: 0, exit: fromHere(now, { range: e.exit?.range ?? from, down: Math.max(e.down, fell, clinched(now, duration)) }), ...letGo };
  };
  /**
   * Its prior, where no profile prices it, read as a profile's cell is (`Expected`): `throws` blows
   * from its stronger hand, each landing as often as its record says (`record`, which is of the hand
   * it is asked for), as long as its record says it runs, under the focus's pressure from `from` m
   * head to head.
   */
  const priorOf = (now: Situation, from: number): Expected => {
    const { lands, seconds } = record(now.sight.report.ledger, action.name);
    const blow = Math.max(...action.effectors.map((limb) => limb.startsWith("hand.") ? now.predictions.blows[limb.slice(5) as Side] : 0));
    return { done: lands, dealt: throws * lands * blow, taken: threatened(now, seconds, from), seconds, down: 0, ends: [] };
  };
  return {
    name: action.name, claims: Object.freeze(["legs", "trunk"]), state,
    entry,
    status: (now) => { if (state.over) return "over"; const phase = live(now)?.phase; return phase === "release" ? "exit" : phase === "commit" ? "committed" : "yields"; },
    window(now) {
      if (live(now) || unfit(now)) return null;
      const { ready, placed } = offer(now);
      return ready === null && placed?.readiness.kind === "position" ? placed.readiness.window : null;
    },
    begin(now) { state.limb = null; state.target = targetOf(now); state.id = null; state.since = now.time; state.over = false; state.began = null; },
    end() { state.id = null; state.limb = null; state.target = null; state.began = null; },
    priced(now) {
      if (!found) return "by hand, no drill measured it";
      const stale = staleness(found.profile, { ...measured, reaction: now.reaction });
      if (stale !== null) return `by hand, ${stale}`;
      if (!expected(now, 0)) return "by hand, no cell of its profile reads here";
      const scaled = readProfile(found.profile, measure.spec).scaled(now.focus?.spec ?? null);
      return scaled === null ? "measured" : `measured, ${scaled}`;
    },
    model: (now) => priceOf(now, false),
    through: (now, going) => priceOf(now, true, going),
    step(now) { const asked = ask(now); return { asked, holds: asking(now, asked) }; },
  };
  /** What it asks this step: its blow, asked once a limb is ready and continued until it is over. */
  function ask(now: Situation): Asked {
    const face = walk.facing(now), still = { move: null, face, actions: [] };
    const running = live(now);
    // Kept at its exit, it strikes again: the blow under way is let go, and the next is asked once a limb is ready.
    if (running?.phase === "release") { state.id = null; state.since = now.time; state.began = null; return still; }
    if (running) state.began ??= now.time;
    if (running) return { ...still, actions: [{ id: running.id, action: running.action, effector: running.effector, target: structuredClone(running.target) }] };
    if (state.id !== null || !state.target || now.time - state.since >= PATIENCE) { state.over = true; return still; }
    const chosen = scan(now, state.target).ready;
    if (!chosen) { state.over = true; return still; }
    state.limb = chosen.limb;
    state.id = now.sight.instance();
    return { ...still, actions: [{ id: state.id, action: action.name, effector: chosen.limb, target: structuredClone(state.target) }] };
  }
}
