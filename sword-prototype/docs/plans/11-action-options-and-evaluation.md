# Session 11 -- actions a learner can compose

## Outcome

Extract short action-specific policies behind one option interface, add a scripted
meta-controller that reproduces current tactics, and build a reproducible evaluation record
that can distinguish winning from interesting behaviour before learning begins.

## Implement

1. Add `src/options.ts`, pure and Node-loadable, with this boundary:

   ```ts
   export type OptionName =
     | "close" | "disengage" | "cover" | "cut"
     | "thrust" | "punch" | "shoot" | "recover";

   export interface CombatOption {
     readonly name: OptionName;
     enter(view: FighterView): void;
     decide(view: FighterView, dt: number): Intent;
     done(view: FighterView): boolean;
   }
   ```

   Options return ordinary `Intent` and may use the posture layer. They cannot reach a
   `Fighter`, joint, body, weapon or `CONFIG` through a mutable back door.
2. Extract the reusable strokes/guards/range movement from `src/policies.ts:630-1490` into
   option factories. Keep geometry helpers shared; do not paste a second cut implementation.
   Unsupported options refuse by name (`shoot` without bow, `punch` without an empty hand).
3. Add `scriptedMetaMind` that selects options with rules matching current `duelist`/`archer`
   decisions. Keep the old policies during this session as controls. A parity harness feeds
   identical synthetic views to old and option-based versions and records every difference.
4. Define a compact factual feature writer in `src/learning/features.ts`: normalized measure
   and closing rate; self/opponent vitality; per-hand kind, lost, reach and tip speed; threat
   bearing/speed; posture; and clock fraction. Version and name every column. No renderer or
   cosmetic value is reachable.
5. Add `scripts/evaluate-options.mjs` using the headless recipe in `scripts/measure.mjs`.
   Its fixed, mirrored cells cover every loadout and policy, train/validation/test seeds from
   separate ranges, and emit JSON plus a readable table.
6. Record behaviour descriptors per bout: range-bin occupancy, chosen-option occupancy,
   transitions, attacks by hand/kind, blocks, crouch time, trunk-twist sign changes, damage,
   vitality, win and time. Accumulate events directly; do not infer them from the 24-entry
   combat log.
7. Add `npm run ai:evaluate`. Check in a small baseline JSON under
   `asset-src/learning/baseline-v1.json`; it is evidence and versioned input, not a golden
   hash to overwrite on surprise.

## Tests that must exist first

Add `tests/options.test.mjs`:

- `every_option_returns_a_complete_bounded_intent`
- `an_option_refuses_a_loadout_that_cannot_perform_it_by_name`
- `the_scripted_meta_controller_matches_the_policy_it_replaces`
- `feature_columns_are_total_finite_and_versioned`
- `mirroring_a_view_mirrors_directional_features_and_preserves_scalar_ones`
- `the_behaviour_record_counts_events_instead_of_the_truncated_combat_log`

Delete one intent field, swap train/test seed ranges and sum from `Combat.log`; the totality,
split and event tests must fail.

## Acceptance

Run old and option-based controllers on the same seed. Session 11 is architectural: outcomes,
damage and option-equivalent actions should match within explicitly listed timing differences.
Every option must be reached by at least one corpus cell, and every feature must have a real
reader in session 12's network input.

```powershell
npm test
npm run check
npm run build
npm run measure -- --seed 20260823
npm run ai:evaluate -- --seed 20260823
```
