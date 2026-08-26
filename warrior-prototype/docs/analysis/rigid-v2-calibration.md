# Rigid-v2 calibration status

Rigid-v2 fixes candidate registration, adds visible structural and material
regions, and makes small regions measurable through fixed-context montages. Its
initial `0.15/0.25/0.10/0.15/0.20/0.15` weights are engineering priors, not a
claim that the scalar reproduces human judgment.

The full phase-01 render tree was deliberately removed during the phase close.
Its ledger preserves decisions and numerical summaries, but not the pixels
needed to compute new region tensors. Reconstructing target-similarity labels
from accepted/rejected status would train the new ruler on the old ruler and
conflate production failures with similarity. We therefore do not do it.

Phase 02 begins with rigid-v2 marked provisional. A candidate may be accepted
only when it clears the global and affected-region margins, keeps unaffected
regions bounded, and its record contains an explicit all-eight-view production
review. Ambiguous candidates additionally need a digest-pinned blinded A/B.
After 24 non-tied target and production labels, `metric/calibrate_v2.py` permits
the held-out fit. Until then there is deliberately no absolute stopping score;
the old `<= 0.10` target is retired.

This is a measured limitation, not unfinished plumbing: comparison records keep
the complete view/component/region tensor and formula identity so later fitting
uses the exact aggregate rather than a component-max surrogate.
