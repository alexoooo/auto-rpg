import { deepFreeze } from "../../core/state.ts";
import { STAND_ORDERS, type Orders } from "../orders.ts";
import type { CommanderConfig, CommanderEntry } from "./kind.ts";
import type { Commander, MemberReport, SensedBody, TeamDecision, TeamView } from "./team.ts";

/**
 * **A beat's move**: the member's own judgement (`own`, no orders), standing (`stand`), holding a
 * range of the foe from `near` to `far` m (`range`), or attacking the foe (`strike`). The foe is
 * the first body its team senses that is still in the fight.
 */
type BeatMove =
  | { readonly kind: "own" }
  | { readonly kind: "stand" }
  | { readonly kind: "range"; readonly near: number; readonly far: number }
  | { readonly kind: "strike" };

/** One beat of a script: its move, for `seconds`. */
interface Beat { readonly seconds: number; readonly move: BeatMove }

/**
 * **A beats Commander's config**: each beat's move given every member as orders for the beat's
 * seconds, in turn and round again from the team's first step; with no beats, its members are
 * left to their own judgement throughout.
 */
export interface BeatsConfig extends CommanderConfig {
  readonly kind: "beats";
  readonly beats: readonly Beat[];
}

/** What is wrong with `config`, each a sentence. */
function beatsFaults(config: CommanderConfig): string[] {
  const { kind: _, beats, ...rest } = config as Partial<BeatsConfig>;
  const faults = Object.keys(rest).map((key) => `${key}: not a setting of beats`);
  if (!Array.isArray(beats)) return [...faults, "beats: a list of beats"];
  return [...faults, ...beats.flatMap((beat, i) => {
    const move = beat?.move, at = `beats.${i}`;
    if (!(Number.isFinite(beat?.seconds) && beat.seconds > 0)) return [`${at}.seconds: a positive time`];
    switch (move?.kind) {
      case "own": case "stand": case "strike": return [];
      case "range": return Number.isFinite(move.near) && move.near >= 0 && Number.isFinite(move.far) && move.far >= move.near ? [] : [`${at}.move: a range from near to far, m, not negative`];
      default: return [`${at}.move: own, stand, range or strike`];
    }
  })];
}

/** The move `beats` give `seconds` in: the beat that time falls in, round again; none with no beats. */
function moveAt(beats: readonly Beat[], seconds: number): BeatMove | null {
  if (beats.length === 0) return null;
  let period = 0;
  for (const beat of beats) period += beat.seconds;
  let left = seconds - period * Math.floor(seconds / period);
  for (const beat of beats) {
    if (left < beat.seconds) return beat.move;
    left -= beat.seconds;
  }
  return beats[beats.length - 1]!.move;
}

/** `move` as orders on `foe`: none for the member's own judgement; standing where it names a foe and none is sensed. */
function ordersOf(move: BeatMove, foe: SensedBody | undefined): Orders | null {
  switch (move.kind) {
    case "own": return null;
    case "stand": return STAND_ORDERS;
    case "range": return foe ? { move: { kind: "range", focus: foe.id, near: move.near, far: move.far }, face: null } : STAND_ORDERS;
    case "strike": return foe ? { face: null, foe: foe.id } : STAND_ORDERS;
    default: { const never: never = move; throw new Error(`no beat move ${JSON.stringify(never)}`); }
  }
}

/** **A beats Commander** (`BeatsConfig`): it keeps no memory but what its members are told now. */
function beatsCommander(config: BeatsConfig): Commander {
  const state = { task: "" };
  return {
    state,
    hear() {},
    decide(view: TeamView): TeamDecision {
      const orders = new Map<string, Orders>(), move = moveAt(config.beats, view.time);
      const given = move && ordersOf(move, view.others.find((other) => other.fighting));
      state.task = move?.kind ?? "";
      if (given) for (const member of view.members) orders.set(member.id, given);
      return { orders, looked: true };
    },
    idle() { return false; },
    report(): MemberReport { return { target: null, task: state.task, forced: false, selected: false }; },
    get notice() { return ""; },
  };
}

/** **Beats** (`beatsCommander`): what a drill's opponent is led by, a script of moves; as it starts, pressing forward, half a metre to 0.7 m off the foe. It leads no side of a Crypt run. */
export const BEATS = deepFreeze<CommanderEntry>({
  label: "Beats", sides: [], defaults: { kind: "beats", beats: [{ seconds: 1, move: { kind: "range", near: .5, far: .7 } }] }, faults: beatsFaults,
  create: (_host, config) => beatsCommander(config as BeatsConfig),
});
