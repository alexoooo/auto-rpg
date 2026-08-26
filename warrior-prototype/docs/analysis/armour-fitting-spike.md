# Fitting armour to the CC0 base mesh

## The question

[The base mesh spike](cc0-base-mesh-spike.md) settled anatomy and left one thing
open: given a real body, is there a mechanism for putting armour on it that does
not reduce to authoring plate shapes from nothing? Authoring from nothing is
exactly what eighty-seven experiments showed does not converge.

## The answer

There is, and it rests on something the bundle already ships that the first
spike did not look at. Every body carries a sculpt face-set attribute, and it is
not decoration: it is a complete anatomical segmentation, 102 labelled regions
covering torso, abdomen, pelvis, upper arm, forearm, hand and every finger,
thigh, shin, foot and every toe, neck, skull, and the features of the face.

| body part | face sets | faces |
| --- | --- | ---: |
| torso | 1 | 704 |
| abdomen | 19 | 128 |
| pelvis | 18 | 168 |
| upper arm | 20 right, 21 left | 291 each |
| forearm | 11 right, 12 left | 285 each |
| thigh | 23 right, 24 left | 198 each |
| shin | 16 right, 15 left | 409 each |
| foot | 13 right, 14 left | 482 each |
| neck | 22 | 494 |
| skull | 17 | 2,026 |

That is the selection primitive armour needs, authored by the bundle rather than
guessed by us. A plate is then not modelled, it is derived:

    select the anatomy it covers -> relax the surface so it reads as forged plate
    rather than shrink-wrapped skin -> push it out over the padding beneath ->
    solidify it into real thickness -> cut its seams -> crease and bevel its rim

Armour built this way cannot float off the body, cannot intersect it, and cannot
be out of proportion, because its proportions **are** the anatomy. The design
work that remains is the part that is genuinely design: where each piece starts
and stops, how far it stands off the body, and how hard its edges are. Those are
three numbers per piece, and they are legible in the source.

## Result

Thirteen plates -- cuirass, gorget, fauld, and paired pauldrons, rerebraces,
vambraces, cuisses and greaves -- with no plate modelled by hand.

![Armour derived from the base mesh](../../experiments/progress/screens/armour-fitted-to-base-mesh.png)

The full sheet is in
[the screening frames](../../experiments/progress/screens/README.md). The top row
is the accepted control, which is where eighty-seven experiments finished.

| | triangles |
| --- | ---: |
| accepted control | 44,244 |
| body plus thirteen plates | 47,272 |

The whole figure derives from the 10,590-quad multires level 0 cage, so it lands
within a few percent of the accepted budget with no decimation.

## Two defects found and fixed rather than shipped

Both are visible in the working renders under `.review/v3/harness/`.

- **Seams followed the quad grid.** Clipping a plate to a height band by testing
  each face centre leaves a stair-stepped edge, because the boundary can only
  fall between whole quads. Plates are now cut with a real bisecting plane, and
  that plane is oriented along the limb rather than horizontally: the figure
  stands in an A-pose, so a horizontal cut across an arm is not a seam any
  armourer makes. The limb axis is read off the anatomy, not hard-coded.
- **Metal rendered as a silhouette.** The review world is nearly black, so a
  fully metallic surface has almost no diffuse left to catch and goes flat. The
  harness now sits at metallic `.80`, in the same family as the accepted asset,
  which solves the same problem at `.76`.

## What this does not settle

The head is bald, the hands and feet are bare, and there is no helm, no hair, no
weapon, no shield and no cloth, so the bottom row covers less of the figure than
the control row above it. The cuirass still reads a little soft -- relaxation
removes the anatomy but does not add a keel or a breastplate break, which is
authored detail the `asset-src/v3` plate toolkit can now add on top of a correct
body instead of in place of one.

Nothing here is scored. No experiment identifier was spent, the accepted
checkpoint and the frozen `rigid-v5` ruler are untouched, and no number in this
document may be compared with a `rigid-v4` or earlier absolute. The moment the
body changes, the accepted checkpoint stops being a comparable baseline at all;
that is a decision to take deliberately, not a side effect of a spike.

## Reproducing it

```powershell
npm run asset:v3:spike:harness
```

The viewer shows the result at `?asset=harness`, beside `?asset=basemesh` for the
bare body, `?asset=v3` for the authored torso, and the untouched control at no
parameter.
