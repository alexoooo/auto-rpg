/**
 * **How the scorecard reads a bout**: at each decision of each side's mind that reports its offers
 * (`Engagement.offers`), what the chosen offer was priced to deal and take over its seconds against
 * what the bout gave over them; the strikes each side began, and its falls.
 */
import { SIDES } from "../../game/arena/duel.ts";
import { hypot } from "../../core/math/real.ts";
import { ARRIVED } from "../../skills/framework/movement.ts";
import { readBout, type BoutReading } from "../contest.ts";
import type { BuiltBout } from "../bout.ts";
import type { Reader } from "../evaluation.ts";

/** The range slices are this wide, m head to head. */
const BAND = .25;

/** A silence is this long with no strike begun by either side, s. */
export const QUIET = 3;

/**
 * Priced against given, summed over decisions: how many, and the life (a share of a full life)
 * the chosen offer was priced to take over its seconds against what the body lost over them; and
 * of those priced to deal (`dealing`), what they were priced to deal against what the foe lost
 * over them. An offer priced to deal nothing is not read for it: the life dealt in its seconds is
 * the later decisions'.
 */
export type Prices = { n: number; taken: number; lost: number; dealing: number; dealt: number; given: number };

/**
 * What one side's decisions came to, by slice: `all`; by what the chosen offer was priced to do
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
 * step both stood again, s (`grounded`).
 */
export type ScorecardReading = BoutReading & {
  readonly sides: readonly [SideReading, SideReading];
  readonly grounded: readonly (readonly [number, number])[];
};

type Decision = { readonly t: number; readonly duration: number; readonly dealt: number; readonly taken: number; readonly slices: readonly string[] };

/** A bout's scorecard reader: the contest's, with each side's decisions read as they are made and priced at the end. */
export function readScorecard(built: BuiltBout): Reader<ScorecardReading> {
  const { duel } = built, contest = readBout(built);
  const times: number[] = [], lives: [number[], number[]] = [[], []];
  const decisions: [Decision[], Decision[]] = [[], []], strikes: [number[], number[]] = [[], []], downs = [0, 0], wasDown = [false, false];
  const offered: unknown[] = [null, null], sequence = [0, 0], grounded: [number, number][] = [];
  let groundedSince: number | null = null;
  return {
    afterStep() {
      contest.afterStep();
      times.push(duel.clock);
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
        decisions[s]!.push({ t: duel.clock, duration: terms.duration, dealt: terms.dealt, taken: terms.taken, slices: ["all", kind, ...engagement.foe ? [`foe ${engagement.foe}`] : [], `range ${(Math.floor(range / BAND) * BAND).toFixed(2)}`] });
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
        const prices: Record<string, Prices> = {};
        for (const d of decisions[s]!) {
          const until = d.t + d.duration;
          if (until > end && !carried) continue;
          const given = lifeAt(1 - s, d.t) - lifeAt(1 - s, until), lost = lifeAt(s, d.t) - lifeAt(s, until);
          for (const slice of d.slices) {
            const p = prices[slice] ??= { n: 0, taken: 0, lost: 0, dealing: 0, dealt: 0, given: 0 };
            p.n++; p.taken += d.taken; p.lost += lost;
            if (d.dealt > 0) { p.dealing++; p.dealt += d.dealt; p.given += given; }
          }
        }
        return { decisions: decisions[s]!.length, prices, strikes: strikes[s]!, downs: downs[s]! };
      }) as unknown as readonly [SideReading, SideReading];
      return { ...read, sides, grounded: groundedSince === null ? grounded : [...grounded, [groundedSince, end] as [number, number]] };
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
