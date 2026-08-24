# Session 13 -- promote a behaviour, not merely a checkpoint

## Outcome

Train candidates, select one on held-out evidence, ship it as an optional setup policy and
show which action option it is choosing so emergent behaviour can be seen and argued with.

## Implement

1. Run at least three independent default experiments from session 12. Keep raw reports under
   ignored run directories; commit only the selected checkpoint, compact evaluation JSON and
   the exact command/provenance in `asset-src/learning/`.
2. Promotion criteria, all required:

   - no train/validation/test seed overlap;
   - held-out mirrored win score above scripted meta and random-option controls;
   - no loadout loses more than 15 percentage points against its scripted specialist;
   - at least three non-recover options each occupy 8% or more of decisions;
   - at least two transition motifs are more common than in the scripted baseline;
   - no non-finite intent, unsupported option, stuck option or post-verdict action.

3. Add `learnedMetaMind(checkpoint)` to `src/learning/meta.ts` and register `learned-v1` in
   `POLICIES` at `src/mind.ts:699-720`. Loading is local and synchronous from a generated TS
   byte module or validated JSON bundled by Vite; a corrupt/missing checkpoint refuses by
   name rather than silently using `duelist`.
4. Expose current option, persistence time and top three logits through a read-only mind
   diagnostic. Add it to the HUD only when the learned policy is selected or the readout is
   open; the display cannot feed back into the policy.
5. Extend `scripts/measure.mjs` and `scripts/evaluate-options.mjs` with `learned-v1`, including
   mirrored loadouts for sword, shield, axe, bow and bare hands. Record option transition
   examples with timestamps and surrounding factual features.
6. Update `README.md`, `docs/design.md` and `docs/measurements.md` with what actually emerged.
   Describe observed motifs, not intent attributed to a network. Include failures and
   loadouts on which the scripted specialist remains better.

## Tests that must exist first

Add to `tests/learning.test.mjs` and `tests/minds.test.mjs`:

- `the_shipped_checkpoint_matches_the_feature_and_option_contract`
- `the_learned_policy_replays_its_pinned_option_sequence_on_a_fixed_view_trace`
- `a_missing_or_corrupt_checkpoint_is_refused_by_name`
- `the_learned_policy_never_selects_an_option_the_loadout_cannot_perform`
- `diagnostics_report_the_decision_without_changing_it`
- `the_learned_policy_stops_on_the_bout_verdict`

Corrupt one feature name and make diagnostics call `decide` a second time; the contract and
non-interference tests must fail.

## Acceptance

Capture held-out tables and three visible bouts chosen before viewing their outcomes: one
melee, one bow and one bare-hand loadout. Name at least two action transitions that are absent
or materially rarer in scripted policies. If promotion criteria fail, land the trainer and
reports without registering `learned-v1`; a failed experiment is evidence, not permission to
lower the bar after seeing it.

```powershell
npm test
npm run check
npm run build
npm run ai:evaluate -- --seed 20260823 --policy learned-v1
npm run measure -- --seed 20260823
```

## Implementation record -- 2026-08-24

Three default experiments completed under run IDs `session13-20260823`,
`session13-777001` and `session13-991337`. Validation-only selection chose 777001. Its
full five-loadout test evaluation failed seven unchanged promotion gates, so this session
intentionally did **not** register `learned-v1` or bundle a checkpoint. Compact evidence is
`asset-src/learning/unpromoted-v1.json`; durable interpretation is in
`docs/measurements.md`.

The trainer exposed a two-bout test probe in every raw report before selection, so the run
did not achieve a pristine test quarantine even though the selector itself cannot read that
field. The final evaluator excluded that already reported cell and began at test cell 1.
This methodological failure is recorded rather than silently upgraded into stronger evidence.

The generic validated checkpoint loader, read-only diagnostics, conditional HUD,
five-loadout evaluator, explicit experimental `measure --checkpoint` route and hard-gate
tests landed. `the_shipped_checkpoint_matches_the_feature_and_option_contract` is
inapplicable until a candidate is actually shipped; inventing shipped bytes to satisfy its
name would violate the acceptance rule above. `npm run ai:evaluate -- --seed 20260823
--policy learned-v1` is likewise intentionally unavailable.

The three visible bouts remain open for session 14 because an unpromoted policy has no
honest setup-screen route. Before viewing any such outcomes, the bouts were fixed as melee
seed 291337/left, bow seed 291338/right and bare-hands seed 291339/left.
