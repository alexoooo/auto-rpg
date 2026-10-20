import type { BodyView } from "../body.ts";
import { atan2, cos, hypot, sin } from "../math/real.ts";
import type { ActionAround, ActionRequest, Readiness, Region, TargetRef } from "../skills/action.ts";
import { cleanMiss, landed } from "../skills/action-instances.ts";
import { STANCE_LOWER } from "../skills/locomotion.ts";
import { rangeOf } from "../skills/strike.ts";
import type { BodySpec } from "../spec/body.ts";
import { deepFreeze } from "../state.ts";
import { actionAim, regionSegments } from "./action-aim.ts";
import { approachActionWindow } from "./action-window.ts";
import { clearanceExit, clearMove } from "./clear-step.ts";
import type { ActionConfig, BehavioursConfig, ConditionConfig } from "./config.ts";
import { conditionMatches } from "./conditions.ts";
import { coveringHand } from "./cover-hand.ts";
import type { Cover, Intent } from "./intent.ts";
import type { Orders } from "./orders.ts";
import { orderedFacing, orderedIntent } from "./ordered.ts";
import { bodyClearance, lowOpponent } from "./sensed-bounds.ts";
import { groundPosition } from "./ground-position.ts";
import type { BodySense } from "./senses.ts";
import type { Sight, Tactics } from "./tactics.ts";
import { PREDICTION, THREAT, threatReader } from "./threat.ts";

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

/** Detached decision facts for status displays and candidate inspection. */
export interface ActionEngagement {
  readonly phase: string;
  readonly focus: string | null;
  readonly lost: boolean;
  readonly pending: { readonly key: string; readonly since: number } | null;
  readonly candidates: readonly Candidate[];
}

/** Footwork checks the next half metre and keeps feet clear of each fallen segment. */
const SPACE = Object.freeze({ margin: .08, ahead: .5, band: .1, fallbackPace: .3, fallen: .9 });

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
  return conditionMatches(condition, { walking: !!orders?.move, foe, destination: sight.report.navigation?.remaining ?? Infinity, targetDown: focus?.down ?? false, sinceTarget });
}
/** Shared focus and candidate selection give every behaviour the same opponent and admission facts. */
export function actionTactics(spec: BodySpec, supplied: readonly ActionConfig[], settings: Omit<BehavioursConfig, "kind">,
  ordersOf: (sight: Sight) => Orders | null = () => null, estimates: ActionEstimates = {}): Tactics<Sight, Intent> {
  const config = deepFreeze(structuredConfig(settings)), actions = deepFreeze(supplied.map(action => structuredConfig(action)));
  if (!Number.isFinite(config.choose.rethink) || config.choose.rethink < 0 || !Number.isFinite(config.choose.patience) || config.choose.patience <= 0)
    throw new Error("action selection needs a finite rethink and positive patience");
  if (config.choose.kind === "estimate") {
    const units = actions.map(action => estimates[action.name]?.unit ?? (action.aim.kind === "surface" ? "opening" : null));
    if (units.some(unit => unit === null) || new Set(units).size !== 1) throw new Error("estimate selection needs comparable estimates for every action");
  }
  const aims = new Map(actions.map(action => [action.name, actionAim(spec, action.aim, action.family)]));
  const radius = bodyClearance(spec) + SPACE.margin, threat = threatReader();
  const ground = config.list.some(behaviour => behaviour.kind === "ground")
    ? groundPosition(spec, (view, heading, move) => clearMove(view.stance.centre, view.senses.solids, heading, move, radius, SPACE.ahead), {}, true) : null;
  const state = {
    phase: "guard", focus: null as string | null, orderedRegion: null as string | null, lost: false, nextTable: 0,
    pending: null as { key: string; since: number } | null, candidates: [] as Candidate[],
    awaiting: null as { id: number; key: string } | null, lastStarted: null as string | null,
    sequence: 0, missed: 0, counts: Object.fromEntries(actions.map(action => [action.name, { committed: 0, landed: 0 }])),
    spacing: config.list.map(behaviour => behaviour.kind === "approach" ? behaviour.spacing ?? 0 : 0),
    edgeSince: config.list.map(() => null as number | null),
    ground: ground?.state ?? null,
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
  const walking = (sight: Sight, x: number, z: number, face: number, pace: number): Pick<Intent, "move" | "face"> => {
    const distance = hypot(x, z), h = sight.report.heading;
    const move: readonly [number, number] | null = distance > 0 ? [(x * sin(h) + z * cos(h)) * pace / distance, (x * cos(h) - z * sin(h)) * pace / distance] : null;
    return { move: clearMove(sight.view.stance.centre, sight.view.senses.solids, h, move, radius, SPACE.ahead), face };
  };
  return { name: "Actions", state, engagement: state, decide(sight, dt) {
    if (sight.view.senses.out) { ground?.reset(); state.pending = null; state.awaiting = null; state.phase = "out"; return { move: null, face: sight.report.heading, guard: { left: null, right: null }, actions: [] }; }
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
    if (changed) { state.pending = null; state.edgeSince.fill(null); ground?.reset(); }
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
    let legs: Pick<Intent, "move" | "face" | "lower" | "destination" | "movement" | "pace" | "travelFacing"> | undefined, requested: readonly ActionRequest[] | undefined;
    let left: Cover | null | undefined, right: Cover | null | undefined;
    const centre = sight.view.stance.centre, dx = focus ? focus.centre.x - centre.x : 0, dz = focus ? focus.centre.z - centre.z : 0;
    const face = focus ? atan2(dx, dz) : sight.report.heading, pace = Math.min(sight.envelope?.walk.value ?? SPACE.fallbackPace, orders?.pace ?? Infinity);
    state.phase = state.lost ? "lost" : "guard";
    for (const [i, behaviour] of config.list.entries()) switch (behaviour.kind) {
      case "follow-orders": if (orders) {
        if (orders.move !== undefined && (orders.move || orders.foe === undefined)) ground?.reset();
        if (!legs && orders.move !== undefined) {
          const ordered = orderedIntent(sight, orders, { left: null, right: null });
          legs = { ...ordered, move: clearMove(centre, sight.view.senses.solids, sight.report.heading, ordered.move, radius, SPACE.ahead) };
        }
        if (orders.move !== undefined && orders.foe === undefined) requested ??= [];
        if (orders.move) state.phase = "move";
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
        const shield = spec.held?.some(({ item }) => item.coverNormal !== undefined);
        if (cover && shield) {
          const dx = cover.threat[0] - cover.guarded[0], dz = cover.threat[2] - cover.guarded[2], h = sight.report.heading;
          const hand = coveringHand(spec, dx * cos(h) - dz * sin(h) >= 0 ? "right" : "left");
          if (hand === "left" && left === undefined) left = cover;
          if (hand === "right" && right === undefined) right = cover;
        } else { if (left === undefined) left = cover; if (right === undefined) right = cover; }
        break;
      }
      case "clear-of-walls": if (!legs) {
        const exit = clearanceExit([centre.x, centre.y, centre.z], radius, sight.view.senses.solids ?? []);
        if (exit) { legs = walking(sight, exit[0], exit[1], face, pace); state.phase = "clear"; }
      } break;
      case "evade": if (!legs && threat.threatOf(sight.view, THREAT, PREDICTION)) { legs = walking(sight, -dx, -dz, face, pace); requested ??= []; state.phase = "evade"; } break;
      case "clear-of-fallen": if (!legs && focus?.down) {
        let near = Infinity; for (const segment of focus.segments.values()) near = Math.min(near, hypot(segment.centre.x - centre.x, segment.centre.z - centre.z));
        legs = near < SPACE.fallen ? walking(sight, -dx, -dz, face, pace) : { move: null, face }; requested ??= []; state.phase = "clear";
      } break;
      case "ground": if (!legs && ground && focus && (lowOpponent(sight.view, focus) || ground.state.near.active || ground.state.wide.active)) {
        const candidates = ranked(sight, focus, orders).filter(candidate => candidate.eligible && actions.find(action => action.name === candidate.action)?.lower !== undefined);
        const selected = candidates.find(candidate => candidate.key === pending?.key) ?? candidates[0];
        if (!selected) break;
        const placement = ground.decide(sight.view, sight.report, focus, selected.effector === "hand.left" ? "left" : "right", dt);
        if (!placement) break;
        const candidate = candidates.find(candidate => candidate.effector === `hand.${placement.hand}`) ?? selected;
        if (pending?.key !== candidate.key) state.pending = { key: candidate.key, since: sight.view.time };
        pending = candidate; recheck(sight, pending);
        legs = placement; state.phase = ground.state.phase;
        if (!placement.allow) requested ??= [];
      } break;
      case "edge": if (!legs && focus && !focus.down && focus.spec.effectors?.some(effector => effector.segment === "hand.left")
        && focus.spec.effectors.some(effector => effector.segment === "hand.right") && !sight.report.actions.length && pending?.readiness.kind !== "ready") {
        const mine = sight.view.head, theirs = focus.segments.get(focus.spec.marks.high)?.centre ?? focus.centre;
        const reach = rangeOf(focus.spec, "right", mine.y - theirs.y), outside = reach.reach + reach.along[1];
        const apart = hypot(theirs.x - mine.x, theirs.z - mine.z);
        if (apart >= outside && apart <= outside + behaviour.band) state.edgeSince[i] ??= sight.view.time;
        else if (state.edgeSince[i] === null || sight.view.time - state.edgeSince[i]! < behaviour.patience) state.edgeSince[i] = null;
        if (state.edgeSince[i] !== null && sight.view.time - state.edgeSince[i]! >= behaviour.patience) break;
        const near = Math.max(0, outside + hypot(dx, dz) - apart);
        legs = apart > outside + behaviour.band ? { ...walking(sight, dx, dz, face, pace), movement: { kind: "range", focus: focus.id, near, far: near + behaviour.band }, pace }
          : apart < outside ? walking(sight, -dx, -dz, face, pace) : { move: null, face };
        state.phase = "edge";
      } break;
      case "flee": if (!legs && focus) { legs = walking(sight, -dx, -dz, atan2(-dx, -dz), pace); state.phase = "flee"; } break;
      case "close-in": case "keep-distance": case "break-clinch": if (!legs && focus) {
        const apart = hypot(dx, dz), delta = apart - behaviour.metres;
        const retreat = delta < -SPACE.band && behaviour.kind !== "close-in";
        const advance = delta > SPACE.band && behaviour.kind !== "break-clinch";
        if (retreat || advance) {
          legs = { ...walking(sight, retreat ? -dx : dx, retreat ? -dz : dz, face, pace),
            ...(advance ? { movement: { kind: "range" as const, focus: focus.id, near: Math.max(0, behaviour.metres - SPACE.band), far: behaviour.metres + SPACE.band }, pace } : {}) };
          state.phase = behaviour.kind;
        }
        else if (behaviour.kind !== "break-clinch") legs = { move: null, face };
      } break;
      default: { const never: never = behaviour; throw new Error(`unknown action behaviour ${JSON.stringify(never)}`); }
    }
    const facing = orders?.move === undefined && orders ? orderedFacing(orders.face) : null;
    return { move: legs?.move ?? null, face: facing ?? legs?.face ?? face, guard: { left: left ?? null, right: right ?? null }, actions: requested ?? [],
      ...(legs?.lower === undefined ? {} : { lower: legs.lower }), ...(legs?.destination === undefined ? {} : { destination: legs.destination }),
      ...(legs?.movement === undefined ? {} : { movement: legs.movement }), ...(legs?.pace === undefined ? {} : { pace: legs.pace }),
      ...(legs?.travelFacing ? { travelFacing: true } : {}) };
  } };
}

/** Config and requests own their plain data independently of editable caller objects. */
function structuredConfig<T>(value: T): T {
  if (Array.isArray(value)) return value.map(item => structuredConfig(item)) as T;
  if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, structuredConfig(item)])) as T;
  return value;
}
