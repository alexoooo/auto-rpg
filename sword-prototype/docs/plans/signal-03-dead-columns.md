# Session 03 -- six columns divided by a ten-thousandth

**Status (2026-09-11): planned. Needs 02.**

## Outcome

`normalise` in `../../src/golem/policy.ts` stops amplifying a column the fit never varied, and the
shipped mind is re-rated with and without that change on the same bouts, **without touching a
single weight**. It is the cheapest shot in this set at moving a number the record already
publishes, and it is the only one that can be taken in an afternoon.

## The defect, stated once because the whole session is its consequence

`normalise` divides by `sqrt(variance + 1e-8)` and clamps to +-5. The shipped table in
`../../src/golem/policy-weights.ts` was accumulated over 11,390,700 observations of mirrored
self-play, and **seven of its 71 columns have exactly zero variance**: `bias`, `reachEdge`,
`myWeapon:buckler`, `theirWeapon:buckler`, `myHealth:locomotion`, `theirHealth:locomotion`,
`interceptWall`. The divisor for those is 1e-4, so `reachEdge` -- the signed reach difference in
half-metres -- saturates at a reach gap of **0.25 mm**, and the two `buckler` one-hots saturate the
moment a buckler appears.

It is not a lost signal. It is worse. **A column that is identically zero takes no gradient**, so
those first-layer weight columns are still at their initialisation, and they now carry +-5 with the
sign preserved. Measured against the shipped table: Glorot init rms for 71 -> 256 is 0.07821, the
shipped layer-1 rms is 0.07846, and column 9's own rms is 0.07851 -- untouched. The live columns at
unit variance give a pre-activation sd of 0.627; the six non-bias dead columns at +-5 give 0.963.
**On random viable pairs more than half the shipped mind's first hidden layer is unfitted noise
that flips sign with the reach order. On the mirror it is exactly zero.** That is a mechanism for
1st of 14 mirrored and 13th of 14 on random viable pairs, and it costs an afternoon to test.

## Frozen choices

- **The fix goes in `normalise`, and nothing in the shipped table moves.** A column whose fitted
  variance is below a floor passes through as **zero**, which is the unique value that makes
  inference agree with training: during the fit the raw value equalled the mean on every one of
  those 11,390,700 rows, so `(raw - mean) / 1e-4` was exactly 0. **The change is therefore provably
  a no-op on every observation the fit ever saw**, and differs only on inputs the fit never saw.
  That argument is why this is a correctness fix rather than a policy change, and it is why no
  number already in `../measurements.md` moves.
- **A floor at write time as well, so the next table says so on its face.** `NORMALISATION_FLOOR`
  is also honoured where `extendNormalisation` and `freshNormalisation` write a variance, and
  `renderPolicyModule` names the dead columns in the generated header. Neither of those repairs the
  shipped table -- `normalise` does that -- but a table that ships a dead column should announce it.
- **No refusal on a zero variance.** The shipped table has seven and must keep loading. A refusal
  would make this session a two-commit deletion of the only fitted mind in the tree, for a defect
  the session is fixing in the reader.
- **Two arms, not three.** "Floor the variance" and "drop the column to its mean" are the same arm
  once the floor is low enough to clip, and pretending otherwise would put a third row in a table
  that says one thing.
- **The two-sided reading is stated before the data.** A wash lands the fix anyway as a
  correctness fix and records that the defect cost nothing measurable, which is a real answer. A
  *loss* on random pairs beyond one standard error means the network had learned to use the
  saturation, and that would be the most interesting outcome in the set -- it is recorded, not
  buried, and the fix is reverted.

## Implement

1. **Two minutes of arithmetic first, and its answer goes in the entry whichever way it reads.**
   Forward the shipped net on one real random-viable observation with column 9 at 0, +5 and -5,
   and print the displacement of each of the nine axis means in normalised units; repeat for the
   other five live dead columns. This tells the session whether the rating below is an experiment
   or a formality **before** it spends the bouts, and the number belongs in the record either way.
2. `../../src/golem/policy.ts` -> `normalise`:
   ```ts
   /**
    * Below this a fitted variance means the column never moved, and the fit's own first layer
    * never took a gradient through it. Zero is what the fit saw; zero is what inference reads.
    */
   const DEAD_VARIANCE = 1e-6;
   export function normalise(raw: Float64Array, norm: Normalisation, into: Float64Array): Float64Array {
     for (let k = 0; k < raw.length; k += 1) {
       if (norm.variance[k] < DEAD_VARIANCE) { into[k] = 0; continue; }
       const sd = Math.sqrt(norm.variance[k] + 1e-8);
       into[k] = clamp((raw[k] - norm.mean[k]) / sd, -5, 5);
     }
     return into;
   }
   ```
3. `../../scripts/train-ppo.mjs` -> `extendNormalisation`, and `freshNormalisation` in
   `../../src/golem/policy.ts`: a variance below the floor is written as zero rather than as a
   value a later reader has to interpret, so "dead" is one predicate and not two.
4. `../../scripts/train-ppo.mjs` -> `renderPolicyModule`: name the zero-variance columns in the
   generated module's header comment, by feature name, so the next table that ships one says so.
5. Tests. `../../tests/ppo.test.mjs`: a zero-variance column handed 1e9 reads **0**, not 5 -- the
   mutation to watch red is deleting the branch, which makes it read 5. And a table whose every
   variance is live reads exactly as it does today, so the change is pinned as a no-op where it
   should be one. `../../tests/policy-perception.test.mjs`: the seven dead columns of the shipped
   table pinned by feature name, so a future fit that revives one is a test change and not a
   surprise.

## Human gate

None. The mechanical bar, stated before the data.

The shipped weights are rated two ways -- as shipped, and under the fix -- as **two arms in one
`ratePaired` call**, which is what makes them paired, at 600 bouts, seed 20260906, random viable
pairs and mirrored, against `golem-driver` and `golem-fencer` on Session 02's column.

- **Pass:** on random viable pairs the fix's paired difference from the shipped arm is
  **d >= +0.10 with an interval excluding zero** -- a tenth of a bar from a change that touches no
  weight.
- **The other side, which is a refusal and not a bar:** the mirrored margin must not fall by more
  than one standard error. A column identically zero in the mirror cannot change a mirrored bout,
  so a mirrored move is a bug in the change and not a result.
- **Wash:** the fix lands anyway, and the record says the defect cost nothing measurable. That
  answers "is this the shipped mind's transfer failure" with a no, which is worth having.
- **Worse on random pairs beyond one standard error:** reverted, and recorded as the network having
  learned to use the saturation.

**Folded in for ten minutes, because the bouts are already being bought.** One rating point of the
shipped mind read **drawn** against the same point read greedily, same bouts, same seed. Training
draws the action and every rating in this record reads the mean, and the two are different policies
-- most sharply on the three gates, whose logits the shipped table holds within 0.2 of zero. If the
two reads score materially differently, every bar in the record has been measuring a policy the fit
never optimised, and that belongs in `../measurements.md` before `signal-04-abort-gate.md` builds
on it.

## Verification

```powershell
npm run check
node --test tests/ppo.test.mjs tests/policy-perception.test.mjs tests/minds.test.mjs tests/docs.test.mjs
node scripts/tournament.mjs --policies golem-policy,golem-fencer --bouts 24 --seed 20260906 --pairs all
npm test
npm run build
git diff --check -- .
```

The tournament line is a smoke test that the shipped table still loads and still fights, not a
measurement; the measurement is the paired call named in the bar.

## What remains

The floor stops a dead column from being amplified. It does not make the column *informative* --
that needs a training distribution in which the column varies, which is random viable pairs, which
is a fit and therefore outside this set. The five other dead columns are dead for reasons worth
separating in the record: two `buckler` one-hots and two `locomotion` slots are dead because the
pool never drew those bodies in a mirror, and `interceptWall` is dead because `wallOnChamber`
ships false.
