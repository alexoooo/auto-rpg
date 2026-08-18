# Navigation and visibility

**Purpose:** Explain why the floor, routing, sight, orders, and browser route have their current shapes.
**Status:** current
**Canonical source:** [`Dungeon`](../../crates/sim/src/dungeon.rs#L159) and [`World::refresh_nav`](../../crates/sim/src/world/navigation.rs#L62). The two policy order adapters this header used to name were `utility.rs` and `duelist.rs`, deleted with the legacy seam in embodied session 10 -- **they were the only readers the flow field ever had**, which is why this document now records the order channel as built and unconsumed rather than as a live input
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

### The floor has a height, and a wall is a consequence of it

The grid carries a signed `i16` of height steps per tile beside its byte of kind, at
`TERRAIN_HEIGHT_RAW_UNIT` — an eighth of a world unit — per step. Each tile is one
flat plateau: there is no interpolation across a tile and no slope within one. That
is the Doom sector model, and it is chosen over a smoothed heightfield because a
smoothed one puts a body's floor between two tiles and makes every collision query
ask which of them it is standing on.

**A rise greater than `TERRAIN_STEP_UP_RAW` — three height steps — is impassable
uphill and passable downhill**, and that one directional rule produces both a ledge
and a cliff. A "ledge" tile kind beside a "cliff" tile kind would be two kinds
agreeing by convention about the same geometry; a rise is the geometry, and asking
whether it can be entered from a given side is the whole question.

The threshold is a whole number of steps deliberately. Every rise the grid can
express is a multiple of the unit, so a threshold falling between two of them names
a boundary that does not exist — `0.45` and `0.375` admit and refuse exactly the same
set of rises, and only one of them says so.

**A flat dungeon is not merely fast here, it is *unreachable* from an elevated one.**
`Dungeon::digest` folds the height vector only when `sculpted` is true, and `sculpted`
is derived from the heights rather than passed: a dungeon asked for with heights that
are all zero **is** flat, digests as one and routes as one. That short circuit is why
adding elevation to the engine moved no golden hash, and it is the same property that
keeps every legacy fixture in the registry unreachable from the sculpted embodied
corpus.

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
predicted to be inert in every browser fixture. Lab used `Advance`, and navigation
is additionally silent when `Objective` is `None`. `ROOM_HASH`, however, ran
`init(1); set_goto(20_000, 12_000); step(600)` and was the one browser golden that
reached ordered feet; it moved to `0xadae95f2b6b46499` when the click became a leash.
Both that pin and `LAB_HASH` were deleted by embodied session 10 with the model they
measured, and their last values are recorded in
[Hashes](../reference/hashes.md#golden-registry).

**The durable lesson outlives both numbers and is the reason this paragraph is kept
rather than deleted with them:** a claim that no golden reaches a given code path must
inspect the browser scripts as well as the lab scenarios, because the two drive
different fixtures through different entry points. `LAB_HASH` remaining fixed proved
only the lab side. This supersedes the correction formerly recorded under
`DESIGN.md#naming-the-quarry` and the order-sensitive part of `DESIGN.md#the-route`.

## The browser waypoint queue, and why it is gone

`Order` remains one standing order per faction in the sim. The browser used to lay a
**queue** over that channel: a dragged route whose legs the wasm host advanced once per
simulation tick, dropping unreachable or stalled ones, clearing on a plain click, focus
change, death, swap or descent, at fixed capacity so route editing could not grow wasm
memory while JavaScript held typed-array views. The leg test ran in Rust rather than on
the page because one animation frame may hand the host up to eight catch-up ticks, and a
page-side arrival test would overshoot each waypoint by that many ticks on a stutter.

**Embodied session 10 deleted all of it, and the reason is worth keeping.** A standing
order reaches a body only through `Observation::nav_dir` and `nav_distance`, which are
columns of the *legacy* observation. `ArticulatedObservation` — what an articulated or
embodied body perceives — has no order column and no navigation column at all. So once
the browser opened an embodied floor, `set_goto` mutated the orders array (which is
hashed, so it moved the state hash), rebuilt a flow field nobody read, and published a
destination marker the renderer drew and the body ignored. The queue's own stall timer
then advanced each leg on a ninety-tick clock while the hero stood still.

A control that moves the state hash and paints a marker while changing no behaviour is
worse than a deleted one, so the exports went and direct control became the whole input
channel. Re-introducing waypointing means giving the surviving observation a navigation
column first — a mechanic, not a host convenience — and this section exists to say that
the host half was solved and thrown away rather than never built.

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
