# Session 01 — close phase 02 and verify the ruler

## Outcome

Archive experiments 0074–0084, establish whether the largest atlas residuals
are geometry or ownership errors, and freeze a named successor profile before
new asset evidence begins.

**Status:** complete for the demonstrated ownership scope. Phase 02 is archived,
`rigid-v3` is frozen, and the detailed result is in
[the ownership/oracle audit](../analysis/rigid-v3-ownership-and-oracle-audit.md).

## Implementation

1. Extend `scripts/archive-similarity-phase.mjs` only if needed to archive the
   active 0074–0084 range as `experiments/archive/phase-02/`; preserve the
   terminal accepted source/report from 0032 and keep global next ID 0085.
2. Add `scripts/audit-region-ownership.mjs`. For every view it must compare
   reference visible IDs, candidate object ownership, and pixel area; emit a
   reviewed table under `docs/analysis/rigid-v2-ownership-audit.md`.
3. Correct only demonstrated ontology errors in a new
   `metric/reference/rigid-v3/` profile. Start with shield field/rim/boss and
   reject any change justified only by a high score. Keep rigid-v2 immutable.
4. Add `metric/oracle_v3.py` and fixtures that score:
   - identity target pixels through the pipeline;
   - a view-specific 2D cutout oracle, clearly labelled nonproduction;
   - the accepted 3D control;
   - cardinal-versus-diagonal sheet correspondences.
   The gap between the 2D oracle and one rigid object bounds projection and
   annotation error; it is not an asset candidate.
5. Generate vision-assisted structural masks only as proposals. Inspect and
   correct every visible boundary, especially occlusions and tiny regions.
6. Collect blinded labels for the clear 0075–0084 comparisons and update
   `docs/analysis/rigid-v2-calibration.md`. Do not infer a label from status.

## Required tests

- `unknown_visible_reference_id_is_refused`
- `shield_field_and_rim_ownership_matches_the_reviewed_contract`
- `an_identity_oracle_scores_zero`
- `a_view_specific_oracle_is_never_accepted_as_a_3d_asset`
- `a_profile_change_cannot_read_rigid_v2_experiment_evidence`
- `phase_02_archives_without_resetting_experiment_0085`

Show each new guard red before restoring it.

## Gates

```powershell
npm run similarity:test
npm run similarity:experiment:audit
npm test
npm run asset:validate
npm run asset:v2:validate
npm run build
```

Do not begin formal experiment 0085 until the reviewed ownership table has no
unknown pixels, the profile is frozen, and the accepted baseline is rescored
under that exact profile.
