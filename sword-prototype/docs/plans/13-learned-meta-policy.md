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
