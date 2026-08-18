# ADR 0004: keep a purpose-built simulation kernel

**Purpose:** Record why the current game uses explicit structure-of-arrays state and audited geometry instead of an ECS, spatial framework, or general physics engine.
**Status:** current
**Canonical source:** [`World`](../../crates/sim/src/world/mod.rs#L143), deterministic geometry in [`fx`](../../crates/fx/src/geom.rs#L92), and the dependency manifests under [`crates/`](../../crates/)
**Update when:** Entity storage, broad-phase collision, contact solving, hit detection, authoritative dependencies, or the browser ABI architecture changes.

**ADR status:** accepted

## Context

The game simulates dozens of actors under a stronger requirement than ordinary
gameplay repeatability: the same accepted inputs must produce the same bytes on
native and wasm targets. The useful mechanics are narrow -- planar bodies,
articulated-in-one-plane limbs, projectiles, and tile masonry -- while the cost of
an abstraction includes its iteration order, numeric representation, dependency
closure, serialization surface, and target behavior.

The former `DESIGN.md` grouped these choices as “deliberate non-choices.” That
name was important: they were scoped rejections with evidence and replacement
conditions, not an aesthetic preference for writing every subsystem by hand.

## Decision

Keep authoritative entity storage as explicit structure-of-arrays columns over a
generational free list. Keep collision and combat geometry as small fixed-point
algorithms whose traversal and tie-breaks are visible in the tick. At current
roster sizes, use deterministic pairwise scans rather than adding a broad-phase
framework.

Do not introduce a general ECS or physics engine merely to obtain storage,
collision, or a broad phase. Revisit those decisions only when a measured shipped
scenario needs a materially different scale or genuinely different mechanics.
Any replacement must reproduce the current brute-force result byte-for-byte before
it can become authoritative.

This decision does not forbid audited exact dependencies outside the authority
boundary. Host, presentation, asset, and explicitly nondeterministic learning code
may use them under [Determinism](../reference/determinism.md). It does require that
no dependency-owned host or presentation type enter `Scenario`, `World`, submitted
inputs, replay, or a hash domain without becoming a reviewed deterministic input.

## No ECS

`World` stores one column per property and resolves an `EntityId` through index,
generation, and liveness. At the current scale, an archetype engine would not
remove the loops that dominate work. It would obscure the two properties the game
uses constantly: a state-hash walk that can be read field by field, and a tick that
can be audited phase by phase from top to bottom.

The replacement condition is not “ECS becomes fashionable” or “the files become
large.” It is a measured need for dynamic composition or query scale that the
explicit columns cannot meet while keeping stable traversal and hash ownership.

## Pairwise collision before spatial partitioning

`World::separate` currently visits every live unordered body pair. This is
quadratic and intentionally simple. A spatial index would add cell assignment,
duplicate suppression, boundary rules, and another ordering contract. Below the
scale where pair enumeration dominates, those are costs rather than savings.

The former design record preserved this arithmetic and measurement:

| Actors | Unordered pairs | Historical reported cost |
|---:|---:|---:|
| 64 | 2,016 | about 1% of one core |
| 200 | 19,900 | about 14% of one core |
| 640 | 204,480 | about one CPU-second per game-second |

Each pair performed one fixed-point vector length in the measured separation
kernel. These values are **historical evidence from the pre-v2 `DESIGN.md`**. The
record did not name a date, CPU, compiler, build profile, or benchmark harness, so
the percentages are not a current performance gate and must not be extrapolated.
The pair counts are exact arithmetic; the timings are provenance-incomplete. The
current shipped browser cap is much closer to the first row than the last.

If a shipped scenario crosses the useful threshold, the first deliverable is a
test that compares the proposed broad phase with the brute-force candidate set and
final state. Optimizing into a different collision order or tie result is a
mechanics change, not an implementation detail.

## Why a general physics engine remains the wrong boundary

The current kernel has purpose-built angular limb state, pair impulses,
restitution constants, projectiles, and tile collision. That reconciles an old
overstatement that it had “no rotational dynamics” or “no restitution”: those
mechanics now exist, but they still do not make a general rigid-body world.

There are no free rigid-body graphs, 3D rotations, joint solvers, stacking
manifolds, sleeping islands, ropes, or destructible piles. A general engine would
solve and marshal a much larger state model than the game owns, usually in floating
point and with iteration behavior outside this repository's direct control.
Rapier was the concrete rejected candidate. Its same-build determinism features do
not establish this project's native/wasm bit equality, and its normal wasm binding
surface would replace the current hand-read ABI with generated host glue.

The old record estimated a Rapier wasm addition at roughly 1.5--3 MB against a
then-current module of exactly 246,384 bytes. Those are **historical sizing notes**,
not current artifact measurements: the record named neither Rapier version nor
build date/profile, and the browser module has changed since. They preserve why the
trade looked disproportionate at the time; they do not pin today's size.

A general engine becomes the honest option if the game becomes about mechanics it
actually owns well -- tumbling thrown objects, ragdolls, articulated constraints,
stacks, ropes, or destruction. That would require an explicit decision about the
cross-target contract rather than bolting a second authority beside `World`.

## Closest approach, swept contact, and the agility clamp

The first blade/body test used `segment_circle` only at the end of a tick. It is a
closest-point-on-one-segment test, not a sweep through time, and it is correct only
when a blade tip cannot cross a whole target between samples. The agility multiplier
was therefore capped at `2.00`; the recorded worst tip travelled `0.537` world units
per tick against the smallest body's `0.60`-unit diameter. The exhaustive
`no_blade_can_outrun_the_smallest_body` test covered all 256 agility values and all
current bodies.

That former contract is **superseded as a correctness argument**. Body impulses
made relative motion consume its margin, so blade/body collision now uses
`swept_segment_circle`. It walks a deterministic bounded number of substeps based on
relative travel and runs the exact closest-approach predicate at each one. At one
substep it uses the endpoints verbatim and matches the old result, which allowed the
change to land without moving a golden hash.

The historical `2.00`, `0.537`, and `0.60` values come from the former design note
and remain corroborated by comments and the exhaustive cost guard in
[`entity.rs`](../../crates/sim/src/entity.rs#L301). The cap remains current as a
balance and sweep-cost choice, not as permission to use an unswept hit test. Raising
it requires remeasuring the difficulty ladder and substep cost; collision correctness
must continue to come from the swept predicate.

Not every geometric query is swept. Static segment/circle queries still use closest
approach, tile walls use the closest point on an axis-aligned box, and projectile
motion uses a segment along its flight. “Swept” is a temporal contract for a moving
blade and moving body, not a universal replacement for simpler exact predicates.

## Impact is a magnitude plus a projection

`World::impact_speed` owns a deliberate asymmetry:

- blade speed at the contact arm is a nonnegative tangential magnitude; and
- relative body motion is projected onto the contact normal as signed closing
  speed.

Projecting the blade term onto the surface normal would describe a thrust-only
model. At the degenerate centre hit, a fast tangential blade is perpendicular to
the radial normal and would contribute nothing even though it swept through the
body. The magnitude correctly prices a cut. Body motion has a meaningful approach
direction, so charging toward a blow adds to it and retreating subtracts from it.
That invariant was tested by `impact_is_the_blade_plus_the_closing_and_backing_off_helps`
in `crates/sim/src/world/legacy.rs`, which embodied session 10 deleted with the model.
**The argument survives the test and is now the contact solver's**: a swept segment
against a swept body carries the closing speed in the same way, and
[the contact solver](../reference/contact-solver.md) owns the current statement of it.

## Dependencies and the browser boundary

The original repository rejected `rand`, `rayon`, engine crates, and generated wasm
bindings so a point release could not silently change a recorded run. Current crate
manifests still contain only local path dependencies; lab parallelism uses
`std::thread::scope`; the browser boundary still has no `wasm-bindgen` host types.

The historical browser snapshot described 25 integer `extern "C"` functions, one
packed `f32` frame, an empty import list, and a 246,384-byte wasm module. That exact
export count, buffer count, and size are **superseded historical values** from the
former `DESIGN.md`; the record did not name a commit or build profile. The current
ABI has more exports and separate frame, map, visibility, and furniture buffers.
[Browser runtime](../architecture/browser-runtime.md) is the current contract.

One part of that history remains current and instructive. Behavior-panel gene values
cross as fixed integer thousandths. Gene labels cross as pointer/length pairs into
the policy crate's static strings and JavaScript decodes the bytes. Mirroring names
in JavaScript was rejected because a Rust rename would leave a confidently stale UI.
This is an ABI design choice, not a claim that a future external host may never use a
generated binding layer outside simulation authority.

## Consequences

- Entity and contact storage are verbose but locally auditable.
- Pairwise work has an explicit scale ceiling; crossing it creates a measured broad-
  phase task with a byte-equality oracle.
- The kernel owns only the mechanics the game needs, so adding a genuinely general
  physics mechanic may require revisiting this ADR rather than disguising an engine
  inside adapters.
- Geometry optimizations carry executable equivalence or bounded-cost tests.
- Host dependencies may evolve outside authority, while deterministic inputs and
  hash ownership remain local and reviewed.

## Compatibility declaration

## Amendment, 2026-08-18: a third body model in the same kernel

**The strongest evidence this decision has yet had, and it arrived as a
by-product.** The embodied combat work replaced the entire body model — a floor
with height, hips that turn slower than the torso, a two-link arm with a
commanded elbow plane, and seven swept collider volumes over five anatomy
regions — and it landed *inside* this kernel, as a third `CombatModel` beside
the two already there, without discarding either.

What survived that replacement untouched is the list this ADR is about: the
swept segment/segment contact solver, the impulse and energy law, regional
anatomy with severance, the generational free list, and the fixed-point
determinism apparatus. A general physics engine would have had to be replaced
along with the model, because the model *is* what a physics engine encodes; an
audited set of small fixed-point algorithms is a set of parts, and parts get
reused.

**The variant is also what kept the golden registry still**, which is a property
no framework offers. Every mechanics session landed inside `Embodied`, whose
fixtures are new, so the pins guarding `Legacy` and `Articulated` could not move
by construction — and each session stated that in advance and treated a surprise
as a bug. Two of them found real defects that way: a replay reader consuming the
wrong payload width for one schema, and a frame conversion applied in one of the
two places that needed it.

**One counter-measurement belongs here too, because it cuts against the ADR's
grain.** The plan that opened this work assumed three or four refactoring
sessions were needed before any of it could start. Measured, only one file was
genuinely oversized: `world.rs` at 20,470 lines, of which 12,541 were
`#[cfg(test)]`. `combat/contact.rs` reads as 9,045 lines and is 2,659 lines of
production code; `combat/resolution.rs` reads as 5,623 and is 1,982. Splitting
either would have been a week of hash risk spent on a file that was never the
problem. Explicit hand-written subsystems get *long*, and length is not the
measurement — the ratio of production code to its own tests is.

**Former anchor:** `DESIGN.md#deliberate-non-choices`

**Durable destination:** this ADR is the exact destination for the former anchor's
no-ECS, pairwise-spatial, general-physics, closest-versus-swept, agility-clamp,
impact-composition, dependency, and hand-written-browser-ABI rationale and history.
Renderer authority is additionally owned by
[ADR 0003](0003-renderer-outside-sim.md); exact dependency and portability rules are
owned by [Determinism](../reference/determinism.md).

## Source anchors

- Explicit world columns and generational storage: [`World`](../../crates/sim/src/world/mod.rs#L143)
- Pairwise body separation: [`World::separate`](../../crates/sim/src/world/movement.rs#L16)
- Static closest-approach predicate: [`segment_circle`](../../crates/fx/src/geom.rs#L130)
- Bounded temporal sweep: [`swept_segment_circle`](../../crates/fx/src/geom.rs#L176)
- Current clamp rationale: [`agility_multiplier`](../../crates/sim/src/rules.rs#L265)
- Exhaustive historical-bound cost guard: [`no_blade_can_outrun_the_smallest_body`](../../crates/sim/src/entity.rs#L319)
- Current blade/body sweep: [`World::resolve_contact`](../../crates/sim/src/world/contact_phase.rs) -- the legacy `resolve_swings` it replaced was deleted with its model
- Impact magnitude and projection: [`contact_behavior_corpus`](../../crates/sim/src/combat/resolution.rs)
- Browser buffer and ABI authority: [`browser-runtime.md`](../architecture/browser-runtime.md)
