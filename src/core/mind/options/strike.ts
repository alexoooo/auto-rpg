import type { ActionAround, Readiness, Region, TargetRef } from "../../skills/action.ts";
import { STANCE_LOWER } from "../../skills/locomotion.ts";
import { regionSegments } from "../action-aim.ts";
import type { ActionConfig, ExecutorEntry } from "../config.ts";
import type { PartLookup } from "../lookup.ts";
import { expect, farthest, measuredOn, profileFor, skillDigest, staleness, STRIKE_PROFILES, type Measured, type Profile } from "../profile.ts";
import type { Sight } from "../tactics.ts";
import { asking, blocked, READY, type Situation, type StandingOption } from "./option.ts";
import { threatened } from "./percepts.ts";
import { clinched, orderedDealt, record, type Terms } from "./value.ts";
import type { Walker } from "./walk.ts";
import type { BodySpec, Side } from "../../spec/body.ts";

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
  const found = profileFor(STRIKE_PROFILES, measure.measured);
  return found && found.stale === null ? found.profile : null;
}

/** **A strike option** (`strike`), which says why its model is built by hand. */
export interface StrikeOption extends StandingOption {
  /** Why its model is built by hand now, a sentence: no drill measured it, or its profile is stale (`staleness`); null where it reads its profile. */
  unmeasured(now: Situation): string | null;
}

/**
 * **Strike**: `action` at the focus, a standing foe, with the first of its limbs that is ready; or,
 * where it `closes`, else the first its executor would admit from a window, which its legs are
 * brought to first (`approach`). It asks for the blow once the limb is ready, and goes on asking
 * until the blow is over: then it has run its course. A blow asked for and refused, every limb out
 * of its entry, or `PATIENCE` s without a blow also end it. It yields until its blow is committed,
 * and holds what its blow holds (`asking`). Its exit is its stroke's end (the blow's `release`).
 * The region struck is what the orders name on the focus, else the first of the action's regions
 * the focus has.
 *
 * Its model, where its drill measured it as it is read now (its profile among `STRIKE_PROFILES`,
 * found by `measure`, read at the senses' reaction time): walking into the window, where its entry
 * is one, then the profile's cell nearest the range (to its farthest measured), the closing speed
 * and the focus's phase (`expect`): the focus's life its blows took, its own the drill took (the
 * foe's reply while it struck), how long it ran and its chance of ending down; through the blow
 * coming, and the focus's pressure while it walks within the focus's reach (`threatened`). Else
 * built by hand: walking into the window until the focus is in its reach, then `throws` blows from
 * its stronger hand, each landing as often as its record says (`record`, which is of the hand it is
 * asked for), within the focus's reach from where it stands or the focus would reach it while it
 * strikes, and through the blow coming. Either leaves the body where it strikes from: its own reach,
 * or nearer where it stands nearer.
 */
export function strike(action: ActionConfig, walk: Walker, closes: boolean, throws: number, measure: StrikeMeasure): StrikeOption {
  const state = { limb: null as string | null, target: null as TargetRef | null, id: null as number | null, since: 0, over: false };
  const { measured } = measure, found = profileFor(STRIKE_PROFILES, measured);
  /** Its profile, where it is read now: measured as the body reads it, its senses as late. */
  const profileNow = (now: Situation): Profile | null =>
    found && staleness(found.profile, { ...measured, reaction: now.reaction }) === null ? found.profile : null;
  const targetOf = (now: Situation): TargetRef | null => {
    const focus = now.focus;
    if (!focus || !action.regions) return null;
    const ordered = now.orders?.foe === focus.id && now.orders.region !== undefined ? [{ kind: "segment", segment: now.orders.region } as Region] : action.regions;
    const region = ordered.find((r) => regionSegments(focus.spec, r).length > 0);
    return region ? { kind: "body", body: focus.id, region } : null;
  };
  const readiness = (now: Situation, limb: string, target: TargetRef): Readiness =>
    now.sight.readiness(now.sight.view, action.name, limb, target, around(now.sight));
  /** The first limb ready, else, where it closes, the first with a window to walk to; null with neither. */
  const limbFor = (now: Situation, target: TargetRef): { limb: string; readiness: Readiness } | null => {
    let placed: { limb: string; readiness: Readiness } | null = null;
    for (const limb of action.effectors) {
      const ready = readiness(now, limb, target);
      if (ready.kind === "ready") return { limb, readiness: ready };
      if (closes && ready.kind === "position") placed ??= { limb, readiness: ready };
    }
    return placed;
  };
  const live = (now: Situation) => state.id === null ? undefined : now.sight.report.actions.find((a) => a.id === state.id);
  const UNFIT = blocked("no standing focus to strike"), UNAIMED = blocked("the focus has none of its regions"), UNREADY = blocked("no limb in its entry");
  const STROKE: Readiness = Object.freeze({ kind: "waiting", reason: "the stroke goes on" });
  const entry = (now: Situation): Readiness => {
    if (live(now)) return READY;
    if (now.down || !now.focus || now.focus.down || state.target !== null && state.target.body !== now.focus.id) return UNFIT;
    const target = targetOf(now);
    if (target === null) return UNAIMED;
    return limbFor(now, target)?.readiness ?? UNREADY;
  };
  return {
    name: action.name, posture: "standing", layer: "commitment", state,
    entry,
    exit: (now) => live(now)?.phase === "release" ? READY : STROKE,
    yields: (now) => (live(now)?.phase ?? "prepare") === "prepare",
    ended: () => state.over,
    holds: asking,
    begin(now) { state.limb = null; state.target = targetOf(now); state.id = null; state.since = now.time; state.over = false; },
    end() { state.id = null; state.limb = null; state.target = null; },
    unmeasured: (now) => !found ? "no drill measured it" : staleness(found.profile, { ...measured, reaction: now.reaction }),
    models: { "hand-built": (now): Terms => {
      const { apart, theirs, mine } = now.reach, pace = walk.pace(now), walks = entry(now).kind === "position";
      const walking = walks ? Math.max(0, apart - mine) / pace : 0, walkingInReach = walks ? Math.max(0, Math.min(apart, theirs) - mine) / pace : 0;
      const profile = profileNow(now), focus = now.focus;
      const e = profile && focus ? expect(profile, { range: Math.min(now.apart, farthest(profile, now.phase)), closing: now.closing, phase: now.phase }) : null;
      const from = walks ? Math.min(apart, mine) : apart;
      if (e && focus) {
        const dealt = e.dealt / focus.spec.wounds.hp.value, duration = walking + e.seconds;
        return { duration, dealt, taken: now.danger + e.taken / measure.spec.wounds.hp.value + threatened(now, walkingInReach, from),
          orders: orderedDealt(now, dealt), exit: { apart: from, down: Math.max(e.down, clinched(now, duration)) } };
      }
      const { lands, seconds } = record(now.sight.report.ledger, action.name);
      const blow = Math.max(...action.effectors.map((limb) => limb.startsWith("hand.") ? now.blows[limb.slice(5) as Side] : 0));
      const dealt = throws * lands * blow, duration = walking + seconds;
      return { duration, dealt, taken: now.danger + threatened(now, seconds + walkingInReach, from), orders: orderedDealt(now, dealt), exit: { apart: from, down: clinched(now, duration) } };
    } },
    step(now) {
      const face = walk.facing(now), still = { move: null, face, actions: [] };
      const running = live(now);
      if (running) return { ...still, actions: [{ id: running.id, action: running.action, effector: running.effector, target: structuredClone(running.target) }] };
      if (state.id !== null || !state.target || now.time - state.since >= PATIENCE) { state.over = true; return still; }
      const chosen = limbFor(now, state.target);
      if (!chosen) { state.over = true; return still; }
      state.limb = chosen.limb;
      switch (chosen.readiness.kind) {
        case "ready": {
          state.id = now.sight.instance();
          return { ...still, actions: [{ id: state.id, action: action.name, effector: chosen.limb, target: structuredClone(state.target) }] };
        }
        case "position": return { ...still, approach: chosen.readiness.window };
        case "waiting": case "blocked": return still;
        default: { const never: never = chosen.readiness; throw new Error(`unknown readiness ${JSON.stringify(never)}`); }
      }
    },
  };
}
