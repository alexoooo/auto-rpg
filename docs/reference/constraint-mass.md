# Effective contact mass with shared equipment

`build/constrained-mass.ts` computes instantaneous impact mobility in maximal coordinates (six
velocity freedoms a rigid body, homogeneous velocity constraints), so a shared item counts its mass
once. Its relative rank tolerance is a numeric setting recorded here. It is a diagnostic that
allocates; the game's damage path uses the tree model (`contactMass`).

## The model

- Each constraint is whitened by inverse square-root mass and principal inertia; dependent rows are
  removed by two-pass modified Gram–Schmidt with strongest-row pivoting; impulses are projected
  onto the remaining freedoms. This is the constrained inverse mass, not a penalty spring.
- **Rank tolerance**: 1e-10, relative to the largest original whitened row length, a numeric
  setting. Duplicate constraints do not make an item heavier; the second pass limits roundoff on
  nearly dependent rows. The report gives supplied rows, rank and remaining freedoms.
- `build/articulated-mass.ts` supplies the anatomical joint rows and each item's active grip rows,
  each joint about the mean of its anchors on its current axes. A common point keeps common rigid
  rotation free when the solver leaves an anchor gap; the
  [moving-loop check](coupled-dynamics.md) rejects separate-anchor rows.
- As `contactMass` does, it leaves joints and limits free, floats the body, and omits ground,
  motors and actuator response. Fixed engine bodies are not fixed here unless declared.
- Pose and attachments are read at `update` and held until the next. Equipment gives its rows to
  trusted model code, never to a policy's port.

## Measurement

Node core world, Rapier `0.21.0-auto-rpg.3`, directional configuration, no gravity, ground, motors
or assists; `node --test tests/core-constrained-mass.test.mjs`.

Two 1 kg holders (isotropic inertia 0.001 kg m², centres (-0.1, 1, 0) and (0.1, 1.2, 0) m) are
joined by a free spherical joint at (0, 1.1, 0); the wooden club's origin is at (0, 0.9, 0), held by
rigid grips at item y = 0.1 and 0.3 m. Holders have no colliders. An impulse (0.04, 0.08, 0.1) N s
acts on the item at (0.05, 1.4, 0.08) m; velocity is read after three steps at 3840 Hz.

| Released grip | Independent rank | Effective mass along impulse, kg | Predicted velocity, m/s | Measured velocity, m/s |
|---|---:|---:|---|---|
| None | 12 | 2.467271 | (0.019969, 0.014619, 0.053272) | (0.019942, 0.014580, 0.053271) |
| Left | 9 | 2.043242 | (0.050393, 0.028359, 0.045250) | (0.050182, 0.027881, 0.045257) |
| Right | 9 | 1.372930 | (-0.071972, 0.032290, 0.134063) | (-0.071905, 0.032309, 0.134052) |
| Both | 3 | 0.868048 | (-0.163929, 0.082711, 0.206764) | (-0.163767, 0.082699, 0.206710) |

- Each component is within 1.5 % of the predicted velocity's magnitude; all four branches replay
  exactly. Making equipment return no constraint rows fails the loop tests.
- Against the tree model, on the Warrior, the Rogue and the skeleton with a compounded right-hand
  club, every segment's mobility agrees within 1e-6 × (1 + entry) at construction (largest
  1.4932e-7, the skeleton's left hand) and within 1e-5 after a hand impulse and 12 steps at 120 Hz
  (largest 1.8957e-6, the Rogue's right hand), where the two anchor conventions part. All three
  report 41 free speeds: six root and 35 joint freedoms.
