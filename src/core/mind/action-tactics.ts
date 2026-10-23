import { atan2, hypot } from "../math/real.ts";
import type { ActionAround, Readiness, Region, Window } from "../skills/action.ts";
import { landed } from "../skills/action-instances.ts";
import { STANCE_LOWER } from "../skills/locomotion.ts";
import { deepFreeze } from "../state.ts";
import { regionSegments } from "./action-aim.ts";
import { structuredConfig, type Behaviour, type Candidate, type Turn } from "./behaviour-part.ts";
import { FIGHTING, type BehavioursConfig, type ConditionConfig } from "./config.ts";
import { conditionMatches } from "./conditions.ts";
import { NO_COVER, type Intent } from "./intent.ts";
import { remainingOf } from "./movement.ts";
import type { Orders } from "./orders.ts";
import { orderedFacing } from "./ordered.ts";
import { slotList, anyBody } from "./parts.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";
import type { TacticsMaking, TacticsPart } from "./tactics-part.ts";

/** Detached decision facts for status displays and candidate inspection. */
export interface ActionEngagement {
  readonly phase: string;
  readonly focus: string | null;
  readonly lost: boolean;
  readonly pending: { readonly key: string; readonly since: number } | null;
  readonly candidates: readonly Candidate[];
}

/** Conditions share detached facts; distance reads proximity, while target and follow-up read focus. */
export function actionCondition(condition: ConditionConfig, sight: Sight, orders: Orders | null, focus: BodySense | null): boolean {
  let foe = Infinity, sinceTarget = Infinity;
  const centre = sight.view.stance.centre;
  for (const other of sight.view.senses.others) if (!other.out && other.side !== sight.view.senses.side)
    foe = Math.min(foe, hypot(other.centre.x - centre.x, other.centre.z - centre.z));
  if (focus) for (const record of [...sight.report.actions, ...sight.report.ledger]) {
    if (record.target.body !== focus.id || record.contacts.lastTarget === null) continue;
    const since = sight.view.time - record.contacts.lastTarget;
    if (since >= 0) sinceTarget = Math.min(sinceTarget, since);
  }
  return conditionMatches(condition, { walking: !!orders?.move, foe, destination: orders?.move ? remainingOf(orders.move, sight.view.stance.centre, sight.view.senses.others) : Infinity, targetDown: focus?.down ?? false, sinceTarget });
}

/** A turn as the tactics fill it in: every field written. */
type Filling = { -readonly [K in keyof Turn]: Turn[K] };

/**
 * **Behaviour tactics**: one focus and one ranked choice of candidate actions for the whole list,
 * then each behaviour (`BehaviourPart`, made as `making.parts` finds it) fills its part of the
 * intent in rank order (`Turn`).
 */
export function actionTactics(making: TacticsMaking, settings: BehavioursConfig): Tactics<Sight, Intent> {
  const { spec, estimates, orders: ordersOf } = making;
  const config = deepFreeze(structuredConfig(settings)), actions = deepFreeze(making.actions.map(action => structuredConfig(action)));
  if (!Number.isFinite(config.choose.rethink) || config.choose.rethink < 0 || !Number.isFinite(config.choose.patience) || config.choose.patience <= 0)
    throw new Error("action selection needs a finite rethink and positive patience");
  if (config.choose.kind === "estimate") {
    const units = actions.map(action => estimates[action.name]?.unit ?? (action.aim ? making.parts.of("aim", action.aim).unit : null));
    if (units.some(unit => unit === null) || new Set(units).size !== 1) throw new Error("estimate selection needs comparable estimates for every action");
  }
  const aims = making.aims;
  const made: readonly Behaviour[] = config.list.map(behaviour => making.parts.of("behaviour", behaviour).make({ spec, actions }, behaviour));
  const state = {
    phase: "guard", focus: null as string | null, orderedRegion: null as string | null, lost: false, nextTable: 0,
    pending: null as { key: string; since: number } | null, candidates: [] as Candidate[],
    awaiting: null as { id: number; key: string } | null, lastStarted: null as string | null,
    sequence: 0, missed: 0, counts: Object.fromEntries(actions.map(action => [action.name, { committed: 0, landed: 0 }])),
    behaviours: made.map(behaviour => behaviour.state ?? null),
    decision: { focus: null as string | null, evading: false, approach: null as Window | null },
  };
  const selectFocus = (sight: Sight, orders: Orders | null): BodySense | null => {
    const { view } = sight, valid = (id: string) => view.senses.others.find(foe => foe.id === id && !foe.out && foe.side !== view.senses.side) ?? null;
    state.lost = false;
    for (const rule of config.target) switch (rule.kind) {
      case "ordered": if (orders?.foe !== undefined) { const foe = valid(orders.foe); state.lost = foe === null; return foe; } break;
      case "current": { const foe = state.focus === null ? null : valid(state.focus); if (foe) return foe; break; }
      case "nearest": {
        let best: BodySense | null = null, distance = Infinity;
        const anyStanding = view.senses.others.some(foe => !foe.out && foe.side !== view.senses.side && !foe.down);
        for (const foe of view.senses.others) {
          if (foe.out || foe.side === view.senses.side || (rule.prefer === "standing" || anyStanding) && foe.down) continue;
          const apart = hypot(foe.centre.x - view.stance.centre.x, foe.centre.z - view.stance.centre.z);
          if (apart < distance) { best = foe; distance = apart; }
        }
        if (best) return best;
        break;
      }
      default: { const never: never = rule; throw new Error(`unknown focus rule ${JSON.stringify(never)}`); }
    }
    return null;
  };
  const around = (sight: Sight): ActionAround => ({ heading: sight.report.heading, placed: sight.view.stance.phase === "stand",
    support: sight.report.support ?? null, walk: null, lower: STANCE_LOWER });
  const recheck = (sight: Sight, candidate: Candidate): Readiness => candidate.readiness = candidate.eligible
    ? sight.readiness(sight.view, candidate.action, candidate.effector, candidate.target, around(sight)) : candidate.readiness;
  const rebuild = (sight: Sight, focus: BodySense | null, orders: Orders | null) => {
    state.candidates.length = 0;
    // An action that aims at nothing is not one the tactics choose a target for.
    if (focus) for (const action of actions) if (action.regions) for (const effector of action.effectors) {
      let found = false;
      const regions: readonly Region[] = orders?.region && orders.foe === focus.id ? [{ kind: "segment", segment: orders.region }] : action.regions;
      for (const region of regions) {
        const target = { kind: "body" as const, body: focus.id, region: { ...region } }, exists = regionSegments(focus.spec, region).length > 0;
        const eligible = !found && exists;
        const aimed = eligible ? aims.get(action.name)!(sight.view, target, effector, sight.report.ledger) : null;
        const provider = estimates[action.name], estimated = eligible && provider ? provider.read(sight.view, target, effector) : null;
        if (estimated !== null && !Number.isFinite(estimated)) throw new Error("action estimate must be finite");
        const estimate = provider ? estimated === null ? undefined : { unit: provider.unit, value: estimated } : aimed?.estimate;
        const candidate: Candidate = { key: JSON.stringify([action.name, effector, target]), action: action.name, effector, target, eligible,
          readiness: { kind: "blocked", reason: exists ? "earlier region available" : "no such region" }, ...(estimate ? { estimate: { ...estimate } } : {}) };
        if (eligible) recheck(sight, candidate);
        state.candidates.push(candidate); found ||= exists;
      }
    }
    state.nextTable = sight.view.time + config.choose.rethink;
  };
  const ranked = (sight: Sight, focus: BodySense | null, orders: Orders | null): Candidate[] => {
    let candidates = [...state.candidates];
    switch (config.choose.kind) {
      case "first-ready": break;
      case "rotate": {
        const index = candidates.findIndex(candidate => candidate.key === state.lastStarted);
        if (index >= 0) candidates = [...candidates.slice(index + 1), ...candidates.slice(0, index + 1)];
        break;
      }
      case "scored": {
        const score = (candidate: Candidate) => { const counts = state.counts[candidate.action]!; return (counts.landed + 1) / (counts.committed + 2); };
        candidates.sort((a, b) => score(b) - score(a)); break;
      }
      case "estimate": candidates = candidates.filter(candidate => candidate.estimate !== undefined);
        candidates.sort((a, b) => b.estimate!.value - a.estimate!.value); break;
      case "rules": {
        const wanted = config.choose.rules.find(rule => actionCondition(rule.when, sight, orders, focus))?.actions ?? config.choose.otherwise;
        candidates = candidates.filter(candidate => wanted.includes(candidate.action));
        candidates.sort((a, b) => wanted.indexOf(a.action) - wanted.indexOf(b.action)); break;
      }
      default: { const never: never = config.choose; throw new Error(`unknown selector ${JSON.stringify(never)}`); }
    }
    return candidates;
  };
  const turn: Filling = {
    sight: null as unknown as Sight, dt: 0, orders: null, focus: null, dx: 0, dz: 0, face: 0, pace: undefined, pending: undefined,
    legs: undefined, requested: undefined, left: undefined, right: undefined, evading: false, approach: null, phase: "guard",
    ranked: () => ranked(turn.sight, turn.focus, turn.orders),
    recheck: (candidate) => recheck(turn.sight, candidate),
    choose(candidate) {
      if (turn.pending?.key !== candidate.key) state.pending = { key: candidate.key, since: turn.sight.view.time };
      turn.pending = candidate;
    },
    start(candidate) {
      const id = turn.sight.instance();
      state.awaiting = { id, key: candidate.key };
      return { id, action: candidate.action, effector: candidate.effector, target: structuredConfig(candidate.target) };
    },
    interrupt() { for (const behaviour of made) behaviour.interrupted?.(); },
  };
  return { name: "Actions", state, engagement: state, get decision() { return state.decision; }, decide(sight, dt) {
    state.decision.evading = false; state.decision.approach = null;
    if (sight.view.senses.out) { turn.interrupt(); state.pending = null; state.awaiting = null; state.phase = "out"; return { move: null, face: sight.report.heading, guard: NO_COVER, actions: [] }; }
    const orders = ordersOf(sight), focus = selectFocus(sight, orders), changed = state.focus !== (focus?.id ?? null) || state.orderedRegion !== (orders?.region ?? null);
    state.focus = focus?.id ?? null;
    state.decision.focus = state.focus;
    state.orderedRegion = orders?.region ?? null;
    if (state.awaiting) {
      const admitted = sight.report.actions.some(action => action.id === state.awaiting!.id)
        || sight.report.ledger.some(record => record.id === state.awaiting!.id && record.ending.kind !== "refused");
      if (admitted) state.lastStarted = state.awaiting.key;
      state.awaiting = null; state.pending = null;
    }
    for (const record of sight.report.ledger) if (record.sequence > state.sequence) {
      state.missed += Math.max(0, record.sequence - state.sequence - 1); state.sequence = record.sequence;
      const count = state.counts[record.action];
      if (count && record.committed) { count.committed++; if (landed(record)) count.landed++; }
      for (const behaviour of made) behaviour.ended?.(record);
    }
    if (changed) { state.pending = null; for (const behaviour of made) behaviour.refocus?.(); }
    if (changed || sight.view.time >= state.nextTable) rebuild(sight, focus, orders);
    let pending = state.candidates.find(candidate => candidate.key === state.pending?.key);
    if (pending && config.choose.kind === "rules" && !ranked(sight, focus, orders).some(candidate => candidate.key === pending!.key)) { pending = undefined; state.pending = null; }
    if (pending && (sight.view.time - state.pending!.since >= config.choose.patience || recheck(sight, pending).kind === "blocked")) { pending = undefined; state.pending = null; }
    if (!pending || pending.readiness.kind === "waiting") {
      let position: Candidate | undefined, waiting: Candidate | undefined;
      for (const candidate of ranked(sight, focus, orders)) {
        if (!candidate.eligible) continue;
        if (candidate.readiness.kind === "blocked") continue;
        if (candidate.readiness.kind === "waiting") { waiting ??= candidate; continue; }
        const readiness = recheck(sight, candidate);
        if (readiness.kind === "ready") { pending = candidate; break; }
        if (!position && readiness.kind === "position") position = candidate;
        if (!waiting && readiness.kind === "waiting") waiting = candidate;
      }
      pending ??= position ?? waiting;
      if (pending && state.pending?.key !== pending.key) state.pending = { key: pending.key, since: sight.view.time };
    }
    const centre = sight.view.stance.centre, dx = focus ? focus.centre.x - centre.x : 0, dz = focus ? focus.centre.z - centre.z : 0;
    turn.sight = sight; turn.dt = dt; turn.orders = orders; turn.focus = focus; turn.dx = dx; turn.dz = dz;
    turn.face = focus ? atan2(dx, dz) : sight.report.heading; turn.pace = orders?.pace; turn.pending = pending;
    turn.legs = undefined; turn.requested = undefined; turn.left = undefined; turn.right = undefined; turn.phase = state.lost ? "lost" : "guard";
    turn.evading = false; turn.approach = null;
    for (const behaviour of made) behaviour.decide(turn);
    state.decision.evading = turn.evading; state.decision.approach = turn.approach;
    state.phase = turn.phase;
    const filled: Turn = turn, { legs, requested, left, right } = filled, facing = orders?.move === undefined && orders ? orderedFacing(orders.face) : null;
    return { move: legs?.move ?? null, face: facing ?? legs?.face ?? turn.face, guard: { "hand.left": left ?? null, "hand.right": right ?? null }, actions: requested ?? [],
      ...(legs?.lower === undefined ? {} : { lower: legs.lower }), ...(legs?.destination === undefined ? {} : { destination: legs.destination }),
      ...(legs?.movement === undefined ? {} : { movement: legs.movement }), ...(legs?.pace === undefined ? {} : { pace: legs.pace }),
      ...(legs?.walk ? { walk: true } : {}), ...(legs?.travelFacing ? { travelFacing: true } : {}) };
  } };
}

/** What is wrong with the selection's own numbers, each a sentence: its behaviours answer for their own. */
function selectionFaults(config: BehavioursConfig): readonly string[] {
  const faults: string[] = [];
  if (!Number.isFinite(config.choose.rethink) || config.choose.rethink < 0 || !Number.isFinite(config.choose.patience) || config.choose.patience <= 0)
    faults.push("selection needs finite nonnegative rethink and positive patience");
  if (config.choose.kind === "rules") for (const rule of config.choose.rules) {
    if (rule.when.kind === "when-distance" && (!Number.isFinite(rule.when.metres) || rule.when.metres < 0)) faults.push("rule distance must be finite and nonnegative");
    if (rule.when.kind === "follow-up" && (!Number.isFinite(rule.when.seconds) || rule.when.seconds < 0)) faults.push("follow-up duration must be finite and nonnegative");
  }
  return faults;
}

/** **Behaviours** (`actionTactics`): a ranked list of behaviours over one focus and one choice of action. */
export const BEHAVIOUR_TACTICS: TacticsPart<BehavioursConfig> = deepFreeze({
  role: "tactics", label: "Behaviours", stage: "game", phases: { guard: "Guarding", lost: "Finding opponent", out: null }, fields: [], slots: [slotList("list", "Behaviours", "behaviour")], defaults: FIGHTING,
  keys: { kind: true, target: true, choose: true, list: true }, fits: anyBody, faults: selectionFaults,
  decisionCapabilities: () => ["focus", "evading", "approach"],
  actionFaults(config, actions) {
    if (config.choose.kind !== "rules") return [];
    const choose = config.choose;
    return [...choose.otherwise, ...choose.rules.flatMap(rule => rule.actions)].filter(name => !actions.includes(name)).map(name => `selector: no action ${name}`);
  },
  make: actionTactics,
});
