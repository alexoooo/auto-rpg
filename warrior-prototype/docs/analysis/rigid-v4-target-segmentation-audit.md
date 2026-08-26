# Rigid-v4 target segmentation and broad-form audit

> Superseded for active experiments by
> [rigid-v5](rigid-v5-cardinal-segmentation-and-sprint.md), which corrects the
> cardinal/diagonal source-routing bug and freezes a consistent ontology. This
> document remains the immutable rationale for experiment 0085.

## Decision

`rigid-v4` is the first similarity profile whose structural and material masks
come from the target concept rather than from the accepted candidate's object-ID
render. It is frozen as a coarse phase-04 ruler after an all-eight-view review.
It does not rewrite rigid-v2 or rigid-v3 evidence, and the resulting absolute
scores must not be compared across profiles.

The accepted source did not change during this ruler transition. Its full v4
baseline is `0.8728686848085476`. This number is ruler movement, not an asset
regression.

## Why another profile was necessary

The broad body screen exposed a decisive flaw in rigid-v2/v3. Those profiles
bootstrapped their fine structural masks from the accepted candidate. Any
meaningful geometry change was therefore penalized for ceasing to resemble the
old geometry, even when it moved toward the concept. Under rigid-v3 classical
scoring, every broad proportion variant was worse than the accepted control:

| variant | rigid-v3 classical |
| --- | ---: |
| accepted control | 0.483631 |
| tall/narrow | 0.614857 |
| broad/compact | 0.588822 |
| heroic | 0.583659 |

The landmark term was identical for all four, while the inherited structural
term supplied most of the punishment. That is evidence of an objective-function
error, not evidence that all three large forms were worse.

## How the masks were made

The two concept sheets were passed through the built-in image-generation tool
as semantic-paint proposals. The prompts asked for a pixel-aligned flat-color
segmentation overlay, with one constant color per anatomical/equipment region,
no gradients, no relighting, no new detail, and the original sheet layout and
silhouette preserved. The generated proposal images are retained at:

- `metric/reference/proposals/warrior-angles-cardinal-imagegen.png`
- `metric/reference/proposals/warrior-angles-diagonal-imagegen.png`

They are suggestions, not scoring truth. Generated gradients and small boundary
drift made direct use unsafe. `metric/prepare_v4_reference.py` instead combines
their color fields with the original target silhouette, reviewed equipment/head
polygons, and target landmarks. It then applies deterministic region assignment,
left/right splitting, lower-leg cleanup, and the frozen registration transform.
The script reads no `.review` candidate evidence.

The resulting eight structural and material masks were inspected at full-frame
resolution. They are intentionally coarse: they identify the major silhouette,
armour, limb, head, shield, and sword regions, but do not claim pixel-perfect
fingers, engravings, or mail links. That limitation belongs in the interpretation
of local scores.

## Falsification result

The same four geometry renders were rescored under rigid-v4 without changing
their pixels:

| variant | v4 classical | delta from control |
| --- | ---: | ---: |
| accepted control | 0.792018 | -- |
| tall/narrow | 0.770809 | -0.021209 |
| heroic | 0.782251 | -0.009767 |
| broad/compact | 0.828776 | +0.036758 |

This ordering is coherent with the concept: the accepted model is visibly
squat, moderate vertical extension helps, and making it broader hurts. The
tall/narrow finalist also improved the full score from `0.8728686848085476` to
`0.8642787573879791`, a delta of `-0.008589927420568522`. Formal experiment
0085 replicated that screen and accepted the exact root transform.

That gain is not uniform. Mean structure improves about `-0.04416`, silhouette
`-0.00420`, and material appearance `-0.00408`; global neural appearance
regresses about `+0.02561`, and region neural appearance regresses about
`+0.01304`. Back, back-left, back-right, front, and left improve, while both
front diagonals and right regress. The result is therefore a valid broad-form
hypothesis, not proof that uniform root scaling is a final authored body.

## Contract for phase 04

- `rigid-v4` is immutable after this review.
- Its source is target proposals plus target annotations only.
- Candidate region IDs still come from exact authored object ownership.
- Absolute scores from rigid-v2, rigid-v3, and rigid-v4 are not cross-comparable.
- A v4 baseline transition is never credited as accepted asset progress.
- Formal candidates must improve the v4 aggregate and structural terms while
  bounding neural and view-specific regressions.
- The next metric improvement is manual boundary correction, not another
  candidate-derived bootstrap.

## First formal result

[Experiment 0085](../../experiments/archive/phase-04/README.md)
accepted the `.91` X / `1.10` Z floor-pivoted whole-warrior transform. Five of
eight views improved, led by back (`-0.03150`), back-right (`-0.01415`), and
front (`-0.00976`). Both neural appearance means regressed, but their average
remained within the preregistered budget and the all-eight visual review found
no stretch or contact defect. The next sprint must author form inside this
improved envelope rather than treating more root scaling as an open family.

## Reproduction

```powershell
npm run similarity:v4:prepare
$env:WARRIOR_REFERENCE_PROFILE='rigid-v4'
.\metric\.venv\Scripts\python.exe metric\score_v2.py --classical
```

The prepare command deliberately refuses to overwrite an existing profile.
Delete-and-regenerate was allowed only before the frozen review recorded here.
