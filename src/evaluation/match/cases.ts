/**
 * **The standard match's cases**: two minds over one fixed set of arena bouts, each mind on each
 * side. Bouts are the same to the bit on every machine (`src/core/math/real.ts`).
 */
import { CAP_SECONDS } from "../../game/arena/duel.ts";
import type { ArenaLevel } from "../../game/arena/levels.ts";
import { loadoutKey, type Loadout } from "../../core/bodies/items/held.ts";
import { REPRESENTATIVE } from "../loadouts.ts";
import { presetFitsModel } from "../../minds/catalog/controller.ts";
import type { BodyModel } from "../../core/bodies/models.ts";

import { readBout, type BoutReading } from "../contest.ts";
import { mindOf, seatBody, sideCharacters, type Cases, type Json, type Subject } from "../evaluation.ts";
import { FIGHT_ENTRY } from "../../minds/catalog/catalog.ts";
import { drawnGap, WARRIOR_GAPS } from "../scorecard/cases.ts";
import { type GameContext, mindFaultsOf, perContext } from "../../game/arena/context.ts";

/**
 * What a match plays: each body a mind may have against each the other may have, each loadout, and
 * each level at each of its starting gaps, by the arena's rules as its page plays them (the game's
 * end rules, its cap). The standard plays the representative loadouts (`REPRESENTATIVE`) on the
 * open stage. A change here is a new protocol: its cases' keys change.
 */
const MATCH = Object.freeze({
  levels: Object.freeze([Object.freeze({ level: "open" as ArenaLevel, gaps: Object.freeze([3, 4, 5]) })]),
  bodies: Object.freeze(["man", "woman"] as BodyModel[]),
  loadouts: REPRESENTATIVE,
  capSeconds: CAP_SECONDS,
});

/** Sword and buckler on both levels, the court round its columns at its nearer and farther gaps. */
const SWORD_AND_BUCKLER = Object.freeze({ ...MATCH,
  levels: Object.freeze([Object.freeze({ level: "open" as ArenaLevel, gaps: Object.freeze([3, 4.5]) }), Object.freeze({ level: "obstacle-court" as ArenaLevel, gaps: Object.freeze([4, 6]) })]),
  loadouts: Object.freeze(REPRESENTATIVE.filter((loadout) => loadoutKey(loadout) === "buckler,sword")),
});

/**
 * The Warrior empty-handed on itself at the scorecard's gaps (`warrior`, `src/evaluation/scorecard/cases.ts`):
 * 24 from 2.65 to 5.41 m, on three draws each shifted 0.5 cm more, so a reading's spread over its
 * draws can be read beside its interval.
 */
const WARRIOR = warriorOn([0, 1, 2]);

/** The same on six further draws, 3 to 8 (`warrior-drawn`): bouts a choice made on `warrior` was not made on. */
const WARRIOR_DRAWN = warriorOn([3, 4, 5, 6, 7, 8]);

/** The Warrior empty-handed on itself at the scorecard's 24 gaps on each of `draws`, a draw shifting them 0.5 cm more. */
function warriorOn(draws: readonly number[]) {
  return Object.freeze({ ...MATCH,
    levels: Object.freeze([Object.freeze({ level: "open" as ArenaLevel, gaps: Object.freeze(draws.flatMap((draw) => WARRIOR_GAPS.map((gap) => drawnGap(gap, draw)))) })]),
    bodies: Object.freeze(["man"] as BodyModel[]),
    loadouts: Object.freeze(REPRESENTATIVE.filter((loadout) => loadoutKey(loadout) === "empty,empty")),
  });
}

type Protocol = typeof MATCH;

/** One bout's conditions: the left's body, the right's, both sides' loadout, the level and the gap, m. */
export type MatchCondition = { readonly left: BodyModel; readonly right: BodyModel; readonly loadout: Loadout; readonly level: ArenaLevel; readonly gap: number };

export const createMatchCases = perContext((context: GameContext) => {
  const { controllers: CONTROLLERS } = context.catalog;
  const mindFaults = mindFaultsOf(context);

  /** Both minds occupy both bodies in a complete pair; each body must fit and allow its named calibration. */
  function faultsOf(value: Json, condition: MatchCondition, subject?: Subject): readonly string[] {
    const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
    if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
    const { loadout } = condition;
    return [...new Set([condition.left, condition.right])].flatMap((body) => !presetFitsModel(subject ?? {}, body)
      ? [`named calibration allows ${subject?.models?.join(", ") || "no bodies"}; ${body} is unavailable`]
      : mindFaults(mindOf(value), seatBody(body, loadout, subject), { entry: FIGHT_ENTRY }).map((fault) => `${body} carrying ${loadoutKey(loadout)}: ${fault}`));
  }

  /** The match on `protocol`: its conditions in the order each left body, right body, loadout, level, gap. */
  function matchCases(protocol: Protocol): Cases<MatchCondition, BoutReading> {
    const conditions: MatchCondition[] = [];
    for (const left of protocol.bodies) for (const right of protocol.bodies) for (const loadout of protocol.loadouts)
      for (const { level, gaps } of protocol.levels) for (const gap of gaps) conditions.push({ left, right, loadout, level, gap });
    return {
      arity: 2,
      play: protocol as unknown as Json,
      conditions,
      seconds: protocol.capSeconds,
      faults: faultsOf,
      world: (values, { left, right, loadout, level, gap }, engine, seats) => ({
        kind: "bout", engine, tape: [],
        recipe: { level, left, right, gap, loadouts: { left: loadout, right: loadout },
          minds: { left: mindOf(values[0]), right: mindOf(values[1]) },
          capSeconds: protocol.capSeconds, ...sideCharacters({ left, right }, { left: seats[0], right: seats[1] }) },
      }),
      read: readBout,
    };
  }

  /** Every protocol a match may be played on, by name. */
  const MATCH_CASES: Readonly<Record<string, Cases<MatchCondition, BoutReading>>> = Object.freeze({
    standard: matchCases(MATCH), "sword-and-buckler": matchCases(SWORD_AND_BUCKLER), warrior: matchCases(WARRIOR), "warrior-drawn": matchCases(WARRIOR_DRAWN),
  });

  return { MATCH_CASES };
});
