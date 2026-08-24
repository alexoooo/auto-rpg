# Session 15 -- experiment A: NEAT with curriculum and quality diversity

## Hypothesis

The first NEAT run collapsed to one species, trained only sword-versus-scripted-Duelist and
found a safe 88% disengage attractor. Proper structural diversity, a frozen multi-stage
curriculum and opponent coevolution should preserve several competent tactical niches long
enough for attacking behavior to emerge.

This experiment uses NEAT's historical markings/speciation/complexification and a MAP-Elites
archive rather than merely increasing population or generations. Research basis:
[Stanley and Miikkulainen](https://nn.cs.utexas.edu/downloads/papers/stanley.ec02.pdf) and
[Mouret and Clune](https://arxiv.org/abs/1504.04909).

## Implement

1. Extend `src/learning/genome.ts:7-150` with recurrent edges, innovation-correct crossover,
   disabled-gene inheritance and adaptive compatibility threshold targeting 6--12 species.
   Begin from minimal sparse feature-to-head graphs; do not seed a dense finished network.
2. Add `src/learning/quality-diversity.ts`. Archive axes are opportunity conversion, attack
   contact conversion and near-range stall share, each in five frozen bins. Within a cell,
   retain the best lexicographic outcome/safety result; novelty never outranks feasibility.
3. Add a declarative curriculum to `src/learning/research-matrix.ts`: stationary engagement,
   moving unguarded, guarding specialist, mixed shipped opponents/loadouts, then the complete
   mirrored roster including Broot/Centipede-compatible natural attacks. The final 25% of
   generations contains the complete matrix. Stage boundaries are in the config digest.
4. Maintain a deterministic opponent archive containing shipped controls and validation-
   selected champions from prior stages. Sample by indexed job, not stateful RNG or worker
   completion order. Do not evaluate against the fresh test range.
5. Add `scripts/train-neat-qd.mjs` behind
   `npm run ai:research -- --idea neat-qd`. Preserve atomic five-generation checkpoints,
   exact resume and full generation ledgers from `scripts/train-meta.mjs:34-120`.
6. Run three full seeds with the common fixed solver-step budget. Also run predeclared
   ablations without curriculum, without the QD archive and with the old fixed species
   threshold; report them, do not choose whichever ablation looks best after validation.

## Tests first

Add to `tests/learning.test.mjs`:

- `recurrent_neat_preserves_historical_markings_and_rejects_enabled_cycles_without_delay`
- `adaptive_speciation_moves_both_directions_toward_the_frozen_species_band`
- `map_elites_keeps_the_best_feasible_controller_in_each_exact_behavior_cell`
- `novel_but_stalling_behavior_cannot_displace_a_feasible_elite`
- `the_curriculum_schedule_is_seed_independent_complete_and_in_the_config_digest`
- `the_final_quarter_contains_every_frozen_loadout_opponent_and_unit_stratum`
- `opponent_archive_sampling_is_indexed_and_worker_count_independent`
- `neat_qd_resume_reproduces_the_same_population_archive_and_report_bytes`

Break recurrence delay, innovation matching, each QD axis, one curriculum cell and indexed
archive order separately and observe the named failure.

## Research decision

Freeze one validation champion per seed. Record species count, archive coverage, engagement
gates, macro/worst-cell outcomes and solver steps. It advances to session 19 even if it fails;
failure is evidence for comparison, not permission to rerun with test-informed bins.

```powershell
npm test
npm run check
npm run build
npm run ai:research -- --idea neat-qd --seed 310013 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea neat-qd --seed 310019 --workers 8 --solver-steps 1800000000
npm run ai:research -- --idea neat-qd --seed 310031 --workers 8 --solver-steps 1800000000
```
