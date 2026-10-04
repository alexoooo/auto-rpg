# Effective contact mass with shared equipment

`build/constrained-mass.ts` computes instantaneous mobility in maximal coordinates: six
velocity freedoms per rigid body, with explicit homogeneous velocity constraints. It whitens
each constraint by inverse square-root mass and principal inertia, removes dependent rows by
two-pass modified Gram–Schmidt with strongest-row pivoting, and projects impulses onto the remaining freedoms. This is
the constrained inverse mass, not a penalty spring. A shared item contributes its mass once.
The relative rank tolerance is 1e-10 against the largest original whitened row length, a numerical setting; duplicate
constraints do not make an item heavier. The second projection pass limits roundoff when rows
are nearly dependent. The report exposes supplied rows, rank and remaining freedoms.

`build/articulated-mass.ts` supplies anatomical joint rows plus each equipment item's active
grip rows. It uses each joint's current motion axes and the mean of its anchors as a common
point. This preserves common rigid rotation when the solver leaves a small anchor gap;
the [moving-loop acceleration check](coupled-dynamics.md) rejects separate-anchor rows. Like the existing
`contactMass`, the impact model leaves joint freedoms and limits free, floats the body, and
omits ground, motors and actuator response. Fixed engine bodies are not automatically fixed
in this model. This is an impact-mobility capability, not inverse dynamics or a proof of
motor-driven tracking. The game damage path still uses the existing tree implementation.

The pose and attachment set are read only at `update`. Queries retain that pose until the next
update; a restored physics snapshot followed by update reconstructs the same answer. Equipment
exposes constraint rows to trusted model code, not to the policy's observation/action port.

## Mechanical verification

Harness: Node core world, Rapier `0.21.0-auto-rpg.3`, directional configuration, no gravity,
ground, motors or assists. Two 1 kg holders have isotropic inertia 0.001 kg m² and centres
(-0.1, 1, 0), (0.1, 1.2, 0) m. A free spherical joint joins them at (0, 1.1, 0). The sourced
wooden club's origin is (0, 0.9, 0); ideal rigid grips join it to the holders at item y=0.1
and 0.3 m. These are mechanical test inputs, not anatomy. Holder colliders are absent to isolate
constraint response; the item retains its colliders.

An impulse (0.04, 0.08, 0.1) N s acts on the item at (0.05, 1.4, 0.08) m. The observed velocity
is read after three steps at 3840 Hz, before appreciable pose change, following the existing
tree contact-mass test's convention. No cross-rate physical conclusion is drawn.

| Released grip | Independent rank | Effective mass along impulse, kg | Predicted velocity, m/s | Measured velocity, m/s |
|---|---:|---:|---|---|
| None | 12 | 2.467271 | (0.019969, 0.014619, 0.053272) | (0.019942, 0.014580, 0.053271) |
| Left | 9 | 2.043242 | (0.050393, 0.028359, 0.045250) | (0.050182, 0.027881, 0.045257) |
| Right | 9 | 1.372930 | (-0.071972, 0.032290, 0.134063) | (-0.071905, 0.032309, 0.134052) |
| Both | 3 | 0.868048 | (-0.163929, 0.082711, 0.206764) | (-0.163767, 0.082699, 0.206710) |

Each velocity component is within 1.5% of the predicted velocity's magnitude. All four impulse
branches replay exactly. At 120 Hz, the separate topology test verifies release, restoration
and redundant-row invariance without advancing an impulse response. Mutating equipment's
constraint read to return no rows makes the loop tests fail.

For each of Warrior, Rogue and skeleton, every segment's mobility is compared with the existing
tree model, with a compounded right-hand club. At construction the matrix entry differences
are below 1e-6 times (1 + entry magnitude), with a measured maximum of 1.4932e-7 on the
skeleton's left hand. After a small hand impulse and 12 steps at 120 Hz,
they remain below 1e-5 on that scale; the two models use different anchor conventions when
the solver leaves a joint slightly stretched. The largest measured scaled difference is
1.8957e-6, on the Rogue's right hand. Directional mass uses the corresponding relative tolerance.
All three report 41 free speeds: six root freedoms plus 35 joint freedoms.

```powershell
node --test tests/core-constrained-mass.test.mjs
```

Anatomical shared-item placement, bounded actuator control, moving contacts, damage identity
and interactive cost remain separate gates. This allocating diagnostic implementation is not
installed in the reference controller's per-step solve.
The separate [coupled acceleration model](coupled-dynamics.md) now checks forces, internal joint
torques and velocity-dependent loads through a moving mechanical loop and either-hand release.
