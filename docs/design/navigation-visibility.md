# Navigation and visibility

**Purpose:** Explain why the floor, routing, sight, orders, and browser route have their current shapes.
**Status:** current
**Canonical source:** [`Dungeon`](../../crates/sim/src/dungeon.rs#L102), [`World::observe`](../../crates/sim/src/world.rs#L1676), and the policy order adapters ([utility](../../crates/policy/src/utility.rs#L511), [duelist](../../crates/policy/src/duelist.rs#L685))
**Update when:** Floor representation, collision, routing, visibility, order semantics, or route ownership changes.

## The floor plan

The dungeon is a grid of bytes at one world unit per tile. Collision, clearance,
ray casting, and breadth-first routing all have cheap, deterministic answers on that
representation. A bitset would save little on the shipped floor and add shifts and
masks to its hottest reads; bytes also leave room for tile kinds. Out-of-range space
is solid, so the boundary is ordinary masonry to every caller.

Corridors are three tiles wide. Two-wide corridors admit a Brute but do not let a
Brute and Fighter pass, turning opposing route fields into a hard deadlock. Corridors
are carved as square blocks because a one-tile inside corner can trap the largest
body just as effectively.

Collision uses closest-point-on-box resolution. An axis-first minimum penetration
rule needs an axis tie-break and creates mirror asymmetry at corners; separate axis
sweeps create cardinal pushes where the physical answer is diagonal. Shared faces
between adjacent solid tiles are culled because they are interior seams, not
surfaces. Movement is swept in substeps no longer than half a tile so a one-tile wall
cannot be crossed by knockback.

Uncarved rooms short-circuit interior collision, clearance, and sight. That is the
mechanical reason older flat scenarios retain their behavior and do not merely happen
to produce the same answer.

## Routing is authoritative information

The world owns the floor, so it owns the answer to “how do I reach that point?” An
observation publishes `nav_dir` and `nav_distance`; the policy still decides whether
to follow them. The field is a four-neighbor, multi-source BFS rebuilt when its goal
changes. Eight neighbors at equal cost would make a diagonal falsely cost one tile;
the straight-line shortcut supplies useful diagonals without a weighted queue.

`Objective` is an input channel like `Order`: it is supplied from outside, hashed,
and recorded in replay. It defaults to `None`, so a scenario that did not request
routing does not silently gain it. Monsters may route toward known heroes within a
bounded route distance; without the bound a whole floor converges into one opening
brawl.

## Sight and fog

Distance-only contacts once let fighters see each other through rock. They then
entered combat, abandoned the route field, walked directly into the wall, and stayed
there. `Dungeon::sees` fixes the authority error with one deliberately permissive
centerline ray. Walking is deliberately more conservative and checks a body's
flanks: seeing slightly around a corner is less damaging than committing a body to a
line it cannot occupy.

The sight test happens after the cheap range test but before the bounded contact
collector. Occluded allies are filtered too, because cohesion toward an ally through
a wall produces the same deadlock. A swing independently raycasts the segment from
the attacker to the impact point: “not seen” and “cannot pass through masonry” are
different rules.

`Dungeon::visible_tiles` answers regional sight. The browser folds current visibility
into per-floor memory and publishes unknown, remembered, and visible tiles; it does
not reconstruct fog from camera geometry. Solid boundary tiles are lit only from an
open visible neighbor, preventing light from leaking through a wall according to scan
direction. See [browser runtime](../architecture/browser-runtime.md#visibility-authority)
for publication ownership.

## Orders are a leash, not remote control

A live `Order::Goto` or `Order::Focus` controls the feet while hands and intent remain
policy-owned. The first implementation only consulted orders while marching with no
contact, which made clicks ineffective during a fight. The next replaced combat
footwork completely and used a one-tick arrival band; a shove re-armed the order and
pinned the fighter to the mark.

The current policy adapter blends its own footwork with a braking order vector. The
pull grows quadratically with distance, leaving room to circle near the mark and a
firm correction near the leash rim. Arrival is a limit rather than a latched event,
so there is nothing for knockback to undo. Utility and Duelist retain their distinct
braking laws; unifying them would be a behavior change, not a navigation refactor.

### Naming the quarry

`Order::Focus` existed in the enum, state hash, feature vector, and replay before
any shipped host constructed it. Making it real required three owners to agree.
The simulation seeds its route from the named living enemy and resolves the full
generational handle; the policy hard-locks that quarry only while it is visible;
and the host expires a dead quarry into a `Goto` at the hero's current feet. It
does not turn the order into free-roaming `Hold` and does not silently acquire a
different target. A recycled entity index must never inherit the lock.

The focus leash goes slack outside the weapon's ordinary spacing correction.
`FOCUS_SLACK` shipped at 1.5 because 1.0 put the pursuit rim exactly where
station-keeping crosses its preferred range: each outward spacing step re-armed
the inward pursuit step. `ActionMind::standoff` is required rather than defaulted
so the weapon's approach and station-keeping cannot quietly disagree. The policy
reads the action actually held, not the one requested during a swap.

The hard lock made the old `obedience` gene unread, but its positional genome slot
was deliberately retained. Removing the slot would renumber every later gene and
reinterpret stored genomes. Reusing it for a new behavior is a separately measured
decision, not a cleanup.

Focus changed values already carried by the frame rather than its layout. The
order discriminant already reported whether the lock was live, while the existing
order point slots report the quarry's live position for drawing. That was not a
reason to bump `FRAME_LAYOUT_VERSION`; appending or moving a slot would be.

### The browser-golden correction

The focus/order change was correctly inert in lab fixtures and incorrectly
predicted to be inert in every browser fixture. Lab uses `Advance`, and navigation
is additionally silent when `Objective` is `None`. `ROOM_HASH`, however, runs
`init(1); set_goto(20_000, 12_000); step(600)` and is the one browser golden that
reaches ordered feet. The historical room hash moved to
`0xadae95f2b6b46499` when the click became a leash; the current pin is in
[Hashes](../reference/hashes.md#golden-registry).

The durable lesson is broader than that old literal: a claim that no golden reaches
an order path must inspect the browser scripts as well as lab scenarios. `LAB_HASH`
remaining fixed proves only the lab side. This supersedes the correction formerly
recorded under `DESIGN.md#naming-the-quarry` and the order-sensitive part of
`DESIGN.md#the-route`.

## Browser waypoint queue

`Order` remains one standing order per faction. A dragged route is therefore a
browser-host convenience queue over that channel, not simulation state and not a
per-unit order system. The wasm host advances waypoints, drops unreachable or stalled
legs, clears the queue on a plain click, focus change, death, swap, or descent, and
uses fixed capacity so route editing cannot grow wasm memory while JavaScript holds
typed-array views. The queue implementation begins at [`Sim::route`](../../crates/web/src/lib.rs#L2024)
and its exports at [`route_clear`](../../crates/web/src/lib.rs#L5325).

The leg test runs in Rust once per simulation tick. One animation frame may hand
`Sim::advance` up to eight catch-up ticks, so a page-side arrival test would overshoot
each waypoint by that many ticks on a stutter. Drawing the line remains presentation;
deciding when its next standing order begins is host game-loop state.

Intermediate arrival is measured against `World::nearest_walkable`, not the raw
drag point, because a sample laid across a corner may be inside masonry. A leg advances
inside `ROUTE_ARRIVE` 0.70 plus the hero radius. A sealed leg advances after
`ROUTE_STALL` 90 ticks without `ROUTE_PROGRESS` 0.05 of movement; ninety is three
times the slowest thirty-tick decision period, so a slow thinker is not mistaken for
a stuck one. The final leg deliberately remains as the standing `Goto`. The leash
slows toward it continuously, and popping it would leave the hero holding an order
the queue had no reason to replace.

The continuous approach replaced a one-tick arrival band, not merely a wider
threshold. A direction component below raw fixed-point 19 multiplies to zero
displacement, so an arbitrarily tight band may never terminate. Worse,
`apply_movement` can still update facing from that nonzero direction, leaving a body
spinning without translating. A one-tick band avoided that quantization edge but was
re-armed by the first shove. The current pull and brake fade with the remaining gap;
when no direction remains, `Command::HOLD` preserves both position and facing.

The fixed `ROUTE_MAX` of 24 covers roughly 29 world units at the page's 1.2-unit
sampling interval. Scalar append/clear calls avoid a second detachable wasm-memory
view. Beginning a leg changes authoritative state because `World::set_order` rebuilds
the flow field and orders enter `state_hash`; the queue itself remains browser-host
state.

Five host transitions discard a queued path: a plain `set_goto`, `set_focus`,
`clear_order`, hero replacement, and descent. Focus is the dangerous one to omit:
the next leg would write a `Goto` over the quarry lock. Replacement and descent must
not inherit coordinates belonging to another body or floor. The explicit
`route_clear` export is a sixth user operation that forgets the remaining queue while
leaving the current standing order intact.

## Superseded DESIGN destinations

This document supersedes `DESIGN.md#the-floor-plan`, `#three-wide-corridors`,
`#collision`, `#routing-and-why-the-objective-is-an-input`, `#sight`,
`#the-order-channel`, `#naming-the-quarry`, and `#the-route`.

For migration tooling, the fully qualified former anchors are
`DESIGN.md#three-wide-corridors`, `DESIGN.md#collision`,
`DESIGN.md#routing-and-why-the-objective-is-an-input`, `DESIGN.md#sight`,
`DESIGN.md#the-order-channel`, and `DESIGN.md#naming-the-quarry`.
