# Combat design

**Purpose:** Preserve the rationale, measured corrections, and trade-offs behind the current combat model.
**Status:** current
**Canonical source:** [`World` combat phases](../../crates/sim/src/world.rs#L2207), [`Hand`](../../crates/sim/src/hand.rs#L181), and [`rules`](../../crates/sim/src/rules.rs#L1)
**Update when:** Limb state, action roles, collision, damage, recoil, perception, recovery, regeneration, or timeout design changes.

This document explains why the mechanics have their current shape. Exact enum
members, fields, discriminants, and input semantics belong in
[Commands](../reference/commands.md); exact determinism requirements belong in
[Determinism](../reference/determinism.md). Code and tests remain authoritative
for numeric tuning.

## The swing

A current character has one active limb and a loadout of at most two actions.
It used to have a sword hand and a shield hand simultaneously. That gave defence
no opportunity cost: every policy held a shield out while attacking, so blocking
was not an alternative to pressure. Making the hand singular turned equipment
choice into tempo. A fighter can attack or have a guard live, and changing which
one is held costs time.

A guard follows a bearing and extension under a torque cap. A strike follows a
declared line through a state machine: it rests in guard, visibly winds up,
commits through a live strike, and recovers before it can act again. A loadout
change has its own inactive swap phase. The normative state and command shapes
are in [Commands](../reference/commands.md#actions-and-loadouts).

## Actions and loadouts

A body supplies geometry and a stat sheet; an action supplies the mechanic held
by its limb. This separation replaced the older model in which an archetype was
inseparable from its weapon and shield. It permits questions such as how a heavy
body plays with a short weapon without adding a new body type.

The simulation branches on an action's role rather than its display name. Strike
actions own blade geometry and phased attacks, guard actions own a blocking arc,
move actions trade the hand for movement, and shoot actions spend a phased
release on a projectile rather than a segment sweep. Reserved registry rows may
exist without becoming playable mechanics. Exact registry codes and playable
status are reference data, not design prose.

The resolved arm is rebuilt from body, stats, radius, and the selected action.
That avoids stale cached mechanics when a host changes a body, stat sheet, or
loadout during a room.

### The swap, and why it costs what it costs

A swap starts only from guard. It cannot cancel a committed cut, and nothing is
live while it runs: no strike, guard, or parry. The incoming action pays its own
ready cost, so drawing a shield and drawing a light weapon need not take the same
time.

The first shield-ready tuning compared the draw only with telegraph duration.
That was the wrong interval: contact comes after the telegraph, partway through
the strike. Live-world measurements showed much more response time than the
windup alone implied. The corrected tuning lets slow attacks be answered by a
deliberate swap while fast attacks demand an already-held answer. The paired
world tests near [`a_club_can_be_answered_by_swapping_to_a_guard`](../../crates/sim/src/world.rs#L12834)
own that behavioral constraint.

### What this cost, honestly

Removing free blocking lowered every fighter's measured duel performance. That
was an intended cost, not a regression to hide: the mechanic gained a real
choice and the old absolute win-rate floors no longer described the game.

A second near-miss came from applying loadout hysteresis per decision. A sharper
fighter decides more often, so it crossed the same threshold more often and
spent more of the fight swapping; added intellect could make it worse. The
duelist now normalizes the threshold against a reference period so swap pressure
is a rate over time rather than a fee per thought. The old result is retained
because it is the reason that normalization exists.

## Why it is a state machine and not a bearing

The first limb interface let a policy directly aim an extended blade every
tick. It was more expressive and produced one dominant behavior: rotate a live
hitbox continuously. With no instant at which an attack began, there was no cue
to read, commitment to punish, or miss to exploit.

The phased model establishes three design facts:

- an attack announces itself during windup;
- its line becomes committed for the damaging phase; and
- a miss or stopped blow buys the opponent a recovery window.

Windup continues to track the commanded line. Freezing at the beginning of a
slow telegraph was tested and made heavy attacks miss ordinary walking targets.
Once the strike begins, the line freezes and the command cannot recall it.

Strike duration is derived from the resolved weapon rather than one flat
constant. The flat duration cut the slowest attacks off before they crossed
their own declared line. Fights still looked plausible, which is why the
correction is preserved here: visual motion was not evidence that the damaging
arc completed.

Holding the attack request does not chain attacks. A new strike requires a
release between requests; otherwise the windmill returns as repeated phased
attacks. [`Hand::armed`](../../crates/sim/src/hand.rs#L250) owns this edge.

## Where you stand still decides what it costs

Damage depends on tangential speed at the contact point. Near the wielder, a
blade may be below the impact floor; toward the tip it is faster. Range therefore
changes both the chance of intersection and the price of one. A distant target
is touched less often and harder, while a close target is touched more often and
more weakly.

This is why observations expose an opponent's perceived minimum strike range.
Before that value existed, matchup spacing was a lookup only a policy author
could perform outside the observation boundary. Making it a percept lets
perception quality decide how accurately the fighter judges the danger.

A guard must cover the bearing where the sweep reaches the defender, not merely
the enemy's centre or current blade position. It must also settle. A guard
snapped across at the last instant leaks more of the blow than one planted in
advance. That rule is what makes telegraph time worth buying.

## Perception is a fighting stat, and the split is deliberate

Ground truth remains inside `World`. Contact position and motion are degraded by
the observer's perception. Positional error scales with range: flat error made
close geometric aiming worse than distant aiming and caused fighters to stand
nose-to-nose while missing.

The existence of a phase is exact because a hauled-back weapon is not subtle.
Its timing and line are noisy because reading when and where the blow lands is
the skill. A dim fighter is not blind to a telegraph; it reacts late or covers
the wrong line.

## What measurement said, including where it disagreed

Several reversals are deliberately kept instead of polishing the history:

- Frequent re-evaluation cancelled windups before they committed. Evolution
  repeatedly favored finishing a chosen action rather than reconsidering every
  cue.
- Reading ahead was initially harmful because an instantaneous guard sold
  nothing for the time spent reading. Once a guard had to settle, early reading
  became valuable. The old negative was correct for the old mechanic.
- Evasion was initially dominated because a miss cost the attacker nothing.
  Whiff recovery and extra exposure during recovery turned a dodge into an
  exchange opportunity rather than merely an avoided number.
- A weak time price let evolution refuse exchanges and orbit a slower opponent.
  It won while erasing the intellect/perception gradient. Fitness prices time
  because skill in this model is expressed through exchanges.

These are historical measurements, not current normative thresholds. Current
behavior is guarded by simulation and policy tests.

The dated [combat-mechanics evidence](../performance/evidence/2026-08-combat-mechanics.md)
retains the seed counts, reversals, and percentages behind these conclusions. They
live outside the rationale so historical results do not read as current thresholds.

## The difficulty range, which is what all of it is for

The intended difficulty axis uses one policy and body while changing intellect
and perception. Intellect changes how often a fighter may reconsider; perception
changes the quality of its geometric and timing reads. Neither is a direct
damage multiplier.

The measured ladder has been re-run after momentum, physical weapons, knockback,
damage-law changes, and policy evolution. Its exact percentages changed each
time. The durable conclusions are that low sheets can lose, high sheets win more
cleanly, searches terminate, and the same policy spans the range. Exact tables from
those phases are preserved in
[combat-mechanics evidence](../performance/evidence/2026-08-combat-mechanics.md),
not treated as permanent acceptance values.

One correction is especially instructive. Several apparently independent
evolution runs were launched with an ignored seed flag and were actually the
same run. Later runs used the real master-seed input. Claims of independent
confirmation must name the actual input that varied.

## Weight, momentum and inertia

Body mass comes primarily from geometry: density modifies the area of the body,
not a free-standing RPG weight score. Weapon inertia comes from mass and reach.
This makes size, balance, and reach participate in acceleration, collisions,
parries, and recoil without a second unrelated scale.

### Mass is geometry unless stated otherwise

Body collision separates an overlapping pair by inverse mass and applies a
normal impulse only while they are closing. The exact iteration remains fixed
and index-ordered. This is deterministic pair resolution, not a claim that a
many-body pile is invariant under slot reassignment.

### Traction is grip, not weight

Traction controls how quickly commanded movement changes body velocity. Mass
controls how external impulses change it. Treating them as the same quantity
made heavy bodies both hard to move and unable to move themselves; separating
grip from inertia preserves heavy footing without making movement commands
meaningless.

### What it broke, and what that says

Adding body momentum invalidated policies tuned against instantaneous movement.
Well-read dodges could still fail because the body needed time to accelerate,
and the difficulty spread narrowed. The lesson was not to remove inertia, but
to remeasure every policy conclusion whose premise was instant translation.

### The hit test had to stop being a physics limit

An early implementation used the minimum damaging impact speed as the geometric
hit threshold. That coupled collision detection to damage tuning: lowering the
damage floor changed which contacts existed. The current path detects geometry
first and decides the consequence from impact afterward. The superseded coupling
is recorded because it looked like principled physics while making two unrelated
knobs one.

### A measured negative: leading a target does not pay

An explicit lead calculation was tested against the already-short decision
horizon. It added prediction error without a stable gain, because policies
re-aim during windup and contacts move again before a committed strike. The
negative result is retained; a future longer-horizon policy would need to earn a
different answer with new measurement.

### Weapons became physical, and one cliff came with it

Resolved arms carry angular momentum. Longer and heavier actions accelerate
more slowly and resist deflection more strongly. The important cliff is the
impact floor: below it a geometric touch deals no damage, while above it damage
rises with energy. Policy spacing must treat the floor as a boundary, not assume
every visual touch is a smaller hit.

### Blows move bodies, and weight finally means something

Blocks, parries, strikes, and projectiles can transfer momentum. Recoil is
computed after hand interactions from the change in limb momentum; calculating
it earlier charged the intended swing rather than the swing that actually met a
guard or blade. Collected impulses are applied in deterministic entity order.

Two measured corrections remain part of the rationale. The first recoil pass
used the wrong sign for some stopped blows; another applied an impulse in both
the contact resolver and recoil, billing one collision twice. Both bugs produced
plausible motion. Conservation-flavored prose was not a substitute for mirrored
tests and single ownership of the impulse.

Fixed-point division also produced a mirror-match bias when one side derived a
share as `total - other` and the other side rounded independently. Computing
both mirrored shares by the same expression preserves symmetric rounding even
if their sum misses the final raw unit.

### Damage is kinetic energy, and weapon mass cancels out of it

Damage is derived from kinetic energy above a floor and then scaled by the
wielder's power. Action mass participates in both energy and the arm's inertia;
under the current construction those effects cancel in the peak-speed term.
Mass still matters to timing, deflection, and recoil. Reach remains in the
tangential-speed geometry and therefore still changes where useful damage
begins.

The linear predecessor made the dead zone too small and reach mostly cosmetic.
The squared energy law expanded the spacing gradient and finally made reach pay.
Its first implementation also exposed two old geometry mistakes: a cached phase
value was updated at the wrong moment, and policy spacing added triangle legs
where the hit test used a hypotenuse. Those corrections changed matchups enough
to require retuning; they are not licenses to preserve the wrong formulas.

### Four answers to weight, of which two survived

The duelist was experimentally given several responses to a heavier opponent.
Spacing from perceived strike range and exchange-rate reasoning survived.
An explicit body-check stance did not: at contact, ordinary trading outscored
it throughout the roster because bodies were already wider than the supposedly
unusable band. A special shove would have been mechanics added to rescue a
policy idea, so it was removed. The percepts remained useful for collision and
threat judgment.

The removed barge also exposed an unrelated spacing error, which was corrected
rather than attributed to the rejected stance. This history is preserved to
keep discovery separate from justification.

### The ladder is an anti-objective, and fitness cannot hold both ends

Optimizing a policy to fight better raises the bottom of a difficulty ladder
whose lowest rung is deliberately bad reading. Current evolution scores quality,
not spread between dim and sharp sheets. Some weights therefore remain chosen
from measured ladder sweeps rather than from the single fitness objective. A
future optimizer that claims to preserve difficulty must evaluate both ends and
reward the gap explicitly.

## Rules that exist for termination, not for flavour

Out-of-combat regeneration exists because a cautious wounded fighter otherwise
retreats and re-engages forever. It is delayed, suppressed while an enemy is in
sight, and budgeted across the fight so retreat can recover without resetting
every lost exchange.

When a scenario's clock ends, remaining health decides the result on points.
That outcome stays distinguishable from a kill and is worth less in fitness. A
plain draw made weak fighters look less weak merely because they failed to
finish losing.

`UtilityPolicy` interprets `Order::Advance` as a patrol rather than an endless
march. Its memoryless predecessor let two sides cross, reach opposite walls, and
walk parallel lines until timeout. One byte of policy memory made searching
continue after a wall turn. The open search problem is richer memory of where a
fighter has already looked, not another timeout exception.

Destination arrival likewise terminates through braking and authoritative
walkability rather than a renderer-side distance guess. Earlier one-tick bands
were re-armed by a shove and could leave a zero-displacement command changing
facing forever. The current approach slows continuously, and `World` owns the
nearest point a body can actually occupy.

## Open combat questions

These questions remain unresolved in current code:

- `Event::Block` reports absorbed damage but not the separate impulse imparted
  to the guard. That `knock` value exists during blade deflection and is not a
  monotone restatement of damage. Projectiles currently have no analogous guard
  impulse. Extending the event requires one owner for both paths rather than a
  decorative zero on every arrow.
- Policy fitness rewards combat quality, while the difficulty ladder needs a
  deliberately large gap between dim and sharp sheets. Current evolution does
  not optimize that spread.
- Patrol memory is not search memory. A policy does not remember where it has
  already looked, and unseen pursuit under `Objective::Hunt` is a bounded route
  behavior rather than knowledge or tracking.
- Evolution still uses fixed opponents. Cross-opponent and full-roster scoring
  prevent two demonstrated forms of overfitting, but do not provide self-play.
- Fitness time pressure is load-bearing: remove or weaken it and evolution can
  refuse exchanges, survive, and erase the intended skill gradient. The right
  shaping beyond the present penalty remains an experiment, not a settled rule.
- The published difficulty sweep is one principal matchup. It does not prove
  that intellect and perception buy the same gradient against a fast telegraph.
- Correcting the duelist's old sum-versus-hypotenuse spacing formulas improved
  one pairing and caused widespread untouched timeouts. The geometry diagnosis
  is known; shipping that policy correction is blocked on full retuning rather
  than on preserving the wrong formula as a contract.
- `Strike` lets a policy choose which side a cut winds up from, while current
  browser pointer control requests `Nearest`. The human cannot yet make the
  flank choice the AI can.

Several former open questions are answered and remain here as history rather
than work items:

- A second opponent and worse-of-two score now catch a policy that is merely a
  counter; full-roster evaluation catches the same mistake across bodies.
- Threat and frailty percepts let a policy distinguish the exchange value of an
  axe and knife without exposing absolute hidden stats.
- The squared damage law made fair mirrors resolve and made reach matter by
  widening useful dead zones; knockback alone did neither.
- Opponent-relative minimum strike range replaced one global standoff distance.
  Its first zero tuning was partly compensation for wrong geometry, and the
  alleged four confirming runs were one ignored seed repeated. Both corrections
  stay on the record.
- A dedicated body-check stance was built and removed after ordinary trading
  outscored it throughout the current contact geometry. Weight percepts survived
  because they answer other decisions.

## Superseded DESIGN.md headings

This document is the proposed compatibility destination for these former
headings: `The swing`; `Actions and loadouts`; `The swap, and why it costs what
it costs`; `What this cost, honestly`; `Why it is a state machine and not a
bearing`; `Where you stand still decides what it costs`; `Perception is a
fighting stat, and the split is deliberate`; `What measurement said, including
where it disagreed`; `The difficulty range, which is what all of it is for`;
`Weight, momentum and inertia` and all of its subsections through `The ladder is
an anti-objective, and fitness cannot hold both ends`; and `Rules that exist for
termination, not for flavour`. The combat portions of `Open questions` move to
`Open combat questions`; answered struck-through notes remain explicitly
historical there rather than disappearing.

Compatibility links should point the old top-level swing, weight, and
termination anchors to [`combat.md`](combat.md), with more specific old anchors
targeting the same-named sections above. Exact action/loadout claims should
instead target [Commands](../reference/commands.md).

The linked evidence record preserves the consolidated measurement and correction
account behind these former
anchors whose wording did not become standalone headings here:
`DESIGN.md#two-things-the-recoil-model-got-wrong-first-both-measured`,
`DESIGN.md#what-it-cost-and-what-it-did-not-buy`,
`DESIGN.md#a-rounding-bug-was-deciding-mirror-matches`,
`DESIGN.md#the-squared-law-is-what-finally-made-reach-pay`,
`DESIGN.md#a-phase-3-bug-that-only-became-expensive-here`,
`DESIGN.md#the-wrong-triangle-and-a-second-one-underneath-it`,
`DESIGN.md#four-things-a-fighter-was-given-to-do-about-weight-of-which-two-survived`,
`DESIGN.md#a-fifth-change-nobody-asked-for-which-the-barge-exposed`, and
`DESIGN.md#what-it-came-to`.

## Source anchors

- Limb phases and transition rationale: [`hand.rs`](../../crates/sim/src/hand.rs#L92)
- Action roles and registry: [`action.rs`](../../crates/sim/src/action.rs#L28)
- Loadout mutation: [`loadout.rs`](../../crates/sim/src/loadout.rs#L18)
- Tick ordering and combat resolution: [`world.rs`](../../crates/sim/src/world.rs#L2207)
- Damage, blocking, regeneration, and recovery constants: [`rules.rs`](../../crates/sim/src/rules.rs#L39)
- Duelist spacing and stance decisions: [`duelist.rs`](../../crates/policy/src/duelist.rs#L1)
- Termination outcome: [`World::timeout`](../../crates/sim/src/world.rs#L3863)
