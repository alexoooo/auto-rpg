# Humanoids in the golem framework

Choose **Human warrior** on either arena corner (also available in waves), then **Customize**
to select equipment or mix human and golem modules. The dungeon offers human presets and
main/off-hand equipment selectors before starting a run. A maul occupies both hands.
The bench lists human legs, torso, head and each anatomical-arm equipment pairing.

An anatomical arm has seven physical hinges: three shoulder axes, an elbow, forearm
rotation and two wrist axes. A bounded inverse-kinematics controller maps the existing
position controls and an optional hand quaternion onto these joints. The seventh axis
lets the solver choose elbow posture. Limits, motor torque and reach still apply:
full pose control does not mean an unlimited or infinitely strong arm.

Mouse placement and attack buttons use the same ownership system as other golems.
With **direct wrist** enabled, **Z/X** rolls the hand, **T/Y** bends it and **U/I** turns
it sideways. Without direct wrist, the policy controls orientation. Dungeon keyboard
movement and mouse facing remain independent; attacks remain automatic.

Human legs parameterize the existing biped and supported carrier. Human posture and
walking therefore use the shared movement system; this is not a new unsupported balance
simulation. The authored Human duelist uses the existing tactical executor and adds hand
orientation commands from the arm's published reach envelope. No learned model, action
layout or training pipeline is changed.

Human anatomy can be wounded. Held equipment has zero vitality contribution and parries
using its actual weapon kind. Severing remains module-level, and a severed hand no longer
parries. Empty hands are fitted fist terminals. Equipment choices are fixed for the run;
there is no new runtime inventory or item-swapping system.

The armoured warrior is a local CC0 skinned asset. Its bones follow achieved physical
transforms, including detached modules. CPU skinning keeps mesh picking and bounding
boxes aligned with that pose. Original golem art and module IDs are retained. See
[asset provenance and rebuilding](../public/assets/humanoid/README.md).

## Verification

`tests/humanoid.test.mjs` measures independent six-dimensional pose goals on both sides,
joint limits, all three manual rotation channels, loaded mirrored sweeps, steady-state
tracking while awake, second-grip engagement, walking, anatomy/equipment damage routing,
authored combat, deformed-mesh picking and disposal. These use real Havok under Node,
with the same fixed physics clock as the game.

The unloaded inertia-conditioning sweep is recorded beside `HUMAN_ARM_DRIVE`.
The loaded arm checks allow 30 mm hand-to-command stray after a moving sweep and settle,
and 0.08 rad joint error. These are tracking checks, not a claim that every requested pose
is reachable. The maul test requires an engaged second grip within 15 mm; null fails.
