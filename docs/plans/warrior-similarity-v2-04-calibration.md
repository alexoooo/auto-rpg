# Session 04 -- human calibration and historical rescore

## Outcome

Demonstrate that formula v2 predicts held-out human target-similarity choices
better than formula v1, establish the attainable reference floor, and publish a
calibrated acceptance margin and stopping band.

## Implementation

- Rescore the phase-01 accepted checkpoint and every archived baseline/candidate
  render for which immutable evidence exists before session-01 cleanup; if a
  render is absent, regenerate only from its archived source when hashes prove
  identity.
- Collect blinded randomized A/B labels across accepted changes, null changes,
  protocol false negatives such as 0057, and numeric-but-production-invalid
  candidates such as 0012, 0031, 0047, 0059, 0062, 0068, and 0072.
- Store the full `[view][component][region]` tensor with each comparison. Fit the
  exact aggregate rather than a component-max surrogate; reject mixed formula
  versions.
- Separate labels for target similarity and production coherence. Use held-out
  experiments and leave-one-region-family-out validation with bootstrap
  confidence intervals.
- Measure harmless-transform repeatability and cross-sheet same-design distance.
  Replace `0.001` and `<=0.10` only when those measurements justify successors.
- Publish the calibration in `docs/analysis/` and freeze `rigid-v2` weights,
  annotations, model hashes, and decision bands.

## Verification

Formula v2 must outperform v1 on held-out target-similarity ordering and must not
rank the known visual shortcuts as unqualified production wins. If it does not,
the session remains open and no asset experiment uses v2 for acceptance.

