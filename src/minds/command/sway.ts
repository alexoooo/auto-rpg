import { deepFreeze } from "../../core/state.ts";
import type { CommanderEntry, CommanderConfig } from "./kind.ts";
import { direction, distance } from "./goals.ts";
import type { Orders } from "../orders.ts";
import type { Commander, MemberReport, SensedBody, TeamDecision, TeamView } from "./team.ts";

/**
 * **The sway Commander's config**: within `set` m of its foe a member is ordered the gait `set`
 * (its carriage), and out of it again `SET_OFF` beyond; within `range` m and no nearer than `near`
 * it is ordered the gait `back-step` for `seconds` s, then stands `rest` s before it may be again;
 * while ordered it, with its foe beyond `follow` m, it is ordered a walk toward it (none where 0).
 */
export interface SwayConfig extends CommanderConfig {
  readonly kind: "sway";
  readonly range: number;
  readonly near: number;
  readonly seconds: number;
  readonly rest: number;
  readonly set: number;
  readonly follow: number;
}

/** How far beyond its `set` range a member is ordered out of its carriage, m. */
const SET_OFF = .5;

/** A member's sway: waiting for its foe in range, ordered the back step, or standing its rest; since when, s; whether it is ordered its carriage. */
interface Swaying { phase: "waiting" | "going" | "resting"; since: number; set: boolean }

/**
 * **Swaying members**: what the back step's drill leads its defender by. Each faces the nearest
 * foe fighting, standing and striking nothing; in its carriage within `set` m of it; and ordered
 * the back step when that foe comes within `range` m (`SwayConfig`), so the sway is begun on the
 * foe's range before a punch. The gaits named are the member's own (`MoveConfig.gaits`).
 */
function swayCommander(config: SwayConfig): Commander {
  const state = { targets: {} as Record<string, string | null>, members: {} as Record<string, Swaying> };
  return {
    state,
    hear() {},
    decide(view: TeamView): TeamDecision {
      const orders = new Map<string, Orders>();
      for (const member of view.members) {
        let foe: SensedBody | null = null, apart = Infinity;
        for (const other of view.others) {
          if (!other.fighting) continue;
          const d = distance(member.at, other.at);
          if (d < apart) { foe = other; apart = d; }
        }
        state.targets[member.id] = foe?.id ?? null;
        const sway = state.members[member.id] ??= { phase: "waiting", since: view.time, set: false };
        if (!sway.set && apart <= config.set) sway.set = true;
        else if (sway.set && apart > config.set + SET_OFF) sway.set = false;
        if (sway.phase === "waiting" && apart <= config.range && apart >= config.near) { sway.phase = "going"; sway.since = view.time; }
        else if (sway.phase === "going" && view.time >= sway.since + config.seconds) { sway.phase = "resting"; sway.since = view.time; }
        else if (sway.phase === "resting" && view.time >= sway.since + config.rest) sway.phase = "waiting";
        const gait = sway.phase === "going" ? "back-step" : sway.set ? "set" : null;
        const toward = foe ? direction(member.at, foe.at) : null, following = toward && sway.phase === "going" && config.follow > 0 && apart > config.follow;
        orders.set(member.id, { move: following ? { kind: "direct", direction: toward } : null, face: toward, ...(gait ? { gait } : {}) });
      }
      return { orders, looked: true };
    },
    idle() { return false; },
    report(member: string): MemberReport { return { target: state.targets[member] ?? null, task: state.members[member]?.phase === "going" ? "swaying" : "standing", forced: false, selected: false }; },
    get notice() { return ""; },
  };
}

/** The sway Commander's settings as the back step's drill reads best: in the carriage within 3 m, the sway at 1.05 m held 1.65 s, 0.3 s between. */
const SWAY_DEFAULTS = deepFreeze<SwayConfig>({ kind: "sway", range: 1.05, near: 0, seconds: 1.65, rest: .3, set: 3, follow: 0 });

/** The keys of a sway config, each a number but its kind. */
const SWAY_KEYS = ["range", "near", "seconds", "rest", "set", "follow"] as const;

/** **Sway** (`swayCommander`): what the back step's evaluation leads its subject by. It leads no side of a Crypt run. */
export const SWAY = deepFreeze<CommanderEntry>({
  label: "Sway", sides: [], defaults: SWAY_DEFAULTS,
  faults: (config) => [
    ...Object.keys(config).filter((key) => key !== "kind" && !(SWAY_KEYS as readonly string[]).includes(key)).map((key) => `${key}: not a setting of sway`),
    ...SWAY_KEYS.filter((key) => !(typeof config[key] === "number" && Number.isFinite(config[key]) && (config[key] as number) >= 0 && (config[key] as number) <= 6)).map((key) => `${key}: a number from 0 to 6`),
  ],
  create: (_host, config) => swayCommander({ ...SWAY_DEFAULTS, ...config } as SwayConfig),
});
