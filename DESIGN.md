# Design rules

This is the short entry point for the game's load-bearing design choices. Exact
contracts live in `docs/reference/`, current ownership in `docs/architecture/`,
gameplay rationale in `docs/design/`, decisions in `docs/decisions/`, and measured
claims in `docs/performance/`. The [documentation map](docs/README.md) routes readers
by role.

Three principles organize the rest:

1. The fight is deterministic authority; hosts, policies, and renderers consume or
   submit versioned data.
2. Mechanics should create readable choices, not merely simulate more detail.
3. Measurements keep their method and mistakes. They are evidence, not timeless
   constants.

The headings below are stable compatibility entries for links to the former design
monolith.

## The determinism contract

Given the same scenario, seed, and submitted inputs, the world must produce the same
bytes on every supported target, profile, and thread. The normative rules, boundary,
and verification commands are in [Determinism](docs/reference/determinism.md); the
reason fixed point and counter-based randomness were chosen is recorded in
[ADR 0001](docs/decisions/0001-deterministic-fixed-point.md).

## The agent boundary

Policies observe state and return commands; they do not own world state or time. The
current ownership and decision flow are in [Policy architecture](docs/architecture/policy.md),
while exact observation, command, action, and loadout shapes are in
[Commands](docs/reference/commands.md). Human input deliberately uses that same
submission boundary rather than a privileged simulation channel.

## The swing

A swing is a paid state machine: preparation, movement, contact, and recovery make
timing, range, commitment, and the held action legible choices. The history of the
one-limb model, swap cost, perception split, and measured difficulty range is in
[Combat design](docs/design/combat.md#the-swing).

## Weight, momentum and inertia

Mass, traction, weapon weight, impact, damage, knockback, blocking, and reach are
separate because each buys a different fighting consequence. Their current rationale,
including rejected models and measurements that overturned intuition, is in
[Combat design](docs/design/combat.md#weight-momentum-and-inertia).

## Replays

Replays record submitted decisions rather than relying on policy portability. The
decision is in [ADR 0002](docs/decisions/0002-record-commands-in-replays.md); current
in-memory coverage and known omissions are in
[Replay and hashing](docs/architecture/replay-hashing.md) and the exact integrity
contract is in [Hashes](docs/reference/hashes.md#current-replay-integrity).

## Deliberate non-choices

The current game deliberately has no ECS, general physics engine, mutable RNG stream,
renderer authority, or learned policy in its deterministic core. The kernel choices,
rejected alternatives, and superseded measurements are retained in
[ADR 0004](docs/decisions/0004-purpose-built-simulation-kernel.md). The current
fixed-order simulation is described in [Simulation architecture](docs/architecture/simulation.md),
the dependency boundary in [Architecture overview](docs/architecture/overview.md), and renderer separation in
[ADR 0003](docs/decisions/0003-renderer-outside-sim.md). These are scoped decisions,
not claims that every future host or presentation tool must remain dependency-free.

## The floor plan

Walkability, collision, routes, sight, fog, standing orders, and the browser waypoint
queue have different owners but must agree on the same carved space. Their rationale
is in [Navigation and visibility](docs/design/navigation-visibility.md); current
simulation and browser ownership are in [Simulation architecture](docs/architecture/simulation.md)
and [Browser runtime](docs/architecture/browser-runtime.md). Floor descent and hero
carry-over are host progression, documented in [Progression](docs/design/progression.md).

## Performance notes

Performance claims are dated evidence with named methods and controls. The
[performance index](docs/performance/README.md) owns the retained Canvas and isometric
measurements, including failed hypotheses and the requirement to repeat a visible
foreground baseline. Canvas remains the playable reference/debug renderer; a separate
GPU client is the production direction recorded by ADR 0003.

## Art direction

The game aims for a warm, miniature dungeon whose threats, occlusion, and interaction
state remain readable before detail. The visual principles and renderer roles are in
[Presentation design](docs/design/presentation.md); current asset ownership and known
generator hazards are in [Assets architecture](docs/architecture/assets.md).

## Rules that exist for termination, not for flavour

Regeneration budgets, timeout scoring, patrol memory, and reachable destination
braking exist so fights and routes finish without hiding failure behind a draw. Their
mechanical rationale is retained in
[Combat design](docs/design/combat.md#rules-that-exist-for-termination-not-for-flavour),
while clearing a floor and taking a portal remain separate host progression in
[Progression](docs/design/progression.md#progression-is-not-combat-termination).

## Open questions

Unresolved combat questions and answered investigations are preserved together in
[Open combat questions](docs/design/combat.md#open-combat-questions). Forward work is
temporary and belongs in the [live plans](docs/plans/fight-00-overview.md); current
architecture and reference documents describe what has shipped, while performance
records preserve measured failures and the constraints they place on successors.
