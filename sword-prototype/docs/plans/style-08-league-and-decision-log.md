# Session 08 -- the league, and the decision log

**Status (2026-09-07): implemented; the human gate is open. The log telescopes; the league
cannot tell seven of nine minds apart.** The two leagues, the two-part corpus, the option-by-option
reward table and every number below are in the Session 08 entry of `../measurements.md`.

**The league's finding is about bodies, not minds.** Pooled over the nine, three of eleven build
classes can finish a bout -- a long maul decides 94.2 % of its bouts, a long mace 58.8 %, a long
blade 7.1 % -- and the other eight decide between 0.0 % and 1.1 %, so 78 % of the mirrored league
ends on the 60 s cap. Only two policy rows are away from zero on the bar, `golem-brawler` at
+0.0270 +- 0.0052 and `golem-duelist` at -0.0263 +- 0.0057; the seven between them span 0.024 bar
and four of thirty-six ordered matrix pairs reach two standard errors, against the 1.8 chance
would give. **A style is worth six times as much on the body that can kill**: on a long maul the
nine run 0.622 down to 0.411 and the brawler's bar there is +0.1553 +- 0.0209, with the two styles
holding both ends of that order. On a long blade every mind throws about 113 strokes a bout at
0.51 damage each, five parts to a stroke -- Session 01's one-claim rule stopped a stroke billing
one part five times and never could stop it billing five parts once.

**Both of this file's estimates were wrong.** A recorded side takes **253 decisions a bout**, not
about 80, because the executor asks on their phase changes and at the end of every exchange as
well as on the cadence; and the per-decision reward has **sigma 0.0105 bar**, not 0.05 to 0.1,
because a bout's margin is now divided among 253 windows. 72.7 % of windows carry a reward of
exactly zero and 2.9 % run zero seconds, which is legal: the view clock is quantised to 1/60 s
while the control step is 1/240 s, so two asks inside one frame are zero seconds apart. The two
corpus halves are 1,149,249 labelled decisions, three times what Session 10's budget assumed, at
about 65 MB a thousand bouts.

**The rewards inside a mirrored bout are very nearly independent**, which nobody predicted: 259
windows at sigma 0.01016 predict a margin sigma of 0.1635 and the measured one is 0.1788, nine per
cent over. On random pairs the same arithmetic gives 0.1665 against 0.4151, so the autocorrelation
is the build mismatch rather than the fight. The option table is a conditional mean and not a
treatment effect -- `void`, `duck` and `parry` are named when a stroke is already coming -- but its
sign structure is clean: `strike`, `cut` and `shove` are the only options with a positive mean,
and the six exchange options are 13.7 % of asks, 44.4 % of the seconds and 67.6 % of the damage
dealt.

**Two precision problems the telescoping test found.** The reward columns had to become `Float64`:
at `Float32` the sum was 0.008561126654967666 against a margin of 0.008561125627647437, because
the identity is a sum of five hundred catastrophic cancellations. And a decision window may be
exactly zero seconds long, for the frame-clock reason above; the assertion is `seconds >= 0` and
the cause is written into the recorder, the test and `../design.md`.

**`--record "*"` means every style, not every mind with a director.** The planner and the champion
sit on the second executor with a 56-column feature set, and one samples file holds one kind; a
nine-mind league recorded with `"*"` would otherwise have thrown at the merge after twenty-five
minutes of bouts. Separately, `runTournament` was rewriting the whole log on every row -- 295 GB
of writes for this session's 148 MB corpus file -- and appends now.


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

This session does not lower the per-bout sigma; it changes attribution, so that 384 bouts are about
thirty thousand labelled decisions rather than one scalar. Whether that is enough is Session 10's
number. Measured: a recorded side takes 253 decisions a bout, so 384 bouts with both sides
recorded are about a hundred and ninety thousand labelled decisions, not thirty.

Two things this session leaves behind. **The samples file has no policy column**, so the four
styles merge into one stream and the clean causal read that explore 0.3 makes available -- an
option a style never prefers appears only through exploration, so its rows are unconfounded --
cannot be taken from this corpus. Fitted Q does not need it and adding it costs a re-run, so it is
recorded here rather than done. And **this file's own count of the options is stale**: it says
thirteen, and the executor has shipped fifteen since the owner added `thrust` and `duck`; the
feature module and the sixteen-bit mask were built against the fifteen.
