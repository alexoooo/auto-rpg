# Separate items and persistent grips

`src/core/equipment.ts` supplies a separately simulated item with a caller-assigned identity,
its sourced mass/inertia and collision shapes, and named rigid grip frames. A task owns the
identity namespace and registers all permitted grips during construction. Observation contains
detached pose, velocity, spin, attachment errors and collider-pair contact readings. It contains
no mutable engine handles. The trusted construction result also carries the body and node.

This is an experimental representation, not the game's equipment default. Existing compound
holdings remain unchanged. Reference-fighter equipment control, surface damage attribution for
free items, rendering, compound splitting and the representation comparison remain open.

## Attachment and replay

The engine registers a grip slot independently of whether its fixed joint exists. Attaching
creates the joint; releasing removes it. If their shapes overlap, that pair remains excluded
until a geometric query finds clearance at the beginning of a later step. Otherwise collision
eligibility returns immediately.
Neither operation writes pose, velocity or mass. Equipment capture first checks world-space
anchor distance and orientation error, `1 - abs(dot(q1, q2))`, against explicit task tolerances.
An out-of-range request returns false. Capturing bodies with different velocities can produce
a physical constraint impulse on the next step; this is not an energy-free capture guarantee.

A grip is ideal and rigid, like the existing compound holding. It has no authored break force
or disarm rule. It is not an external weapon assist. The observation reports
`collisionSuppressed`, including the clearance interval after release. It applies to the former
grip pair only, has no timer, and cannot suppress a later impact after clearance.

Rapier adapter revision 3 saves node poses, registered grip handles, release exclusions and the
solver snapshot.
Loading validates body/constraint membership and grip endpoints before replacing the live world.
The caller retains the same grip objects through release, reattachment and load. A registered
slot's deletion or addition changes topology and invalidates an older snapshot. Engine/task
configuration still has to match; the research environment enforces its complete identity.
The vendor artifact is unchanged. Older adapter environment snapshots are intentionally incompatible.

## Mechanical fixtures

Harness: Node, NullEngine scene, core World, vendored Rapier `.2`, adapter 3, 120 Hz, directional
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

## Policy commands

`equipmentPort` grants a host's controller named grips on explicit items. Its model contains
detached item mass/inertia, local grip frames and capture tolerances. Its observations include
only granted items and grip names. Duplicate grants or two different items with the same identity
are refused. A task owns this identity namespace and gives each grip one command owner.

`createPolicyBody` accepts the trusted port at construction and gives the policy its immutable
description and observations, not the port or physical handles. Existing actuator actions still
work. A `BodyAction` can combine an actuator action and grip requests. `checkedBodyAction` copies
and validates every component before any physical command is applied. An ungranted, duplicate
or malformed grip request rejects the whole action, including any otherwise valid release or
actuation. Geometrically unreachable capture leaves the item detached; permission alone does
not make it reachable. Idle policies issue no grip requests; existing rigid attachments remain.

`tests/core-equipment-policy.test.mjs` checks capture/release through an independent policy,
detached observations, immutable construction options, invalid-action atomicity, duplicate
identities, and exact physics/controller replay. It also captures independent items at both
hands on all three body models and releases only the left. These are short, gravity-free,
pinned-body port fixtures with synthetic attachment placement. They establish neither a usable
anatomical grasp nor standing equipment control. Shared-item load dynamics and game integration
remain open. The separate CCD path is recorded in [collision CCD](collision-ccd.md).

## Anatomical placement

`human/equipment.ts` supplies `equipHands` for initial separate equipment. It uses the same
`handHolding` frame as compound equipment: the item's origin is the little-finger end of the
grasp, with explicit item-local offsets for each registered hand. Only the primary hand starts
attached. Registering the other hand neither moves it nor captures an unreachable item.
Construction requires stationary hands in the body's initial world and refuses a hand that
already contains compound equipment. Subsequent capture uses the existing physical grip API.

`tests/core-hand-equipment.test.mjs` checks both hands of all three models against the compound
club's anatomical tip position, total mass, release continuity and replay. Its loaded fixture
uses two separate clubs, gravity, a pinned pelvis and independent actuator feedback, under
directional actuation at 120 Hz. Left/right elbow goals are 0.6/0.4 rad; both reach within
0.025 rad at 2 s and remain within that tolerance at 3 s, with grip errors below 2 mm. These
are declared fixture tolerances, not game timing requirements. The feedback time constant is
0.05 s, speed cap 3 rad/s and full activation; anatomical muscle limits remain unchanged.
The bare reach fixture's 0.1 s constant leaves Warrior's loaded left elbow 0.027 rad short.

This is not a collision-free trajectory: the Rogue's clubs meet during the hold, and the
skeleton can have speculative head contact. Meaningful self-collision remains enabled. The
fixture demonstrates physically loaded independent items, not standing combat, a second-hand
capture route or a whole-body inverse-dynamics solution.
