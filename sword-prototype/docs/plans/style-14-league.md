# Session 14 -- league self-play: a main agent, a pool of its past selves, and two exploiters

**Status (2026-09-08): calibration landed; the league is not built.**

## Outcome

The main agent trained against a pool of frozen past checkpoints rather than against its current
self alone, with two exploiters trained specifically to beat it, and the main agent trained back
against them. This is the step the owner named as the one that produces the qualitative jump from
flailing to something that reads as skilled, and the tournament harness is already most of a
league runner.

## What the calibration found, and what it changes

Session 13 landed a fit and this session opened by measuring the one thing the owner made a
condition of the overnight: a winner against a mirrored idle opponent on a body that has a weapon.
`.review/idle-probe.mjs` plays every build against itself with one side on `idle`. The full tables
are in `../measurements.md`; the four facts that change this plan are:

1. **Decisive layouts exist and they are the maul.** Seven maul builds, four bouts each,
   twenty-eight kills out of twenty-eight for `golem-driver`, the dummy left at 0.087 of its bar in
   a mean 21 s. Fourteen blade builds and the same mind finishes 2 % of them: a blade deals 13.3
   damage in 60 s where a maul deals 64.3, against a bar worth 55 to 80 damage, so the driver's
   blade would need about 160 s on the `default` body to do what its maul does in 21. The owner's
   condition is met, and it is met by a weapon class rather than by a draw index.
2. **The fitted mind gives most of that back, and the shipped read of it is beaten by noise.**
   `golemPolicy`'s `sample` defaults false, so `golem-policy` fights on the head's *mean* command;
   that mean turns the maul's 100 % into 32 %, the mace's 53 % into 0 %, and the pool's 46 kills in
   208 into 9 -- against a *uniform random command's* 11, which out-damages it on every weapon
   class. The same weights **drawn** at the spread the head carries kill 31 of 208, recovering the
   maul to 57 % and the mace to 28 %. The mind has learned to strike and not to stand where
   striking works, and the half of it that ships is the half that cannot reach.
3. **The reason is structural and it is about self-play, not about the fit.** In a mirrored bout
   the two sides' bar margins are exactly negated, so the margin and the win bonus both sum to zero
   over the rollout; the only terms whose mean is not zero by construction are `clinch` and `idle`,
   and both charge for engaging. The best symmetric score available is zero, and Session 13's fit
   found it: on the default blade body against a motionless opponent it holds at **2.27 times their
   reach**, leans and steps back, and swings 56 times a bout at 40 m/s for **0 contacts**.
4. **The zero of the action space is out of the fight.** `commandFromAction` centres every axis on
   the midpoint of its published range and `COMMAND_RANGES.standOff` is `[0, 3]`, so a head with no
   signal -- and the mean of the uniform draw -- stands at 1.5 times the opponent's reach, outside
   the 0.92 a stroke opens at; the feet settle at `hold - advance / closeGain` with `closeGain`
   1.8, so a saturated `advance` closes 0.31 of a reach of that. The drift to 2.27 was half a
   reach, not a journey.

**A league of self-play is the same identity again, with more players.** Two minds optimising a
symmetric margin, both able to abandon a stroke at 12 Hz, have an obvious stable attractor, and
this session has now watched the fit walk into it. So the league's opponent distribution is not a
detail of this plan any more; it is the thing the plan is for, and the calibration's sweep is what
says which distribution to build.

## Frozen choices

- **Three roles.** The *main* agent trains against a distribution over: itself, a uniform draw
  from the checkpoint pool, and the current exploiters. The *pool* is every Nth checkpoint of the
  main, frozen, never trained, capped by age and thinned by a rule in the entry. The *exploiters*
  are policies initialised from the main and trained against the frozen current main only, reset
  when they stop gaining.
- **Why a pool at all**: self-play against only the current self cycles -- a counter to a habit
  beats the habit and is then beaten by the habit's return, forever, with no monotone progress.
  Playing the past is what makes the progress monotone, and this repository can check it: the
  main agent must beat every checkpoint older than K, and a table of that matrix is the session's
  main measurement.
- **The evaluation is unchanged and stays held out**: the hand-coded league on both pools with
  common random numbers, the structural columns beside the score, at the settings Session 11
  fixed. A league that beats its own past and loses to the fencer is reported as exactly that.
- **The overnight is the owner's decision** (carried from 2026-09-06): six to ten hours of
  harness unattended, seeds and hours in the entry, artifacts committed the next session.

## Implement

1. scripts/league.mjs: the roles, the opponent distribution, checkpoint storage and thinning,
   the exploiter reset rule, and resumability -- a league that cannot resume cannot run overnight,
   and a second V8 fatal this session (`../measurements.md`) makes that a certainty rather than a
   precaution: the fatal takes the process, so the only recovery is the last checkpoint.
   `scripts/train-ppo.mjs` gained `--reward-win/-clinch/-idle/-tick` and `--opponent` in the
   calibration; the league's opponent distribution is the general case of the second.
2. The checkpoint matrix: every pair of checkpoints played, the table into `../measurements.md`,
   and the monotonicity claim checked rather than asserted.
3. **A structural tripwire beside the matrix**, checked every time the matrix is: the decided
   fraction, blows per stroke, the abort fraction, and the idle-dummy kill rate by weapon class. A
   league that climbs its own matrix by never committing is a league that climbs; the matrix cannot
   see it and this session has measured what it looks like. The tripwire is what catches it before
   the owner does.
4. **The action space's zero, and which read of the weights ships.** Narrow
   `COMMAND_RANGES.standOff` to `[0, 2]` so the axis centre is `freshCommand`'s neutral and the
   fencer's shipped `standOffFraction` of 1.00 rather than a stand-off no weapon can reach across;
   bump `POLICY_VERSION` to 2, because the change moves what every number in
   `src/golem/policy-weights.ts` means and the old table would load and lie about it; regenerate
   the module from this session's fit. `src/golem/styles/driver.ts` clamps its own stand-off to the
   axis roof, so re-run `.review/idle-probe.mjs` on `golem-driver` afterwards -- a mind whose reach
   is more than twice its opponent's is the case where the new roof bites, and 46 of 208 is the
   number it has to keep. Then decide `golemPolicy`'s `sample` default on the re-measured numbers
   rather than on the convention: greedy is reproducible and drawn kills three times as often, and
   drawn is still deterministic because the stream is seeded per side.
5. The overnight run, then the held-out evaluation against every hand-coded mind.
6. Tests in tests/league.test.mjs: the opponent distribution is the one the table declares; a
   checkpoint round-trips; the exploiter resets when its gain stalls; a two-role league of three
   short iterations runs on two workers.

## Human gate

**This is the gate for the whole programme, and it is the only one.** The owner opens the matchup
screen, randomises a dozen matchups, watches, and says whether the golems now behave in a way
they can name. It sits here rather than earlier at the owner's instruction (2026-09-07): the
current fighting is too poor for variations of it to be judged, so nothing is put in front of
them until there is at least one non-trivial mind to look at. Verdict into `style-00-overview.md`.

## Verification

```powershell
npm run check
node --test tests/league.test.mjs
npm test
npm run build
git diff --check -- .
```

## What remains

Nothing is built after this but the record, which is Session 15.
