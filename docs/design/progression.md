# Progression design

**Purpose:** Explain the current floor-to-floor loop and why progression remains outside the fight simulation.
**Status:** current
**Canonical source:** [`Scenario::dungeon`](../../crates/sim/src/scenario.rs#L391) and browser [`Sim`](../../crates/web/src/lib.rs#L1938)
**Update when:** Dungeon depth, portal opening/arming, descent, persistent hero state, or progression ownership changes.

## What the simulation does not know

`sim` models a fight. `World` has no run, level number, victory portal, inventory
campaign, reward, or transition to another scenario. Keeping those concepts out
lets the lab drive the same combat core without inheriting a browser game loop.

`Scenario` may carry a generated portal point because the dungeon generator is
the authority that knows the room furthest from the entrance. That point is data
for a host. `World::new` does not retain it, `World::step` never acts on it, and
walking there has no simulation meaning. The point contributes to
`Scenario::fingerprint` because changing a destination used by a driver changes
the setup; it does not contribute separately to `World::state_hash` because it
never enters `World`.

Torches make the contrast explicit. They are presentation decoration carried
out of generation for the browser and omitted from both `World` and the scenario
fingerprint. See [Hashes](../reference/hashes.md) for the current fingerprint
coverage and its known loadout omission.

## A floor is a pure input, not persistent world state

`Scenario::dungeon(seed, depth, hero_spec)` deterministically builds one floor.
The seed and depth choose the plan and roster through separate counter-based
streams, so retuning monster selection need not recarve the dungeon. The hero
spec supplies the body, stats, and loadout that enter at the generated start.

Depth also raises opposition within a capped curve and changes roster mix. Exact
counts and thresholds belong to the scenario code and its tests rather than to
this rationale document. Generation tests assert that the same seed/depth pair
returns the same scenario and that placements remain walkable.

Each descent constructs a fresh `World`. Entity handles, commands, projectiles,
door state, navigation caches, and combat damage belong to the floor being left.
They do not migrate between worlds.

## The browser owns the run

The current shipped run loop lives in the browser crate's `Sim`, above `World`.
It owns depth, the unopened generator exit room, the live portal, last kill and
hero-fall positions, the arming flag, hero and spawn templates, remembered fog,
route convenience, traces, flashes, and run events. These fields sharing a wasm
module with `World` does not make them simulation authority.

When a floor opens, `Sim` sets the hero objective to interpret destination
orders and the monster objective to hunt. Objectives are ordinary hashed world
inputs; the choice to install these defaults belongs to the host.

## Opening and taking the way out

There is no visible exit while monsters remain. Once a floor has no living
monsters, the browser opens the way out at the most recent kill, moved to ground
wide enough for the largest current body. If there is no kill position, the
generator's exit room is the fallback. A scenario with neither remains without
a way out.

Opening is a state rule rather than an edge detector: “the floor is clear and no
portal exists.” That also handles an already-empty fixture. Once opened, the
portal remains open even if the sandbox spawns another monster; the completed
clear is not undone by an editor action.

The portal opens where the last blow landed, which is often under the hero that
made it. It therefore starts disarmed. The hero must first stand clear before
overlap can trigger descent. Without that flag, killing the last monster would
change floors immediately and erase the room before the player could see the
win. Portal overlap uses body geometry; arming supplies the game-state meaning.

## What persists through descent

Before creating the next scenario, the live hero wins over the stored template:
its current body, stats, and loadout are copied into the next hero specification.
The new `World` spawns that specification at full health with a fresh regeneration
budget. Current progression therefore preserves character configuration, not
injury or combat phase.

The browser then replaces floor-owned presentation state: torches, unit handle
lists, portal and kill/fall positions, route, flashes, traces, event feed,
decision caches, map/furniture revisions, and fog memory. The descent event is
emitted only after the old event feed is cleared, so it names the depth just
entered and the portal just left.

The waypoint queue is discarded because its coordinates describe the old floor.
This is another reason it belongs in the host: `World` carries one standing
order per faction, while a multi-point route and its lifetime are game-loop
convenience.

## Progression is not combat termination

Clearing a floor, opening a portal, and descending are host progression. Death,
a health decision at a tick limit, or a draw are fight outcomes owned by
`World`. The browser may use world events and alive counts to decide progression,
but the causal direction is outward: progression observes the fight and selects
the next scenario; it is never fed into the combat rules as hidden state.

This distinction also bounds replay claims. The current in-memory `sim::Replay`
replays one scenario's commands, orders, and objectives. It does not encode the
browser's portal state, templates, edits, descent events, or a multi-floor run.
A durable run format remains future work; current replay limitations are listed
in [Replay and hashing](../architecture/replay-hashing.md).

## Superseded DESIGN.md headings

This document is the proposed compatibility destination for the progression
part of `What the sim does not know`. Its navigation and route ownership parts
remain better served by [Simulation architecture](../architecture/simulation.md)
and [Browser runtime](../architecture/browser-runtime.md). The termination rules
formerly adjacent to progression belong in [Combat design](combat.md#rules-that-exist-for-termination-not-for-flavour),
because they end a fight rather than advance a run.

A future short `DESIGN.md` compatibility entry for
`#what-the-sim-does-not-know` should link here first, then to the two architecture
documents for order/objective and route ownership.

This is now the durable destination for the former
`DESIGN.md#what-the-sim-does-not-know` anchor.

## Source anchors

- Scenario portal ownership and exclusions: [`Scenario`](../../crates/sim/src/scenario.rs#L123)
- Pure dungeon construction: [`Scenario::dungeon`](../../crates/sim/src/scenario.rs#L391)
- Browser progression fields: [`Sim`](../../crates/web/src/lib.rs#L1938)
- Portal opening and arming: [`Sim::open_the_way_out`](../../crates/web/src/lib.rs#L2633)
- Descent and hero persistence: [`Sim::descend`](../../crates/web/src/lib.rs#L2819)
- Browser tick integration: [`Sim::advance`](../../crates/web/src/lib.rs#L3086)
