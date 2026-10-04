# Separate items and persistent grips

`src/core/equipment.ts` supplies a separately simulated item with a caller-assigned identity,
its sourced mass/inertia and collision shapes, and named rigid grip frames. A task owns the
identity namespace and registers all permitted grips during construction. Observation contains
detached pose, velocity, spin, attachment errors and collider-pair contact readings. It contains
no mutable engine handles. The trusted construction result also carries the body and node.

This is an experimental representation, not the game's equipment default. Existing compound
holdings remain unchanged. Character observation/actions, surface damage attribution for free
items, rendering, compound splitting and the representation comparison remain open.

## Attachment and replay

The engine registers a grip slot independently of whether its fixed joint exists. Attaching
creates the joint; releasing removes it and restores collision eligibility between those bodies.
Neither operation writes pose, velocity or mass. Equipment capture first checks world-space
anchor distance and orientation error, `1 - abs(dot(q1, q2))`, against explicit task tolerances.
An out-of-range request returns false. Capturing bodies with different velocities can produce
a physical constraint impulse on the next step; this is not an energy-free capture guarantee.

A grip is ideal and rigid, like the existing compound holding. It has no authored break force
or disarm rule. It is not an external weapon assist. Collision eligibility after release does
not guarantee geometric clearance; overlapped shapes may subsequently produce contact impulses.

Rapier adapter revision 2 saves node poses, registered grip handles and the solver snapshot.
Loading validates body/constraint membership and grip endpoints before replacing the live world.
The caller retains the same grip objects through release, reattachment and load. A registered
slot's deletion or addition changes topology and invalidates an older snapshot. Engine/task
configuration still has to match; the research environment enforces its complete identity.
The vendor artifact is unchanged. Adapter-1 environment snapshots are intentionally incompatible.

## Mechanical fixtures

Harness: Node, NullEngine scene, core World, vendored Rapier `.2`, adapter 2, 120 Hz, directional
actuation configuration, no assists. The fixtures contain two synthetic 1 kg holders and the
sourced `woodenClub()`. They do not model anatomical hands or claim actuator feasibility.

Holder centres are `[-0.1, 1, 0]` and `[0.1, 1.2, 0]` m. Each collider is a 0.035 m sphere;
principal moments are `[0.001, 0.001, 0.001]` kg m². These are engineering fixture choices,
not anatomy. The club starts at `[0, 0.9, 0]` m and is gripped 0.1 and 0.3 m along its frame.
Capture allows 0.002 m anchor error and 0.00001 quaternion error. A 0.5 N s impulse to one
free holder excites motion before release. The closed-loop case joins the holders at their
midpoint with three limited angular freedoms, fixes the left holder, enables gravity and
applies 0.2 N s to the item after releasing either grip.

`node --test tests/core-equipment.test.mjs` passes these six checks:

| Check | Result |
|---|---|
| One item, two holders, either release | Total mass within 1e-6 kg; total linear momentum within 1e-5 N s; remaining grip within 1 mm after 120 steps; released holder separates |
| Release and regrip replay | Exact observations in place, through handle reuse, and in a fresh equivalent world |
| Unreachable capture | Position and orientation refusals leave pose and velocity unchanged |
| Free item contact | Released club contacts the floor with stable item identity and valid original shape indices |
| Closed loop | Both attachments within 1 mm; after either release the remaining attachment stays within 1 mm; exact branch replay |
| Incompatible topology | Refused without modifying the live snapshot; disposing the extra slot restores compatibility |

Removing the engine's actual joint-removal call while retaining the logical release makes the
equipment tests fail. This checks physical release, not merely a changed attachment flag.

These tests do not validate tree-only inverse dynamics for a closed loop, effective contact mass,
muscle load distribution, CCD, compound release or standing two-handed use. Those are subsequent
physical gates in the control foundation.
