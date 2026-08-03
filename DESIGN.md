# Design rules

Short document, load-bearing content. These are the constraints that make the
project's central claim — *the same inputs produce the same run, everywhere,
forever* — true rather than aspirational.

## The determinism contract

Given the same `Scenario`, the same seed and the same sequence of submitted
actions, `World` produces byte-identical state on every target, in every build
profile, on every thread. `World::state_hash()` is how you check.

What that requires, concretely:

**No floating point reaches simulation state.** `Fx::to_f32` exists for the
renderer and for printing. If a value crosses back into the world from an `f32`,
the contract is void. The bit-exact IEEE operations (`+ - * /`, `sqrt`) would
technically be safe; the temptation they create is not, so the rule is absolute
rather than nuanced.

**No transcendental functions.** `sin`/`cos` come from a 1024-entry table
committed as Rust source (`crates/fx/src/sin_table.rs`). `atan2` is a
polynomial approximation in fixed point, accurate to about 0.09°. Both are
identical everywhere by construction. A build-time computation would have baked
in the *building* host's libm, which defeats the purpose.

**Arithmetic saturates.** Not wraps, not panics. Wrapping arithmetic panics in
debug and wraps in release, which means a debug build and a release build
compute different histories — a class of bug that only shows up when you compare
a dev run against CI. Saturation is one behaviour in all profiles. It is still a
bug when it happens; it just fails visibly instead of silently.

**No RNG state in the world.** Randomness (currently only perception noise)
comes from `Rng::from_stream(seed, tick, entity)`. A draw depends on *what* is
being decided, never on the order entities are visited, so iteration order can
change freely without changing results. There is no global or thread-local RNG
anywhere in the project.

**Fixed iteration order, index tie-breaks.** Every loop runs in ascending entity
index. Every "nearest" or "best" comparison breaks ties on index. Sorting uses
stable sorts with explicit tie-breakers.

**Deaths resolve after all attacks.** Two units that kill each other on the same
tick both die. Applying deaths during the attack loop would make the outcome
depend on entity index, which quietly makes mirror matches unfair.

**No wall clock, no threads, no I/O in `sim`.** The crate cannot observe
anything that varies between runs. `crates/sim/tests/determinism.rs` runs the
same scenario on eight threads and asserts one answer.

### What is *not* covered

Policies. A neural policy is explicitly allowed to be unportable — that is why
replays record actions rather than seeds (see below). Cross-platform equality is
required of `World`, not of whatever decided the actions.

## The agent boundary

`Observation` in, `Action` out. That is the entire interface.

The observation is not a view of the world; it is *what perception allows*. The
world holds ground truth, and `World::observe` degrades it by the observer's
stats before handing it over. A policy cannot reach past it, which is what makes
`perception` a meaningful stat instead of a damage multiplier.

The one exception is the standing `Order`, and it is an exception on purpose: an
order is a *command*, not a percept. It comes from the player rather than from
the world, so there is nothing for perception to have been imperfect about, and
it arrives exact. That is what lets an agent compute `destination - position`
exactly and actually arrive somewhere — a `Goto` degraded by positional noise
would be a destination that moved every time you looked at it.

`Observation::write_features` flattens to a fixed-width vector for a future
network. Nothing uses it yet. It exists now because the *layout* is the contract
a trained network gets frozen against, and changing it later means retraining.

That bill has been paid twice, deliberately, and both times while no weights
existed. Adding `Order::Goto` and `decision_period` moved the vector from 73 to
75 slots (version 2) and changed what the order-direction slot *means*. Two-handed
combat then moved it from 75 to 205 (version 3): a contact went from five numbers
to fifteen, because a defender that cannot see where an enemy's blade is pointing
and how fast it is turning cannot block, dodge, or punish a recovery. Doing this
now costs nothing; doing it after a training run costs the training run.
`FEATURE_LAYOUT_VERSION` exists so that a future frozen network can refuse to
load against a shifted layout rather than quietly reading the wrong number out of
every slot.

Every angle enters that vector as a `(cos, sin)` pair rather than as a number. A
raw angle is discontinuous at the wrap, so a blade at 359 degrees and one at 1
degree look maximally different in a slot nothing can learn across.

Actions persist until the agent's next decision tick. A slow-witted character
keeps executing a stale plan; a sharp one re-plans up to sixty times a second.
That is the whole of "intellect makes you faster" — and with hands on the action
it cuts deeper than it used to, because a stale plan is now a stale *swing*,
still travelling.

### The one exception: taking the controls

`DESIGN.md` used to say the player never issues a per-tick command. The browser
build now lets you take the hero's feet, its sword, or both, and drives them from
live input every tick.

That is a smaller change than it reads as, and worth being precise about. It does
not add a channel: the host still answers with an `Action`, the sim still cannot
tell what produced it, and `Observation` in / `Action` out is untouched. What
changes is only *who is asked*. An `Order` remains what it was — a command to a
faction, degraded by nothing, interpreted by whatever wits the character has —
and manual control is a policy that happens to be a person.

Two things follow that are easy to miss. `World::submit` pushes `next_decision`
out by a full period, so an entity submitted to on every tick never satisfies
`next_decision <= tick` again and drops out of `pending_decisions` entirely; the
host therefore keeps its own decision clock for the hero, and consults the policy
on that beat for whichever half the player has *not* taken. And a page that ever
grows a "save this fight" button must record those per-tick submissions, because
`policy::run` only records inside the pending loop and would otherwise lose the
run.

## The swing

A character has two hands. An agent does not attack — it *commands a bearing*
for each, and the hand accelerates toward it under a torque cap. Everything else
falls out of that:

- A swing takes time, so it can be read and answered.
- A swing cannot be reversed instantly, so overcommitting is punishable.
- Damage is the blade's speed at contact, so **where on the arc you meet it
  matters as much as whether you meet it at all**.

That last one is the property the whole design rests on, and nothing encodes it.
Impact is `spin × arm`, so a Brute's blow is worth about 16 at mid-blade and
about 31 at the tip — and *nothing at all* within 1.27 units of its shoulder,
where its blade has no room left to build speed. Every weapon has such a dead
zone. Getting inside one and staying there is the strongest answer to a heavy
weapon in the game; getting inside your *own* is how a Skitterer ends up
immune and harmless at the same time.

Two consequences worth stating because they are counterintuitive:

**The angular window in which a blade reaches a body narrows with distance.**
At the tip of a Brute's arc it is about 7 degrees wide and at close quarters
about 23. So a distant target is hit rarely and hard, and a near one often and
weakly, and the two effects pull against each other. Choosing a range is a
decision rather than a lookup.

**A shield covers where the blow lands, which is not where the enemy is.** A
blade sweeping in at an angle first touches the body well round from its
wielder — an overhead swing lands on top of you. Pointing a guard at the
swordsman is therefore not the same as pointing it at the blow, and the
difference is most of what separates the two policies in `crates/policy`.

### Perception is a fighting stat now

Positional error scales with range: exact at arm's length, full at the edge of
sight. A flat error is the obvious model and it is wrong in a way that only
appears once aiming is geometric — half a unit of uncertainty is nothing at ten
paces and is thirty degrees of aiming error at two, against a window sixteen
degrees wide. Every archetype stood nose to nose and missed, and the fights timed
out.

Enemy *hand* bearings are blurred separately and are not scaled that way, because
they are the new perceptual skill: blocking and dodging are bets on where a blade
will be in a few ticks, and the inputs to that bet are `sword_angle` and
`sword_spin`. A dim character does not merely block late. It blocks the wrong
line.

## Replays

`Replay` stores agent decisions as `(tick, entity, action)` and player orders as
`(tick, faction, order)`. Not a seed.

Both halves matter. The first version recorded only agent actions, and every
replay diverged — the entities were all in exactly the right places, but the
standing orders were missing, and orders are part of world state. A replay that
records half the inputs reproduces half the run. Anything that can change the
world from outside belongs in the log.

Recording the seed and re-running policies is smaller and simpler, and it breaks
the moment a policy is a neural network: a wasm SIMD matmul and a native AVX
matmul reduce in different orders, so logits differ in the last bit, an `argmax`
flips on a near-tie, and the whole run diverges. Recording decisions means
playback never runs inference — the sim is fed exactly what it was fed the first
time.

Cost: roughly 180 records/second at thirty agents. An `Action` grew from 12 bytes
to 36 when it gained two hand commands, so a long fight is now closer to a
megabyte than to a few hundred KB before compression. Still worth it: the
alternative is a replay that reproduces the walking and none of the swordplay.

`lab verify` is the standing check: it runs a batch, re-runs each fight, and
replays each fight, requiring all three to agree bit for bit. 200/200 at the
time of writing.

## Deliberate non-choices

**No ECS.** Structure-of-arrays over a generational free list. At the entity
counts this genre needs — dozens, not tens of thousands — an archetype engine
buys nothing and costs the two properties that matter most: trivially hashable
state, and a tick loop that reads top to bottom.

**No spatial partitioning.** Collision separation is O(n²). At fifty entities a
spatial hash is slower and much easier to get subtly wrong. Revisit when a
scenario actually needs hundreds — and when it does, the hash must produce
results identical to the brute-force version, which is a test worth writing
first.

**Closest-approach hit detection, not swept.** A blade is tested where it *is*,
not along the path it took since the last tick, which is wrong in exactly one
circumstance: a tip that crosses a whole body inside one tick. Rather than pay
for a quadratic solve on every pair, the sim makes that circumstance
unreachable — `rules::agility_multiplier` is clamped at 2.00, which holds the
worst tip speed in the game to 0.537 units per tick against a smallest-body
budget of 0.60. That clamp is load-bearing rather than tidy, and
`no_blade_can_outrun_the_smallest_body` sweeps all 256 agility values of all four
archetypes to keep it honest. A comment would not have survived someone widening
the range.

**Impact is a magnitude for the blade and a projection for the bodies.** Damage
is the blade's own speed through the flesh, which is tangential to its arc, plus
the signed closing speed of the two bodies. Projecting the blade term onto the
surface normal as well is the tidier-looking model and it says something oddly
specific — that only a thrust counts — with a degenerate case at the heart of it:
a blade buried dead centre at full speed is, at that instant, travelling exactly
perpendicular to the way in, and would do nothing at all. The body term stays a
projection because walking has a direction and retreating from a blow should take
something off it.

**No dependencies.** Not even `rand` or `rayon`. A generator that "improves" in
a point release invalidates every recorded run in the repository. `std::thread::scope`
covers the parallelism this needs.

This survived contact with the browser. `crates/web` is a hand-rolled wasm ABI —
twenty-five `extern "C"` functions passing `u32`/`i32`, plus one packed `f32`
buffer JavaScript reads straight out of linear memory — rather than
`wasm-bindgen`. It has zero `unsafe {}` blocks, and the module links with an
*empty* import list, so the page instantiates it with `{}`. The `web/` page and
the two Node tools are vanilla and dependency-free for the same reason.

It survived the behaviour panel too, which is where a binding generator would
have been most tempting. Gene values cross as thousandths in both directions,
like a click does; gene *names* cross as a pointer and a length into the
`&'static str` the policy crate already holds, and the page decodes them with
`TextDecoder`. Two exports rather than a list of names mirrored into JavaScript,
because a mirror rots — rename a gene in Rust and the page goes on confidently
labelling the old one.

## Performance notes

`Vec2::length` is the hot path and runs a bit-by-bit `isqrt64` (~32 iterations).
That is fine at current entity counts. The obvious optimisation later is that
`f64::sqrt` is exactly specified by IEEE-754 and therefore *is* portable, so a
float square root with an integer correction step would be both fast and
deterministic — the one place a float could be admitted without breaking the
contract. Measure before doing it.

`[profile.dev] opt-level = 1` is set because a test here is thousands of
simulated ticks. Unoptimised fixed-point math makes `cargo test` slow enough
that people stop running it.

## Rules that exist for termination, not for flavour

Two rules earn their place by stopping fights from failing to end. Both were
added after measuring, not by guessing.

**Out-of-combat regeneration** (`REGEN_PER_TICK`, three seconds after the last
blow, full heal in thirty). Without it, an agent whose health drops below its
caution threshold can never come back: it flees, loses sight, marches back under
its standing order, flees again, forever. That was 12% of all runs, with mean
surviving health of 0.20 — not two sides failing to find each other, but two
sides of walking wounded. Regeneration turns retreating into a real tactic
(withdraw, recover, return). Draws fell to 3%, and mean fight length from 1330
ticks to 921.

**The wall sweep** in `UtilityPolicy::march`. An agent ordered to advance that
has reached the far wall used to grind into it. It now sweeps along the wall
toward whichever side has more room, which turns a stall into a patrol.

**Braking and an arrival band** for `Order::Goto`. A destination order needs a
rule for *stopping*, and both of the above are actively wrong for arriving — the
wall sweep walks past a destination near an edge, and `open_ground`'s wall-fear
bias is a search heuristic for an agent that has nowhere particular to be, so
against an explicit destination it is fighting the player. Worse, it is added
before `clamp_length`, and `clamp_length` only ever *shortens*: a short sum passes
through untouched, so the bias never shrinks as the approach slows. That is a
stable fixed point roughly 0.2 units short of every click, anywhere in the arena.
The `Goto` arm therefore drops both and does two things instead:

- **Brake by the stride, not the tick.** An action persists until the agent's
  next decision, so the vector is scaled by `distance / (move_speed ×
  decision_period)`. This is the intellect stat again, from the other side: a
  dim character commits to a longer stride and has to creep in, a sharp one
  lands on the point. Without it the hero ping-pongs across the destination
  forever at an amplitude of one tick of travel.
- **Stop inside one tick of travel.** The band is `move_speed` rather than a
  constant, so it scales with agility. It cannot be much tighter: a direction
  component below raw 19 multiplies to *zero* displacement, so a band near zero
  never terminates, and below one tick of travel `apply_movement` still updates
  `facing` from a `dir` that moves nothing — leaving the character spinning on
  the spot. `Action::HOLD` short-circuits on a zero direction and freezes the
  arrival facing.

A click within one body radius of a wall is unreachable, because
`clamp_to_arena` pins bodies to `[radius, arena - radius]`. The agent clamps the
destination into its own reachable box — it knows its radius and its clearance in
all four directions — so it stops as close as a body can get instead of pressing
into the wall and never satisfying the arrival test. That belongs in the AI, not
in the renderer: the renderer would have to reimplement collision rules in float
to know it.

The general lesson: a fight that cannot end is worse than a fight that ends
badly. A draw scores zero, tells evolution nothing, and costs a full tick limit
of compute — the most expensive possible way to learn nothing.

## Open questions

**Search behaviour.** The wall sweep is not search — agents still have no memory
of where they have looked. Skirmish spawns are confined to a vertical band
because across the full arena the two sides can walk past each other. Papered
over, not solved.

**Self-play.** Evolution currently scores candidates against a fixed hand-tuned
opponent, which measures "better than what we wrote by hand". Self-play measures
something more interesting and introduces the usual instabilities.

**Fitness shaping.** The current function rewards winning, then surviving
health, then damage, with a small time penalty. The time penalty is load
bearing: without it, "run away and survive to the tick limit" outscores
"attack and sometimes die", and evolution will find that out long before you do.
