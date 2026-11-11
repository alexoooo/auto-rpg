import { atan2, cos, hypot, sin } from "../../core/math/real.ts";
import { approachPace, arrivedIn, settledAt, straightSpot, widened, windowArrival, windowHolds } from "../../skills/intent/action-window.ts";
import { ARRIVED, directMovement, placeMovement, SWAY } from "../../skills/framework/movement.ts";
import { isRegion, type Orders } from "../orders.ts";
import type { ActionStatus, Readiness, Region, Window } from "../../skills/framework/action.ts";
import { skillOf, type KitEntry, type MenuEntry, type Spot } from "../../skills/framework/menu.ts";
import { deepFreeze } from "../../core/state.ts";
import { hold, letGo, stillHeld, unheld } from "../../control/held.ts";
import type { CommanderConfig, CommanderEntry } from "./kind.ts";
import type { Commander, MemberReport, MemberView, SensedBody, TeamDecision, TeamView } from "./team.ts";

/**
 * **A drill Commander's config**: one skill with one limb at one region of the nearest foe, asked
 * once; where it leaves one of the three out, the first choice of its member's menu that fits the
 * rest and could start or be walked to, kept once taken. It stands `after` s; with `approach`, walks
 * its way off the line to the foe, ordering the strike the first step it is ready; walks into the
 * action's window no faster than `pace` (with none, it never walks) and orders the strike once there
 * and settled, or, `walking`, the first step it is ready. With `letGo`, it orders a stand that long after the action began, where the action is
 * still before its point of no return. With `moment`, it orders nothing until its member begins its
 * `moment`th action aimed at a body, and the mind fights by itself till then; from that step it
 * carries that one on where it is the choice it asks (`adopts`), else orders its own in that one's
 * place, which the mind lets go where it can.
 */
export interface DrillCommanderConfig extends CommanderConfig {
  readonly kind: "drill";
  /** The skill, its executor's kind (`KitEntry.kind`, as an order names it, `Orders.skill`); absent, any. */
  readonly skill?: string;
  /** The limb, an effector (`hand.right`, `foot.left`); absent, any. */
  readonly limb?: string;
  /** The region of the foe, a mark or a segment; absent, any the action aims at. */
  readonly region?: Region;
  /** How long it stands from its first decision, or from its moment, before it walks or orders anything else, s. */
  readonly after: number;
  /** The most speed it walks its member at into the action's window, m/s; absent, it stands where it is. */
  readonly pace?: number;
  /** Order the strike the first step it is ready, walking or not, rather than once settled in the window's middle. */
  readonly walking?: true;
  /**
   * How it first moves once it has stood (`Approach`), ordering the strike the first step it is
   * ready meanwhile; absent, it walks only into the window.
   */
  readonly approach?: Approach;
  /** How long after its action began it orders a stand, s, where the action is still before its point of no return; absent, never. */
  readonly letGo?: number;
  /** Which of its member's actions aimed at a body it takes the place of, from 1; absent, none: it orders from the start. */
  readonly moment?: number;
}

/**
 * **How a drill first moves its member** (`DrillCommanderConfig.approach`): `way` degrees off the
 * line to the foe, to the member's right (0 toward the foe, 180 away from it, 90 to its right), at
 * `speed` m/s, for `seconds` s, facing the foe.
 */
export type Approach = { readonly way: number; readonly speed: number; readonly seconds: number };

/**
 * Where a drill is: its member fighting by itself before its moment; standing first (`settling`);
 * on its approach (`going`); with no foe (`lost`); reading the ordered choice (its readiness: out of its window, waiting,
 * refused, ready); with the strike ordered (`striking`) or under way (`under way`); after
 * letting it go until it is ready again (`let go`); or after it (`done`).
 */
export type DrillPhase = "fighting" | "settling" | "going" | "lost" | Readiness["kind"] | "striking" | "under way" | "let go" | "done";

/** What a drill says its member does (`MemberReport.task`): its phase, and why where its choice is refused or waits. */
const taskOf = (phase: DrillPhase, reason: string): string => reason && (phase === "blocked" || phase === "waiting") ? `${phase}: ${reason}` : phase;

/** A drill's phase and reason from what it says its member does (`taskOf`). */
export function drillTask(task: string): { readonly phase: DrillPhase; readonly reason: string } {
  const at = task.indexOf(": ");
  return at < 0 ? { phase: task as DrillPhase, reason: "" } : { phase: task.slice(0, at) as DrillPhase, reason: task.slice(at + 2) };
}

/** A ground heading of `angle`, rad from +z toward +x. */
const heading = (angle: number) => ({ x: sin(angle), z: cos(angle) });

/**
 * A stand where the body stands, as it faces: it asks no strike, and lets go one not yet past its
 * point of no return. A drill's orders are firm (`Orders.firm`): what it measures is the order carried out.
 */
const STAND: Orders = deepFreeze({ move: null, face: null, firm: true });

const sameRegion = (a: Region | null, b: Region | null): boolean => a !== null && b !== null
  && (a.kind === "mark" ? b.kind === "mark" && a.mark === b.mark : b.kind === "segment" && a.segment === b.segment);

/**
 * **Whether a drill asking `config`'s choice takes `action` as its own**: an action under way at a
 * body, by the skill (as `kit` has it), limb and region its config names (each where it names one).
 * At its moment the drill carries such an action on rather than letting it go and ordering it again.
 */
function adopts(config: Pick<DrillCommanderConfig, "skill" | "limb" | "region">, action: ActionStatus, kit: readonly KitEntry[]): boolean {
  return action.target.kind === "body" && (config.skill === undefined || skillOf(kit, action.action) === config.skill)
    && (config.limb === undefined || action.effector === config.limb)
    && (config.region === undefined || sameRegion(action.target.region, config.region));
}

/**
 * How a spot beside a body lying is held (`Held`): chosen again once that body's middle moves
 * `moved` m, or, while the walk has not yet held in its window, `rethink` s on. The menu reads its
 * spot afresh at each ask, on the side of that body the walk goes to, and a window read from where a
 * sole stands moves with each stride, which would step a member held in its window after each new
 * spot, never settled.
 */
const HELD_SPOT = Object.freeze({ moved: .3, rethink: 1 });

/** The choice a drill orders: a skill, a limb and a region. */
type Choice = { readonly skill: string; readonly limb: string; readonly region: Region };

/** **The drill Commander** (`DrillCommanderConfig`): it leads its team's first member. */
function drillCommander(config: DrillCommanderConfig): Commander {
  const state = {
    phase: (config.moment === undefined ? "settling" : "fighting") as DrillPhase, focus: null as string | null,
    /** Why its choice is refused or waits, as its readiness last said; "" where it is neither. */
    reason: "",
    /** When it began standing; the foe it ordered struck, the action's id and when it began, and when it let it go: null before. */
    since: null as number | null, struck: null as string | null, id: null as number | null, began: null as number | null, let: null as number | null,
    /** The actions aimed at a body its member began before its moment, by id. */
    begun: [] as number[],
    /** The window the ordered choice last named, whether it has walked toward it, whether it holds there, and the way it faces once it does. */
    window: null as Window | null, walked: false, held: false, set: null as number | null,
    /** Where its member's menu last said the body would stand in its choice's window, where that is beside a body lying, with the way round it: null where it stands straight. */
    spot: null as Spot | null,
    /** The spot beside a body lying as held (`HELD_SPOT`). */
    spotHeld: unheld(),
    /** The choice it orders, once its member's menu offers one that fits its config and could start or be walked to. */
    choice: null as Choice | null,
    /** Where its member stood at its last decision, and when: what its speed over the ground is read from. */
    last: null as { x: number; z: number; time: number } | null,
    /** How its member's walk into the window ends (`arrivedIn`), and since when its speed has stayed at most `SETTLED`. */
    arrival: windowArrival(),
  };
  const aimed = (member: MemberView): ReadonlySet<string> => new Set((member.kit ?? []).filter((entry) => entry.regions.length > 0).map((entry) => entry.action));
  const nearest = (member: MemberView, others: readonly SensedBody[]): SensedBody | null => {
    let best: SensedBody | null = null, apart = Infinity;
    for (const other of others) {
      if (!other.fighting) continue;
      const d = hypot(other.at.x - member.at.x, other.at.z - member.at.z);
      if (d < apart) { best = other; apart = d; }
    }
    return best;
  };
  /** Whether its member has begun its `moment`th action aimed at a body, counting those it has not. */
  const reached = (member: MemberView): boolean => {
    const struck = aimed(member);
    for (const action of member.actions ?? []) if (struck.has(action.action) && action.target.kind === "body" && !state.begun.includes(action.id)) state.begun.push(action.id);
    return state.begun.length >= (config.moment ?? 0);
  };
  /** The menu's entry for its choice at `foe`, or, before it has one, the first that fits its config and could start or be walked to (which it then keeps), else the first that fits. */
  const ordered = (member: MemberView, foe: string): MenuEntry | null => {
    const fits = (entry: MenuEntry, want: Partial<Choice>) => entry.foe === foe && entry.region !== null && (want.skill === undefined || entry.skill === want.skill)
      && (want.limb === undefined || entry.limb === want.limb) && (want.region === undefined || sameRegion(entry.region, want.region));
    const menu = member.menu ?? [];
    if (state.choice) return menu.find((entry) => fits(entry, state.choice!)) ?? null;
    const open = menu.find((entry) => fits(entry, config) && (entry.readiness.kind === "ready" || entry.readiness.kind === "position"));
    if (open) state.choice = { skill: open.skill, limb: open.limb, region: open.region! };
    return open ?? menu.find((entry) => fits(entry, config)) ?? null;
  };
  /**
   * A stand facing `face`; beside a body lying, a stay at its spot by that body (`MovementRequest`'s
   * `by`), where a plain stand is kept off a fallen body, as near it as the window is narrow: a body
   * inside its window needs no step.
   */
  const stay = (face: number): Orders => {
    const spot = state.spot, window = state.window;
    if (spot?.by === undefined || !window) return { move: null, face: heading(face) };
    const near = Math.min(window.along[1] - window.along[0], window.across[1] - window.across[0]) / 2;
    return { move: { kind: "place", points: [{ x: spot.x, z: spot.z }], near, by: spot.by }, face: heading(face) };
  };
  const decided = (member: MemberView, orders: Orders | null): TeamDecision =>
    ({ orders: new Map(orders ? [[member.id, { ...orders, firm: true as const }]] : []), looked: true });
  return {
    state,
    hear() {},
    decide(view: TeamView): TeamDecision {
      const member = view.members[0];
      if (!member) return { orders: new Map(), looked: false };
      const at = member.at, last = state.last, dt = last ? view.time - last.time : 0;
      const speed = last && dt > 0 ? hypot(at.x - last.x, at.z - last.z) / dt : 0;
      state.last = { x: at.x, z: at.z, time: view.time };
      const settled = settledAt(state.arrival, speed, view.time);
      if (state.phase === "fighting") {
        if (!reached(member)) return decided(member, null);
        state.since = view.time - config.after;
        // The moment's own action, where it is the choice asked, is carried on as the drill's.
        const own = member.actions?.find((action) => action.id === state.begun[(config.moment ?? 0) - 1]);
        const skill = own ? skillOf(member.kit ?? [], own.action) : null;
        if (own && own.target.kind === "body" && skill !== null && adopts(config, own, member.kit ?? [])) {
          state.choice = { skill, limb: own.effector, region: own.target.region };
          state.struck = own.target.body; state.id = own.id; state.began = view.time; state.phase = "under way";
        }
      }
      state.since ??= view.time;
      const foe = nearest(member, view.others);
      state.focus = foe?.id ?? null;
      if (state.phase === "striking") {
        // The step it first sees its strike begun, it reads it as under way, a let-go included.
        const begun = member.actions?.find((action) => skillOf(member.kit ?? [], action.action) === state.choice!.skill && action.effector === state.choice!.limb && !state.begun.includes(action.id));
        if (!begun) return decided(member, strike(state.struck!, state.set));
        state.id = begun.id; state.began = view.time; state.phase = "under way";
      }
      if (state.id !== null) {
        const live: ActionStatus | undefined = member.actions?.find((action) => action.id === state.id);
        if (live && state.let === null) {
          const letting = config.letGo !== undefined && live.phase === "prepare" && view.time >= state.began! + config.letGo;
          if (!letting) return decided(member, strike(state.struck!, state.set));
          state.let = view.time;
        }
        if (!live && state.phase === "under way") state.phase = "done";
        if (state.let !== null && state.phase !== "done") {
          // Let go, it stands until the action it let go is ready again.
          state.phase = "let go";
          if (foe && ordered(member, foe.id)?.readiness.kind === "ready") state.phase = "done";
          return decided(member, STAND);
        }
      }
      if (state.phase === "done") return decided(member, STAND);
      if (view.time < state.since + config.after) { state.phase = "settling"; return decided(member, STAND); }
      if (!foe) { state.phase = "lost"; return decided(member, STAND); }
      const entry = ordered(member, foe.id), readiness = entry?.readiness ?? { kind: "blocked" as const, reason: "no such choice on its menu" };
      const approach = config.approach;
      if (approach && view.time < state.since + config.after + approach.seconds) {
        const toward = atan2(foe.at.x - at.x, foe.at.z - at.z), way = toward + approach.way * Math.PI / 180;
        if (readiness.kind === "ready") {
          state.set = toward; state.struck = foe.id; state.phase = "striking";
          return decided(member, strike(foe.id, toward));
        }
        state.phase = "going";
        return decided(member, { move: directMovement(sin(way), cos(way)), pace: approach.speed, face: heading(toward) });
      }
      state.phase = readiness.kind;
      state.reason = readiness.kind === "blocked" || readiness.kind === "waiting" ? readiness.reason : "";
      const h = member.heading ?? 0, toward = atan2(foe.at.x - at.x, foe.at.z - at.z);
      if (readiness.kind === "position") state.window = readiness.window;
      if (entry?.spot) {
        const offered = entry.spot.route ? entry.spot : null, drift = [{ at: [foe.at.x, foe.at.z], within: HELD_SPOT.moved }];
        if (!offered) { state.spot = null; letGo(state.spotHeld); }
        else if (!state.spot || !stillHeld(state.spotHeld, view.time, state.held ? Infinity : HELD_SPOT.rethink, offered.by ?? "", drift, () => true)) {
          state.spot = offered; hold(state.spotHeld, view.time, offered.by ?? "", drift);
        }
      }
      const window = state.window;
      if (window && (readiness.kind === "position" || readiness.kind === "ready" && state.walked && !state.held && !config.walking)) {
        const within = (one: Window) => windowHolds(one, at.x, at.z, h) && speed <= one.speed;
        // Beside a body lying, the place its menu names and the way round that body; else straight into the window's middle.
        const spot: Spot = state.spot ?? straightSpot(window, at), distance = hypot(spot.x - at.x, spot.z - at.z);
        // Arrived at its spot, the window's middle or the place beside a body lying (`arrivedIn`), it stands, and holds there once
        // slow enough inside the window, while it sways no further than `SWAY` out of it and until it stands settled outside it.
        const arrived = arrivedIn(state.arrival, window, at.x, at.z, h, distance, settled);
        state.held = state.held ? within(widened(window, SWAY)) && !(settled && !within(window)) : arrived && within(window);
        // Held beside a body lying, it faces as its spot does; else at the foe.
        if (state.held) state.set ??= state.spot ? spot.face : toward;
        if (config.pace === undefined || state.held || arrived) return decided(member, stay(state.set ?? spot.face));
        state.walked = true;
        const move = spot.route ? { kind: "place" as const, points: spot.route.map((point) => ({ x: point.x, z: point.z })), near: ARRIVED, ...(spot.by === undefined ? {} : { by: spot.by }) }
          : placeMovement({ x: spot.x, z: spot.z }, ARRIVED);
        return decided(member, { move, pace: approachPace(config.pace, distance), face: heading(spot.face) });
      }
      const face = state.set ?? toward;
      if (readiness.kind !== "ready" || state.walked && !settled && !config.walking) return decided(member, stay(face));
      state.set = face; state.struck = foe.id;
      state.phase = "striking";
      return decided(member, strike(foe.id, face));
    },
    idle() { return false; },
    report(): MemberReport { return { target: state.focus, task: taskOf(state.phase, state.reason), forced: false, selected: false }; },
    get notice() { return ""; },
  };

  /** The order to strike `foe` as the drill asks, standing and facing `face` (as it stands where none). */
  function strike(foe: string, face: number | null): Orders {
    const { skill, limb, region } = state.choice!;
    return { move: null, face: face === null ? null : heading(face), foe, region, skill, limb };
  }
}

const named = (value: unknown): boolean => typeof value === "string" && value.length > 0;
/** Whether `value` is an approach (`Approach`): a finite way, a speed over nothing and a time not negative, and nothing else. */
const approachFine = (value: unknown): boolean => {
  const given = value as Partial<Approach> | null;
  return typeof given === "object" && given !== null && Object.keys(given).every((key) => ["way", "speed", "seconds"].includes(key))
    && typeof given.way === "number" && Number.isFinite(given.way) && time(given.speed) && given.speed! > 0 && time(given.seconds);
};
const time = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** **A drill** (`drillCommander`): one skill with one limb at one region of the nearest foe. It leads no side of a Crypt run. */
export const DRILL = deepFreeze<CommanderEntry>({
  label: "Drill", sides: [], defaults: { kind: "drill", after: .5, pace: 1 },
  faults: (config: CommanderConfig) => {
    const given = config as Partial<DrillCommanderConfig>, keys = ["kind", "skill", "limb", "region", "after", "pace", "walking", "approach", "letGo", "moment"];
    return [
      ...Object.keys(config).filter((key) => !keys.includes(key)).map((key) => `${key}: not a setting of drill`),
      ...given.skill === undefined || named(given.skill) ? [] : ["skill: a skill's kind, or absent"],
      ...given.limb === undefined || named(given.limb) ? [] : ["limb: an effector, or absent"],
      ...given.region === undefined || isRegion(given.region) ? [] : ["region: a mark (high, middle, legs, any) or a segment, or absent"],
      ...time(given.after) ? [] : ["after: a finite time, s, not negative"],
      ...given.pace === undefined || time(given.pace) ? [] : ["pace: a finite speed, m/s, not negative"],
      ...given.walking === undefined || given.walking === true ? [] : ["walking: true, or absent"],
      ...given.approach === undefined || approachFine(given.approach) ? [] : ["approach: a way, degrees, finite; a speed, m/s, over nothing; and a time, s, not negative"],
      ...given.letGo === undefined || time(given.letGo) ? [] : ["letGo: a finite time, s, not negative"],
      ...given.moment === undefined || Number.isSafeInteger(given.moment) && given.moment >= 1 ? [] : ["moment: a count from 1, of its member's actions"],
    ];
  },
  create: (_host, config) => drillCommander(config as DrillCommanderConfig),
});
