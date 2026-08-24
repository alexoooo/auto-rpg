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

## Implementation record -- 2026-08-24

The pure learning graph, runtime meta-policy, validated binary checkpoint and atomic trainer
are implemented. The CI smoke is 8 genomes x 3 generations x 2 mirrored bouts; the real
headless smoke ran 68 fresh-Havok bouts including species validation, scripted/random
controls and the final test pair. After adversarial repair, two final eight-worker runs took
27.526 and 28.139 seconds and produced the same
champion digest and report values:

```text
3289d671c44ec434cbfb9b178b4490640a2162afefb1784917ea58f0a6b44db9
```

Resume reproduced that digest with a different worker count in 0.628 seconds, and a population mismatch was refused before
the first bout. At the observed 0.9465 seconds per isolated bout, the default experiment's
245,760 training bouts plus validation, controls and final test are approximately 65 serial
hours on this machine.

The trainer therefore has a bounded `--workers` evaluation pool: eight workers at most on
this 32-thread host. Work carries its genome index into the worker, each bout still receives
its explicit seed and fresh Havok module, and results are sorted and checked for missing or
duplicate indices before selection. Worker count is deliberately absent from checkpoint
semantics. A 1-generation real-Havok bracket produced the same report and champion digest
at 1, 4 and 8 workers (`101d67ff...5c407ab1`), in 18.371, 12.779 and 10.639 seconds. That
small bracket includes eight serial validation/control/test bouts, so its 1.73x end-to-end
speedup is a conservative lower bound for the training-dominated default; the observed
training portion projects roughly 18--38 hours per default run, to be measured rather than
promised by session 13. The default experiment remains the input to session 13's three-run
promotion decision; this session does not promote or register its smoke checkpoint.

The forced-option lifecycle repair superseded `baseline-v1.json` explicitly. The preserved
old file has SHA-256 `77b09b520380041a7f56671e8b97d70e53228f74c4b4d2d7d6055c80e4d2e877`;
the replacement has SHA-256 `810beb2fe6533743e786e14bd1c3aa084dfe11f73451f1697941729f7d0f32f6`.
A recursive field comparison found exactly 24 changed leaves and no others: the matching
`behavior.attackAttempts` counter for cut, thrust, punch and shoot, for mirror 0 and mirror
1, in each of train, validation and test. These counters now count each attack-option entry,
including re-entry after completion, instead of only a selected-name transition. Outcomes,
duration, damage, vitality, intents, controls and every ordered-parity field were unchanged.
An exact seed-20260827 evaluation against the replacement passed.
