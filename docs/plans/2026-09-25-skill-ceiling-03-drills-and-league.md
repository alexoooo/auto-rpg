# Session 03: drills, the naive ladder, and the league protocol

## Goal

Replace "one scalar per 30 s bout" as the main ruler. Short drills are dense, low-variance and
diagnostic. The full bout stays as the final exam, under a protocol that stops it lying.

## Drills

A drill is a start state, a horizon of 1 to 3 s, and a success criterion. The start state is built
with session 02's restore: bodies placed, posed and moving as the drill says. So a drill costs
seconds of simulation, not a whole bout, and can be run thousands of times.

The first suite. Each drill is parametrised by bodies and attributes, and seeded:

| drill | start | success |
|---|---|---|
| survive the cut | their committed cut arriving, at several ranges and lines | no wound over a threshold within 1 s |
| land a clean blow | opponent at striking range, guarding a stated line | a scored blow with edge lead over 0.8 within 1.5 s |
| get inside | a longer-armed opponent holding its stand-off | reach striking range without taking a wound, within 3 s |
| hold the range | a closing opponent | keep the gap inside a band for 3 s |
| punish the miss | their heavy stroke has just missed | a scored blow within 1 s |
| finish | the opponent is down | damage landed before it rises |
| recover | shoved to the edge of the fall line | still standing after 2 s, or up again fastest |
| off-balance | the opponent mid-step, or committed on one foot | down it within 1 s |
| hold under orders | a destination ordered, an opponent attacking | reach it while taking less than a threshold |

`hold under orders` waits on session 06's orders and is added there.

Every drill reports its pass rate, and a margin where it has one (time to success, wound taken, edge
lead). Its variance is measured, and the number of runs for a stated precision is recorded beside
it.

A drill is also where a competency lives, which is what the mind-schools analysis calls knowledge:
"can parry a committed cut" means passes `survive the cut`.

## The naive ladder

- `idle`, as today.
- **walker**, new: faces the opponent, walks straight in, and swings its primary on a fixed clock
  whenever it is in reach. No reading, no guard, no footwork. It is written against the new surface
  in session 06; until then it is an `Intent` mind.
- `golem-duelist`, frozen at this commit. It is the strongest hand-written base (every admitted
  researched mind wraps it) and the default today.

The ladder is what "naive" means everywhere in this set.

## The league protocol

Any full-bout comparison from here on:

- Bouts start from body release 1's built-at-guard opening.
- Scores are split by side, and every mind's own mirror is inside its band (session 01's gate).
- **Asymmetric pairs.** Bodies differ between corners. On identical bodies four of seven weapon
  classes decided nothing, and the mirrored pool is what training, the league and the idle probe all
  read.
- **Structural guard columns**, never optimised, always printed:
  - near-range stall seconds and retreat-outside-reach seconds (`src/engagement.ts`);
  - changes of lead;
  - the winner's remaining bar;
  - decided before the cap;
  - falls a bout.
- The paired criterion (Cohen's d per corner-swapped pair) and the stated n. At 128 bouts a cell
  the band is about ±9 points, so n is at least 384 for any claim of a difference.
- Reports are always by weapon class. A pooled total is mostly a maul statistic.

This goes in `research/` as the one protocol `research/runner.mjs` runs. The older tournament
scripts that read the mirrored pool are retired in session 09.

## Measure

- Every drill run 1,000 times with the duelist against the duelist. Report pass rate, variance, and
  runs needed for ±2 points.
- The same drills with `idle` and walker. The ladder must be ordered on most drills. A drill where
  idle passes as often as the duelist does is measuring nothing, and is fixed or removed.
- Mutation check. Break the duelist's guard; `survive the cut` must fall.

## Depends on

Session 02, for start states.
