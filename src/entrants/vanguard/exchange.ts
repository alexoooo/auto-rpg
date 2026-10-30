import { atan2, hypot } from "../../core/math/real.ts";
import { copyActionTarget, type ActionAround } from "../../core/skills/framework/action.ts";
import { STANCE_LOWER } from "../../core/skills/locomotion/locomotion.ts";
import { deepFreeze } from "../../core/state.ts";
import { regionSegments } from "../../core/intent/action-aim.ts";
import { structuredConfig, type Candidate, type Turn } from "../../core/tactics/behaviour-part.ts";
import { FIGHTING } from "../../core/mind/config.ts";
import { number } from "../../core/parts/fields.ts";
import { NO_COVER } from "../../core/intent/intent.ts";
import { orderedFacing } from "../../core/tactics/ordered.ts";
import { orderAllows, orderedRegions, struckKey } from "../../core/intent/orders.ts";
import { anyBody, slotList, type PartConfig } from "../../core/parts/parts.ts";
import type { BodySense } from "../../core/mind/senses.ts";
import { engagementWithDetails, type Sight, type Tactics } from "../../core/tactics/tactics.ts";
import type { TacticsMaking, TacticsPart } from "../../core/tactics/tactics-part.ts";

interface ExchangeConfig extends PartConfig {
  readonly kind: "vanguard:exchange";
  readonly list: readonly PartConfig[];
  readonly rethink: number;
  readonly patience: number;
  readonly revisit: number;
}

/** The behaviour list whose evasive member the outer planner may remove for its attack trial. */
export function exchangeList(config: PartConfig): readonly PartConfig[] | null {
  const list = (config as Partial<ExchangeConfig>).list;
  return config.kind === "vanguard:exchange" && Array.isArray(list) ? list : null;
}

/** Rank physical contact score per attempted second; an unknown choice is sampled before a known one. */
function exchange(making: TacticsMaking, given: ExchangeConfig): Tactics {
  const config = deepFreeze(structuredConfig(given));
  const actions = deepFreeze(structuredConfig(making.actions));
  const made = config.list.map(part => making.parts.of("behaviour", part).make({ spec: making.spec, actions }, part));
  const state = {
    phase: "guard", focus: null as string | null, lost: false, ordered: null as string | null,
    pending: null as { key: string; since: number } | null, awaiting: null as { id: number; key: string } | null,
    candidates: [] as Candidate[], nextTable: 0, sequence: 0, completed: 0,
    ratings: {} as Record<string, { work: number; seconds: number; attempts: number }>,
    owned: {} as Record<number, { key: string; work: number }>,
    motion: Object.fromEntries((making.spec.effectors ?? []).map(e => [e.segment, { step: -1, velocity: [0, 0, 0] }])),
    behaviours: made.map(behaviour => behaviour.state ?? null),
    decision: { focus: null as string | null, evading: false, approach: null as import("../../core/skills/framework/action.ts").Window | null },
  };
  const rankedWork: Candidate[] = [];
  const keyOf = (one: { action: string; effector: string; target: unknown }) => JSON.stringify([one.action, one.effector, one.target]);
  const exploring = () => state.completed > 0 && state.completed % config.revisit === 0;
  const rate = (key: string) => { const r = state.ratings[key]; return r ? r.work / r.seconds : Infinity; };
  const ranked = () => {
    rankedWork.length = 0; rankedWork.push(...state.candidates);
    rankedWork.sort((a, b) => exploring()
      ? (state.ratings[a.key]?.attempts ?? 0) - (state.ratings[b.key]?.attempts ?? 0)
      : rate(a.key) === rate(b.key) ? 0 : rate(a.key) > rate(b.key) ? -1 : 1);
    return rankedWork;
  };
  const around = (sight: Sight): ActionAround => ({ heading: sight.report.heading, placed: sight.view.stance.phase === "stand",
    support: sight.report.support ?? null, walk: null, lower: STANCE_LOWER });
  const recheck = (sight: Sight, one: Candidate) => one.readiness = sight.readiness(sight.view, one.action, one.effector, one.target, around(sight));
  const selectFocus = (sight: Sight, ordered: string | undefined): BodySense | null => {
    const foes = sight.view.senses.others, valid = (foe: BodySense) => !foe.out && foe.side !== sight.view.senses.side;
    state.lost = false;
    if (ordered !== undefined) { const foe = foes.find(f => f.id === ordered && valid(f)) ?? null; state.lost = !foe; return foe; }
    const current = foes.find(f => f.id === state.focus && valid(f));
    if (current) return current;
    const standing = foes.some(f => valid(f) && !f.down);
    let selected: BodySense | null = null, distance = Infinity;
    for (const foe of foes) if (valid(foe) && (!standing || !foe.down)) {
      const apart = hypot(foe.centre.x - sight.view.stance.centre.x, foe.centre.z - sight.view.stance.centre.z);
      if (apart < distance) { selected = foe; distance = apart; }
    }
    return selected;
  };
  const learn = (sight: Sight, dt: number) => {
    const view = sight.view;
    if (state.awaiting) {
      const ask = state.awaiting;
      if (sight.report.actions.some(a => a.id === ask.id) || sight.report.ledger.some(a => a.id === ask.id && a.ending.kind !== "refused"))
        state.owned[ask.id] = { key: ask.key, work: 0 };
      state.awaiting = null; state.pending = null;
    }
    for (const [effector, before] of Object.entries(state.motion)) {
      const feedback = view.effectors[effector]?.feedback, step = feedback?.completedStep;
      if (!feedback || step === undefined || step === before.step) continue;
      const action = sight.report.actions.find(a => a.effector === effector && a.phase === "commit" && state.owned[a.id]);
      const foe = action && view.senses.others.find(f => f.id === action.target.body);
      if (action && foe && step === before.step + 1) for (const pair of feedback.pairs ?? []) {
        if (!pair.loaded || !pair.onset || pair.target.kind !== "body" || pair.target.body !== foe.id) continue;
        const segment = foe.segments.get(pair.target.segment);
        if (!segment) continue;
        const dx = pair.point[0] - segment.centre.x, dy = pair.point[1] - segment.centre.y, dz = pair.point[2] - segment.centre.z;
        const vx = segment.velocity.x + segment.spin.y * dz - segment.spin.z * dy;
        const vy = segment.velocity.y + segment.spin.z * dx - segment.spin.x * dz;
        const vz = segment.velocity.z + segment.spin.x * dy - segment.spin.y * dx;
        // Guard contacts count too: impulse times preceding relative normal speed is a contact heuristic, not damage.
        state.owned[action.id]!.work += pair.impulse * Math.abs((before.velocity[0]! - vx) * pair.normal[0]
          + (before.velocity[1]! - vy) * pair.normal[1] + (before.velocity[2]! - vz) * pair.normal[2]);
      }
      before.step = step;
      before.velocity[0] = feedback.velocity[0]; before.velocity[1] = feedback.velocity[1]; before.velocity[2] = feedback.velocity[2];
    }
    for (const record of sight.report.ledger) if (record.sequence > state.sequence) {
      state.sequence = record.sequence;
      const observed = state.owned[record.id];
      if (observed) {
        const r = state.ratings[observed.key] ??= { work: 0, seconds: 0, attempts: 0 };
        r.work += observed.work; r.seconds += Math.max(dt, record.ended - record.began); r.attempts++;
        state.completed++; delete state.owned[record.id]; state.pending = null;
      }
      for (const behaviour of made) behaviour.ended?.(record);
    }
    for (const id in state.owned) if (!sight.report.actions.some(a => a.id === Number(id))) delete state.owned[id];
  };
  type Filling = { -readonly [K in keyof Turn]: Turn[K] };
  const turn: Filling = { sight: null as unknown as Sight, dt: 0, orders: null, focus: null, dx: 0, dz: 0, face: 0, pace: undefined,
    pending: undefined, legs: undefined, requested: undefined, left: undefined, right: undefined, evading: false, approach: null, phase: "guard",
    ranked, recheck: one => recheck(turn.sight, one), choose(one) {
      if (state.pending?.key !== one.key) state.pending = { key: one.key, since: turn.sight.view.time };
      turn.pending = one;
    }, start(one) { const id = turn.sight.instance(); state.awaiting = { id, key: one.key };
      return { id, action: one.action, effector: one.effector, target: copyActionTarget(one.target) }; },
    interrupt() { for (const behaviour of made) behaviour.interrupted?.(); },
  };
  const engagement = engagementWithDetails(() => state, () => [
    { label: "Contact selection", value: exploring() ? "revisit the least sampled choice" : "highest observed contact score per second" },
    ...ranked().map(one => { const r = state.ratings[one.key]; return { label: `${one.action} · ${one.effector}`,
      value: r ? `${rate(one.key).toFixed(3)} score/s · ${r.attempts} attempts` : "untried" }; }),
  ]);
  return { name: "Contact exchanges", state, engagement, decision: state.decision, decide(sight, dt) {
    state.decision.evading = false; state.decision.approach = null;
    if (sight.view.resumed) { state.awaiting = null; state.pending = null; for (const id in state.owned) delete state.owned[id];
      for (const motion of Object.values(state.motion)) motion.step = -1; turn.interrupt(); }
    learn(sight, dt);
    if (sight.view.senses.out) { turn.interrupt(); state.pending = null; state.phase = "out"; return { move: null, face: sight.report.heading, guard: NO_COVER, actions: [] }; }
    const orders = making.orders(sight), focus = selectFocus(sight, orders?.foe);
    const changed = state.focus !== (focus?.id ?? null) || state.ordered !== struckKey(orders);
    state.focus = focus?.id ?? null; state.decision.focus = state.focus; state.ordered = struckKey(orders);
    if (changed) { state.pending = null; for (const behaviour of made) behaviour.refocus?.(); }
    if (changed || sight.view.time >= state.nextTable) {
      state.candidates.length = 0;
      if (focus) for (const action of actions) if (action.regions) for (const effector of action.effectors) {
        if (!orderAllows(orders, focus.id, action.name, effector)) continue;
        const region = orderedRegions(orders, focus.id, action.regions).find(r => regionSegments(focus.spec, r).length > 0);
        if (!region) continue;
        const target = { kind: "body" as const, body: focus.id, region: { ...region } };
        const one: Candidate = { action: action.name, effector, target, key: keyOf({ action: action.name, effector, target }), eligible: true,
          readiness: { kind: "blocked", reason: "not read" } };
        recheck(sight, one); state.candidates.push(one);
      }
      state.nextTable = sight.view.time + config.rethink;
    }
    let pending = state.candidates.find(one => one.key === state.pending?.key);
    if (pending && (sight.view.time - state.pending!.since >= config.patience || recheck(sight, pending).kind === "blocked")) {
      pending = undefined; state.pending = null;
    }
    if (!pending || pending.readiness.kind === "waiting") {
      let position: Candidate | undefined, waiting: Candidate | undefined;
      pending = undefined;
      for (const one of ranked()) {
        const ready = recheck(sight, one);
        if (ready.kind === "ready") { pending = one; break; }
        if (ready.kind === "position") position ??= one;
        if (ready.kind === "waiting") waiting ??= one;
      }
      pending ??= position ?? waiting;
      if (pending && state.pending?.key !== pending.key) state.pending = { key: pending.key, since: sight.view.time };
    }
    const centre = sight.view.stance.centre, dx = focus ? focus.centre.x - centre.x : 0, dz = focus ? focus.centre.z - centre.z : 0;
    Object.assign(turn, { sight, dt, orders, focus, dx, dz, face: focus ? atan2(dx, dz) : sight.report.heading, pace: orders?.pace, pending,
      legs: undefined, requested: undefined, left: undefined, right: undefined, evading: false, approach: null, phase: state.lost ? "lost" : "guard" });
    for (const behaviour of made) behaviour.decide(turn);
    state.decision.evading = turn.evading; state.decision.approach = turn.approach; state.phase = turn.phase;
    const { legs, requested, left, right } = turn, facing = orders?.move === undefined && orders ? orderedFacing(orders.face) : null;
    return { move: legs?.move ?? null, face: facing ?? legs?.face ?? turn.face, guard: { "hand.left": left ?? null, "hand.right": right ?? null }, actions: requested ?? [],
      ...(legs?.lower === undefined ? {} : { lower: legs.lower }), ...(legs?.destination === undefined ? {} : { destination: legs.destination }),
      ...(legs?.movement === undefined ? {} : { movement: legs.movement }), ...(legs?.pace === undefined ? {} : { pace: legs.pace }),
      ...(legs?.walk ? { walk: true } : {}), ...(legs?.travelFacing ? { travelFacing: true as const } : {}), ...(orders?.gait === undefined ? {} : { gait: orders.gait }) };
  } };
}

export const VANGUARD_EXCHANGE: TacticsPart<ExchangeConfig> = deepFreeze({
  role: "tactics", label: "Contact exchanges", stage: "experimental", phases: { guard: "Guarding", lost: "Finding opponent", out: null },
  fields: [number("rethink", "Read candidates every", 0, 2, .01, "s"), number("patience", "Approach patience", .1, 10, .1, "s"),
    number("revisit", "Revisit after", 1, 20, 1, "attempts")], slots: [slotList("list", "Behaviours", "behaviour")],
  defaults: { kind: "vanguard:exchange", list: FIGHTING.list, rethink: .2, patience: 2, revisit: 4 },
  keys: { kind: true, list: true, rethink: true, patience: true, revisit: true }, fits: anyBody,
  faults: config => Number.isFinite(config.rethink) && config.rethink >= 0 && Number.isFinite(config.patience) && config.patience > 0
    && Number.isInteger(config.revisit) && config.revisit > 0 ? [] : ["finite nonnegative rethink, positive patience and a positive integer revisit required"],
  decisionCapabilities: () => ["focus", "evading", "approach"], make: exchange,
});
