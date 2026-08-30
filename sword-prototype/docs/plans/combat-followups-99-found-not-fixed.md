# Found but not fixed

This is the live register of measured combat-research defects and decisions that no
implemented session has closed. An entry is evidence, not a promise to fix. Closed
findings move to their durable owner in `docs/measurements.md` or the relevant
architecture document and leave this file; a live plan should not double as a
historical changelog.

Each entry names the observed problem, the coverage of its evidence, and the work
needed to close it. Re-measure before changing a rule whose evidence is older than
the mechanism it describes.

## 3. The DAgger teacher can never emit a `thrust`

`src/learning/tactical-teacher.ts` chooses `shoot` for a bow, `punch` for an empty
hand and `cut` for every other weapon. The authored thrust aiming rule is therefore
unreachable from a teacher rollout.

Closing this is a teacher-behaviour and balance change, not a wiring fix. It needs a
measured cut-versus-thrust choice rule and a before-and-after null-control run.

## 4. A bite's target head is untrainable

Three independent constraints collapse the choice. `tacticTargets("bite")` offers
only `vital`; the bite branch does not read `target`; and four measured centipede
seed pairs produced 232 contacts -- 172 left shin, 60 right shin, zero head and zero
torso. This coverage describes only the shipped centipede bite.

Closing it requires a natural-attack stroke envelope with meaningful aim, followed
by contact-region evidence.

## 5. The teacher labels every `cut` with a constant `vital`

The original justification was superseded when named cut strokes gained a real
span: their measured separation is now roughly 8.7x. The constant label may still
be correct, but the argument supporting it is not.

Closing it requires a measured teacher rule and a before-and-after run, preferably
beside entry 3.

## 6. Per-weapon guard placement remains unmeasured

Before the supporting-hand spread change, 24 option-driven bouts per loadout
against `swinger` measured 294.7 damage for `sword+shield`, 176.1 for
`sword+buckler` and 202.8 for `sword+sword`. The shield produced the worst outcome.
The later `ACTION_TUNING.guardSpread` change may have altered that ordering, but the
three-loadout comparison has not been rerun.

Re-run the same 24-bout cells first. Only then decide whether guard placement needs
weapon-specific geometry.

## 7. The current tactic is an output but not an input

The feature vector exposes current movement and action, but not current effector,
target or stance. A controller therefore cannot observe the full tactic it is
holding. Closing this is a deliberate `featureVersion` revision which invalidates
the associated checked-in artifacts and goldens.

## 8. The quality-diversity descriptor is thin

The former arithmetic objection used 72 legal tuples per body. Measurement found a
maximum of 21 on one body, a union of 33 across all bodies and 24 across the
then-current research cells. That makes the archive closer to three elites per cell,
not one.

The descriptor remains a decision, not a defect. The surviving reason to revisit it
is whether the outcome descriptor answers the intended diversity question; do not
reuse the retired tuple-count argument.

## 9. Fifteen production exports remain test-only

`src/learning/evaluation.ts` records nine: `SEED_RANGES`, `validateSeedRanges`,
`evaluationMirrorSeeds`, `mirroredEvaluationJobs`, `INTENT_FIELDS`, `intentNumbers`,
`intentFieldDeltas`, `intentSequencesEqual` and `forcedOptionEvaluationMind`. The other six are
`initialPopulation`, `restoreIndexed`, `Network`, `fitnessComponents`, `noveltyDescriptor` and
`noveltyScore`. `partitionIndexed` is not on this list: `scripts/run-construct-bouts.mjs` owns its
production call.

The recorder work gave the adjacent behaviour-record exports a production owner,
but not these fifteen. Closing this requires auditing callers and test value before
shrinking the public surface.

## 12. Head-utilisation claims need a clamped control

The scripted and random meta controls have no effector head and always prefer the
primary legal effector. Their execution target is also `as-measured`, outside the
frozen target names, so merely recording their current decisions would produce
rows the validator refuses.

Session 23 owns the useful comparison: run each candidate again with the relevant
head clamped to its default chooser. This ablation decides what may be claimed about
why a candidate won; it is not a promotion gate.

## 13. Head-collapse claims need a sample-size floor

If all `n` free choices select one option, rejecting a true alternative-choice rate
of at least 10% at 95% confidence requires `0.9^n <= 0.05`, hence `n >= 29`.
Session 23 must name cells below that floor as unanswerable instead of pooling them
into a modal share. This constrains report prose, not candidate promotion.

## 15. `scripts/` and `tests/` have no static check

`tsconfig.json` includes `src` and `vite.config.ts`; the `.mjs` harness and test
files are outside `npm run check`. Adding them requires a deliberate JavaScript
checking setup (`allowJs`/`checkJs`) and cleanup of the failures it reveals. Until
then, a clean TypeScript check does not cover the experiment harness.

## 16. The null control has a narrower proof surface than its name suggests

`npm run measure -- --only duelist-swinger --bouts 120` is a useful guard for
shared execution primitives. It cannot detect a change confined to exports,
`research-havok.mjs`, `learning/tournament.ts` or `learning/meta.ts`, because that
path imports none of them and runs `policyMind` rather than a `CombatOption`.

Treat it as a regression check, not evidence for changes outside its import and
execution graph. Any new claimed proof surface needs a deliberate mutation that
makes the control fail.

## 17. Behaviour records have four smaller limits

- The joint tactic map is sparse: measured sweeps occupied 555 of 2,520 keys at
  2.39 counts each for a uniform policy and 427 at 2.48 for an attack-heavy one.
  Marginals carry the signal; joint questions generally do not.
- Per-row persistence rewrites the whole rows array. The expanded record was
  estimated near 280 MB of total writes for a four-candidate run; measure before
  optimizing.
- Resume merge revalidates prior rows, making it quadratic in row count. The
  estimated parse volume remains small, but has not been measured.
- A hand-built DAgger artifact can name a target outside `TARGET_NAMES` because
  artifact-row validation checks truthiness rather than frozen membership. Merge
  refuses the resulting tournament row, but prediction does not refuse it earlier.

## 18. Boundary progress reward does not telescope

`tacticalBoundaryReward` combines telescoping vitality change with progress clipped
per decision boundary. Because the persistence head controls boundary count, it can
change how much of the same closure survives clipping.

Measured over all 90 train jobs, 1,200 solver steps each, with persistence forced to
each of eight bins: clipped progress was 1.054 per bout at 0.10 seconds and 0.336 at
0.80 seconds. Per-boundary reward stayed roughly flat at 0.0221--0.0263, identifying
boundary count as the mechanism. `docs/measurements.md` owns the full table and the
invalid first measurement.

Every plausible repair changes the reward learned by existing PPO artifacts. Close
this only with a training comparison: bout-level clipping needs new accumulation;
duration scaling introduces the opposite dwell coupling; dropping the clip reopens
range-boundary farming.

## 19. `valueEpsilon` was not re-derived for the time-based horizon

The absolute PPO value clip remains 0.2 after the return changed from a
per-boundary to a per-second discount. Four untrained trajectories (seed 310013,
jobs 0--3, 1,200 steps) produced 73 boundaries: mean target distance 0.292, median
0.223, p90 0.626, maximum 1.308; 53.4% exceeded the clip.

That distribution is about initialization, not a trained value head. Closing this
requires a bracketed sweep during a real training run rather than choosing a new
constant from the untrained sample.

## 22. Two planned command surfaces still do not exist

Session 19 added `--run-id` where it was missing. `--rung`, required by Sessions 21
and 22, and `--verify-promoted`, required by Sessions 24 and 25, remain unimplemented.
Their owning sessions must add refusal-tested parsers before invoking them; no
runner may silently ignore either flag.
