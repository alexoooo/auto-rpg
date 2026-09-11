# Session 01 -- the five gates nobody was asked

**Status (2026-09-11): planned. Needs nothing.**

## Outcome

The learn set recorded twelve human gates and asked none of them; five are still live and they are
asked here, in one sitting, with the commands that put each in front of the owner. The verdicts go
into `../measurements.md` with the date they were asked, and the two that bear on this set's
diagnosis -- the snapshot's command readout and a dozen viable matchups -- are asked with a
specific question attached rather than as an open look.

This session writes no code beyond what it takes to make each artifact appear. Everything it needs
landed in the learn set and every run it reads is still on disk.

## Frozen choices

- **All five in one sitting, before any new work** (owner, 2026-09-11). Folding a gate into a
  close-out is what left twelve of them unasked for a whole set; the instruction was to front-load
  them, and this file is that instruction executed.
- **Two gates carry a named question, the other three are an open look.** An open look is the
  right instrument when the question is "does this read at a glance". It is the wrong one when the
  record already has an arithmetic prediction to confirm or refute, and the third and fifth gates
  do. A gate whose question was invented after the owner answered is not a gate.
- **The owner's verdict is recorded whether or not it agrees with the arithmetic.** The repository
  has one expensive memory of what happens when a scalar goes green while the eye stays red, and
  the reverse -- an eye that says the strokes land while `(1-p)^6` says they cannot -- is the more
  interesting of the two outcomes and must not be quietly dropped.
- **No dev server is left running.** Two of the five need one on 5180; the session kills it by PID
  before it lands.

## Implement

1. **Gate one, the viable Random button** (learn set Session 01). `npm run dev`, the setup screen,
   a dozen presses of Random. The owner is asked whether a dozen presses now give a dozen fights
   that can end. The predicate behind it is `randomViableGolemSetup` in
   `../../src/golem/viability.ts`, and the measured claim it is being checked against is that the
   decided fraction over the viable pool exceeds 80 % where the whole pool ran 42.8 %.
2. **Gate two, the curve page** (Session 02). `curve.html` on the same server, loading
   league-anchored/league.jsonl -- the 93-iteration run that shipped the current mind -- with
   league-flat and league-pure overlaid, then league-long/league.jsonl beside them. The owner is
   asked whether the page shows the curve that shipped the current mind and reads at a glance,
   and whether the pool labels make the two arrangements impossible to confuse.
3. **Gate three, a snapshot playing, and the question this set turns on** (Session 03).
   `golem-snapshot` installed from league-long/pool-8.json, pool-40.json and pool-400.json in
   turn, on one viable matchup, with the HUD's command readout open. The owner is asked the
   learn set's original question -- can they say what changed between iteration 8 and 400 -- and
   then one more, stated here before the data:

   > **Does it finish the strokes it starts, and does that change across the three snapshots?**

   The readout already shows the gates, so this is a look and not a new instrument. The arithmetic
   it is checked against is in `signal-04-abort-gate.md`: at a drawn read the gate is redrawn every
   ask and a stroke spans six to seven of them, so `(1-p)^6` predicts roughly one stroke in eight
   surviving. The screen reads the gate **greedily**, so the owner is watching the read the bar
   measures and not the read the fit trained -- and that gap is itself part of what Session 04
   measures. The session says so when it asks, rather than letting the owner infer it.
4. **Gate four, the axis-probe table** (Session 07). The table is already in `../measurements.md`;
   the owner is asked which of its findings, if any, belong in the next phase. The three live
   candidates are the dead bottom third of `standOff` (0.4 and 0.6 of reach both settle at about
   1.17 m), `advance` saturating through `closeGain` at a gap error above 0.556 m, and
   `strokeOutOfRange`. This set acts on none of them and says why in
   `signal-04-abort-gate.md`'s closing table.
5. **Gate five, a dozen random viable matchups** (Session 11). `golem-policy` against a drawn
   viable opponent, a dozen times, through the setup screen. The owner is asked whether it fights.
   The record's prediction, stated before the data: it is 13th of 14 on this pool and 1st of 14
   mirrored, it holds 6.27 s of near-range stall and 9.16 s outside reach a bout against
   `golem-driver`'s 2.15 and 0.22, and it wins the mirror by clinching.
6. Every verdict into `../measurements.md` as one entry, under the date asked, with the command
   that produced each artifact beside it and the arithmetic prediction each was checked against.
   The gate table in `signal-00-overview.md` is updated in the same commit.

## Human gate

This session **is** the gate; all five of the learn set's live ones, plus the stroke-completion
question on the third. There is no mechanical bar and none is invented: a session whose whole
purpose is to ask the owner does not get to pass itself.

If the owner's answer on gate three is that the strokes visibly land, that is recorded as it
stands and `signal-04-abort-gate.md` is read against it rather than over it -- the greedy read
never aborts, so "the strokes land on screen" and "the fit trained a policy that completes one in
eight" are both able to be true, and the record should carry both.

## Verification

```powershell
npm run check
npm test
npm run build
git diff --check -- .
netstat -ano | findstr ":5180"
```

The last line must print nothing once the sitting is over; if it prints a row, the PID it names is
killed before the session lands.

## What remains

Seven of the learn set's twelve gates were mechanical bars with no question for the owner, and
they stay closed as they were recorded. Nothing in this session changes a default, a weight or a
number; it changes the record's account of what the owner has actually seen.
