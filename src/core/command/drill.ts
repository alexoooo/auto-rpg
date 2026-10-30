import { atan2, cos, hypot, sin } from "../math/real.ts";
import { approachPace, straightSpot, windowHolds } from "../mind/action-window.ts";
import { placeMovement } from "../mind/movement.ts";
import { isRegion, type Orders } from "../mind/orders.ts";
import type { ActionStatus, Readiness, Region, Window } from "../skills/action.ts";
import type { MenuEntry } from "../skills/menu.ts";
import { deepFreeze } from "../state.ts";
import type { CommanderConfig, CommanderEntry } from "./commander.ts";
import type { Commander, MemberReport, MemberView, SensedBody, TeamDecision, TeamView } from "./team.ts";

/**
 * **A drill Commander's config**: one action with one limb at one region of the nearest foe, asked
 * once; where it leaves one of the three out, the first choice of its member's menu that fits the
 * rest and could start or be walked to, kept once taken. It stands `after` s, walks into the action's window no faster than `pace` (with none, it
 * never walks) and orders the strike once there and settled, or, `walking`, the first step it is
 * ready. With `letGo`, it orders a stand that long after the action began, where the action is
 * still before its point of no return. With `moment`, it orders nothing until its member begins its
 * `moment`th action aimed at a body, and the mind fights by itself till then; from that step it
 * orders its own in that one's place, which the mind lets go where it can.
 */
export interface DrillCommanderConfig extends CommanderConfig {
  readonly kind: "drill";
  /** The action, by the name its member's kit gives it (`KitEntry.action`); absent, any. */
  readonly action?: string;
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
  /** How long after its action began it orders a stand, s, where the action is still before its point of no return; absent, never. */
  readonly letGo?: number;
  /** Which of its member's actions aimed at a body it takes the place of, from 1; absent, none: it orders from the start. */
  readonly moment?: number;
}

/**
 * Where a drill is: its member fighting by itself before its moment; standing first (`settling`);
 * with no foe (`lost`); reading the ordered choice (its readiness: out of its window, waiting,
 * refused, ready); with the strike ordered (`striking`) or under way (`under way`); after
 * letting it go until it is ready again (`let go`); or after it (`done`).
 */
export type DrillPhase = "fighting" | "settling" | "lost" | Readiness["kind"] | "striking" | "under way" | "let go" | "done";

/** What a drill says its member does (`MemberReport.task`): its phase, and why where its choice is refused or waits. */
const taskOf = (phase: DrillPhase, reason: string): string => reason && (phase === "blocked" || phase === "waiting") ? `${phase}: ${reason}` : phase;

/** A drill's phase and reason from what it says its member does (`taskOf`). */
export function drillTask(task: string): { readonly phase: DrillPhase; readonly reason: string } {
  const at = task.indexOf(": ");
  return at < 0 ? { phase: task as DrillPhase, reason: "" } : { phase: task.slice(0, at) as DrillPhase, reason: task.slice(at + 2) };
}

/** How near the middle of an action's window the drill walks to, m: a body stopped at the window's edge is admitted where the action reaches least. */
const MIDDLE = .01;

/**
 * How far past an action's window a body that stopped inside it may sway and still stand there, m:
 * the window moves with the head, which bobs that much as a walk's last steps land.
 */
const SWAY = .03;

/** The most speed over the ground a standing body has once a walk's sway has died out, m/s. */
const SETTLED = .06;

/** How long its member stays that slow before it counts as settled, s: a centre of mass slows that long before the feet stop stepping. */
const STILL_FOR = .25;

/** `window` narrowed to `MIDDLE` about its middle. */
function middleOf(window: Window): Window {
  const along = (window.along[0] + window.along[1]) / 2, across = (window.across[0] + window.across[1]) / 2;
  return { ...window, along: [along - MIDDLE, along + MIDDLE], across: [across - MIDDLE, across + MIDDLE] };
}

/** `window` widened by `by` m along and across. */
function widened(window: Window, by: number): Window {
  return { ...window, along: [window.along[0] - by, window.along[1] + by], across: [window.across[0] - by, window.across[1] + by] };
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

/** The choice a drill orders: an action, a limb and a region. */
type Choice = { readonly action: string; readonly limb: string; readonly region: Region };

/** **The drill Commander** (`DrillCommanderConfig`): it leads its team's first member. */
export function drillCommander(config: DrillCommanderConfig): Commander {
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
    /** The choice it orders, once its member's menu offers one that fits its config and could start or be walked to. */
    choice: null as Choice | null,
    /** Where its member stood at its last decision, and when: what its speed over the ground is read from. */
    last: null as { x: number; z: number; time: number } | null,
    /** Since when its member's speed has stayed at most `SETTLED`; null while it moves faster. */
    still: null as number | null,
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
    const fits = (entry: MenuEntry, want: Partial<Choice>) => entry.foe === foe && entry.region !== null && (want.action === undefined || entry.action === want.action)
      && (want.limb === undefined || entry.limb === want.limb) && (want.region === undefined || sameRegion(entry.region, want.region));
    const menu = member.menu ?? [];
    if (state.choice) return menu.find((entry) => fits(entry, state.choice!)) ?? null;
    const open = menu.find((entry) => fits(entry, config) && (entry.readiness.kind === "ready" || entry.readiness.kind === "position"));
    if (open) state.choice = { action: open.action, limb: open.limb, region: open.region! };
    return open ?? menu.find((entry) => fits(entry, config)) ?? null;
  };
  const decided = (member: MemberView, orders: Orders | null): TeamDecision => ({ orders: new Map(orders ? [[member.id, { ...orders, firm: true as const }]] : []), looked: true });
  return {
    state,
    hear() {},
    decide(view: TeamView): TeamDecision {
      const member = view.members[0];
      if (!member) return { orders: new Map(), looked: false };
      const at = member.at, last = state.last, dt = last ? view.time - last.time : 0;
      const speed = last && dt > 0 ? hypot(at.x - last.x, at.z - last.z) / dt : 0;
      state.last = { x: at.x, z: at.z, time: view.time };
      state.still = speed > SETTLED ? null : state.still ?? view.time;
      if (state.phase === "fighting") {
        if (!reached(member)) return decided(member, null);
        state.since = view.time - config.after;
      }
      state.since ??= view.time;
      const foe = nearest(member, view.others);
      state.focus = foe?.id ?? null;
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
      if (state.phase === "striking") {
        const begun = member.actions?.find((action) => action.action === state.choice!.action && action.effector === state.choice!.limb && !state.begun.includes(action.id));
        if (begun) { state.id = begun.id; state.began = view.time; state.phase = "under way"; }
        return decided(member, strike(state.struck!, state.set));
      }
      const entry = ordered(member, foe.id), readiness = entry?.readiness ?? { kind: "blocked" as const, reason: "no such choice on its menu" };
      state.phase = readiness.kind;
      state.reason = readiness.kind === "blocked" || readiness.kind === "waiting" ? readiness.reason : "";
      const h = member.heading ?? 0, toward = atan2(foe.at.x - at.x, foe.at.z - at.z), settled = state.still !== null && view.time - state.still >= STILL_FOR;
      if (readiness.kind === "position") state.window = readiness.window;
      const window = state.window;
      if (window && (readiness.kind === "position" || readiness.kind === "ready" && state.walked && !state.held && !config.walking)) {
        const middle = middleOf(window), within = (one: Window) => windowHolds(one, at.x, at.z, h) && speed <= one.speed;
        state.held = state.held ? within(widened(window, SWAY)) && !(settled && !within(window)) : within(middle);
        if (state.held) state.set ??= toward;
        const spot = straightSpot(middle, at), distance = hypot(spot.x - at.x, spot.z - at.z);
        if (config.pace === undefined || state.held || distance <= MIDDLE) return decided(member, { move: null, face: heading(state.set ?? spot.face) });
        state.walked = true;
        return decided(member, { move: placeMovement({ x: spot.x, z: spot.z }, MIDDLE), pace: approachPace(config.pace, distance), face: heading(spot.face) });
      }
      const face = state.set ?? toward;
      if (readiness.kind !== "ready" || state.walked && !settled && !config.walking) return decided(member, { move: null, face: heading(face) });
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
    const { action, limb, region } = state.choice!;
    return { move: null, face: face === null ? null : heading(face), foe, region, action, limb };
  }
}

const named = (value: unknown): boolean => typeof value === "string" && value.length > 0;
const time = (value: unknown): boolean => typeof value === "number" && Number.isFinite(value) && value >= 0;

/** **A drill** (`drillCommander`): one action with one limb at one region of the nearest foe. It leads no side of a Crypt run. */
export const DRILL: CommanderEntry = deepFreeze({
  label: "Drill", sides: [], defaults: { kind: "drill", after: .5, pace: 1 },
  faults: (config: CommanderConfig) => {
    const given = config as Partial<DrillCommanderConfig>, keys = ["kind", "action", "limb", "region", "after", "pace", "walking", "letGo", "moment"];
    return [
      ...Object.keys(config).filter((key) => !keys.includes(key)).map((key) => `${key}: not a setting of drill`),
      ...given.action === undefined || named(given.action) ? [] : ["action: an action's name, or absent"],
      ...given.limb === undefined || named(given.limb) ? [] : ["limb: an effector, or absent"],
      ...given.region === undefined || isRegion(given.region) ? [] : ["region: a mark (high, middle, legs, any) or a segment, or absent"],
      ...time(given.after) ? [] : ["after: a finite time, s, not negative"],
      ...given.pace === undefined || time(given.pace) ? [] : ["pace: a finite speed, m/s, not negative"],
      ...given.walking === undefined || given.walking === true ? [] : ["walking: true, or absent"],
      ...given.letGo === undefined || time(given.letGo) ? [] : ["letGo: a finite time, s, not negative"],
      ...given.moment === undefined || Number.isSafeInteger(given.moment) && given.moment >= 1 ? [] : ["moment: a count from 1, of its member's actions"],
    ];
  },
  create: (_host, config) => drillCommander(config as DrillCommanderConfig),
});
