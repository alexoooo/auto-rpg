# CC0 human base mesh spike

## Why

Eighty-seven experiments moved the asset a fraction of the way to the concept.
The largest single change ever made to it -- a complete authored torso-to-waist
subsystem -- moved the frozen `rigid-v5` classical distance by `0.005544`
against a control of `0.771220`, under one percent. The user judged the
primitive-authoring approach beyond reach and asked whether a human base mesh
was available instead.

## What was checked

| question | answer |
| --- | --- |
| official Blender Human Base Meshes | `v1.4.1`, 50.6 MB, CC0, on `download.blender.org` |
| MPFB2 | `v2.0.17`, released 2026-07-22, actively maintained, mixed licence |
| bundled Blender addons | `rigify` is present, so rigging is available |

The bundle was vendored under the ignored `.tools/`, so nothing about it is
committed and the spike is reversible.

## Result

`GEO-body_male_realistic` was appended, scaled to the accepted warrior envelope,
and rendered through the identical eight-angle review cameras and lighting.

![CC0 base mesh spike](../../experiments/progress/screens/cc0-base-mesh-spike.png)

The full sheet is in
[the screening frames](../../experiments/progress/screens/README.md).

| part | cage | detail |
| --- | ---: | --- |
| `GEO-body_male_realistic` | 10,582 verts / 10,590 quads | multires level 3 |
| `GEO-head_animation_realistic` | 3,242 verts | animation topology |

The cage is roughly 21,000 triangles against the accepted asset's 44,244, so the
body fits the existing budget with room for armour, and the multires stack is
what a normal-map bake would come from. The mesh arrives in a relaxed A-pose
rather than a T-pose, which is close to the stance the concept uses.

## What it does and does not settle

It settles anatomy. Correct proportions, a real face, and real hands are
supplied rather than authored, and judging those by eye was the specific thing
the primitive approach could not do. What remains is fitting armour to a known
surface, which is the deterministic part the `asset-src/v3` plate toolkit
already does.

It does not settle hair, which the base head lacks and the concept has; it does
not settle build, since this is a generic athletic male and the concept warrior
is heavier; and it is a rebuild rather than an increment, so the accepted
checkpoint and the frozen ruler stop being comparable the moment the body
changes. The agreed quality bar is game-camera read, not close-up hero detail.

## Reproducing it

```powershell
npm run asset:v3:spike:basemesh
```

The viewer shows the result at `?asset=basemesh`, beside `?asset=v3` for the
authored torso and the untouched control at no parameter.
