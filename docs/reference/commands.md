# Commands and standing inputs

**Purpose:** Name the current input vocabulary at the policy and host boundaries, and say which document owns each part of it.
**Status:** current
**Canonical source:** [`crates/sim/src/command.rs`](../../crates/sim/src/command.rs) and [`crates/sim/src/obs.rs`](../../crates/sim/src/obs.rs)
**Update when:** A standing input, an action registry entry, or the ownership split below changes.

<!-- DOC_CONTRACT: policy-observation -->
## Policy input and output

**Most of what it described is gone.** Until embodied session 10 this document owned
the legacy input vocabulary: a subject `Observation` with a contact list and a
954-column feature vector, a `Command` carrying exactly one `LimbCommand` with an
absolute angle and a `Strike`, and a loadout slot request. All of it belonged to
`CombatModel::Legacy`, which was deleted along with the model's fixtures, policies and
codec branches.

What replaces it is not one vocabulary but two contracts, each of which owns its own
bytes:

- **[The embodied command](embodied-command-v1.md)** — the payload a policy submits: a
  movement vector, a torso yaw, an intent, and per arm a bearing, a height, a reach, an
  effort, a grip request, a release request and a swing plane. It also owns the fact
  that a movement vector and an arm bearing are read **relative to the torso**, which
  the identical byte offsets do not show.
- **[The articulated ABI](articulated-abi.md)** — the observation a policy is given, its
  fixed widths, and everything published across the wasm boundary.

[Policy architecture](../architecture/policy.md) owns the seam itself: one `decide`
method, no `&World`, and why the two remaining models are separate traits rather than one
trait over an enum.

## Host standing inputs, and the fact that nothing perceives them

`Order` and `Objective` are set on the world by the host, not returned by a policy.
They are still hashed into `World::state_hash` and still recorded in a replay.

**This section used to add "and they are still refreshed into the navigation flow field
every tick". There is no flow field.** `World::refresh_nav` and its four readers were
deleted on 2026-08-18 for having no production caller: they rebuilt a breadth-first
distance field over the whole floor, per faction, per tick, and the last thing that ever
read a heading out of it — the legacy policy order adapters — had already gone. The field
was not hashed, being a derivation of the floor plan and the objectives, so deleting it
moved no pin.

**No surviving observation carries them.** `Order` reached a body through
`Observation::nav_dir` and `nav_distance`, which were columns of the deleted legacy
observation; `ArticulatedObservation` has neither an order column nor a navigation one.
So a standing order is an input the simulation carries and no body can
perceive — which is why the browser's click-to-move exports were removed rather than
left drawing a marker the fighter ignored.

**Ordered movement is therefore not implemented, and restoring it is three pieces of
work in this order.** First a navigation column on `ArticulatedObservation`, which is a
mechanic and not a plumbing job: somebody has to decide what a jointed body *knows* about
a route it has not walked, and the answer is what the column's width and blur are.
Second a route source to fill it — the deleted field, or anything else that answers "which
way from here"; `World::set_order` is where the sim would call it, and the epilogue is
where it used to be rebuilt. Third a policy that steers on it.
[Navigation and visibility](../design/navigation-visibility.md) records what the deleted
field did and what the browser half of the channel looked like before it was removed, so
none of that has to be rediscovered.

## Actions and loadouts

`ActionKind` is an append-only registry and its codes are what a saved configuration or
a replay carries. `Role` says whether an action guards or strikes.

**A loadout is no longer a free choice.** On a body with articulated columns, every
loadout slot must name an action the scenario's equipment table carries a row for --
`validate_rows` refuses the pair otherwise, and `Scenario::fingerprint` runs that check
before it hashes, so a mismatched loadout is a scenario with no identity rather than a
scenario that fights oddly. The shipped fixture table has three items: a sword, a shield
and a club. That is the whole set of things a body can currently hold, and it is why
`ActionKind::Run`'s move bonus is a mechanic with no reachable subject.
[Combat specs](combat-specs.md) owns the table.

## Source anchors

- The submitted command grammar: [`crates/sim/src/command.rs`](../../crates/sim/src/command.rs)
- Subject-scoped observation: [`ArticulatedObservation`](../../crates/sim/src/obs.rs#L353), [`World::observe_articulated`](../../crates/sim/src/world/query.rs#L285)
- Action roles and append-only registry: [`Role`](../../crates/sim/src/action.rs#L28), [`ActionKind`](../../crates/sim/src/action.rs#L116)
- Loadout shape: [`Loadout`](../../crates/sim/src/loadout.rs#L18)
- Standing inputs: [`Order`](../../crates/sim/src/command.rs#L670), [`Objective`](../../crates/sim/src/command.rs#L773)

## Superseded DESIGN sections

`DESIGN.md#what-the-agent-can-see-layout-versions-7-through-9` described the feature
vector an agent was given: 450 columns under layout version 7, growing to 13 as the
articulated and embodied blocks were appended. **There is no vector.** Embodied session
10 deleted it with the legacy `Observation` it was a method on, having established that
nothing in the workspace read it -- the learning interface that ships builds its own
columns from named fields of `ArticulatedObservation`, and is pinned separately. That
section is history about a shape, and this page is where a reader looking for the
current input contract is sent instead.
