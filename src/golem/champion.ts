import type { BodyView, FighterView, Intent } from "../mind.ts";
import type { HandName } from "../hands.ts";
import { GOLEM_PLANNER, golemPlanner, type GolemPlanner, type PlannerTactics } from "./planner.ts";
import { canAttack } from "./tactics.ts";
import { GOLEM_TACTICS_V2, type AskHook, type FencerTactics, type GolemFencer } from "./tactics-v2.ts";

/**
 * The golem's fourth scripted mind, `golem-champion`: the planner with its numbers moved by a
 * tournament. Session 07 of the matchup set.
 *
 * Nothing here is a new tactic. The fencer's table and the planner's have seventy-one numeric
 * rows between them and every one was set by hand and kept by a sweep; `scripts/tune.mjs`
 * moves the sixty-two the fencer reads of its own table (the sword's stroke shape reads the
 * duelist's) together by a (1+λ) evolution strategy whose fitness is the score against a
 * frozen league of the shipped minds, on the mirrored pool where the body is the same on both
 * sides and the mind is what differs. What it finds is checked in as `GOLEM_CHAMPIONS` in
 * `src/golem/tactics-champions.ts`: one vector per *arm class* that had enough builds in the
 * pool to be tuned on its own, and one general vector for the rest. The mind reads its own arm
 * class off its first view, takes that row or the general one, and is from then on the planner
 * of Session 06 over the fencer of Session 05 with those numbers in place of the defaults.
 *
 * **The arm class is what a mind can read of itself**, and not the tournament's build class,
 * which names the terminal module. The frozen choice of Session 00 stands: a mind reads
 * capabilities and a published view, never module ids. So the class is the armed hand's
 * weapon kind crossed with the reach band its published reach falls in, `sword/long`,
 * `club/mid`, `whip/mid`, `empty/short`, with `paired-` in front when both sockets hold one
 * terminal (the maul, which a mind reads as a paired club). Two things the tournament tells
 * apart fall together here and share a row: a fist and a capped socket are both `empty/short`,
 * because to the mind both are a hand that holds nothing, and the mace and the maul share
 * `club` until the reach band or the pairing separates them, which it does.
 *
 * **Refused by version.** A table from another build of the fencer or the planner names rows
 * that may no longer exist or mean something else; `checkChampions` refuses it by name on load
 * rather than assigning what matches. The rows themselves are checked too: a row the tables do
 * not have is refused, so a renamed constant fails at load and not as an ignored number.
 */
export const CHAMPION_VERSION = 1;

/** The numeric rows of the fencer's table, which is what the tuner moves; the switches stay. */
export type FencerRow = { [K in keyof FencerTactics]: FencerTactics[K] extends number ? K : never }[keyof FencerTactics];
/** The planner's rows the tuner moves: everything but `explore`, which is zero in play. */
export type PlannerRow = Exclude<keyof PlannerTactics, "explore">;

/** One tuned vector: the rows it moved, the class it was tuned on, and what it scored. */
export interface ChampionEntry {
  /** The arm class, or `general`. */
  readonly class: string;
  /** How many of the pool's builds fell in the class the vector was tuned on. */
  readonly builds: number;
  readonly generations: number;
  /** Bouts the search spent. */
  readonly bouts: number;
  /** Points per bout against the league on the confirmation seed, this vector and the defaults. */
  readonly score: number;
  readonly baseline: number;
  /** The bar margin over the same bouts, which is what the search selected on. */
  readonly margin: number;
  readonly baselineMargin: number;
  readonly fencer: Readonly<Partial<Record<FencerRow, number>>>;
  readonly planner: Readonly<Partial<Record<PlannerRow, number>>>;
}

export interface ChampionTables {
  readonly version: number;
  /** The run's seed, and the date it was written. Zero and empty for the table of no champions. */
  readonly seed: number;
  readonly date: string;
  /** The policies the vectors were scored against. */
  readonly league: readonly string[];
  readonly general: ChampionEntry | null;
  readonly classes: Readonly<Record<string, ChampionEntry>>;
}

/**
 * The edges of the reach bands a class is made of, metres of a hand's published reach at the
 * first sample. Short is a capped socket or a fist; mid is a mace, a plate or a whip on a short
 * chain; long is a blade or a maul at full extension. Session 04 drew them for the tournament's
 * build class and the arm class reads the same edges, so a row keyed here and a rating row
 * keyed there fall in the same band for the same body.
 */
export const REACH_BANDS: readonly { readonly name: string; readonly below: number }[] = Object.freeze([
  { name: "short", below: 1.0 },
  { name: "mid", below: 1.5 },
  { name: "long", below: Infinity },
]);

export function reachBand(reach: number): string {
  return (REACH_BANDS.find((band) => reach < band.below) ?? REACH_BANDS[REACH_BANDS.length - 1]!).name;
}

/**
 * The class of the arm a body fights with, from what it publishes of itself: `sword/long`,
 * `paired-club/long`, `empty/short`. The hand is the primary unless it cannot attack and the
 * secondary can, which is the tournament's "primary unless capped" read in capabilities.
 */
export function armClass(self: BodyView): string {
  const caps = self.capabilities;
  const hand: HandName = caps !== undefined && !canAttack(caps.effectors.primary) && canAttack(caps.effectors.secondary)
    ? "secondary" : "primary";
  const paired = caps?.pairedHands === true;
  return `${paired ? "paired-" : ""}${self.hands[hand].weapon}/${reachBand(self.hands[hand].reach)}`;
}

/** The table of no champions: every class falls through to the defaults. */
export const NO_CHAMPIONS: ChampionTables = Object.freeze({
  version: CHAMPION_VERSION, seed: 0, date: "", league: [], general: null, classes: {},
});

/** Refuse a table by version, or by a row neither the fencer nor the planner has. */
export function checkChampions(tables: ChampionTables): ChampionTables {
  if (tables.version !== CHAMPION_VERSION) {
    throw new Error(`champion tables are version ${tables.version}; this build reads version ${CHAMPION_VERSION}`);
  }
  const entries = [tables.general, ...Object.values(tables.classes)].filter((e): e is ChampionEntry => e !== null);
  for (const entry of entries) {
    for (const row of Object.keys(entry.fencer)) {
      if (typeof (GOLEM_TACTICS_V2 as Record<string, unknown>)[row] !== "number") {
        throw new Error(`champion "${entry.class}" moves "${row}", which is not a numeric row of GOLEM_TACTICS_V2`);
      }
    }
    for (const row of Object.keys(entry.planner)) {
      if (row === "explore" || typeof (GOLEM_PLANNER as Record<string, unknown>)[row] !== "number") {
        throw new Error(`champion "${entry.class}" moves "${row}", which is not a row of GOLEM_PLANNER the tuner may move`);
      }
    }
  }
  return tables;
}

/** The entry a body of that class plays: its own row, else the general one, else null. */
export function championEntry(tables: ChampionTables, cls: string): ChampionEntry | null {
  return tables.classes[cls] ?? tables.general;
}

/** The two tables an entry stands for: the defaults with the entry's rows over them. */
export function championTactics(entry: ChampionEntry | null): { fencer: FencerTactics; planner: PlannerTactics } {
  return {
    fencer: { ...GOLEM_TACTICS_V2, ...(entry?.fencer ?? {}) },
    planner: { ...GOLEM_PLANNER, ...(entry?.planner ?? {}), explore: 0 },
  };
}

/** A planner over the fencer with an entry's numbers; the tuner's contenders are built here too. */
export function golemChampion(seed: number, entry: ChampionEntry | null, onAsk: AskHook | null = null): GolemPlanner {
  const { fencer, planner } = championTactics(entry);
  return golemPlanner(seed, undefined, planner, fencer, onAsk);
}

export interface GolemChampionMind {
  readonly name: "golem-champion";
  /** The fencer under the planner, once the first view has named the class; null before it. */
  readonly fencer: GolemFencer | null;
  readonly planner: GolemPlanner | null;
  /** The arm class read off the first view, and the entry chosen for it. */
  readonly armClass: string | null;
  readonly entry: ChampionEntry | null;
  decide(view: FighterView, dt: number): Intent;
}

/**
 * The champion mind: it reads its class off the first view it is handed, picks the entry, and
 * is the planner over that entry from then on. Built lazily because a policy's factory takes a
 * seed and nothing else, and the class is in the view.
 */
export function golemChampionMind(seed: number, tables: ChampionTables, onAsk: AskHook | null = null): GolemChampionMind {
  checkChampions(tables);
  let planner: GolemPlanner | null = null;
  let cls: string | null = null;
  let entry: ChampionEntry | null = null;
  return {
    name: "golem-champion",
    get fencer(): GolemFencer | null { return planner?.fencer ?? null; },
    get planner(): GolemPlanner | null { return planner; },
    get armClass(): string | null { return cls; },
    get entry(): ChampionEntry | null { return entry; },
    decide(view, dt): Intent {
      if (planner === null) {
        cls = armClass(view.self);
        entry = championEntry(tables, cls);
        planner = golemChampion(seed, entry, onAsk);
      }
      return planner.decide(view, dt);
    },
  };
}
