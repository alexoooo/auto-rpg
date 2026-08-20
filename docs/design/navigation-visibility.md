# Navigation and visibility

**Purpose:** Explain why the floor, routing, sight, orders, and browser route have their current shapes.
**Status:** current
**Canonical source:** [`Dungeon`](../../crates/sim/src/dungeon.rs#L159) and [`World::set_order`](../../crates/sim/src/world/mod.rs). The two policy order adapters this header used to name were `utility.rs` and `duelist.rs`, deleted with the legacy seam in embodied session 10 -- **they were the only readers the flow field ever had**. It named `World::refresh_nav` beside `Dungeon` until 2026-08-18, when the flow field was deleted for that reason: a channel built and unconsumed for a session is a note, and one built and unconsumed for two is a cost
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

## Routing was authoritative information, and there is no routing

**The flow field was deleted on 2026-08-18.** `World::refresh_nav` rebuilt it in the
epilogue of every tick of every fight, and `nav_arm`, `reachable_point`,
`nav_goal_point` and `nav_step` were its readers. All five had zero production callers by
then: the observation columns a body read a heading out of (`nav_dir`, `nav_distance`)
went with the legacy `Observation`, the two policy adapters went with the legacy seam, and
the browser's `set_goto`, `set_focus` and `clear_order` exports had already been removed —
so nothing left in the repository could ask for a route, while a breadth-first search over
the whole floor ran per faction per tick. It was not hashed, so removing it moved no pin.

The design below is recorded rather than described, because it is what a session
restoring the channel should start from and none of it was found to be wrong.

The world owns the floor, so it owns the answer to “how do I reach that point?” An
observation published `nav_dir` and `nav_distance`; the policy still decided whether
to follow them. The field was a four-neighbor, multi-source BFS rebuilt when its goal
changed. Eight neighbors at equal cost would make a diagonal falsely cost one tile;
the straight-line shortcut supplied useful diagonals without a weighted queue. Two arms
per faction, indexed by whether the body opens doors, because one field cannot answer for
a faction holding both a Brute that must walk around a shut door and a Fighter that walks
through it — and the second arm was built only while something was still shut *and* that
side held a living body that could open it, which is 14% of a tick on the carved bench.

`Objective` is an input channel like `Order`: it is supplied from outside, hashed,
and recorded in replay. It defaults to `None`, so a scenario that did not request
routing did not silently gain it. Monsters could route toward known heroes within a
bounded route distance; without the bound a whole floor converges into one opening
brawl.

**What a restoration owes, in order.** A navigation column on
`Observation` — a mechanic, since somebody has to decide what a jointed body
*knows* about a route it has not walked. Then a route source to fill it. Then a policy
that steers on it. `World::set_order` carries the same list at the door a host actually
calls.

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

## The velocity channel exists and cannot be read

**Measured 2026-08-18, and it is a companion to the routing section above rather than a
detail of one session.** That section records a channel that was *built and unconsumed*.
This one records a channel that is published, consumed, and carries no usable signal at
the stats the shipped fixtures give their bodies: **no policy in this simulation can tell
an approaching body from a receding one.**

`ObservedOpponent::body_velocity` is the true velocity plus `jitter[3..5] * noise / 4`,
where `noise` is [`Stats::perception_noise`](../../crates/sim/src/rules.rs) and equals
`(15 - perception) / 10`. `contact_timing` is a scalar derived from that same blurred
velocity and then blurred again by `jitter[6] * noise / 8` on *both* branches, saturating
branch included. The arithmetic that settles it is the ratio of two published constants:
the whole achievable range of closing speed between `embodied-duel-v1`'s Fighter and
Brute is `move_speed(6) + move_speed(2) = 0.0994` world units per tick, against a velocity
error of `0.225` for the Fighter's eye and `0.300` for the Brute's. The noise is 2.3x to
3.0x the entire signal.

Measured over 9,689 driven decision ticks, the sign of a closing term recomputed from the
published columns agrees with ground truth **51.59%** of the time, a genuinely receding or
stationary body reads as closing **49.47%** of the time, and no deadband separates the two.
`no_published_column_separates_an_approach_from_a_retreat` re-drives that measurement on
every `cargo test`, so it is a standing property of the fixture rather than a note.
[The tactical policy record](../performance/embodied-tactical-policy.md#nothing-published-can-tell-an-approach-from-a-retreat)
carries the full sweep and the derivation.

**This is a statement about these fixtures' eyes and not about the observation model.** At
perception 12 or better the velocity term drops below the closing range and the judgement
becomes honest; the Fighter is 6 and the Brute 3. Three things would make it readable, and
all three are perception-channel changes rather than policy changes: a velocity term
quieter than a quarter of the positional noise, a longer baseline than one tick — a policy
integrating observed range over many ticks, which costs the memory a deadband design
exists to avoid — or a published closing scalar that is not re-blurred on the way out.

**A policy session may not add one.** That rule was written into the embodied fight's plan
set; the topic honoured it — no perception channel landed — and it outlives the plan set's
deletion, so it is stated here rather than cited. It is a rule and not a preference
because all three fixes above are observation-model changes: a policy that wants a closing
judgement is asking for a new published column, and a new published column is a
measurement job rather than a line in whatever policy session wants it first. Footwork and
measure discipline are exactly the decisions that want one, so a footwork session holds
measure off range and stance instead — the shipped guard already does, and
[the tactical policy record](../performance/embodied-tactical-policy.md#nothing-published-can-tell-an-approach-from-a-retreat)
is what it is measured against. Giving the channel a reader is a separate topic with its
own measurement, and it belongs here beside the other two.

## Orders were a leash, not remote control

**Past tense throughout this section and the two below it**, for the reason the routing
section above gives: nothing reads an order. What follows is the design that was reached
and measured, kept because a restoration should not have to rediscover it.

A live `Order::Goto` or `Order::Focus` controlled the feet while hands and intent remained
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
order reaches a body only through `nav_dir` and `nav_distance`, which were
columns of the *legacy* observation. The subject-scoped observation that replaced it —
what a jointed body perceives, and the one type that survived both model deletions —
has no order column and no navigation column at all. So once
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
view. Beginning a leg changed authoritative state because orders enter `state_hash` — and,
until the flow field was deleted, because `World::set_order` rebuilt it. The rebuild is
gone; the hash write is not, so setting an order still moves a digest and still changes
nothing anybody can observe, which is the whole of the finding recorded in
`crates/sim/tests/determinism.rs`. The queue itself remained browser-host state.

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
