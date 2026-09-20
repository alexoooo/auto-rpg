# Physical movement stabilization

2026-09-20. This change addresses startup, walking, stopping, and mouse-aiming wobble.

## Cause and implementation

The waist and neck used light intermediate bodies between serial motorized hinges. Solver
error in those links propagated into the heavier torso and head. Increasing motor ceilings
did not remove it. An isolated velocity servo worked, but the serial assembled body still rang.

The waist now joins the pelvis and trunk directly, with independent pitch and yaw axes. The
waist bearing remains a physical, severable part welded to the trunk. The neck column is welded
to the trunk, and a direct two-axis joint carries the head at the original pitch pivot. Head yaw
now shares that pivot. Masses and collision shapes are unchanged. Combined-axis tests verify
the pitch/yaw measurements against the actual relative quaternion on both headings.

`JointActuator` writes a finite-effort relative velocity motor. `JointServo` is a separate,
replaceable controller: target velocity plus position-error correction, with no integral term.
Havok solves the velocity error and opposing reaction inside the solver. A 10/s position
response settled without the residual ring seen at 20–40/s in the assembled body.

The direct waist needs less effort: lean/twist ceilings are 600/360 Nm rather than 1500/900.
The neck holding ceilings remain 42/10 Nm. Ram drive and follow are unchanged; recovery uses
100 Nm briefly so the stronger linkage does not carry the head into its joint stop. The torso
bench still measures physical follow-through, impact displacement, and recovery.

Arm commands are rate-limited relative to the shoulder, so moving the carrier does not consume
the arm's speed allowance. Construction-pose acquisition ramps over 0.2 seconds instead of
immediately clamping hanging arms onto the aiming envelope. Normal command rates are unchanged.

## Continuous control boundary

- Existing continuous `Intent` channels are unchanged for players and policies.
- Controllers own target generation; actuators own only physical motor output. Neither new
  class registers a callback that runs independently of its owner.
- A future low-level controller can replace servo calls with direct actuator velocity/effort-cap
  commands. The test exercises this replacement on the same physical bodies and constraint.
- There is no new animation or gesture requirement. Raw torque-policy integration is not added
  here; it can be implemented below the same controller boundary without changing body geometry.
- Severing disables the actuator before disposing its constraint. Later commands cannot re-arm it.

The position servos are used for the waist and neck. The follow-up below adds arm hinge
velocity assistance; existing wrist and locomotion motors remain. Walking already has bounded
acceleration; no second locomotion filter was added. Fully dynamic foot-driven balance remains
outside this change: the game retains its existing supported carrier.

## Measurements

Default biped, plain torso/head, blade/plate, real Havok, fixed 240 Hz, every body forced awake,
sampled after every solver step. An idle opponent is outside contact range. After four seconds,
the moving scenarios run for two seconds; aiming sweeps the normalized horizontal input at 2 Hz.
Numbers are maximum head tilt from upright, in degrees; there is no intentional posture input.

| Scenario | Previous implementation | Stabilized |
|---|---:|---:|
| Startup | 13.994 | 0.178 |
| Forward walking | 7.390 | 0.419 |
| Mouse sweep | 9.566 | 0.114 |
| Walking and mouse sweep | 25.904 | 0.414 |
| First 0.5 s after stopping walking | 16.684 | 0.245 |

The broader regression also reverses, strafes, turns, changes posture, and changes control
sources. It covers both sides, steady/jittered frames, wheel/multileg builds and a plated ram.
The default limit is 3 degrees; the heavy ram has a 5-degree limit with the same holding motor
and measured about 4.44 degrees. This preserves a visible effect of carrying more load.

Browser validation used actual keyboard/pointer events plus fixed simulation steps: walking
backward 1.9 m while aiming reached 1.33 degrees of head tilt. A screenshot alone cannot
demonstrate stability; the moving measurements are the acceptance evidence.

Run `node --test tests/golem-movement-stability.test.mjs tests/golem-idle-stability.test.mjs`
and the full repository checks. In-memory restoration of the previous implementation makes
the new default movement tests fail at 24.81 degrees without touching the development server's
watched source files.

Some older tests assumed a particular transient or wound distribution. The parry fixture now
publishes the velocity of the movement it simulates. The whip compares its driven speed with
its actual wrist rather than its unrelated initial fall. Wave carry compares each reported
module durability with the rebuilt module, rather than a health-bar drift bound fitted to old
fight outcomes; the production wave-carry rule is unchanged.

Final verification: TypeScript check and production build pass; 565 of 568 tests pass.
The three failing test identities also failed before this change: a source scanner matches a
comment in `wear.ts`, and two ram-post scoring tests fail. The ram failures have changed from
insufficient impact energy to no contact with the fixed post after the linkage/recovery change;
they remain unresolved, rather than evidence that ram impact behavior is unchanged. The
physical lunge bench and real ram combat tests pass.

## Follow-up: residual arm oscillation

The initial acceptance tests were too narrow: small sweeps returning to neutral and head tilt
did not catch a broad mouse sweep ending in a held arm pose. The hand could stay near its
anchor while the shoulder/elbow and heavy terminal continued rocking. This reproduced both
in the user's browser and headlessly; it was not stale code or a development-server issue.

The arm now uses bounded relative-velocity assistance at its yaw, shoulder pitch and elbow
hinges. Desired joint rates come from the existing continuous two-bone target. Assistance
fades out as commanded joint speed rises, preserving deliberate swings, and damps residual
motion during a hold. It does not impose another pose target or overwrite body velocity.
Each actuator is released when the arm becomes passive or is severed/disposed.

The regression samples every limb, forces bodies awake, changes input at 30/60 Hz rather than
at solver frequency, sweeps both vertical directions and holds the final pose. Disabling the
correction in memory makes the raised-pose tests fail with 1.44–1.46 m/s residual motion;
the corrected tests require less than 0.03 m/s after 1.5 seconds. A browser keyboard/pointer
replay measured 0.087 m/s after one second, versus over 2 m/s in the original reproduction.
The first constant-resistance attempt slowed cuts; the continuous rate-dependent version
passes those same stroke-speed and AI-exchange checks without changing their assertions.

Follow-up verification: TypeScript and production build pass; 569 of 572 tests pass, with
the same three unresolved failures listed above and no additional failures.
