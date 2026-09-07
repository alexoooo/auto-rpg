# Session 04 -- the third executor, and `golem-form`

**Status (2026-09-07): implemented; the human gate is open.** The executor, the style, the
fifteen tests and the seventeen sweep rows are in the Session 04 entry of `../measurements.md`.
Two of the plan's own checks came back negative and are recorded rather than worked around: the
control row is 0.033 bar behind the fencer where frozen choice 4 said it must sit inside noise of
it, and no constant of the style's own moves the bar outside two standard errors. The measured
reason is in the entry -- the arm reaches 17.4 m/s driven and the blow that scores lands at 4.9,
because 231 blocked contacts a bout swamp one cut every second and a half -- and it is a
contact-rules question rather than an executor one.

## Outcome

A third executor, src/golem/tactics-v3.ts, that offers a director fifteen options including a
committed cut, a thrust, an intercept parry, a shove, a duck, a purposeful circle, a void off
the line of their point and a retreat that ends when the range opens; that asks its director on events as well as
on a cadence; and that has no reflexes of its own. The first style over it, `golem-form`: few
committed cuts, a parry on their commit, a circle with intent.

## Frozen choices

- **A new file, not an edit of v2.** `../../src/golem/tactics-v2.ts` is frozen under the four
  minds built on it (overview, frozen choice 2). The new file imports `writeAim`, `aimAt`,
  `reachForDistance`, `watch`, `STROKE_SHAPES`, the capability predicates and `GOLEM_TACTICS`
  from `../../src/golem/tactics.ts`, and `strokeReader`, `slotHealth`, `TargetSlot` and
  `GOLEM_TACTICS_V2` (as the base of its own table) from `tactics-v2.ts`; the machine is written
  out again. The executor, `golemStyled(seed, table, director)`, refuses a null director. Every
  v2 reflex -- the void, the stop-hit, the counter, patience, close-on-recover, the feint and ram
  rolls -- becomes a director's rule and is not in the executor.
- **The options.** `hold`, `close`, `withdraw`, `circle`, `void`, `retreat`, `strike`, `cut`,
  `feint`, `wait`, `parry`, `shove`, `thrust`, `duck`, `ram`. A director is `(available, reading, view) => option`;
  a hook of the same shape records asks. The reading extends v2's `DuelReading` with the near
  and hold ranges, their reach, whether I am latched inside, my cooldown, seconds since their
  last exchange, the vitality lead, the weakest reachable slot, the intercept (time and
  distance, or null), whether I am the longer or the shorter arm, whether I am head-first or
  paired, and whether my spare hand can cover.
- **Asks on events as well as on the cadence.** The director is asked every `replanSeconds`
  between exchanges, and at once when their read phase changes, when my exchange ends, and when
  a parry releases. With `chamberAbort` on and their phase just turned to commit, the director
  is asked mid-chamber with only the exchange in progress, `parry` and `retreat` open; choosing
  either abandons the chamber at half cooldown. Commit, recover, ram and shove run to their end.
- **How each option is executed, through `writeAim` alone.**
  - `circle`: strafe at `circleStrafe` toward their **spare** side (their armed hand's
    `outboard` and their `facing` give the world side; converted to my frame) for
    `circleSeconds`; the walk axis keeps the hold as now.
  - `void`: back at `voidStep`, strafe off the line of their tip velocity (the floor normal to
    the velocity, signed by which side my socket is on). This reads `tipVelocity`, which nothing
    in the tree reads today.
  - `retreat`: back at full, `withdrawLean`, the void's strafe rule, until the gap exceeds their
    reach plus slack or `retreatSeconds`; the guard held.
  - `strike`: v2's quick exchange with `STROKE_SHAPES`; open at the strike range.
  - `cut`: the same stroke drive with the committed shape of the weapon kind from Session 02,
    walking forward through chamber and commit, trunk lean at `cutLean`; open at the strike
    range plus `cutReachMetres`, which the step-in buys. The mark and the strike reach are
    recomputed every step already, so a step-in stroke corrects its own reach.
  - `parry`, on the spare hand while the acting hand keeps its stance: the intercept of their
    tip's velocity line with my guard shell of radius r, r being the cover distance of the spare
    hand. Solve |p + v·t − S|² = r² for the smallest positive root with the point closing; with
    no root, the closest-approach point q, parried only if it passes inside r plus
    `parryMargin`; an intercept later than `parryHorizon` keeps the cover at q's bearing. The
    command is `aimAt` and `writeAim` with `reachForDistance` at `parryBite`, recomputed every
    step while their phase is chamber or commit, released `readRecoverSeconds` after. Not
    offered to a paired grip or a lost spare. Session 02's arrival time decides intercept or
    wall; Session 06 records which.
  - `shove`: forward at full, trunk lean at `shoveLean`, both hands (`mirror` for a pair) at
    their trunk mark fully extended for `shoveSeconds`, then recover; open at the inner radius
    plus 0.15 of my reach. The plate and the fist score the impulse row; a blade scores a thrust.
  - `thrust`: a point stroke along the reach axis rather than a cut. The chamber draws the reach
    in, the commit extends it to full with the point on the mark at their vital height (the view
    publishes `vitalHeight`), swing and lift offsets near zero, a step-in of `thrustStepIn`;
    a blade scores the thrust row near its tip, a fist its punch. Offered when the weapon has a
    point (`hasPoint` in `../../src/hands.ts`) or is empty; open at the strike range. Its
    shape row per weapon kind sits beside the committed shapes.
  - `duck`: crouch to `duckDepth` for `duckSeconds` with both hands covering and no walk, then
    release. Crouch is derived from the aim today and never chosen, so this is the first use of
    a posture axis as a decision. Offered while their phase is chamber or commit and their tip is
    above my shoulder; it is the void of a body that cannot parry, head-first bodies included.
  - `ram`, `feint`, `wait`, `hold`, `close`, `withdraw`: as v2. Head-first bodies keep v2's ram
    ranges, and `cut`, `strike`, `thrust`, `parry` and `shove` are never offered to them;
    `duck` is, and is their only void that is not a step.
- **The table**, the same widened shape as v2's so `--override` and later the tuner can move it:
  `idleStrafe` 0 (v2's 0.55 is the control value), `circleStrafe` 0.6, `circleSeconds` 0.9,
  `retreatSeconds` 1.2, `cutReachMetres` 0.30, `cutLean` 0.6, `parryHorizon` 0.35,
  `parryMargin` 0.15, `parryBite` 0.5, `chamberAbort` false, `shoveSeconds` 0.35, `shoveLean`
  0.7, `thrustSeconds` 0.12, `thrustStepIn` 0.4, `duckDepth` 1.0, `duckSeconds` 0.35,
  `eventAsks` true, the committed shapes per weapon kind from Session 02 and the thrust shapes. The worker's
  override block sends bare names to the new table after v2's and the planner's; a `form.`
  prefix goes to the style's own table.
- **Styles live one per file** under a new src/golem/styles/ directory, each exporting its
  table and a director factory taking a seed and the table, registered exactly as
  `golem-neural` is: `../../src/golem/golem-policies.ts`, `POLICIES` in `../../src/mind.ts`,
  `GOLEM_POLICIES` in `../../src/units.ts`, and the name lists in
  `../../tests/golem-mind.test.mjs`, `../../tests/units.test.mjs` and
  `../../tests/minds.test.mjs`; the policy-count sentences in `../../README.md`.

## The first style: `golem-form`

Stand-off 1.06 of their reach. Between exchanges, `circle` at a seeded 40 % duty, else `hold`.
Their commit inside their reach: `parry` if the spare can cover, else `void`. Their recover with
`cut` open: `cut` (the counter). Patience 2.2 s: `cut`, or `thrust` when the weakest reachable
slot is the head. `feint` on 0.15 of chambers. Never
`strike`. `chamberAbort` on. Expected signature: about 0.4 strokes a second, damage a stroke at
or above 4, committed fraction at or above 0.7, catches above zero, idle travel low.

## Implement

1. The executor file, the options and the reading, the event asks, the table.
2. The style file, the registration, the override prefix.
3. Tests in `../../tests/golem-mind.test.mjs` on synthetic views with `publishedFixture` from
   `../../tests/fixtures/view.mjs` and the file's own helpers, plus a new helper that gives the
   fixture's opponent a tip velocity and advances the tip along it each step:
   - `circle` strafes toward their spare side and flips when the opponent hand's `outboard` flips;
   - `void` steps off the line of a tip coming from my left (strafe right) and from my right;
   - `parry`: a tip at 1.2 m closing at 6 m/s along a line 0.2 m off my spare socket puts the
     spare hand's command within `parryMargin` of the analytic intercept, inside the envelope; a
     line that misses by 0.5 m leaves the cover pose unchanged;
   - `cut` opens at the strike range plus `cutReachMetres` and not 0.1 m further, walks forward
     and leans through chamber and commit, and its swing offset crosses zero near the middle of
     the arc;
   - `shove` extends both hands fully at the trunk mark for `shoveSeconds` and then recovers;
     on a paired body both channels are equal;
   - `thrust` drives the reach from the chamber's draw to full extension with the swing offset
     near zero and the mark at their vital height, and is not offered to a whip or a plate; a
     real short bout under a director that only thrusts books at least one report of kind
     `thrust`;
   - `duck` writes the crouch to `duckDepth` for `duckSeconds` and then releases it to the
     derived value; it is offered to a head-first body on their commit and not on their idle;
   - the director is asked on the step their phase turns to commit, not `replanSeconds` later;
   - with `chamberAbort` on a chamber becomes a parry on their commit; off, the chamber runs;
   - every command over a whole synthetic bout sits inside the envelope (the file's place sweep),
     deterministic under a seed;
   - one real 14 s bout on a fresh Havok, `golem-form` against `golem-fencer` on the default
     build: runs, lands, no throw.
4. Runs, all `--bouts 512 --mirror --cross --random 40 --cap 60 --seed 20260906`: first the
   control row, `golem-form` with its table overridden to v2's values (`idleStrafe` 0.55, v2's
   shapes, stand-off 1.00, no parry), which must sit inside noise of the fencer; then one row per
   constant: `standOffFraction` {1.00, 1.06, 1.12}, `cutLean` {0.4, 0.6, 0.8}, the committed
   stroke seconds at the bench's best and one step either side, `chamberAbort` on and off,
   `parryBite` {0.3, 0.5, 0.7}, `idleStrafe` {0, 0.55}, `thrustSeconds` {0.10, 0.12, 0.16},
   `duckSeconds` {0.25, 0.35, 0.5}; each on points a bout with the contact
   speed, damage a stroke, committed fraction, catches and clinch beside it.
5. The entry in `../measurements.md`; `../design.md` gains a section on the third executor and
   why the second did not move; README.

## Human gate

The owner watches `golem-form` against the fencer on three random matchups and against itself on
two. Does a cut read as a cut, and does the circle read as intent. Verdict into this file's status
line.

## Verification

```powershell
npm run check
node --test tests/golem-mind.test.mjs tests/minds.test.mjs tests/units.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-fencer,golem-form
npm test
npm run build
git diff --check -- .
```

## What remains

Target selection by least health is carried over from v2 switched off; the brawler turns it on
in Session 07. The intercept parry's true arrival is Session 02's number and Session 06's test.
The executor is a second 1,100-line file beside v2's, and the close-out records whether v2 can be
retired once the four older minds are re-based, which this set does not do.
