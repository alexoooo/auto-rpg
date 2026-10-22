/**
 * **The standard match's cases**: two minds over one fixed set of arena bouts, each mind on each
 * side. Bouts are the same to the bit on every machine (`docs/reference/real-functions.md`).
 */
import { CAP_SECONDS, SIDES, type DuelEnding } from "../../arena/duel.ts";
import type { ArenaLevel } from "../../arena/levels.ts";
import { REPRESENTATIVE, loadoutKey, type Loadout } from "../../core/items/held.ts";
import { CONTROLLERS } from "../../core/mind/controllers.ts";
import type { MindConfig } from "../../core/mind/config.ts";
import { modelHolding, type BodyModel } from "../../core/models.ts";
import { isClash } from "../../core/rules/blows.ts";
import type { Side } from "../../core/spec/body.ts";
import { mindFaults } from "../../ui/mind-link.ts";
import type { BuiltCase, Cases, ContestReading, Json, Reader } from "../evaluation.ts";

/**
 * What a match plays: each body a mind may have against each the other may have, each loadout, and
 * each level at each of its starting gaps, by the arena's rules as its page plays them (no limit on
 * time down, its cap). The standard plays the representative loadouts (`REPRESENTATIVE`) on the
 * open stage. A change here is a new protocol: its cases' keys change.
 */
const MATCH = Object.freeze({
  levels: Object.freeze([Object.freeze({ level: "open" as ArenaLevel, gaps: Object.freeze([3, 4, 5]) })]),
  bodies: Object.freeze(["workshop-fighter", "workshop-rogue"] as BodyModel[]),
  loadouts: REPRESENTATIVE,
  capSeconds: CAP_SECONDS,
  recoverySeconds: null,
});

/** Sword and buckler on both levels, the court round its columns at its nearer and farther gaps. */
const SWORD_AND_BUCKLER = Object.freeze({ ...MATCH,
  levels: Object.freeze([Object.freeze({ level: "open" as ArenaLevel, gaps: Object.freeze([3, 4.5]) }), Object.freeze({ level: "obstacle-court" as ArenaLevel, gaps: Object.freeze([4, 6]) })]),
  loadouts: Object.freeze(REPRESENTATIVE.filter((loadout) => loadoutKey(loadout) === "buckler,sword")),
});

type Protocol = typeof MATCH;

/** One bout's conditions: the left's body, the right's, both sides' loadout, the level and the gap, m. */
export type MatchCondition = { readonly left: BodyModel; readonly right: BodyModel; readonly loadout: Loadout; readonly level: ArenaLevel; readonly gap: number };

/**
 * What a bout came to: the winner (null a draw) and how, when, how many blows landed (clashes not
 * counted), each side's bar at the end and every 10 s of the bout and at its end; the left's score
 * and margin (its bar less the right's).
 */
export type BoutReading = ContestReading & {
  readonly winner: Side | null;
  readonly ending: DuelEnding;
  readonly seconds: number;
  readonly blows: number;
  readonly bars: readonly [number, number];
  readonly series: readonly (readonly [number, number])[];
};

/** How often a bout's bars are read into its series, simulated s. */
const SERIES_SECONDS = 10;

/** A bout's reader: its bars every `SERIES_SECONDS` and at the verdict. */
function readBout(built: BuiltCase): Reader<BoutReading> {
  const { duel } = built, every = SERIES_SECONDS * built.world.hz, series: (readonly [number, number])[] = [];
  const bars = (): readonly [number, number] => [duel.duelists.left.pool.bar(), duel.duelists.right.pool.bar()];
  let steps = 0, last = -1;
  return {
    afterStep() { if (++steps % every === 0) { series.push(bars()); last = steps; } },
    get ended() { return duel.verdict !== null; },
    reading() {
      const verdict = duel.verdict!, end = bars();
      if (last !== steps) series.push(end);
      return {
        winner: verdict.winner, ending: verdict.ending, seconds: duel.clock,
        blows: duel.blows.filter((blow) => !isClash(blow)).length, bars: end, series,
        score: verdict.winner === null ? 0.5 : verdict.winner === "left" ? 1 : 0, margin: end[0] - end[1],
      };
    },
  };
}

/** Why `value` is no mind, or what keeps it from `loadout` on any of the protocol's bodies (`mindFaults`). */
function faultsOf(protocol: Protocol, value: Json, loadout: Loadout): readonly string[] {
  const kind = typeof value === "object" && value !== null && !Array.isArray(value) ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string" || !Object.hasOwn(CONTROLLERS, kind)) return [`no mind: a config names its kind (${Object.keys(CONTROLLERS).join(", ")})`];
  return protocol.bodies.flatMap((body) => mindFaults(value as unknown as MindConfig, modelHolding(body, loadout)).map((fault) => `${body} carrying ${loadoutKey(loadout)}: ${fault}`));
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
    faults: (value, condition) => faultsOf(protocol, value, condition.loadout),
    world: (values, { left, right, loadout, level, gap }, engine) => ({
      kind: "bout", engine, tape: [],
      recipe: { level, left, right, gap, loadouts: { left: loadout, right: loadout },
        minds: Object.fromEntries(SIDES.map((side, k) => [side, values[k] as unknown as MindConfig])) as Record<Side, MindConfig>,
        capSeconds: protocol.capSeconds, recoverySeconds: protocol.recoverySeconds },
    }),
    read: readBout,
  };
}

/** Every protocol a match may be played on, by name. */
export const MATCH_CASES: Readonly<Record<string, Cases<MatchCondition, BoutReading>>> = Object.freeze({
  standard: matchCases(MATCH), "sword-and-buckler": matchCases(SWORD_AND_BUCKLER),
});
