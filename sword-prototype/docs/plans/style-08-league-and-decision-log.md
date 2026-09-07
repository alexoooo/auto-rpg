# Session 08 -- the league, and the decision log

**Status (2026-09-06): planned. Needs 05, 06, 07.**

## Outcome

The league table of all nine minds, by policy and by build class with every structural column,
and the signal the learned minds train on: every director decision of a recorded side logged with
its features, its option, the open options, the damage dealt and taken until the next decision,
its duration and whether it was the side's last. The sum of a side's rewards is its bar margin.

## Frozen choices

- **The decision window is ask to ask.** In the new executor a director is asked when nothing is
  directed, when the cadence elapses, on an event, and when an exchange ends; nothing happens
  between asks that is not attributable to the last decision. So the recorder is a director hook
  and needs no join with the exchange logger: it closes the open decision with dealt = their
  vitality at the last ask minus now, taken = mine likewise, and seconds elapsed, then opens the
  next with the new features, option and open mask; a close at the bout's end marks the last
  decision done. Σ(dealt − taken) over a side equals its bar margin to rounding, and that is a
  test. Vitalities come off the view the hook already receives, so nothing is read that the mind
  cannot read.
- **The features are the neural set rebuilt over the new reading.** A new module,
  src/golem/style-features.ts, with its own version: the 56 columns of
  `../../src/golem/neural-features.ts` computed from the new reading and the thirteen options,
  plus six rhythm columns that no mind reads today: seconds in their phase, seconds in mine,
  their commits so far, seconds since their last commit, since my last strike, since the last
  contact, each clamped and scaled. The open mask becomes sixteen bits.
- **Exploration is a wrapper over any director**, seeded apart from the executor's stream, so a
  recorded style at explore 0.3 rolls the same executor as at 0 and explore 0 is the identity
  to the byte. It lives in the executor's file beside the director type.
- **The worker records any directed side.** In `../../scripts/tournament-worker.mjs` the ask
  recorder of the matchup set becomes the decision recorder for minds that publish the new
  executor; `record` in the worker data becomes a list of policy names or `"*"`, `explore` a
  fraction applied to recorded sides, and `mindFor` builds recorded sides through a policy-name
  to factory table exported from `../../src/golem/golem-policies.ts` that every style registers
  in. The exchange logger accepts a styled mind, with its free options widened by circle, void,
  retreat and parry, so the tactician's tables can be fitted from the same run. Under
  `--behaviour` the row carries the behaviour record.
- **The samples file gains a version.** `collect`, `writeSamples` and `readSamples` in
  `../../scripts/train-neural.mjs` learn the reward columns and the wider mask as version 2;
  version 1 is refused by name. `evaluate` in `../../scripts/tune.mjs` gains `mirror`, `record`,
  `explore` and `behaviour` pass-through, so a confirmation can run over random pairs under
  common random numbers.

## Implement

1. The league: all nine minds, `--bouts 4096 --cross --random 40 --cap 60 --seed 20260906`,
   mirrored and over random pairs (about 25 minutes each); the table by policy and by build
   class with every column, and the style-against-style matrix, into `../measurements.md`.
2. The decision recorder, the exploring director, the rhythm fields on the reading, the feature
   module, the worker's record list and factory table, the samples file version.
3. Tests in `../../tests/neural.test.mjs` and `../../tests/tournament.test.mjs`: on a real 3 s
   bout with a styled side recorded, the count of decisions equals the asks, every taken option
   was open, Σ(dealt − taken) equals the side's final margin to 1e-9, exactly one decision is
   done, every duration is positive and the exchange decisions are longer than the cadence;
   the version 2 file round-trips and a version 1 file is refused; the exploring director at 0
   is identical and at 1 never names a closed option; `collect` over two workers with `"*"`
   returns both sides' sequences.
4. The corpus for Sessions 09 and 10: random pairs 4,096 bouts and mirrored 1,024, every styled
   side at explore 0.3, `--exchanges --behaviour` (about 16 minutes); kept under `tournaments/`.
5. The entry: decisions a bout (about 80 a side expected), the σ of the per-decision reward
   (measured here for the first time; 0.05 to 0.1 bar expected), the fraction of zero-reward
   windows, the option-by-option reward table, the file size per thousand bouts.
   `../design.md` gains a section on the decision log and what a reward is; README names the
   flag.

## Human gate

Mechanical: the telescoping test. And the owner reads the league table against what they have
seen of the four styles. Verdict into this file's status line.

## Verification

```powershell
npm run check
node --test tests/neural.test.mjs tests/tournament.test.mjs
npm run tournament -- --bouts 64 --mirror --policies golem-form,golem-guardian --exchanges --behaviour
npm test
npm run build
git diff --check -- .
```

## What remains

This session does not lower the per-bout σ; it changes attribution, so that 384 bouts are about
thirty thousand labelled decisions rather than one scalar. Whether that is enough is Session 10's
number.
