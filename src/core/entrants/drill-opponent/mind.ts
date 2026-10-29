import { CLASSIC, DUELLIST, FIGHTING, PUNCHER, type MindConfig } from "../../mind/config.ts";
import { controller, type Controller, type MindPreset } from "../../mind/controller.ts";
import type { MindWiring } from "../../mind/minds.ts";
import { STAND_ORDERS, type Orders } from "../../mind/orders.ts";
import { slotOne, type Slot } from "../../mind/parts.ts";
import type { BodySense, Senses } from "../../mind/senses.ts";
import { deepFreeze } from "../../state.ts";

/**
 * **A beat's move**: its body's own tactics (`own`), standing (`stand`), holding a range of the foe
 * from `near` to `far` m (`range`), or attacking the foe (`strike`). The foe is the first other body
 * of another side still in the fight.
 */
export type BeatMove =
  | { readonly kind: "own" }
  | { readonly kind: "stand" }
  | { readonly kind: "range"; readonly near: number; readonly far: number }
  | { readonly kind: "strike" };

/** One beat of a script: its move, for `seconds`. */
export interface Beat { readonly seconds: number; readonly move: BeatMove }

/**
 * **The drill opponent's config**: the mind that moves its body (`body`, a mind whose tactics follow
 * orders), and its script, each beat's move given it as orders for the beat's seconds, in turn and
 * round again from the bout's start. With no beats its body's own tactics play throughout.
 */
export interface DrillOpponentConfig {
  readonly kind: "drill-opponent";
  readonly body: MindConfig;
  readonly beats: readonly Beat[];
}

/** Who is struck: a Warrior with empty hands that stands in guard and throws nothing. */
export const STANDS: MindConfig = deepFreeze({ ...CLASSIC, tactics: { kind: "stand" }, actions: [], executors: [] });

/** A body that goes where it is ordered, its hands held in the pose, and throws nothing. */
const MOVES: MindConfig = deepFreeze({ ...STANDS, tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "cover", guard: "pose" }] } });

/** A body that goes where it is ordered and covers a threat with its hands. */
const GUARDS: MindConfig = deepFreeze({ ...MOVES, tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "cover", guard: "cover" }] } });

/**
 * A body that goes where it is ordered and, ordered at its foe, closes and throws the Puncher's
 * straight punch with either hand (its rear one, mostly; with its lead hand alone the first comes
 * after 3.6 s from 1.4 m, too late for a rhythm).
 */
const PUNCHES: MindConfig = deepFreeze({ ...PUNCHER,
  tactics: { ...FIGHTING, list: [{ kind: "follow-orders" }, { kind: "attack" }, { kind: "approach" }, { kind: "cover", guard: "pose" }] } });

/** Each drill opponent's script, its preset's id the drill names it by (`MindPreset.offered` false: none is on a menu). */
const PRESETS: Readonly<Record<string, MindPreset<DrillOpponentConfig>>> = deepFreeze({
  "drill-stand": { label: "Drill: stand", offered: false, config: { kind: "drill-opponent", body: STANDS, beats: [] } },
  "drill-step": { label: "Drill: step in and out", offered: false, config: { kind: "drill-opponent", body: MOVES,
    beats: [{ seconds: 1.2, move: { kind: "range", near: .8, far: 1 } }, { seconds: 1.2, move: { kind: "range", near: 1.6, far: 1.8 } }] } },
  "drill-guard": { label: "Drill: guard", offered: false, config: { kind: "drill-opponent", body: GUARDS, beats: [] } },
  "drill-punch": { label: "Drill: punch on a rhythm", offered: false, config: { kind: "drill-opponent", body: PUNCHES,
    beats: [{ seconds: 2, move: { kind: "strike" } }, { seconds: 1, move: { kind: "stand" } }] } },
  "drill-swing": { label: "Drill: swing on a rhythm", offered: false, config: { kind: "drill-opponent", body: DUELLIST,
    beats: [{ seconds: 2, move: { kind: "strike" } }, { seconds: 1, move: { kind: "stand" } }] } },
  "drill-press": { label: "Drill: press forward", offered: false, config: { kind: "drill-opponent", body: MOVES,
    beats: [{ seconds: 1, move: { kind: "range", near: .5, far: .7 } }] } },
});

/** Its one slot: the mind that moves its body. */
const SLOTS: readonly Slot[] = Object.freeze([slotOne("body", "Body", "mind")]);

/** What is wrong with `beats`, each a sentence. */
function beatFaults(beats: readonly Beat[]): readonly string[] {
  if (!Array.isArray(beats)) return ["beats: a list of beats"];
  return beats.flatMap((beat, i) => {
    const move = beat?.move, at = `beats.${i}`;
    if (!(Number.isFinite(beat?.seconds) && beat.seconds > 0)) return [`${at}.seconds: a positive time`];
    switch (move?.kind) {
      case "own": case "stand": case "strike": return [];
      case "range": return Number.isFinite(move.near) && move.near >= 0 && Number.isFinite(move.far) && move.far >= move.near ? [] : [`${at}.move: a range from near to far, m, not negative`];
      default: return [`${at}.move: own, stand, range or strike`];
    }
  });
}

/** The move `beats` give `seconds` into the bout: the beat that time falls in, round again; none with no beats. */
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

/** `move` as orders on `foe`: none for its body's own; standing where it names a foe and none is sensed. */
function ordersOf(move: BeatMove, foe: BodySense | undefined): Orders | null {
  switch (move.kind) {
    case "own": return null;
    case "stand": return STAND_ORDERS;
    case "range": return foe ? { move: { kind: "range", focus: foe.id, near: move.near, far: move.far }, face: null } : STAND_ORDERS;
    case "strike": return foe ? { face: null, foe: foe.id } : STAND_ORDERS;
    default: { const never: never = move; throw new Error(`no beat move ${JSON.stringify(never)}`); }
  }
}

/** The script's orders now, under `senses`: its beat's move on the first other body of another side still in the fight. */
function scripted(config: DrillOpponentConfig, senses: Senses): Orders | null {
  const move = moveAt(config.beats, senses.time);
  return move && ordersOf(move, senses.others.find((other) => other.side !== senses.side && !other.out));
}

/**
 * **The drill opponent**, an entrant whose config is its script: its body's mind made as its own
 * controller makes it, given the script's orders where a person gives none. It reads nothing but
 * its senses and the clock in them, so it keeps no memory of its own; its body's mind keeps its own.
 */
export const DRILL_OPPONENT_MIND: Controller = controller<DrillOpponentConfig>({
  role: "mind", label: "Drill opponent", stage: "experimental", fields: [], slots: SLOTS, defaults: PRESETS["drill-stand"]!.config,
  keys: { kind: true, body: true, beats: true }, presets: PRESETS,
  fits: (spec, config, parts) => parts.of("mind", config.body).fits(spec, config.body, parts),
  strikes: (spec, config, parts) => parts.of("mind", config.body).strikes?.(spec, config.body, parts),
  faults: (config) => beatFaults(config.beats),
  builtIn: (spec, config, parts) => parts.of("mind", config.body).builtIn(spec, config.body, parts),
  create: (host, config, wiring: MindWiring) => host.parts.of("mind", config.body).create(host, config.body,
    { ...wiring, orders: (senses) => wiring.orders(senses) ?? scripted(config, senses) }),
});
