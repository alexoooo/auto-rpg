# Session 12 -- evolve when to change tactics

## Outcome

Add a seeded, headless NEAT trainer that evolves a compact meta-policy over the action options,
uses novelty to preserve distinct behaviour, and writes a validated checkpoint that can be
replayed independently of the trainer.

## Implement

1. Add pure modules under `src/learning/`: `rng.ts`, `genome.ts`, `network.ts`,
   `checkpoint.ts` and `meta.ts`. They must remain compatible with Node's strip-only TypeScript
   loader: no parameter properties and explicit `.ts` on runtime imports.
2. The network reads the versioned session-11 feature vector every `decisionSeconds = 0.10`.
   Outputs are one logit per total `OptionName` plus one persistence value in `[0.10, 0.80]`
   seconds. Mask unsupported options before selection and refuse a checkpoint whose output
   names do not exactly match the runtime option table.
3. Implement NEAT essentials explicitly: innovation numbers, add-node/add-edge mutation,
   weight/bias mutation, acyclic execution, compatibility distance, speciation, fitness
   sharing, elitism and crossover. Seed every random choice from the CLI seed; no
   `Math.random()` in the learning graph.
4. Add `scripts/train-meta.mjs` and `npm run ai:train`. Default experiment constants:

   ```text
   population 128; generations 80; elite 4; mirrored bouts 24/genome
   decision interval 0.10 s; checkpoint every 5 generations
   ```

   The script accepts overrides, writes atomically to `asset-src/learning/runs/<id>/`, resumes
   only matching feature/action/config versions, and never changes the shipped checkpoint.
5. Fitness combines win points, vitality differential, damage efficiency and survival with a
   small option-switch cost; novelty uses the session-11 descriptor. Report each component.
   Do not reward raw damage after the verdict, which session 01 made impossible anyway.
6. Train on the train seed range, select species champions on validation, and touch test seeds
   only for the final candidate. Every bout is mirrored side/loadout order. Add a scripted
   baseline and a random-option control to every report.
7. The checkpoint codec stores schema, feature version/names, option names, nodes, edges,
   activation names and training provenance. `Checkpoint.fromBytes` validates bounds,
   duplicate innovations, cycles, non-finite weights and trailing data before constructing a
   network.

## Tests that must exist first

Add `tests/learning.test.mjs`:

- `the_same_seed_builds_the_same_initial_population_and_first_generation`
- `mutation_can_add_a_node_and_an_edge_without_creating_a_cycle`
- `crossover_keeps_matching_innovations_and_the_fitter_disjoint_genes`
- `species_sharing_prevents_one_large_species_from_taking_every_slot`
- `a_checkpoint_round_trips_and_replays_the_same_option_sequence`
- `a_checkpoint_refuses_wrong_features_options_cycles_nans_and_trailing_bytes`
- `train_validation_and_test_seed_ranges_do_not_overlap`
- `mirrored_evaluation_charges_both_spawn_sides_to_one_genome`

Replace the seeded RNG with `Math.random`, permit one back-edge and overlap one seed; the
reproducibility, cycle and split tests must fail.

## Acceptance

Run a short CI-sized training smoke test (8 genomes, 3 generations, 2 mirrored bouts) in
`npm test`, then the default experiment manually. Re-running the same seed/config must emit
the same champion digest and report. A session completes when training, resume and inference
work; it does not claim the learned policy is good. Promotion belongs to session 13.

```powershell
npm test
npm run check
npm run build
npm run ai:train -- --seed 20260823 --smoke
npm run ai:evaluate -- --seed 20260823
```
