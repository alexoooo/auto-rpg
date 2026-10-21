# Separate items and persistent grips

What a separately simulated item (`src/core/equipment.ts`) and its grips are, and the mechanical
fixtures that check them. An item has a caller-assigned identity, sourced mass, inertia and shapes,
and named rigid grip frames registered at construction. Compound holding stays the game's default.

## Attachment and replay

- A grip slot is registered whether or not its fixed joint exists; attaching creates the joint,
  releasing removes it. Neither writes pose, velocity or mass. An overlapping pair stays excluded
  until clearance ([grip clearance](grip-clearance.md)).
- Capture checks world anchor distance and orientation error, `1 - abs(dot(q1, q2))`, against the
  task's tolerances; out of range it returns false. It keeps the hand's desired local frame and
  derives the item's attachment frame from the current pose, so accepting a tolerance asks no
  alignment. Bodies captured at different velocities can take a constraint impulse the next step.
- Observation is detached: pose, velocity, spin, attachment errors, the actual `attachment` frames
  (null when detached), `collisionSuppressed` and contact readings; no engine handles. Dynamics uses
  the actual anchors.
- A grip is ideal and rigid: no break force or disarm rule, and no assist.
- The adapter (revision 4 onward) saves node poses, grip handles, release exclusions and the
  solver snapshot, captured frames included; loading checks membership and endpoints first. Adding
  or deleting a slot changes topology and invalidates an older snapshot.

## Policy commands

`equipmentPort` grants a host's controller named grips on explicit items; its model holds detached
mass, inertia, grip frames and capture tolerances, and its observations only the granted items.
Duplicate grants or identities are refused. `createPolicyBody` takes the port at construction and
gives the policy its description and observations, never the port or handles. A `BodyAction` may
combine actuation and grip requests; `checkedBodyAction` validates the whole before any command, so
one ungranted, duplicate or malformed request rejects all of it. Permission does not make an
unreachable capture succeed.

## Anatomical placement

`equipHands` (`human/equipment.ts`) places initial separate equipment with the compound `handHolding`
frame: the item's origin at the little-finger end of the grasp, an item-local offset for each
registered hand. Only the primary hand starts attached; registering the other neither moves nor
captures. Hands must be stationary and hold no compound equipment.

## Measurement

Node, NullEngine scene, core World, Rapier `.3`, adapter 4, 120 Hz, directional, no assists. Two
synthetic 1 kg holders (centres `[-0.1, 1, 0]` and `[0.1, 1.2, 0]` m, 0.035 m spheres, moments 0.001
kg m²) and the sourced `woodenClub()` at `[0, 0.9, 0]` m, gripped 0.1 and 0.3 m along it; capture
tolerances 0.002 m and 0.00001. The closed loop joins the holders at their midpoint with three
limited angular freedoms, fixes the left one, and applies 0.2 N s to the item after either release.
`node --test tests/core-equipment.test.mjs`:

| Check | Result |
|---|---|
| One item, two holders, either release | Total mass within 1e-6 kg; total linear momentum within 1e-5 N s; remaining grip within 1 mm after 120 steps; released holder separates |
| Release and regrip replay | Exact observations in place, through handle reuse, and in a fresh equivalent world |
| Unreachable capture | Position and orientation refusals leave pose and velocity unchanged |
| Pose-preserving capture | A stationary grip with 0.02 m and 0.05 rad desired-frame error retains pose and zero velocity within 1e-6 through 120 steps; native captured frames survive release/restore and fresh-world replay |
| Free item contact | Released club contacts the floor with stable item identity and valid original shape indices |
| Closed loop | Both attachments within 1 mm; after either release the remaining attachment stays within 1 mm; exact branch replay |
| Incompatible topology | Refused without modifying the live snapshot; disposing the extra slot restores compatibility |

- Dropping the engine's joint-removal call while keeping the logical release fails the tests.
- The pose-preserving case (tolerances 0.03 m and 0.001): joining the desired frames instead moves
  the holder's x from 0.1 to 0.107210085 m and fails.
- `tests/core-equipment-policy.test.mjs`: capture and release through a policy, atomic invalid
  actions, duplicate identities, exact replay; both hands of all three models capture and the left
  releases (short, gravity-free, pinned-body fixtures).
- `tests/core-hand-equipment.test.mjs`: both hands of all three models against the compound club's
  tip, mass, release continuity and replay. Loaded: two clubs, gravity, pinned pelvis, independent
  feedback (0.05 s, 3 rad/s cap, full activation); elbow goals 0.6/0.4 rad reached within 0.025 rad
  at 2 s and held at 3 s, grip errors under 2 mm. The bare reach fixture's 0.1 s constant leaves the
  Warrior's loaded left elbow 0.027 rad short. The Rogue's clubs meet during the hold; self-collision
  stays on.
