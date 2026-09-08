# Session 14 -- league self-play: a main agent, a pool of its past selves, and two exploiters

**Status (2026-09-07): planned. Needs 13.**

## Outcome

The main agent trained against a pool of frozen past checkpoints rather than against its current
self alone, with two exploiters trained specifically to beat it, and the main agent trained back
against them. This is the step the owner named as the one that produces the qualitative jump from
flailing to something that reads as skilled, and the tournament harness is already most of a
league runner.

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
   the exploiter reset rule, and resumability -- a league that cannot resume cannot run overnight.
2. The checkpoint matrix: every pair of checkpoints played, the table into `../measurements.md`,
   and the monotonicity claim checked rather than asserted.
3. The overnight run, then the held-out evaluation against every hand-coded mind.
4. Tests in tests/league.test.mjs: the opponent distribution is the one the table declares; a
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
