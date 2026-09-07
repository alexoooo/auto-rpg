# Session 02 -- the stroke bench: tip speed at the mark before any bout

**Status (2026-09-06): planned. Needs 01.**

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
- **The body's numbers do not move.** `CHAIN_REACH.anchorRate` in `../../src/golem/config.ts`
  is the chain's; if it is the ceiling on speed at the mark, that is reported, not moved.

## Implement

1. The stroke sequence generator, the crossing probe, the parry sequence and the two flags.
2. Tests in `../../tests/golem-bench.test.mjs`: the stroke sequence reproduces a fencer's
   commands for one shape to the digit (a fencer stepped on a fixture from
   `../../tests/fixtures/view.mjs` against the sequence's output); exactly one mark crossing per
   stroke; the parry arrival time is finite and under 0.5 s.
3. The grid, printed as a table into `../measurements.md` with the chosen committed shapes per
   weapon kind marked; the parry row beside it; and one row per weapon kind of its best speed
   at the mark and the peak anchor stray it cost, which is what Session 03 reads.
4. `../design.md`: a paragraph under the stroke-shapes section on where the mark sits in the arc.

## Human gate

The owner reads the table: does a stroke near 10 to 11 m/s at the mark exist inside the arm's
budget, and what does it cost in stroke time. Verdict into this file's status line.

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
