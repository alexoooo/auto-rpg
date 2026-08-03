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

That bill has been paid four times, deliberately, and all four times while no
weights existed. Adding `Order::Goto` and `decision_period` moved the vector from
73 to 75 slots (version 2) and changed what the order-direction slot *means*.
Two-handed combat then moved it from 75 to 205 (version 3): a contact went from
five numbers to fifteen, because a defender that cannot see where an enemy's
blade is pointing and how fast it is turning cannot block, dodge, or punish a
recovery. The phased attack moved it again (version 4): a contact went from
fifteen numbers to twenty-two, because a defender that can see a blade's bearing
and speed but not whether it is *committed* has no way to tell a feint from a
cut, or a recovery from a guard.

Version 5 adds one number to each contact and one to the self block, and both are
about *where to stand and when to move*. `Contact::min_strike_range` is the
enemy's dead zone, without which the strongest answer to a heavy weapon in the
game is not derivable from an observation at all — a contact said how long a
blade was and nothing about how fast it could be swung. The self block gains how
braced the shield is, which nothing else implies: a bearing and a spin say where
a guard is and how fast, and neither says how long it has been *there*, which is
what decides whether it stops a blow or is merely near one.

Version 6 adds two numbers to each contact, and they are the first entries in the
vector that are neither a measurement nor a state — they are the **stakes**.
`Contact::threat` is what one clean blow from that enemy costs as a fraction of
your own bar; `Contact::frailty` is the same blow the other way. Everything a
policy could previously read was scale-free by construction (positions, angles,
health fractions), which was the right instinct and left exactly one hole:
`power`, `weapon.weight` and `max_hp` are all absolute, all correctly kept out of
an observation, and between them they decide whether an exchange is a scratch or
a third of the fight. A Brute's axe is 0.32 of a Warrior, 0.74 of a Skitterer,
and a Skitterer's knife is 0.08 of that same Warrior. A fighter that cannot tell
those apart except by blade length is not reading the fight, and no amount of
perception was ever going to fix it.

Neither is much use alone, which is why both landed at once: knowing you are two
blows from death is half a decision, and the answer is completely different
depending on whether the thing in front of you is five blows from death or one.

The phase block is a one-hot and not a number, for the same reason every angle is
a `(cos, sin)` pair. The four phases are not points on a scale — a recovery is
not "more" than a windup — and encoding them 0, ⅓, ⅔, 1 would ask a network to
learn that the most dangerous state and the most punishable one sit next to each
other.

Doing this now costs nothing; doing it after a training run costs the training
run. `FEATURE_LAYOUT_VERSION` exists so that a future frozen network can refuse to
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

Note what the player is *not* given. The pointer used to set the blade's bearing
and its extension directly, which is the same interface a policy had and led to
the same place: a stick held at full length and waved. It now sets the **line**,
and the mouse button is the **cut**. Everything between the two — the windup, the
arc, the extension, the recovery — belongs to the attack. That is a smaller
vocabulary and a much larger game, and it is the same vocabulary the AI has, so
the two remain comparable.

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

A character has two hands, and they take different kinds of order.

The **shield** takes a bearing and an extension, and accelerates toward it under
a torque cap. That has not changed and does not need to.

The **sword** takes a *line* and a *release*, and the sim runs four phases
against them:

```text
 Guard  — blade chambered on the commanded line, inert
   │ strike command, and the hand is armed
 Windup — cocked 67.5° off the line. Visible. Cancellable. The line still tracks.
   │ the telegraph runs out
 Strike — driving to 78.75° past the line, at speed.
   │        LIVE. The line is frozen; the command cannot recall it.
   │ spent on its own arc, or STRIKE_TIMEOUT
Recover — bringing the blade back. Inert, and cannot attack.
   │ the weapon's recovery, plus a penalty if it was stopped
 Guard
```

### Why it is a state machine and not a bearing

The first version of this model let an agent command the blade's bearing every
tick. That is a strictly more expressive interface, and it produced exactly one
strategy: hold the blade at full extension and rotate it as fast as the torque
cap allows. Nothing charged for it, every tick of rotation was a live hitbox, and
so the optimal play — for a hand-written policy, for evolution, and for a person
with a mouse — was a windmill.

The deeper problem was not that windmilling was strong. It was that there was no
instant at which an attack *began*, which meant there was no instant at which one
could be read, dodged, or punished. A combat model in which nothing can be
anticipated has no skill ceiling to have a gradient along.

Three properties replace it, and they are the whole point:

- **An attack announces itself.** The windup is real time on the clock — 33 ticks
  for a Brute, 7 for a Scout — and it is in the defender's observation. What a
  fighter can answer is set by how often it is allowed to think, so a Brute's
  telegraph buys a Warrior two or three decisions and a Skitterer four, while a
  Scout's telegraph buys a Brute *none at all*.
- **An attack commits.** Momentum was always unreversible; now the decision is
  too. Past the telegraph the line is frozen and the command is not read.
- **A miss costs.** Recovery is a window in which the hand cannot attack, cannot
  parry, and cannot be recalled — and it is longer when a shield or a blade
  stopped the cut, longer still when the cut touched *nothing at all*
  (`WHIFF_RECOVERY`), and a blow landing into it does half again its damage
  (`RECOVERY_EXPOSURE`).

The strike window is computed per weapon (`strike_ticks`) and not a constant, and
that correction is worth recording because the constant version was a bug wearing
tuning's clothes. A flat 45 ticks is ample for a Warrior and nowhere near enough
for a Brute: an extended blade turns at `torque × agility × (1 - REACH_DRAG)`,
20.6 raw units per tick squared, against 23,040 units of arc. **Every heavy
attack in the game was cut off eight degrees short of its own line**,
mid-acceleration, having never crossed the point it was aimed at — so a Brute
could only hurt what it met on the approach side of its swing, standing in front
of one was safe, and the archetype the entire telegraph model was built around
was the easiest thing in the game to fight. It was invisible because the fights
still *looked* right; only the damage was missing.

The slack on that calculation is measured rather than reasoned, and it went the
opposite way to the intuition: the *lightest* weapons need the most, because a
quick hand overshoots its windup further relative to the arc it then has to
cover.

Damage is gated on `Swing::Strike` and on nothing else. That one line is what
ended the windmill: a blade rotating outside its strike window is furniture.
Extension is not the gate and never was a good one — a fighter has every reason
to keep a guard chambered, and a guard that cuts is a guard nobody would drop.

**A windup tracks; a strike does not.** This is the correction that made heavy
weapons playable rather than merely slow. Freezing the line at the start of the
telegraph reads as the principled choice and is quietly fatal: a Brute announces
for 33 ticks, over which a Warrior walks 1.8 units — further than the Brute's
entire blade — so every heavy attack in the game missed by ambient movement, and
the archetype lost to everything at every skill level. Tracking also spends the
intellect stat a second time, because an action persists until its owner's next
decision: a Brute re-aims twice inside its own windup and a Scout thirty times.
Dodging a sharp fighter means beating a cut that is following you.

**Holding the button down throws one attack.** An attack begins only on a strike
command that follows a non-strike command. Without that, attacks chain back to
back and the windmill returns with extra steps. It is a trap for policy authors,
and it is pinned as a test name rather than left to be discovered.

### Where you stand still decides what it costs

Damage is the blade's speed at contact, so **where on the arc you meet it matters
as much as whether you meet it at all**. Nothing encodes this: impact is
`spin × arm`, so every weapon has a radius inside which even a full-speed blade
cannot reach `IMPACT_THRESHOLD`.

That dead zone changed *kind* when the threshold came down from 0.09 to 0.06, and
the change is worth recording. The threshold used to have two jobs — the dead
zone, and stopping a blade carried into someone by walking from being a weapon.
The phase gate does the second job now, so the threshold could come down; and it
had to, because at 0.09 a Brute's dead zone reached 1.27 units, which is *outside*
the 1.15 at which a Warrior's body and its own stop being able to approach. A
fighter that got close became flatly immune, a small enough one became immune and
harmless at the same time, and the fight timed out. At 0.85 the circle is
unreachable and what is left is the gradient — but the gradient is *steep*, and
steeper than that sentence used to admit. Measured end to end on a stationary
Warrior, a Brute's worst blow is 26.5 at the tip of its arc against 2.0 pressed
against its chest: thirteen to one, from spacing alone, with no read and no
timing involved.

That number is the reason `Contact::min_strike_range` had to exist. A single
scalar worth 13× is not a tactic, it is a lookup — and while it was not derivable
from an observation, it was a lookup only the *author* of a policy could perform,
by hand, once, for every matchup. Making it a percept turns it back into a
decision: a sharp fighter finds the line and a dim one misjudges it by a tenth of
a unit, which against a Brute is four points a blow against thirty.

Two consequences worth stating because they are counterintuitive:

**The angular window in which a blade reaches a body narrows with distance.** So
a distant target is hit rarely and hard, and a near one often and weakly, and the
two effects pull against each other. Choosing a range is a decision rather than a
lookup.

**A shield covers where the blow lands, which is not where the enemy is — and is
not where the blade is either.** A cut sweeps in and first touches a body well
round from its wielder; an overhead swing lands on top of you. And during a
windup the blade is cocked *away* from the line it will travel, so covering the
blade covers the one bearing the cut cannot arrive from. `policy::swing::landing`
replays the declared cut to answer both questions at once, including the one that
matters most: *is it even aimed at me?* Adding that gate took the duelling policy
from 21% to 88% against the naive one in a mirror match. A fighter that treats
every attack in its vicinity as its own problem never wins anything.

**And a shield has to be *planted* to be worth anything.** Covering the right
bearing used to be instantaneous: a guard was in the arc or it was not, and one
flung across at the last tick stopped exactly as much as one that had been
waiting there. That made the telegraph worthless — the whole point of half a
second of warning is time to *finish moving*, and there was nothing to finish, so
every measurement said reading an attack early was a waste of tempo. A hand now
carries `braced`, the ticks it has been settled, and a guard leaks
`BLOCK_LEAK_SNAP` while travelling against `BLOCK_LEAK_BRACED` planted — five to
one. `BRACE_SPIN` is deliberately loose enough that a guard tracking a walking
enemy stays braced; tighten it and nobody is ever braced, and the rule becomes a
flat nerf to blocking instead of a statement about timing.

### Perception is a fighting stat, and the split is deliberate

Positional error scales with range: exact at arm's length, full at the edge of
sight. A flat error is the obvious model and it is wrong in a way that only
appears once aiming is geometric — half a unit of uncertainty is nothing at ten
paces and is thirty degrees of aiming error at two, against a window sixteen
degrees wide. Every archetype stood nose to nose and missed, and the fights timed
out.

The attack phase itself arrives **exact**, and its *timing* and its *line* are
blurred hard. That asymmetry is the design. A blade hauled back over a shoulder
is not a subtle cue — anyone can see a blow is coming. What separates fighters is
knowing when it lands and along which line, and at `perception 0` the timing read
has a standard deviation of about twelve ticks against a Brute's thirty-three
tick telegraph. A dim character is not blind to the attack. It is late, and it
guesses the line wrong, which is a far more interesting way to lose.

### What measurement said, including where it disagreed

**Committing matters more than choosing well.** A defensive stance commands the
blade back to guard, and that cancels a running windup. A duellist that re-read
the situation every few ticks started a cut, disliked something, called it off,
started another, and landed nothing: one duel in ten against the policy it is
supposed to beat. Evolution independently pushed `resolve` to the top of its
range for the same reason, and has done so in every run since.

**Reading telegraphs early used to be a losing strategy, and is now the best
thing a fighter does.** This one reversed, and it is worth keeping both halves
because the reversal is the clearest evidence that the mechanics underneath
actually changed rather than merely moved.

The old finding was real: every value of `read_ahead` above its floor made the
duellist worse, 92% down to 57% as it rose. The reason was not that reading is
useless but that *nothing was for sale*. A shield covered an arc or it did not,
and covering was instantaneous — so answering a windup early bought nothing that
flicking the guard across on the last tick did not also buy, while costing every
cut you did not throw. The whole telegraph existed to be answered, and answering
it was strictly a waste of tempo.

A guard has mass now. It has to be *planted* — see `Hand::braced` — and a shield
still travelling toward the bearing a blow arrives on leaks five times what a
settled one does. That is the thing the telegraph was always supposed to be
selling: not information, but time to finish moving. Evolution now pins
`read_ahead` to the **top** of its range, and reading late is worse than not
reading at all, which is a far better shape for a skill than a free lookup.

**A miss has to cost, or a dodge is worth nothing.** `evasion` evolved to zero
under the old rules and `guard` beat it ten to one, which read as "the shield is
the reliable answer" and was really "stepping off a line is unpaid work". A cut
that touches nothing now pays `WHIFF_RECOVERY` on top of its weapon's own
recovery, and a blow landing into a recovery does half again its damage
(`RECOVERY_EXPOSURE`) — so a dodge is no longer merely *not being hit*, it is the
setup for the best exchange available. `evasion` and `punish` both come back
high now.

**Refusing to fight erases the skill gradient, so it has to be priced.** Given a
weak enough time penalty, evolution found the obvious hole: maximum evasion,
maximum flank, no guard, orbit a Brute that walks 17% slower than you do and
grind it down over seventy seconds. It won 99% of its duels that way. The problem
is not that it is dull — it is that *a fighter which refuses to trade needs no
reaction speed and no eye for a blade*, so `intellect 19` and `intellect 8`
posted the same win rate and the same surviving health, and the entire difficulty
range collapsed into one rung. Skill lives in the exchange. `lab::fitness`
charges a point per 150 ticks for exactly this reason.

### The difficulty range, which is what all of it is for

One `DuelistPolicy`, one set of weights, one Warrior body, three values of
intellect and perception, against an unchanged Brute on the naive policy. 240
seeds a row, and not one draw anywhere on it:

| `intellect` / `perception` | decisions | noise | win rate | health when it wins |
|----------------------------|-----------|-------|----------|---------------------|
| 0 / 0                      | every 30  | 2.25  | 29%      | 0.08                |
| 1 / 2                      | every 24  | 1.55  | 53%      | 0.15                |
| 2 / 2                      | every 18  | 1.55  | 73%      | 0.22                |
| 3 / 3                      | every 17  | 1.20  | 88%      | 0.36                |
| 8 / 6 (a stock Warrior)    | every 12  | 0.90  | 99%      | 0.57                |
| 12 / 10                    | every 8   | 0.50  | 100%     | 0.70                |
| 19 / 18                    | every 1   | 0.00  | 100%     | 0.73                |

Re-measured twice, and both times the shape changed in a way worth recording
rather than smoothing over.

**When bodies gained momentum**, the bottom rung came *up* (10% to 19%) and the
top came *down* on health (0.82 to 0.69), narrowing the range. Both moves have
the same cause: a body that needs fourteen ticks to reach its top speed cannot
step out of an arc it has just read, so the reward for reading well is smaller
and the punishment for reading badly is too.

**When weapons became physical**, the win-rate column rose across the board and
the health column *fell* at the dim end and rose at the sharp end — the range
widened again, on health rather than on wins. A dull swordsman now scrapes
through at 0.15 rather than winning comfortably at 0.33. Wins saturate early
enough (99% by the stock sheet) that health is doing most of the work of
distinguishing the top three rungs, which is thinner than it should be and is a
tuning target for the impulse and energy phases rather than something to fix by
moving a constant here.

Swept at the sharp sheet, `evasion` produces **identical** results anywhere from
0.0 to 0.76 — the stance is simply never chosen — and collapses the fight to 20%
at 1.2. Dodging lost to blocking and out-tempoing. That is a defensible answer
and it is not obviously the *best* answer, because the weights it was measured on
were evolved against instantaneous movement. Re-evolving under momentum is the
open question, not a settled result.

The policy axis is still there and still steep — a random policy loses every
time, and the naive one is far below any of these — but the row above is the
claim worth making, because every row runs the *same* swordsman. Levelling
intellect is not a damage multiplier; it is being allowed to think more often.
Levelling perception is not a sight radius; it is knowing where the blade will
be, and how close you can safely get to the one holding it.

Five things had to be true at once for that table to exist, and none of them were
before:

1. **A heavy weapon has to be able to finish its swing.** A flat 45-tick strike
   window meant a Brute's cut was cut off eight degrees short of its own line,
   every time it swung — so the archetype the whole telegraph model was built
   around could only hurt what it met on the *approach* side of its arc, and
   standing in front of one was safe. `strike_ticks` computes the window from the
   weapon instead. This was the single biggest cause: the dim end of the range
   used to *win* two fights in three.
2. **The health axis needs resolution.** At `IMPACT_TO_DAMAGE` 135 a duel was
   three or four landed blows, so "won on half its health" and "won almost
   untouched" were one blow apart and read as luck. At 60 it is a dozen a side.
3. **Losing has to be reachable.** The stat curves gained a steeper stretch below
   the dimmest archetype (`DIM_INTELLECT`, `DIM_PERCEPTION`), so a character can
   be built worse than anything in the roster without any archetype moving.
4. **A bad fighter has to lose rather than wander off.** Three separate rules:
   regeneration is gated on line of sight rather than on a timer, it is budgeted
   at one bar per fight so a retreat cannot un-lose an exchange, and a timeout is
   decided on remaining health instead of thrown away as a draw.
5. **`Advance` has to be a patrol.** Two sides ordered to advance at each other
   cross over, reach opposite walls, and — with a memoryless sweep — pace two
   parallel lines twenty units apart until the clock stops. That was one duel in
   six at the dim end, both fighters at full health. One byte of memory per
   entity (`utility::Patrol`) fixed it, and took the draw rate to zero.

## Weight, momentum and inertia

The arm was physical from the beginning — `Hand` carries angular velocity across
ticks, accelerates under a torque cap, brakes so as to arrive at rest, and has
its spin reversed by a parry. The body was not. `apply_movement` was
`pos += dir * move_speed`: full speed on the tick it was told, reversed on the
tick it was told, and `vel` was not state at all but a measurement recomputed
each tick as `pos - start_pos`, purely so a blow could read a closing speed.

The two halves are now the same kind of thing.

### Mass is geometry unless stated otherwise

`UnitKind::mass()` is `density * radius^2`, normalised so a Warrior weighs 1.00.
Area and not volume: a cube law puts a Brute at four Warriors and a Skitterer at
a third of one, and at that spread the light archetypes cannot hold ground at
all. `density` is the one dial that says an archetype is *built* differently
rather than merely scaled — a Brute is meat and plate at 1.15, a Skitterer is a
light thing for its footprint at 0.80.

Mass is deliberately **not** a stat. Stats are the difficulty ladder's knobs, and
a mass that moved with them would tie every physical interaction in the game to
the dial that decides how well a fighter *uses* them. A dim Brute and a sharp one
weigh the same.

### Traction is grip, not weight

`Stats::traction` has no mass term, and that is physics rather than an omission:
ground friction is `mu * m * g` and the acceleration it buys is `mu * g`, so the
mass cancels. What decides how fast a body can change direction is how well it
digs in, which is agility. A Brute is ponderous because it has `agility 2`.

Weight is not being let off. It is charged where nothing cancels it — what a
collision does to you, and (once the rest of this lands) what a blow throws you
and what your own swing drags you into.

`TRACTION_BASE` is tuned against **stopping distance** rather than acceleration:
`v^2 / 2a` comes out between 0.33 and 0.45 units across the roster, or about one
body radius. That is the whole point. Spacing used to be a question about
position — stand at the right distance and you were safe, arbitrarily late — and
is now a question about commitment.

### What it broke, and what that says

Three things fell over immediately, and each was a latent bug that instantaneous
movement had been hiding:

1. **A wall banked momentum.** `clamp_to_arena` clipped position and left
   velocity alone, which was harmless while velocity was re-derived from
   displacement. With velocity carried across ticks, a body pinned against a wall
   stayed convinced it was running at full speed — and both `impact_speed` and
   `separate` believed it, so it shoved anyone who came near it, forever, without
   moving. The symptom was a 4v6 that could not finish. `clamp_body` now zeroes
   the clipped axis only, so sliding along a wall still works.
2. **Bang-bang control oscillates.** The duellist drove at its preferred range
   flat out and expected to stop dead on arrival, so it slid back and forth
   through the one distance it wanted to be standing at. It now paces the
   approach by `sqrt(2 a d)` — the same braking law `Hand::track` has always run
   on the arm. Worth 10 points of win rate on its own.
3. **`Goto` overshot by design.** The stride brake budgeted the travel a decision
   commits to before the next thought, which was the whole story while a body
   could stop dead. It now solves for a speed that covers the open-loop period
   *and* leaves room to stop, bounded twice — once assuming the request is
   already in force, once charging the whole period at the speed the body is
   actually doing, because the deceleration ramp covers ground the first bound
   never counts. Measured backslide across every test target: exactly zero.

### The hit test had to stop being a physics limit

`segment_circle` samples closest approach at one instant, which is correct only
while nothing crosses a whole body between two samples. That invariant is what
pinned `agility_multiplier` to a ceiling of 2.00 — a *geometry shortcut deciding
how fast a character may move* — and it already held with only a tenth of a body
radius to spare while ignoring body motion entirely. A blow that can throw a body
would have ended it.

`fx::swept_segment_circle` walks the pair through `n` sub-steps and runs the
existing exact predicate at each, with `n` derived from relative travel measured
in radii of the body being tested. A fixed integer count from a fixed rule, so it
is exactly as deterministic as the single test it replaced, and auditable by
reading it rather than by trusting a quadratic solve in fixed point. At `n = 1`
it is bit-identical to the old call on the end state.

It found real blows that were being missed: wiring it in moved `LAB_HASH` on its
own, with nothing else changed. The agility ceiling stays at 2.00, but it is a
balance choice now — agility already buys reaction, sight, footspeed and swing
speed, and a stat with four jobs and no ceiling is the shortest path to one
dominant build.

### What the agent can see (layout version 7)

`Observation::velocity` and `Contact::velocity` in world units per tick, plus
`Observation::traction`. World-frame rather than closing rates, because the
difference of the two *is* the closing rate while the reverse cannot be
recovered. Enemy velocity blurs by `VELOCITY_JUDGEMENT`, which is its own
constant rather than a reuse of `CAPABILITY_JUDGEMENT`: sizing up what a stranger
*can* do is a different kind of mistake from watching a body move, and the second
gets easier as you close while the first does not.

The version bump is load-bearing. Every earlier layout described a world in which
a body could stop dead on any tick, so a policy frozen against one has no
representation for commitment at all — not a missing input, a missing *concept*.

### A measured negative: leading a target does not pay

The obvious first use of `Contact::velocity` is to throw a cut at where an enemy
will be rather than where it is. It was implemented as a gene and swept over 240
duels against both opponents, and it is **worse at every value**: 91% at zero
ticks of lead, 89% at twelve, 69% at twenty-eight, 49% at forty. A cut sweeps a
90-degree arc and the sim already aims the far end past the target, so the swept
area barely moves — while the lead itself is computed from a *perceived* velocity
and adds its error to an aim that was fine. The gene was removed rather than
shipped at zero: an unused knob costs every future evolution run a dimension.

The percept stays. It is in the vector for a network to use, and knockback will
give it a second job.

### Weapons became physical, and one cliff came with it

`Weapon` used to carry `torque`, `max_spin`, `extend_rate` and `weight` as four
independently authored numbers all meant to express the same fact, plus a
`REACH_DRAG` constant approximating a lever arm. It now carries `length`, `mass`
and `balance`, and `Arm::resolve` derives the rest against the body doing the
swinging:

```
lever(reach) = body_radius + balance * length * reach
I            = mass * lever^2 + ARM_INERTIA
accel        = MUSCLE_TORQUE * power * agility / I
cap          = MUSCLE_SPIN * agility * grip_limit(weapon, body_radius)
```

An extended blade is slow because its mass is further from the shoulder, which
is what `REACH_DRAG` was always a linear approximation of. A Brute's axe on a
Skitterer's shoulders is a different weapon — the correct answer, and one the old
table could not express.

The spin cap is the part worth reading, because two obvious derivations are
wrong. Deriving it from an energy budget makes weapon mass **cancel out of damage
entirely**: a fixed torque over a fixed arc does fixed work, so every weapon would
arrive carrying the same energy. Making it a flat property of the arm puts every
heavy weapon so far into the work-limited regime that its blade is still
accelerating when it lands. What is actually right is a *grip* limit,
`sqrt(REFERENCE_GRIP / (mass * lever))` — you cannot hold a heavy weapon swung
fast — and the failed models are recorded in `grip_limit`'s doc comment so the
next person does not re-derive them.

**And then the Brute stopped working, with every derived number saying it should
be stronger.** Tip speed up (0.188 against 0.153), strike budget unchanged, dead
zone *smaller*, peak damage within 7% — and the naive Warrior's win rate against
it went from 10% to 76%. The cause took several wrong hypotheses to find and it
is a cliff rather than a slope:

> A blow of any size ends the swing that threw it. So `IMPACT_THRESHOLD` was not
> a floor, it was a **discontinuity**: a contact one unit above it did essentially
> no damage and still cost its owner an entire cut, and landing *below* it was
> strictly better, because a blade that touched nothing kept swinging into the
> part of its arc where it was actually dangerous.

Contacts happen at body-to-body range whatever the blade length — measured, both
fighters in a duel contact at about 1.17 units from their own centre, because
that is where the other body is. For a Warrior that is 83% of the way to the tip;
for a Brute with a 1.45 blade it is a third. Deriving the cap from grip moved a
Brute's top spin from 741 to 911 and its dead zone from 0.845 to 0.687 — *inside*
its own 0.70 body radius — so no part of its blade could touch anyone harmlessly
any more. Every cut it threw was spent on a hilt scratch worth 1–3 damage against
a peak of 24.8.

`GRAZE_FRACTION` turns the cliff into a ramp: a contact worth less than 12% of
that fighter's own `peak_damage` is not a cut, deals nothing, and **does not spend
the swing**. It is scale-free, so it does not need re-deriving per archetype, and
it took the Brute's damage per landed blow from 1.24 back to 4.29.

Two things it deliberately does not do. It does not guarantee the harmless band
reaches past the wielder's own body — that holds for a Brute (0.86 against 0.70)
and is load-bearing there, but a Scout's dead zone is 0.27 inside a 0.35 body and
always has been, because a short quick blade really is dangerous along its whole
length. Forcing otherwise needs `GRAZE_FRACTION` above 0.43, which measurably
flattens the difficulty ladder. And it does not make reach pay: a long blade whose
first third is all anyone ever touches is still mostly decoration. That is what
knockback is for, and it is the next phase.

The regression test that would have caught this existed and did not, because it
re-derived the dead zone inline from `IMPACT_THRESHOLD` instead of asking
`rules::dead_zone`. It asks now.

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

`HandCommand::strike` is hashed on **both** hands even though only the sword
reads it. The alternative is a hash that depends on which slot a command landed
in, and a replay that cannot tell "attack" from "guard" apart reproduces the
footwork and none of the fight.

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

It has since been fenced twice, because the rule that stops a fight stalling will
happily stop it *ending*:

- **Out of combat means out of contact.** Timing it from the last blow alone is
  the obvious reading and it is wrong: an exchange takes a couple of seconds and
  `REGEN_DELAY` is three, so two fighters circling each other at arm's length
  heal between every trade and a bad one can never be ground down. It reads badly
  too — wounds closing while an enemy stands four feet away with a sword out.
  `World::enemy_in_sight` is the gate.
- **`REGEN_BUDGET` bounds the whole fight at one bar.** Unbudgeted regeneration
  does not heal a fighter, it *resets the fight*: withdraw, wait, and the
  exchange you just lost never happened. At the dim end of the skill range one
  duel in five ended with both fighters at full health and the clock stopped —
  scored a draw, correctly and uselessly, because by then it was one. Retreating
  to recover is now a resource rather than a reset.

**A timeout is decided on points**, to whichever side holds more of the health it
started with (`World::timeout` → `Outcome::Decision`). A draw was the honest
answer while the clock was the only thing that could end a fight neither side was
winning, and it is the wrong answer for a difficulty ladder: every step *down*
that ladder converts a loss into a timeout rather than into a defeat, and the
bottom of the range stops meaning "loses" and starts meaning "wanders off".
`Outcome::is_decisive` keeps a decision distinguishable from a kill, and
`lab::fitness` prices it at 55 against 100 — enough to beat dying, not enough to
make chipping once and running out the clock a strategy.

**`Order::Advance` is a patrol, not a march.** An agent that reached the far wall
used to sweep along it, which turns a stall into a patrol of a *line* — and two
sides ordered to advance at each other cross over, arrive at opposite edges, and
pace two parallel lines twenty units apart for the rest of the run. One duel in
six at the dim end of the skill range ended that way, both fighters at full
health, out of each other's sight for eight thousand of nine thousand ticks.

The fix needed one bit of state (`utility::Patrol`), and needing state is the
interesting part: a memoryless rule cannot do it. Whatever makes an agent step
away from a wall stops applying the moment it has stepped away, so it twitches on
the spot in a band a unit and a half wide. Remembering which way you were walking
costs a byte and took the draw rate to zero.

**Damage per impact, and the tick limits.** `IMPACT_TO_DAMAGE` went 60 → 135 when
the sword became a phase machine, because a windmill billed a blow every nine
ticks and a measured attack is a windup, a cut and a recovery. It has come most
of the way back down, to 60, and the reason is **resolution** rather than pace: at
135 a Brute's blow was worth up to 57 against a Warrior's 84 health, so a duel was
three or four landed blows and "won on half its health" and "won almost
untouched" were one blow apart. That is not enough rungs to hang a difficulty
range on. At 60 a duel is a dozen blows a side, one misread is a visible dent
rather than a third of the fight, and both tick limits sit at two and a half
minutes.

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

**Search behaviour.** A patrol is still not search — an agent remembers which way
it is walking and nothing about *where it has already looked*. It is enough that
two fighters in a duel arena reliably find each other again, which is what the
draw rate needed, and it is not enough to spawn a skirmish across the full arena:
those spawns are still confined to a vertical band. Better than papered over,
short of solved.

**Self-play.** Evolution currently scores candidates against a fixed hand-tuned
opponent, which measures "better than what we wrote by hand". Self-play measures
something more interesting and introduces the usual instabilities. It would also
answer a question this milestone left open: every number in the difficulty table
is measured against a *naive* Brute, so what the range really shows is one
swordsman's wits against a fixed opponent, not against a good one.

**Fitness shaping.** The current function rewards winning, then surviving health,
then damage, with a time penalty. The time penalty is load bearing twice over.
Without it at all, "run away and survive to the tick limit" outscores "attack and
sometimes die". And with it merely *weak*, evolution finds the subtler version:
refuse every exchange, orbit a slower opponent, win 99% of duels over seventy
seconds — which erases the skill range, because a fighter that never trades needs
neither reaction speed nor an eye for a blade.

**The duel arena's opponent decides the answer, and the fitness function cannot
tell.** Evolved against a *duellist* Brute rather than a naive one, four
genuinely independent runs all returned `standoff` between 0.68 and 0.99 with
`evasion` pinned at its ceiling, scoring 100% and 0.76 surviving health. Those
same genomes win 19% to 45% against the naive Brute. Standing off beats an
opponent that reads you and hesitates and is suicide against one that walks in
swinging, because the tip of the arc is the worst place on it — so what evolution
found was not a better fighter but a counter to one opponent, at a fitness score
that looked like a clear win over the hand-tuned weights. The shipped genome is
the hand-tuned one for that reason. This is the same shape of problem as the
kiting collapse below, and neither is fixed by shaping fitness harder: a single
fixed opponent is the thing being overfit.

**~~A policy cannot tell an axe from a knife.~~** Answered. `Contact::threat` and
`Contact::frailty` carry what one clean blow is worth in each direction as a
fraction of the bar it comes off, which is the relative form of three absolute
quantities (`power`, `weapon.weight`, `max_hp`) that are correctly kept out of an
observation. The first thing it bought: breaking off is now counted in blows
rather than in health. `hp_frac < caution` was a decision about yourself and not
about the fight — 20% of a Warrior is two more knife cuts or most of one axe blow,
and one number cannot mean both — and it is now `blows_left < caution`, with a
second clause that refuses to run from someone closer to dead than you are.

**The difficulty range is measured on one matchup.** Warrior against Brute, which
is the fight the swing model was designed around and the one with the widest
gradient in it. Whether `intellect` and `perception` buy as much against a Scout
— seven ticks of telegraph, which is under a stock Warrior's reaction time — is
not something the table above answers, and the honest guess is "much less".

**~~One `standoff` gene cannot serve every body.~~** Answered.
`Contact::min_strike_range` carries the threat's dead zone, so preferred range is
chosen from the *threat's* geometry: the larger of "where my own blade starts to
bite" and "where its blade stops biting", with `standoff` spending the distance
out toward arm's length. Sometimes the second is beyond the first and there is a
band in which a fighter can reach and cannot be reached — a Skitterer has about a
twentieth of a unit of it against a Brute and a Warrior has none at all and must
trade, which is a real asymmetry that falls straight out of the geometry.

The gene ships at **0.000**, which reads like an extreme until you notice it no
longer means "how close to its body". It means how far outside the safest place
you can still fight from to stand, and zero is the considered answer. Swept
directly against a naive Brute over 240 duels it is not close:

| `standoff` | 0.000 | 0.200 | 0.400 | 0.600 | 0.800 | 1.000 |
|------------|-------|-------|-------|-------|-------|-------|
| win rate   | 98%   | 87%   | 72%   | 40%   | 25%   | 17%   |
| health won | 0.60  | 0.44  | 0.37  | 0.32  | 0.23  | 0.24  |

An earlier note here claimed the value came back at 0.000 in four independent
evolution runs. It did not: `lab evolve` takes `--master-seed` and the runs were
launched with `--seed`, which it ignores, so those were one run reported four
times. The sweep above is the real evidence and it is stronger than the claim it
replaces — but the mistake is worth leaving on the record, because "four runs
agreed" is exactly the kind of statement that sounds like independent
confirmation and can be neither.

The error in that read is asymmetric on purpose, and it is where most of the
difficulty range lives. Guess the enemy's dead zone *low* and a policy's own
floor protects you. Guess it *high* and you stand off a weapon you could have
crowded, which against a Brute is four points a blow against thirty. A dim
fighter respects a big weapon's reach and is killed by it.

**The side a cut comes from is a decision the player cannot make.** `Strike`
carries three options and the page only ever sends `Nearest`. Choosing the flank
a guard is not on is one of the sharper reads in the model, the AI makes it, and
there is no second mouse button left to spend on it.
