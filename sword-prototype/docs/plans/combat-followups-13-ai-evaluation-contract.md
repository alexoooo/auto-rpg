# Session 13 -- engagement is a promotion contract

## Outcome

Make "they run around inside attacking range and do nothing" a reproducible failure rather
than a browser impression. Every controller receives the same seeded cells and reports real
attack opportunities, conversion, contact, radial progress, orbit and inactivity. Draws and
long healthy retreats cannot improve a candidate's promotion result.

This session changes instruments and research scoring, not any policy or fight command.

## Implement

1. Add `src/learning/engagement.ts` with pure striker-specific `attackOpportunity()` and
   `EngagementRecord` reducers. Use published `FighterView` capability, reach, facing, relative
   velocity and combat events; never infer opportunities from a sword literal or render state.
   An opportunity is one episode, not 240 frame samples.
2. Extend `BehaviourRecord`, `behaviourRecord()`, `recordCombatEvent()` and
   `recordBehaviourSample()` at `src/options.ts:281-302` with first attack/contact times,
   opportunity/attack/contact conversion, radial and tangential motion, accumulated bearing,
   retreat outside reach, near-range progress drought and longest option occupancy.
3. Add `src/learning/research-matrix.ts` as the single immutable train/validation/test matrix.
   It names both mirrors, loadout, unit, opponent, actor/opponent seeds and bout cap. Extend
   `src/learning/evaluation.ts:45-61` so candidates and controls receive byte-identical jobs.
4. Add `scripts/evaluate-ai.mjs`; retain option-command parity under a renamed
   `ai:options` script and make `npm run ai:evaluate` use the engagement tournament reporter.
   Collect from `Combat` events and per-step views, not the truncated display log.
5. Replace `fitnessComponents()` at `src/learning/meta.ts:140-155`: a draw/loss receives no
   terminal success and elapsed survival cannot be positive fitness. Use terminal outcome as
   the primary tier, bounded vitality/damage progress second, and engagement only as a hard
   feasibility gate. Novelty remains a search aid and cannot change promotion.
6. Run the four shipped policies, scripted meta and random meta over train-only cells. Record
   the frozen threshold provenance in `docs/measurements.md` before any candidate trains.

## Tests first

Add `tests/ai-evaluation.test.mjs`:

- `draws_and_losses_receive_no_terminal_success_credit`
- `lasting_longer_without_damage_cannot_improve_fitness`
- `one_attack_spammed_every_decision_counts_as_one_attack_opportunity`
- `resting_weapon_contact_cannot_fabricate_repeated_blocks`
- `orbiting_inside_one_range_bin_is_reported_as_stall_not_engagement`
- `radial_closing_and_tangential_orbit_are_measured_separately`
- `viable_range_comes_from_the_capable_striker_and_body_profile`
- `every_candidate_and_control_receives_the_exact_same_seed_matrix`
- `a_good_mean_cannot_hide_a_completely_failed_loadout_or_unit`
- `novelty_cannot_change_the_promotion_verdict`
- `test_rows_are_absent_until_the_frozen_candidate_is_selected`

Extend `tests/options.test.mjs` so the behavior recorder counts event windows rather than frame
spam, and `tests/learning.test.mjs` so every split remains disjoint. Show each test failing by
restoring draw score 0.5, positive survival-by-duration, per-contact block counting, different
control seeds, pooled means, novelty in promotion and test rows during tuning.

## Acceptance

The report prints macro and worst-cell values plus raw rows. It must independently catch a
controller that orbits, attack-spams, contact-rattles, runs to the cap or sacrifices one
loadout. Existing fight records remain identical.

```powershell
npm test
npm run check
npm run build
npm run ai:evaluate -- --split train --seed 20260824 --write-engagement-baseline
```

