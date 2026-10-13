import type { BodyView } from "../body.ts";
import type { StanceEnvelope } from "../control/stance-envelope.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { ActionAround, ActionIntent, ActionRequest, ActionStatus, Ended, Readiness, Region, TargetRef } from "../skills/action.ts";
import { cleanMiss, landed } from "../skills/action-instances.ts";
import { STANCE_LOWER } from "../skills/locomotion.ts";
import { rangeOf } from "../skills/strike.ts";
import type { SupportReport } from "../skills/support-fold.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { actionAim, regionSegments } from "./action-aim.ts";
import { approachActionWindow } from "./action-window.ts";
import { clearanceExit, clearMove } from "./clear-step.ts";
import type { ActionConfig } from "./config.ts";
import type { Cover } from "./intent.ts";
import type { Heading } from "./orders.ts";
import { bodyClearance } from "./sensed-bounds.ts";
import type { BodySense } from "./senses.ts";
import type { Tactics } from "./tactics.ts";
import { THREAT, threatReader } from "./threat.ts";

/** Ordered identity is independent of the action's aiming rule. */
interface ActionOrders {
  readonly move: Heading | null;
  readonly face: Heading | null;
  readonly pace?: number;
  readonly foe?: string;
  readonly region?: string;
  readonly destination?: number;
}

/** Selection sees the public protocol and never an executor's motion state or kind. */
export interface ActionSight {
  readonly view: BodyView;
  readonly report: { readonly heading: number; readonly actions: readonly ActionStatus[]; readonly ledger: readonly Ended[]; readonly support?: SupportReport };
  readonly envelope: StanceEnvelope | null;
  instance(): number;
  readiness(view: BodyView, action: string, effector: string, target: TargetRef, around: ActionAround): Readiness;
}

type FocusRule = { readonly kind: "ordered" | "current" } | { readonly kind: "nearest"; readonly prefer: "standing" | "standing-first" };
type Condition = { readonly kind: "always" | "when-standing" | "target-down" }
  | { readonly kind: "when-distance"; readonly of: "foe" | "destination"; readonly than: "under" | "over"; readonly metres: number }
  | { readonly kind: "follow-up"; readonly seconds: number };
type Selector = { readonly kind: "first-ready" | "rotate" | "scored" | "estimate" }
  | { readonly kind: "rules"; readonly rules: readonly { readonly when: Condition; readonly actions: readonly string[] }[]; readonly otherwise: readonly string[] };
type Behaviour = { readonly kind: "attack" | "follow-orders" | "clear-of-walls" | "clear-of-fallen" | "evade" }
  | { readonly kind: "approach"; readonly spacing?: number; readonly spacingStep?: number }
  | { readonly kind: "flee" }
  | { readonly kind: "close-in" | "keep-distance" | "break-clinch"; readonly metres: number }
  | { readonly kind: "edge"; readonly band: number; readonly patience: number }
  | { readonly kind: "ground"; readonly lower: number }
  | { readonly kind: "cover"; readonly guard: "pose" | "cover" | "predictive" };

/** Ranked focus, a bounded selector, then independent ranked behaviour channels. */
interface ActionTacticsConfig {
  readonly target: readonly FocusRule[];
  readonly choose: Selector & { readonly rethink: number; readonly patience: number };
  readonly list: readonly Behaviour[];
}

/** An action's own registration supplies measured estimates without exposing its executor kind. */
interface ActionEstimate {
  readonly unit: "opening" | "net";
  read(view: BodyView, target: TargetRef, effector: string): number | null;
}
export type ActionEstimates = Readonly<Record<string, ActionEstimate>>;

interface Candidate {
  readonly key: string;
  readonly action: string;
  readonly effector: string;
  readonly target: Extract<TargetRef, { kind: "body" }>;
  readiness: Readiness;
  readonly estimate?: { readonly unit: "opening" | "net"; readonly value: number };
  readonly eligible: boolean;
}

/** Footwork keeps a small clearance margin and checks the next half metre. */
const SPACE = Object.freeze({ margin: .08, ahead: .5, band: .1, fallbackPace: .3 });
/** Predictive cover looks just ahead of the head for an incoming contact. */
const PREDICTION = Object.freeze({ out: .2, horizon: .4 });

/** Conditions share detached facts; distance reads proximity, while target and follow-up read focus. */
export function actionCondition(condition: Condition, sight: ActionSight, orders: ActionOrders | null, focus: BodySense | null): boolean {
  switch (condition.kind) {
    case "always": return true;
    case "when-standing": return !orders?.move;
    case "target-down": return focus?.down ?? false;
    case "follow-up": return [...sight.report.actions, ...sight.report.ledger].some(action => action.target.body === focus?.id && action.contacts.lastTarget !== null
      && sight.view.time - action.contacts.lastTarget >= 0 && sight.view.time - action.contacts.lastTarget <= condition.seconds);
    case "when-distance": {
      let distance: number | undefined;
      switch (condition.of) {
        case "destination": distance = orders?.destination; break;
        case "foe": {
          const centre = sight.view.stance.centre;
          for (const foe of sight.view.senses.others) if (!foe.out && foe.side !== sight.view.senses.side) {
            const apart = hypot(foe.centre.x - centre.x, foe.centre.z - centre.z);
            distance = distance === undefined ? apart : Math.min(distance, apart);
          }
          break;
        }
        default: { const never: never = condition.of; throw new Error(`unknown distance source ${never}`); }
      }
      if (distance === undefined) return false;
      switch (condition.than) {
        case "under": return distance < condition.metres;
        case "over": return distance > condition.metres;
        default: { const never: never = condition.than; throw new Error(`unknown comparison ${never}`); }
      }
    }
    default: { const never: never = condition; throw new Error(`unknown action condition ${JSON.stringify(never)}`); }
  }
}

/** Shared focus and candidate selection give every behaviour the same opponent and admission facts. */
export function actionTactics(spec: BodySpec, supplied: readonly ActionConfig[], settings: ActionTacticsConfig,
  ordersOf: (sight: ActionSight) => ActionOrders | null = () => null, estimates: ActionEstimates = {}): Tactics<ActionSight, ActionIntent> {
  const config = deepFreeze(structuredConfig(settings)), actions = deepFreeze(supplied.map(action => structuredConfig(action)));
  if (!Number.isFinite(config.choose.rethink) || config.choose.rethink < 0 || !Number.isFinite(config.choose.patience) || config.choose.patience <= 0)
    throw new Error("action selection needs a finite rethink and positive patience");
  if (config.choose.kind === "estimate") {
    const units = actions.map(action => estimates[action.name]?.unit ?? (action.aim.kind === "surface" ? "opening" : null));
    if (units.some(unit => unit === null) || new Set(units).size !== 1) throw new Error("estimate selection needs comparable estimates for every action");
  }
  const aims = new Map(actions.map(action => [action.name, actionAim(spec, action.aim, action.family)]));
  const radius = bodyClearance(spec) + SPACE.margin, threat = threatReader();
  const state = {
    phase: "guard", focus: null as string | null, orderedRegion: null as string | null, lost: false, nextTable: 0,
    pending: null as { key: string; since: number } | null, candidates: [] as Candidate[],
    awaiting: null as { id: number; key: string } | null, lastStarted: null as string | null,
    sequence: 0, missed: 0, counts: Object.fromEntries(actions.map(action => [action.name, { committed: 0, landed: 0 }])),
    spacing: config.list.map(behaviour => behaviour.kind === "approach" ? behaviour.spacing ?? 0 : 0),
    edgeSince: config.list.map(() => null as number | null),
  };
  const selectFocus = (sight: ActionSight, orders: ActionOrders | null): BodySense | null => {
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
  const around = (sight: ActionSight): ActionAround => ({ heading: sight.report.heading, placed: sight.view.stance.phase === "stand",
    support: sight.report.support ?? null, walk: null, lower: STANCE_LOWER });
  const recheck = (sight: ActionSight, candidate: Candidate): Readiness => candidate.readiness = candidate.eligible
    ? sight.readiness(sight.view, candidate.action, candidate.effector, candidate.target, around(sight)) : candidate.readiness;
  const rebuild = (sight: ActionSight, focus: BodySense | null, orders: ActionOrders | null) => {
    state.candidates.length = 0;
    if (focus) for (const action of actions) for (const effector of action.effectors) {
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
  const ranked = (sight: ActionSight, focus: BodySense | null, orders: ActionOrders | null): Candidate[] => {
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
  const walking = (sight: ActionSight, x: number, z: number, face: number, pace: number): Pick<ActionIntent, "move" | "face"> => {
    const distance = hypot(x, z), h = sight.report.heading;
    const move: readonly [number, number] | null = distance > 0 ? [(x * sin(h) + z * cos(h)) * pace / distance, (x * cos(h) - z * sin(h)) * pace / distance] : null;
    return { move: clearMove(sight.view.stance.centre, sight.view.senses.solids, h, move, radius, SPACE.ahead), face };
  };
  return { name: "Actions", state, engagement: state, decide(sight) {
    const orders = ordersOf(sight), focus = selectFocus(sight, orders), changed = state.focus !== (focus?.id ?? null) || state.orderedRegion !== (orders?.region ?? null);
    state.focus = focus?.id ?? null;
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
      if (cleanMiss(record))
        config.list.forEach((behaviour, i) => { if (behaviour.kind === "approach") state.spacing[i] = Math.max(0, state.spacing[i]! - (behaviour.spacingStep ?? 0)); });
    }
    if (changed) { state.pending = null; state.edgeSince.fill(null); }
    if (changed || sight.view.time >= state.nextTable) rebuild(sight, focus, orders);
    let pending = state.candidates.find(candidate => candidate.key === state.pending?.key);
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
    let legs: Pick<ActionIntent, "move" | "face" | "lower" | "destination"> | undefined, requested: readonly ActionRequest[] | undefined;
    let left: Cover | null | undefined, right: Cover | null | undefined;
    const centre = sight.view.stance.centre, dx = focus ? focus.centre.x - centre.x : 0, dz = focus ? focus.centre.z - centre.z : 0;
    const face = focus ? atan2(dx, dz) : sight.report.heading, pace = Math.min(sight.envelope?.walk.value ?? SPACE.fallbackPace, orders?.pace ?? Infinity);
    state.phase = state.lost ? "lost" : "guard";
    for (const [i, behaviour] of config.list.entries()) switch (behaviour.kind) {
      case "follow-orders": if (orders?.move) {
        if (!legs) legs = { ...walking(sight, orders.move.x, orders.move.z, orders.face ? atan2(orders.face.x, orders.face.z) : atan2(orders.move.x, orders.move.z), pace), ...(orders.destination === undefined ? {} : { destination: orders.destination }) };
        requested ??= []; state.phase = "move";
      } break;
      case "attack": if (!requested) {
        const asks: ActionRequest[] = sight.report.actions.map(action => ({ id: action.id, action: action.action, effector: action.effector, target: structuredConfig(action.target) }));
        if (pending && recheck(sight, pending).kind === "ready") {
          const id = sight.instance(); asks.push({ id, action: pending.action, effector: pending.effector, target: structuredConfig(pending.target) });
          state.awaiting = { id, key: pending.key };
        }
        requested = asks;
        if (asks.length) state.phase = "attack";
      } break;
      case "approach": if (!legs && pending?.readiness.kind === "position") {
        const window = pending.readiness.window, spacing = state.spacing[i]!;
        legs = approachActionWindow(sight.view, { ...window, along: [window.along[0] + spacing, window.along[1] + spacing] }, sight.report.heading, pace, radius);
        state.phase = "approach";
      } break;
      case "cover": {
        let cover: Cover | null;
        switch (behaviour.guard) {
          case "pose": cover = null; break;
          case "cover": cover = threat.threatOf(sight.view, THREAT); break;
          case "predictive": cover = threat.threatOf(sight.view, THREAT, PREDICTION); break;
          default: { const never: never = behaviour.guard; throw new Error(`unknown cover ${never}`); }
        }
        if (left === undefined) left = cover; if (right === undefined) right = cover;
        break;
      }
      case "clear-of-walls": if (!legs) {
        const exit = clearanceExit([centre.x, centre.y, centre.z], radius, sight.view.senses.solids ?? []);
        if (exit) { legs = walking(sight, exit[0], exit[1], face, pace); state.phase = "clear"; }
      } break;
      case "evade": if (!legs && threat.threatOf(sight.view, THREAT, PREDICTION)) { legs = walking(sight, -dx, -dz, face, pace); requested ??= []; state.phase = "evade"; } break;
      case "clear-of-fallen": if (!legs && focus?.down && hypot(dx, dz) < radius * 2) { legs = walking(sight, -dx, -dz, face, pace); state.phase = "clear"; } break;
      case "ground": if (!legs && focus?.down && pending?.readiness.kind === "position") {
        legs = { ...approachActionWindow(sight.view, pending.readiness.window, sight.report.heading, pace, radius), lower: behaviour.lower }; state.phase = "ground";
      } break;
      case "edge": if (!legs && focus && !focus.down && !sight.report.actions.length && pending?.readiness.kind !== "ready") {
        const mine = sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
        const reach = rangeOf(focus.spec, "right", mine.y - theirs.y), outside = reach.reach + reach.along[1];
        const apart = hypot(theirs.x - mine.x, theirs.z - mine.z);
        if (apart >= outside && apart <= outside + behaviour.band) state.edgeSince[i] ??= sight.view.time;
        else if (state.edgeSince[i] === null || sight.view.time - state.edgeSince[i]! < behaviour.patience) state.edgeSince[i] = null;
        if (state.edgeSince[i] !== null && sight.view.time - state.edgeSince[i]! >= behaviour.patience) break;
        legs = apart > outside + behaviour.band ? walking(sight, dx, dz, face, pace)
          : apart < outside ? walking(sight, -dx, -dz, face, pace) : { move: null, face };
        state.phase = "edge";
      } break;
      case "flee": if (!legs && focus) { legs = walking(sight, -dx, -dz, atan2(-dx, -dz), pace); state.phase = "flee"; } break;
      case "close-in": case "keep-distance": case "break-clinch": if (!legs && focus) {
        const apart = hypot(dx, dz), delta = apart - behaviour.metres;
        const retreat = delta < -SPACE.band && behaviour.kind !== "close-in";
        const advance = delta > SPACE.band && behaviour.kind !== "break-clinch";
        if (retreat || advance) { legs = walking(sight, retreat ? -dx : dx, retreat ? -dz : dz, face, pace); state.phase = behaviour.kind; }
        else if (behaviour.kind !== "break-clinch") legs = { move: null, face };
      } break;
      default: { const never: never = behaviour; throw new Error(`unknown action behaviour ${JSON.stringify(never)}`); }
    }
    return { move: legs?.move ?? null, face: legs?.face ?? face, guard: { left: left ?? null, right: right ?? null }, actions: requested ?? [],
      ...(legs?.lower === undefined ? {} : { lower: legs.lower }), ...(legs?.destination === undefined ? {} : { destination: legs.destination }) };
  } };
}

/** Config and requests own their plain data independently of editable caller objects. */
function structuredConfig<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => structuredConfig(item)) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structuredConfig(item)])) as T;
  return value;
}
