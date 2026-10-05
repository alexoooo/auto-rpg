# Local per-point contact step

`build/contact-step.ts::predictPointContacts` predicts fixed-plane contact impulses through an
already updated coupled body/equipment model. The caller supplies bounded actuator torques,
known external loads, candidate points, inward normals, desired lower normal velocities and
the step duration. It returns detached data and applies no forces or impulses to physics.
It is a diagnostic model, not a controller or collision detector.

The model freezes contact lever arms during one velocity step. It removes each point's
centripetal material acceleration when predicting the velocity at that fixed lever arm.
Unit loads through the coupled model provide the contact mobility, retaining the body's mass,
joint coupling and declared internal constraints. Normal impulses cannot pull. Each tangent
pair solves its two-axis stopping impulse and projects it onto the friction disk, matching the
native per-point [projected law](contact-friction.md). Normal and tangent passes repeat from
zero impulse up to the caller's finite budget.

The final velocity is reconstructed independently from the mobility and accumulated impulses.
The report checks normal nonpenetration, complementary support, friction-disk bounds and the
tangent projection's fixed point. Status distinguishes convergence, iteration limit, residual
failure and nonfinite results. A failed candidate cannot justify an action. Convergence means
the local equations passed their checks; it does **not** establish agreement with an engine
during an impact or changing geometry. There is no implicit warmstart or state across queries.

## Transition fixture

Harness: Node core stand, `rapier-coordinate-coulomb`, package `.6`, adapter 7, 120 or 1920 Hz.
A free 1 kg box is 0.6 by 0.1 by 0.4 m, with principal inertia `[.02, .04, .04] kg m²`.
It settles for one second. The spin variants receive a vertical angular impulse of either sign
corresponding to 3 rad/s and advance one step. All trials then use known forces at the centre:

| Interval | Applied force | Intended physical condition |
|---|---|---|
| 0–1 s | ±7 N horizontal | Driven sliding |
| 1–2 s | zero | Friction stops the body |
| 2–3 s | ±3 N horizontal | Friction supports a sublimit load |
| 3–3.25 s | 15 N upward | Unload and lift away |
| 3.25–4 s | zero | Fall and strike the ground |

These are fixture loads, not a character assist or changed muscle strength. The two horizontal
magnitudes straddle the coefficient-0.5 gravity load; the upward force exceeds the weight.
The model receives the same known load that physics receives; its contact reactions are never
applied. Every query is checked to leave the physical save unchanged.

The fixture selects geometric box vertices within 1 mm of the lowest feature and within 5 mm
of the known plane. A positive gap allows closing at `-gap / dt`; penetration receives no extra
position correction. These explicit geometric assumptions are not general contact acquisition.
The numeric settings are 2,048 passes, impulse tolerance `1e-10 N s`, and velocity tolerance
`1e-7 m/s`. Friction is the engine contract's 0.5. All are caller inputs rather than anatomy.

Six trials cover both horizontal signs at both rates without initial spin, and both signs at
120 Hz with initial spin. All physical branches replay exactly. The model predicts sliding,
then sticking, supports the smaller horizontal load, and releases all support under the upward
load. In every case the body physically rises above 0.2 m and returns to rest near its 0.05 m
centre height. This is a free slab's transition, not anatomical recovery.

Maximum component error in **next-step velocity**, aggregated over signs:

| Rate and initial spin | Driven/coast/hold/lift linear, m/s | Angular, rad/s | Landing linear, m/s | Angular, rad/s | Landing rejected steps |
|---|---:|---:|---:|---:|---:|
| 120 Hz, zero | 0.000312 | 0.000072 | 0.006933 | 0.041513 | 0 / 0 |
| 120 Hz, ±3 rad/s | 0.003170 | 0.020155 | 0.006930 | 0.039369 | 0 / 0 |
| 1920 Hz, zero | 0.000093 | 0.000086 | 0.173597 | 0.397778 | 1 / 2 |

All pre-landing solves converge. Established-contact and lift validation requires error below
0.005 m/s and 0.025 rad/s, positive admissible support, the expected mode changes and the
physical endpoints. The 120 Hz landing checks require 0.01 m/s and 0.05 rad/s. The fine-step
landing is **not validated**: acquisition and substep differences remain, and some local solves
reach their budget with an unresolved tangential fixed point. Even a converged local landing
prediction need not match the engine. No between-rate physical conclusion is inferred from
these maxima. The runner retains samples at 120 Hz spacing; the durable
[record](contact-step.json) retains quarter-second samples, phase maxima, failed solves and
whole-branch observation hashes.

The tests also cover rotated normals/forces on an isotropic body, detached outputs, empty
contact sets, invalid inputs and singular mobility. Covariance uses known double-precision
loads rather than rotated impulses rounded separately into the engine's float32 velocity.
Suppressing friction fails the physical transition checks. Accepting every finite iterate
fails the reported-residual checks. The tests do not require an unsupported landing to remain
inaccurate if a future model improves it.

```powershell
node research/contact-step.mjs
node --test tests/core-contact-step.test.mjs
```

## Integration gate

The predictor remains allocating and outside `wholeBodyTracking`. It does not select candidate
surfaces, optimize muscle torques or predict moving-body impacts. Next combine validated
contact modes and their force variables with bounded actuator objectives, test coupled supports
and joint stops, and repeat the installed all-fours hold. Recovery entry follows that hold;
general landing and support acquisition remain separate gates.
