# Session 02 -- the stroke bench: tip speed at the mark before any bout

**Status (2026-09-06): implemented; the human gate is open.**

## Outcome

A bench measurement of the tip's speed as it crosses the mark, as a function of the stroke's
shape, taken by driving the bench module through exactly the commands the mind's stroke emits;
committed stroke shapes chosen from it for Session 04; the speed at the mark of every weapon kind,
which Session 03 turns into energy; and the plate's arrival time over a parry distance, which
decides whether the guardian's parry is an intercept or a wall.

## Frozen choices

- **The bench runs the mind's stroke, not a hand-written cursor path.** `../../scripts/golem-bench.mjs`
  gains a stroke sequence generator that emits, frame by frame, what the fencer's stroke drive
  emits, computed from `STROKE_SHAPES`, `writeAim`, `aimAt` and `reachForDistance` in
  `../../src/golem/tactics.ts` against the bench module's own envelope, for a mark placed at a
  chosen distance and height from the stand's socket: guard, chamber, stroke, follow, recover.
  A bench number is then a claim about the mind's stroke.
- **The probe reads the mark-plane crossing.** The step where the tip's swing angle about the
  socket passes the mark's bearing; report the speed at the mark, the tip's distance from the
  mark there, the peak driven tip speed and the peak anchor stray. Flags `--stroke` and
  `--sweep stroke`.

  *Corrected 2026-09-06, in two places, both in the code beside the reading. The crossing and the
  closest approach are not the same instant -- on a blade the bearing is crossed at 0.82 s and the
  weapon is nearest the mark at 0.89 s, after the arc has finished, because the arm is still
  extending when the azimuth has stopped -- and for a maul there is no crossing to read at all,
  since `canSwing` is false and the commanded arc never sweeps. And the tip is the wrong point:
  `reachForDistance` is called with `strikeBite`, which deliberately puts the mark a third of the
  way down the blade, so a tip-to-mark distance is meant to be large. The probe reports the closest
  approach of the whole anchor-to-tip segment (`missMetres`), how far back from the point it fell
  (`alongMetres`), the speed of the point that is actually at the mark, whether the arc swept at
  all (`sweeps`), and the frozen crossing count beside them.*
- **The grid** on the wrist blade, then the mace, the maul, the fist and the plate bash, each with
  its own mass on the bench module: chamber swing {0.05, 0.4, 0.8,
  1.2} × stroke seconds {0.11, 0.15, 0.20, 0.28} × chamber reach {-0.70, -0.20} × chamber
  seconds {0.22, 0.32}. The prediction to check: speed at the mark rises with the arc until the
  anchor stray runs away, and the best stroke time lengthens with the arc. Step-in and lean are
  not on the bench, which has no carrier; they are swept in Session 04 through the contact-speed
  column.
- **The parry sequence** for the plate: the cover pose, then a one-frame command 0.25 m across
  and 0.10 m up, then hold; read the time to arrive within 50 mm, the peak plate speed and the
  overshoot. Arrival inside about 0.10 s makes the guardian's parry a true intercept; slower
  makes it a wall pre-positioned from the chamber read, and Session 06 records which.

  *Corrected 2026-09-06, twice. The command is an **angle**, `across / coverRadius` on the swing
  axis, because a mind cannot ask a cover to go a quarter of a metre sideways; moving the mark by
  0.25 m instead asks 0.15 rad at a mark 1.6 m away and moves a plate held at 0.4 m by 63 mm,
  which was measured being a parry before the correction. And the arrival is read against where
  the cover **ends up**, not against `commandedTip`: a plate on a static cover command rests
  0.119 m short of it and stays there, so a 50 mm arrival against the command never happens,
  however long the hold. The hold therefore runs two seconds, and `settleRippleMm` reports the
  wobble left at the end so an arrival read off a cover that had not stopped is visible.*
- **The body's numbers do not move.** `CHAIN_REACH.anchorRate` in `../../src/golem/config.ts`
  is the chain's; if it is the ceiling on speed at the mark, that is reported, not moved.

## Implement

1. The stroke sequence generator, the crossing probe, the parry sequence and the two flags.
2. Tests in `../../tests/golem-bench.test.mjs`: the stroke sequence reproduces a fencer's
   commands for one shape to the digit (a fencer stepped on a fixture from
   `../../tests/fixtures/view.mjs` against the sequence's output); exactly one mark crossing per
   stroke; the parry arrival time is finite and under 0.5 s.

   *Two departures, 2026-09-06. The fidelity test is in `../../tests/golem-mind.test.mjs` and not
   in the bench's file, because `standAGolem`, `fixtureOf`, `place`, `theirArm` and `drive` all
   live there and a second copy of them would be a second claim about what a body publishes. It
   runs over a blade **and a whip**, because the whip is the only kind whose `windRoll` differs
   from its `roll` and the mutation that writes one for the other is green on a blade alone. And
   the arrival is not under 0.5 s: the fastest cover on the bench is 0.59 s and the plate's is
   0.89, so the test asserts finite, settled, and **over** 0.10 s, which is the gate the guardian
   actually branches on.*
3. The grid, printed as a table into `../measurements.md` with the chosen committed shapes per
   weapon kind marked; the parry row beside it; and one row per weapon kind of its best speed
   at the mark and the peak anchor stray it cost, which is what Session 03 reads.
4. `../design.md`: a paragraph under the stroke-shapes section on where the mark sits in the arc.

## Human gate

The owner reads the table: does a stroke near 10 to 11 m/s at the mark exist inside the arm's
budget, and what does it cost in stroke time. Verdict into this file's status line.

Measured, and the question turned out to be the wrong way round. **Speed was never the binding
constraint and the shipped shapes never reach the mark at all.** A wrist blade on its shipped cut
peaks at 19.9 m/s -- nearly twice `combat.referenceSpeed` -- and comes no closer than 0.63 m to
what it was swung at; a mace misses by 0.73 m, a maul by 1.29. Across the whole 320-cell grid the
blade's speed at the mark is flat at 25 to 28 m/s at every arc width, and what the arc buys is the
*miss*, which falls sixfold. The chosen cut is `chamberSwing` 1.20, `strokeSeconds` 0.20,
`chamberReach` -0.20, `chamberSeconds` 0.32: **0.070 m at 22.3 m/s**, costing 0.05 s of stroke
time over the shipped 0.15 and 0.10 s of extra wind-up. The plate bash lands at 0.014 m and
11.1 m/s and the fist at 0.031 m and 12.5. No club shape lands at any cell.

The parry answers its own question: no. The fastest cover on the bench is a blade at 0.59 s and
the plate at 0.89 s over 0.40 m. Session 05's guardian gets a wall.

## Verification

```powershell
npm run check
node --test tests/golem-bench.test.mjs
node scripts/golem-bench.mjs --stroke --sweep stroke
npm test
npm run build
git diff --check -- .
```

## What remains

The maul and the whip keep their shapes from the matchup set; their rows on this bench are taken
but no committed shape is chosen for them until a style wants one.

*Three things this session found and did not fix, 2026-09-06.*

*The **club cannot be driven by the chain it is on**. No cell of the grid brings a mace within
0.47 m of its mark or a maul within 0.94 m, and the mace's peak anchor stray runs from 268 to
864 mm across the grid -- at the two widest arcs its speed at the mark collapses to 5.0 m/s and
the arc simply does not happen. That is `CHAIN_REACH.anchorRate` against the mass on the end, and
the frozen choice above says it is reported and not moved. Both club bodies go into Session 03 as
their own class.*

*The **maul's strike range is outside its own arm**. `tacticalRanges` puts its mark 1.92 m out on
a published reach of 1.77, because its inner radius is large enough that `hold + slack` clears the
reach fraction; so a maul opens exchanges from a range at which full extension is 0.15 m short
before the arc is considered. Session 03 owns the ranges.*

*The bench has **no carrier and no body radius**: `stepIn` and `trunkLean` do nothing on a stand
that holds the socket still, and a miss measured to a point is not a hit rate against a torso
0.22 m wide. The miss column is a ranking. Session 03 takes the same shapes through `scoringSpeed`
in a real bout, which is where the feet and the body finally appear.*
