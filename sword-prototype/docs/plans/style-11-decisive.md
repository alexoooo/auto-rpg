# Session 11 -- make a bout decidable

**Status (2026-09-08): landed.** `GOLEM_ASSEMBLY.healthScale` 0.25 -> 0.15 and
`GOLEM_ASSEMBLY.vitalityTotal` 3.6 -> 5.4, both with their sweep tables in
`../../src/golem/config.ts`. On the `rival` gap that is d 0.163 -> 0.235, decided 25 % -> 36 %,
points 0.491 -> 0.529 -- the best hand-coded mind stops losing its head-to-head against the worst
-- the winner's own bar 0.567 -> 0.448, and 0.48 parts severed a bout against 0.45, so
dismemberment survives. Step 4's league was run at both settings over all twelve minds through
`--override body.<row>`: mirrored, 1,544 of 4,096 bouts decide against 913 and the points spread
goes 0.093 -> 0.176; on random pairs, 1,806 against 970 and 0.060 -> 0.098. The ordering is
preserved as step 4 expected -- Spearman's rho 0.67 and 0.80, same mind first and last -- and the
only mind that moves by more than two standard errors on either pool is `golem-learner`, whose
table is still zeros and which is the league's stand-in for no mind at all. The climbability probe
named in step 5 is not run here and is Session 13's first act.

## Outcome

A bout that ends because somebody won it. Every session of this set has put the 60 s cap in front
of the owner's gate -- eight times, by the overview's own count -- and Session 08's league finally
said what it costs: eight of eleven build classes decide no bout at all, 78 % of the mirrored
league ends on the clock, and every mind but two sits within noise of every other. A value
function fitted against that is fitted against a constant, which is the best explanation on record
for why no learned mind of either plan set has ever beaten a hand-coded one.

This session is first in the owner's programme of 2026-09-07 for the reason they gave: *"Every
downstream sample gets more informative; 500 bouts start saying what 5,000 say now. Cheap, and it
multiplies everything after it."*

## The criterion, and why it is not a judgement

The owner has said the current fighting is too poor for variations of it to be judged, so nothing
here is chosen by watching. The response is the **bar margin across a reference gap** -- two minds
that ought to differ -- and the criterion is Cohen's d on it: the mean over the standard
deviation, per pair.

- One **pair** is that matchup twice with the corners swapped, on one body and one seed, and the
  pair is the unit. The corner a body stands in decides more of a single bout than the mind in it
  does, measured, and only the swap cancels that.
- d is the right functional because bouts needed to see a difference go as 1/d^2, which is
  exactly the owner's "500 start saying what 5,000 say".
- **It fails at both ends, which is the property that makes it safe to maximise.** A bout that
  never ends has a numerator near zero. So does a bout decided by one blow, because which body
  swings first is a coin flip -- the numerator collapses while the denominator does not. Nothing
  in it prefers a long fight or a short one; it prefers a fight whose *outcome the mind moves*.
- Two guard columns are read beside it and not optimised: the fraction of bouts decided before
  the cap, and the winner's own remaining bar. A setting that decides every bout with the winner
  untouched is a stomp whatever d says. A third was added once the sweep ran: how much
  dismemberment survives, because a bar that empties before anything comes off no longer
  describes the body it is drawn over.

**Which gap, and a correction.** The sweep was first built on a style played greedily against the
same style at explore 1.0 -- a uniform draw from whatever is open, which is the flail itself --
and that is the wrong gap to select on. Both corners of it are the *same executor* naming the same
fifteen bundles, so what the bar is asked to resolve is a difference in timing rather than in
kind, and the reference-gap run measured it moving far less under the lever than the gap between
two different minds does. The decision was retaken on **`rival`** -- `golem-brawler` against
`golem-duelist`, the two ends of Session 08's league and the widest difference between minds on
record, which is the gap a league actually has to resolve. Three gaps are reported in
`../measurements.md`: `passive` (a director that only ever names `hold`), `uniform`, and `rival`.

## What the diagnostic found first

104 mirrored `golem-fencer` bouts over the 40-build random pool, seed 20260907, the shipped
settings, every part of both bodies read at the last sample:

- 30 of 104 decided; mean final vitality 0.665, and 0.785 over the drawn ones. **The bar loses
  about a fifth of itself in a minute**, so a bout needs four to five times the lethality it has,
  or four to five times the clock. It is a rate problem and not a conversion problem.
- Injury spent is 0.348 of the 3.600 a body declares. Of that bar, **41.7 % sits on the legs and
  the legs absorb 7.5 % of the injury** -- spent over weight 0.017, against 0.212 for the head and
  0.195 for the primary arm. `locomotion` is a target slot, but `targetByHealth` is off in every
  table but the brawler's, so every stroke goes to the trunk mark at shoulder height and the legs
  are below the swing plane.
- **The obvious inference from that was wrong, and the sweep says so.** Moving the weight off the
  legs -- a pure reallocation, the bar renormalised -- *lowers* the effect size, 0.130 against the
  control's 0.210, and lowers it again in combination with more lethality. The inert weight was
  not diluting the signal, it was damping the variance: concentrating the bar onto the arm and the
  head makes one sever swing more of it, and the denominator grows faster than the numerator.
  Reallocation is refused, on its own measurement, and the record says so because the argument for
  it was good and it was still wrong.

## Frozen choices

- **The lever is lethality, and it is reached through `GOLEM_ASSEMBLY`** -- `healthScale`, what a
  point of declared part health is worth, and `vitalityTotal`, how much bar a destroyed part
  removes. Both are golem-only. The global constants that would do the same job,
  `CONFIG.combat.cutJoulesPerDamage` and its two siblings, are refused for a concrete reason: they
  are the Warrior's scoring too, and `tests/scoring.test.mjs` pins it.
- **`healthScale` 0.25 was calibrated before the rules it is measured under.** Its own table in
  `../../src/golem/config.ts` chose it against 93.8 damage a bout over 29 seconds, decided 16 of
  16. The diagnostic now measures 55.1 damage a bout over 53.7 -- about a 3.2-fold fall in rate --
  and Session 01's one claim per part per stroke, which took away the rake, is where it went. The
  number was not wrong when it was chosen; the fight underneath it moved.
- **`--override body.<row>`** reaches the assembly from the harness, beside the `form.` prefix
  that reaches a style's table. It is deliberately not a bare name: every other override changes
  what a mind decides, and this one changes what it is deciding about.
- **The cap stays at 60 s.** Shortening it without more lethality converts decided bouts into
  drawn ones, which moves the number the wrong way; the owner named it as one of three levers and
  it is the one the measurement does not support.
- **Dismemberment is a third guard column, and it is what stops the sweep at its best d.**
  `vitalityTotal` scales the declared weights to sum to itself, so raising it means a bar empties
  on a smaller fraction of the body; past about 7 it empties on less than any single module, and
  the bar is gone before anything comes off. A setting is refused when a decided bout stops ending
  with a part on the floor, whatever d says, because a bar that no longer describes the body it is
  drawn over is the worse defect.
- **`vitalityTotal` stays under 5.95**, which is where a severed primary arm begins emptying a
  default golem's whole bar on its own and `../../tests/golem-arena.test.mjs` stops being able to
  say that a golem fights on with the other arm -- that file passes at 5.9 and fails at 6.0. The
  ceiling is `1 / s` for a module of share `s`, and the default build's primary is 16.8 % of its
  bar. It is build-dependent rather than an invariant -- nine of the fifty-two pool builds carry a
  primary heavier than a bar even at 3.6 -- but it is not a line to cross as a side effect of a
  sweep.

## Implement

1. `--override body.<row>`, its refusal, and the test that a thinner bar visibly costs more of it.
2. The diagnostic and the sweep, their tables into `../measurements.md`.
3. The chosen row moved in `../../src/golem/config.ts`, with the sweep table in its doc comment
   as `healthScale`'s own table already is, and the old table kept above it rather than replaced.
4. The league re-taken at the new settings: every mind, mirrored and random pairs, confirming the
   ordering is preserved and the separation widened.
5. The climbability probe: a corpus re-collected under the new settings and the existing fitted-Q
   learner re-run over it, as a yes or no on whether the gradient is now real.

## Human gate

None. The bar is mechanical and stated above; the owner's one gate for this programme is Session
14's, at their instruction of 2026-09-07.

## Verification

```powershell
npm run check
node --test tests/tournament.test.mjs tests/golem-mind.test.mjs tests/scoring.test.mjs
npm test
npm run build
git diff --check -- .
```

## What remains

If the effect size at the best setting is still small, the finding is that the *option vocabulary*
and not the bar is what flattens the league -- fifteen frozen bundles among which timing barely
matters -- and that is what Session 12 exists to fix.
