/**
 * **How the scorecard reads a bout**: at each decision of each side's mind that reports its offers
 * (`Engagement.offers`), what the chosen offer was priced to deal and take against what the bout gave
 * (`pricesOf`); the strikes each side began, and its falls; how long the two stood out of each other's
 * reach, and when each blow that took life landed.
 */
import { SIDES } from "../../game/arena/duel.ts";
import { hypot } from "../../core/math/real.ts";
import { ARRIVED } from "../../skills/framework/movement.ts";
import { dataOf } from "../../core/data/store.ts";
import { lifeTaken } from "../../combat/blows.ts";
import { measuredReach } from "../../minds/option/predictions/exchange/model.ts";
import { readBout, type BoutReading } from "../contest.ts";
import type { BuiltBout } from "../bout.ts";
import type { Reader } from "../evaluation.ts";

/** The range slices are this wide, m head to head. */
const BAND = .25;

/** A silence is this long with no strike begun by either side, s. */
export const QUIET = 3;

/**
 * Priced against given, summed over choices (`pricesOf`): how many, and the life (a share of a full
 * life) each was priced to take against what the body lost; and of those priced to deal
 * (`dealing`), what they were priced to deal against what the foe lost. A choice priced to deal
 * nothing is not read for it: the life dealt while it held is the earlier choices'.
 */
export type Prices = { n: number; taken: number; lost: number; dealing: number; dealt: number; given: number };

/**
 * What one side's choices came to, by slice, each read as `pricesOf` reads it: `all`; by what the chosen offer was priced to do
 * (`strike` where it deals, else `move` where it leaves the range further than `ARRIVED` from where
 * it was, as the chooser tells a staying run, else `stay`); by what its mind read the foe doing (`foe <label>`, `Engagement.foe`); and by
 * the range head to head it decided at, in bands `BAND` wide (`range <from>`).
 */
export type SideReading = {
  readonly decisions: number;
  readonly prices: Readonly<Record<string, Prices>>;
  /** When each strike it began and committed began, s. */
  readonly strikes: readonly number[];
  readonly downs: number;
};

/**
 * A bout as the scorecard reads it: the contest's reading (`BoutReading`), each side's own
 * (`SideReading`), and when either body was down, each stretch from the step one went down to the
 * step both stood again, s (`grounded`); the seconds with both bodies standing farther apart than
 * either's strikes reach the other (`outOfReach`, `apartReach`); and when each blow that took
 * life landed, s on the bout's clock (`landed`).
 */
export type ScorecardReading = BoutReading & {
  readonly sides: readonly [SideReading, SideReading];
  readonly grounded: readonly (readonly [number, number])[];
  readonly outOfReach: number;
  readonly landed: readonly number[];
};

/**
 * **How far either of a bout's bodies reaches the other**, m centre to centre: the farther of the
 * two, each the farthest any strike measured on its body reads against the other's standing clear
 * (`measuredReach`, as a Mind reads a foe's reach).
 */
function apartReach(duel: BuiltBout["duel"]): number {
  const [a, b] = SIDES.map((side) => duel.duelists[side].built.spec);
  return Math.max(measuredReach(dataOf("strike-profiles"), a!, b!, "clear"), measuredReach(dataOf("strike-profiles"), b!, a!, "clear"));
}

/**
 * **The longest stretch of a bout `seconds` long with no blow taking life**, s: between its start,
 * each blow `landed` that took life, and its end.
 */
export function longestUnlanded({ landed, seconds }: { readonly landed: readonly number[]; readonly seconds: number }): number {
  const marks = [0, ...[...landed].sort((a, b) => a - b), seconds];
  let longest = 0;
  for (let i = 1; i < marks.length; i++) longest = Math.max(longest, marks[i]! - marks[i - 1]!);
  return longest;
}

/** A decision: when, the Option it chose (`name`), whether that Option is held (`OfferTerms.open`), its priced terms, and the slices it is read in. */
export type Decision = { readonly t: number; readonly name: string; readonly open: boolean; readonly duration: number; readonly dealt: number; readonly taken: number; readonly slices: readonly string[] };

/**
 * **Priced against given**, one side's `decisions` in time order, its life and its foe's at a time
 * (`lifeAt(0 | 1, t)`, its own 0), the bout ending at `end`, its last bars held past it where
 * `carried`. A run of decisions choosing one Option is one choice, and it holds until another is
 * chosen, at most its priced duration.
 * - What it was priced to take, the others' pressure on the body, against the life the body lost
 *   over the window it was priced for, whatever the body chose in it: a run's whole duration (a
 *   strike's, a walk's, whose danger may come at its end); a held Option's (`open`), priced as
 *   held to the horizon, over the span it was held, its price for that share of its duration.
 * - What it was priced to deal, its own blows, whole, against the life the foe lost over the span
 *   it held: a later choice's blows are that choice's.
 * A choice whose window runs past a bout cut by the clock is not read.
 */
export function pricesOf(decisions: readonly Decision[], lifeAt: (side: 0 | 1, t: number) => number, end: number, carried: boolean): Record<string, Prices> {
  const prices: Record<string, Prices> = {};
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i]!;
    let next = i + 1;
    while (next < decisions.length && decisions[next]!.name === d.name) next++;
    i = next - 1;
    const held = Math.min(d.duration, (next < decisions.length ? decisions[next]!.t : end) - d.t);
    const window = d.open ? held : d.duration, taken = d.open && d.duration > 0 ? d.taken * held / d.duration : d.taken;
    if (d.t + window >= end && !carried) continue;
    const lost = lifeAt(0, d.t) - lifeAt(0, d.t + window), given = lifeAt(1, d.t) - lifeAt(1, d.t + held);
    for (const slice of d.slices) {
      const p = prices[slice] ??= { n: 0, taken: 0, lost: 0, dealing: 0, dealt: 0, given: 0 };
      p.n++; p.taken += taken; p.lost += lost;
      if (d.dealt > 0) { p.dealing++; p.dealt += d.dealt; p.given += given; }
    }
  }
  return prices;
}

/** A bout's scorecard reader: the contest's, with each side's decisions read as they are made and priced at the end. */
export function readScorecard(built: BuiltBout): Reader<ScorecardReading> {
  const { duel } = built, contest = readBout(built);
  const times: number[] = [], lives: [number[], number[]] = [[], []];
  const decisions: [Decision[], Decision[]] = [[], []], strikes: [number[], number[]] = [[], []], downs = [0, 0], wasDown = [false, false];
  const offered: unknown[] = [null, null], sequence = [0, 0], grounded: [number, number][] = [], landed: number[] = [];
  let groundedSince: number | null = null, reach: number | null = null, outOfReach = 0, blowsRead = 0, last = 0;
  return {
    afterStep() {
      contest.afterStep();
      const step = duel.clock - last;
      last = duel.clock;
      times.push(duel.clock);
      for (; blowsRead < duel.blows.length; blowsRead++) {
        const blow = duel.blows[blowsRead]!;
        // A blow lands on the world's clock; the bout's runs from its start.
        if (blow.sides.some((side) => lifeTaken(side) > 0)) landed.push(blow.time - built.world.time + duel.clock);
      }
      if (SIDES.every((side) => !duel.duelists[side].body.down)) {
        const a = duel.duelists.left.body.physical.centre, b = duel.duelists.right.body.physical.centre;
        if (hypot(a.x - b.x, a.z - b.z) > (reach ??= apartReach(duel))) outOfReach += step;
      }
      SIDES.forEach((side, s) => {
        const me = duel.duelists[side], foe = duel.duelists[SIDES[1 - s]!];
        lives[s]!.push(duel.life(side));
        const down = me.body.down;
        if (down && !wasDown[s]) downs[s]!++;
        wasDown[s] = down;
        for (const record of me.minded.skills?.report.ledger ?? []) if (record.sequence > sequence[s]!) {
          sequence[s] = record.sequence;
          if (record.committed) strikes[s]!.push(record.began);
        }
        const engagement = me.minded.report?.engagement, offers = engagement?.offers;
        if (!engagement || !offers || offers === offered[s]) return;
        offered[s] = offers;
        const terms = offers.find((offer) => offer.name === engagement.phase)?.terms;
        if (!terms) return;
        const a = me.body.physical.head, b = foe.body.physical.head, range = hypot(a.x - b.x, a.z - b.z);
        const kind = terms.dealt > 0 ? "strike" : Math.abs(terms.exit.range - range) > ARRIVED ? "move" : "stay";
        decisions[s]!.push({ t: duel.clock, name: engagement.phase, open: terms.open, duration: terms.duration, dealt: terms.dealt, taken: terms.taken, slices: ["all", kind, ...engagement.foe ? [`foe ${engagement.foe}`] : [], `range ${(Math.floor(range / BAND) * BAND).toFixed(2)}`] });
      });
      const either = SIDES.some((side) => duel.duelists[side].body.down);
      if (either && groundedSince === null) groundedSince = duel.clock;
      else if (!either && groundedSince !== null) { grounded.push([groundedSince, duel.clock]); groundedSince = null; }
    },
    get ended() { return contest.ended; },
    reading() {
      const read = contest.reading(), end = duel.clock;
      // Past a bout ended by a body's life, its last bars hold; one ended otherwise is cut there.
      const carried = read.bars.some((bar) => bar <= 0);
      const lifeAt = (s: number, t: number): number => {
        let lo = 0, hi = times.length - 1;
        if (hi < 0 || t < times[0]!) return 1;
        while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (times[mid]! <= t + 1e-9) lo = mid; else hi = mid - 1; }
        return lives[s]![lo]!;
      };
      const sides = SIDES.map((_, s): SideReading => {
        const prices = pricesOf(decisions[s]!, (side, t) => lifeAt(side === 0 ? s : 1 - s, t), end, carried);
        return { decisions: decisions[s]!.length, prices, strikes: strikes[s]!, downs: downs[s]! };
      }) as unknown as readonly [SideReading, SideReading];
      return { ...read, sides, grounded: groundedSince === null ? grounded : [...grounded, [groundedSince, end] as [number, number]], outOfReach, landed };
    },
  };
}

/**
 * Of a bout `seconds` long, the seconds after its first strike begun (`fought`), how many of them
 * passed in gaps over `QUIET` s with no strike begun by either side (`silent`), and of those how
 * many with both bodies standing, outside the stretches either was `grounded` (`standing`); null
 * where no strike began. `strikes` is when each side's began, s, in any order.
 */
export function silenceOf({ strikes, seconds, grounded }: { readonly strikes: readonly number[]; readonly seconds: number; readonly grounded: readonly (readonly [number, number])[] }):
  { readonly silent: number; readonly standing: number; readonly fought: number } | null {
  const times = [...strikes].sort((a, b) => a - b);
  if (!times.length) return null;
  const marks = [...times, seconds];
  let silent = 0, down = 0;
  for (let i = 1; i < marks.length; i++) {
    const from = marks[i - 1]!, to = marks[i]!;
    if (to - from <= QUIET) continue;
    silent += to - from;
    for (const [a, b] of grounded) down += Math.max(0, Math.min(b, to) - Math.max(a, from));
  }
  return { silent, standing: silent - down, fought: seconds - times[0]! };
}

/** A scorecard reading's silence (`silenceOf`), both sides' strikes. */
export const readingSilence = (reading: ScorecardReading) =>
  silenceOf({ strikes: [...reading.sides[0].strikes, ...reading.sides[1].strikes], seconds: reading.seconds, grounded: reading.grounded });
