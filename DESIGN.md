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

`Observation` in, `Command` out. That is the entire interface.

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
a third of the fight. A Brute's axe is 0.32 of a Fighter, 0.74 of a Skitterer,
and a Skitterer's knife is 0.08 of that same Fighter. A fighter that cannot tell
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
not add a channel: the host still answers with an `Command`, the sim still cannot
tell what produced it, and `Observation` in / `Command` out is untouched. What
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

A character has **one** limb, and what it does with an order depends on what is
in it.

It used to have two — a sword hand and a shield hand — and that was a worse
model than it looked. Nothing charged for the second one. A shield held at full
reach cost no tempo, no attack and no ground, so every policy in the crate held
one out permanently, unconditionally, in all eight stances. Defending was never
an *alternative* to pressing; it was something you got for free while pressing,
and the test that measured "answering a telegraph" as a losing strategy was
measuring exactly that.

So a character now carries a **loadout** of up to two [actions](#actions-and-
loadouts) and holds one at a time. Which one is the decision the fight turns on,
and it is paid for in ticks.

A **guard** action takes a bearing and an extension, and accelerates toward it
under a torque cap. That half of the model is unchanged.

A **strike** action takes a *line* and a *release*, and the sim runs four phases
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

### Actions and loadouts

A **body** is a size, a weight and a stat sheet. It is not a swordsman.

That distinction did not exist until recently. `UnitKind` carried a radius, a
density, a stat template, a weapon *and* a shield arc as one indivisible fact, so
a Skitterer did not carry a knife — it *was* one, and "what does a Brute with a
knife play like" was a question with no representation anywhere in the codebase.

Now there are two things. `Body` is the four rows above. `ActionKind` is a
registry of mechanics — punch, knife, shortsword, sword, club, shield, and two
reserved rows for run and bow — and each is an `ActionSpec`: a role, a length, a
mass, a balance, a guard arc, a windup, a recovery, and a `ready` cost. The role
is the only thing the sim branches on:

| role | blade hitbox | blocks | phases |
|---|---|---|---|
| `Strike` | yes | no | the four above |
| `Guard` | no | yes, over `arc` | none; sits at `Guard` |
| `Move` | no | no | none; buys footspeed |

`Arm::resolve(spec, stats, radius)` is where the two halves meet, and it is
rebuilt on every call so it cannot go stale when a fighter changes its mind
mid-fight.

#### The swap, and why it costs what it costs

Changing what is in your hand enters a fifth phase, `Swing::Swap`, in which
**nothing is live** — no blade, no guard, no parry. It is entered only from
`Guard`, so a swap is never an escape hatch out of a cut that has already
committed, and it costs `phase_ticks(incoming.ready, agility)`: you drop what you
are holding for free and pay for what you are drawing.

The number that matters is `Shield.ready`, and getting it right took one wrong
answer worth recording. The first pass set it against the **telegraphs**: a club
announces for 33 ticks and a knife for 7, so 8 looked generous against one and
impossible against the other. Both figures are real and neither is the operative
one — a cut has to *travel* after it is declared, and contact lands well into the
strike phase. Measured through a live world, the window from declaration to
contact is **24 ticks for a knife and 62 for a club**, nearly triple the
telegraph. Against those, a fighter drawing in 8 could get a guard up against
anything in the game, and the ladder had no rungs on it at all.

At `ready: 14` a Fighter spends 12 ticks noticing (its decision period) and 15
drawing, which puts a guard up around tick 27: inside a club's 62 with most of
the brace still to spend, and outside a knife's 24. So **heavy weapons are
blockable and fast ones are not**, which is the whole reason to carry either. A
Rogue — thinking every 10 and drawing in 12 — lands right on the knife's edge,
which is the correct shape for the quick body.

Those constraints are asserted through a live `World` in
`world::tests::a_club_can_be_answered_by_swapping_to_a_guard` and its twin,
rather than on paper, because on paper is exactly how they were got wrong.

#### What this cost, honestly

Taking away free blocking made every fighter worse, and the difficulty ladder
moved down with them: the three character sheets that used to win 33 / 91 / 99
percent of their duels now win 14 / 73 / 88. The ordering and the spread are what
that test pins now, because those are the claims worth making and the absolute
floors were the part that rotted.

One further finding is worth keeping, because it nearly shipped. Loadout
hysteresis applied *per decision* means a sharp fighter, re-deciding twelve times
as often as a dim one, flips its loadout twelve times as readily and spends the
fight mid-swap — measured at dull 14%, capable 73%, sharp **46%**. More intellect
made a worse fighter, which inverts every stat in the game. A swap costs the same
ticks whoever throws it, so what has to be constant is flips per *second*; see
`REFERENCE_PERIOD` in `duelist.rs`.

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
  for a Brute, 7 for a Rogue — and it is in the defender's observation. What a
  fighter can answer is set by how often it is allowed to think, so a Brute's
  telegraph buys a Fighter two or three decisions and a Skitterer four, while a
  Rogue's telegraph buys a Brute *none at all*.
- **An attack commits.** Momentum was always unreversible; now the decision is
  too. Past the telegraph the line is frozen and the command is not read.
- **A miss costs.** Recovery is a window in which the hand cannot attack, cannot
  parry, and cannot be recalled — and it is longer when a shield or a blade
  stopped the cut, longer still when the cut touched *nothing at all*
  (`WHIFF_RECOVERY`), and a blow landing into it does half again its damage
  (`RECOVERY_EXPOSURE`).

The strike window is computed per weapon (`strike_ticks`) and not a constant, and
that correction is worth recording because the constant version was a bug wearing
tuning's clothes. A flat 45 ticks is ample for a Fighter and nowhere near enough
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
for 33 ticks, over which a Fighter walks 1.8 units — further than the Brute's
entire blade — so every heavy attack in the game missed by ambient movement, and
the archetype lost to everything at every skill level. Tracking also spends the
intellect stat a second time, because an action persists until its owner's next
decision: a Brute re-aims twice inside its own windup and a Rogue thirty times.
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
the 1.15 at which a Fighter's body and its own stop being able to approach. A
fighter that got close became flatly immune, a small enough one became immune and
harmless at the same time, and the fight timed out. At 0.85 the circle is
unreachable and what is left is the gradient — but the gradient is *steep*, and
steeper than that sentence used to admit. Measured end to end on a stationary
Fighter, a Brute's worst blow is 26.5 at the tip of its arc against 2.0 pressed
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

One `DuelistPolicy`, one set of weights, one Fighter body, three values of
intellect and perception, against an unchanged Brute on the naive policy. 240
seeds a row, and not one draw anywhere on it:

| `intellect` / `perception` | decisions | noise | win rate | health it finishes on |
|----------------------------|-----------|-------|----------|-----------------------|
| 0 / 0                      | every 30  | 2.25  | 18%      | 0.06                  |
| 1 / 1                      | every 24  | 1.90  | 35%      | 0.08                  |
| 1 / 2                      | every 24  | 1.55  | 52%      | 0.16                  |
| 2 / 2                      | every 18  | 1.55  | 86%      | 0.32                  |
| 3 / 3                      | every 17  | 1.20  | 90%      | 0.36                  |
| 8 / 6 (a stock Fighter)    | every 12  | 0.90  | 100%     | 0.56                  |
| 12 / 10                    | every 8   | 0.50  | 100%     | 0.61                  |
| 19 / 18                    | every 1   | 0.00  | 100%     | 0.65                  |

Re-measured four times, and each time the shape changed in a way worth recording
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

**When blows started moving bodies**, the wins column barely moved and the bottom
of the range gained a rung: `int 0 / per 0` fell to 24% and `int 1 / per 1`
appeared between it and the old bottom sheet, so the dim end now reads 24 / 42 /
59 / 65 across four of them. Perception is what the bottom is made of — holding
intellect at 0 and walking perception 0 / 1 / 2 gives 24 / 39 / 48, while going
the other way, 0 / 1 on intellect at perception 0, gives 24 / 28. That is worth
knowing when choosing where a difficulty setting should sit.

The saturation at the top did *not* improve, and this phase was the one expected
to improve it. Wins are at 99% by the stock sheet and the top three rungs are
still separated by health alone. Energy damage is the next thing that can move it.

**When the policy was re-evolved**, the table changed character rather than
merely moving, because for the first time it was an *input* to the tuning instead
of an output of it. See "The ladder is an anti-objective" below. The rungs moved
down about five points at the dim end and up in the middle, wins now saturate one
rung earlier, and the top three are still separated by health alone — which is the
one direction this table has never managed to move and still has not.

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
2. **The health axis needs resolution.** At 135 damage per unit of impact speed
   a duel was three or four landed blows, so "won on half its health" and "won
   almost untouched" were one blow apart and read as luck. At 60 it was a dozen a
   side, and `ENERGY_TO_DAMAGE` 384 held the same resolution under the energy
   law. **This was later traded away deliberately** — 96 against `4 + vitality`
   health puts a duel back at three or four clean exchanges — because resolution
   in the fixture bought nothing a player could see and a legible stat point
   does. See "Damage per impact, and the tick limits" below; the diagnosis here
   was sound and is what makes the trade a cost rather than an oversight.
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

`Body::mass()` is `density * radius^2`, normalised so a Fighter weighs 1.00.
Area and not volume: a cube law puts a Brute at four Fighters and a Skitterer at
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

### What the agent can see (layout versions 7 through 9)

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

Version 8 adds `Contact::knockback_taken` and `Contact::knockback_dealt`: how
much **ground** one clean blow costs, in the body radii of whoever is losing it,
mirrored the way `threat`/`frailty` are and blurred by the same
`CAPABILITY_JUDGEMENT`. Stopping distance rather than peak speed, because what a
fighter has to decide is whether it can afford to be somewhere else and where it
ends up is the answer to that; it is also directly comparable to
`Observation::traction`, which is the same quantity about its own footwork.

Not derivable from what was already there, and the roster is built so that it
never becomes derivable. A Skitterer's knife is the second-heaviest thing in the
game for its speed and among the least dangerous, so shoving and wounding rank
the archetypes differently — a policy inferring one from the other reads a
correlation that was deliberately broken.

Version 9 closes the two holes version 8 left, and they are both in the same
place: a fighter could see what a *blow* moved and nothing about what a *body*
weighed or about what its own swing cost it.

`Observation::recoil_drift` is the ground a fighter's own hardest cut costs it, in
its own body radii — the same stopping-distance question as `knockback_taken`,
asked about your own weapon, so a policy weighing "what this cut costs me in
position" against "what standing here costs me" is comparing like with like.
Exact rather than perceived: a fighter knows what its own weapon does to it. A
*ceiling* rather than an expectation, because static friction holds the smooth
middle of a swing outright and only a stopped blade delivers the whole change at
once.

`Contact::heft` is what the other body weighs relative to yours. Perceived, and
blurred by `CAPABILITY_JUDGEMENT` for the reason `min_strike_range` is: sizing
somebody up is a judgement about a capability, and standing closer does not
improve it. A ratio rather than an absolute weight, for the same reason `threat`
is a fraction of a health bar — the observer's own mass is not in the observation
and should not be, and what a fighter needs is not how much the other one weighs
but whether it can move them.

Neither is derivable from `radius`, which is the obvious stand-in and the reason
`density` exists as a separate authored number: mass is `density · radius²`, a
Brute is 15% denser than it looks and a Skitterer 20% lighter, and a Skitterer
sizing up a Brute reads 7.83 where the radius ratio squared says 5.44. It enters
the feature vector as `heft / (heft + 1)` rather than clamped, because unlike the
ground figures the difference between "twice my weight" and "five times it" is one
a fighter acts on differently.

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

**Built again and removed again**, four phases later, and the second measurement
is much stronger than the first. The rebuild was better in three ways: the horizon
came from the observation rather than being a flat gene (the telegraph still to
run, exact off the fighter's own hand, plus the wait for its own next thought),
the range ran to 2 so the gene could carry the one delay nothing states — the
front of the cut — and the drift was *relative*, so it covered the fighter's own
footwork and its own recoil rather than only the enemy's walk.

Four evolution runs on genuinely independent master seeds returned **0.000,
0.000, 0.059 and 0.000**, and a direct sweep is monotonically non-positive: 48%
mean win rate at zero, 47% at a quarter, 45% at a half, 44% at one, 29% at two.
Removed for the same reason as the first time. The mechanism is unchanged and
worth keeping written down: the arc is wide and the sim already aims its far end
past the target, so the swept area barely moves — while the lead is computed
partly from a perceived velocity and adds its error to an aim that was fine.

There is a test asserting the duellist does *not* lead, which is the only kind of
test worth writing about a negative result. Without it the next person to notice
`Contact::velocity` sitting unused rediscovers this, and the loss is small enough
to miss.

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
zone *smaller*, peak damage within 7% — and the naive Fighter's win rate against
it went from 10% to 76%. The cause took several wrong hypotheses to find and it
is a cliff rather than a slope:

> A blow of any size ends the swing that threw it. So `IMPACT_THRESHOLD` was not
> a floor, it was a **discontinuity**: a contact one unit above it did essentially
> no damage and still cost its owner an entire cut, and landing *below* it was
> strictly better, because a blade that touched nothing kept swinging into the
> part of its arc where it was actually dangerous.

Contacts happen at body-to-body range whatever the blade length — measured, both
fighters in a duel contact at about 1.17 units from their own centre, because
that is where the other body is. For a Fighter that is 83% of the way to the tip;
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
and is load-bearing there, but a Rogue's dead zone is 0.27 inside a 0.35 body and
always has been, because a short quick blade really is dangerous along its whole
length. Forcing otherwise needs `GRAZE_FRACTION` above 0.43, which measurably
flattens the difficulty ladder. And it does not make reach pay: a long blade whose
first third is all anyone ever touches is still mostly decoration. Knockback was
supposed to be the answer to that and turned out not to be — see the next
section, which is where the attempt is written up.

The regression test that would have caught this existed and did not, because it
re-derived the dead zone inline from `IMPACT_THRESHOLD` instead of asking
`rules::dead_zone`. It asks now.

### Blows move bodies, and weight finally means something

Damage came out of the last section bounded by the muscle: a swing is a fixed
torque over a fixed arc, so the work is the same whatever is being swung and
weapon mass mostly decides how *long* a cut takes. Momentum is bounded by
nothing, and that is where weight actually lives. Four couplings, one constant
each, all in `World`:

**Blow → target.** A landed blow adds `mass_weapon × blade_speed ×
KNOCKBACK_TRANSFER / mass_target` along the direction the blade is travelling.
Tangential, not away from the attacker: a cut *sweeps*, and what it does to a
body is carry it along the sweep. Pushing the target directly away would describe
a thrust, which is not what anything in this roster is doing.

**Impact → arm.** `BLOCK_REBOUND` and `BLOCK_SHIELD_KNOCK` are gone, replaced by
one collision resolved from both arms' moments of inertia and a restitution
constant. The pair they replaced could contradict each other and did:
`BLOCK_SHIELD_KNOCK` scaled the *attacker's spin* with no mass term anywhere in
it, so a Rogue's whippy 3461 disturbed a guard nearly four times as hard as a
Brute's 911 — the heaviest weapon in the game was the one a shield had the
easiest time holding. Measured against a Fighter's guard, before and after:

| attacker | old knock | new knock | old rebound | new rebound |
|----------|----------:|----------:|------------:|------------:|
| brute    |       364 |       512 |       −0.35 |       −0.02 |
| fighter  |       752 |       292 |       −0.35 |       −0.26 |
| rogue    |      1384 |       164 |       −0.35 |       −0.32 |

A Brute's axe now throws the guard aside and barely deflects; a Rogue's is
stopped nearly dead and moves it very little. Neither number was authored — they
are the two halves of one impulse, so whatever the heavy blade fails to give back
to itself it gave to the guard.

The trick that keeps it cheap is resolving the whole collision **in spin units at
the attacker's contact radius**. Everything in a collision is linear in the
relative velocity and the spin-to-speed conversion is a constant times the
radius, so working in one arm's units cancels the constant out of every term. The
cosine between the two arms does two jobs at once — it projects the defender's
hand speed onto the direction the blade is travelling, *and* it is the moment arm
by which that impulse turns the defender's hand — so it enters the defender's
effective inertia squared. At zero the blow points straight through the
defender's shoulder, the guard is infinitely stiff, and nothing rotates. That
falls out; it is not a special case.

**Parry** is the same routine with two blades in it, so the heavier weapon wins
the crossing.

**Swing → wielder.** The reaction to a body's own weapon, taken as the change in
its momentum across the whole tick — so whatever moved the blade, the muscle or a
shield or another blade, is billed to the body that owns it.

#### Two things the recoil model got wrong first, both measured

*Differencing the momentum **vector*** bills the body for the centripetal
reaction on every tick of every swing. That is real physics and it completely
swamps the model: at a quarter transfer it came to a **sustained** 38% of a
Rogue's top speed per tick, pushing outward from wherever its blade happened to
be. Rogue mirror duels stopped landing blows at all and 98% of them ended in a
draw at full health. Dropping it is the honest call — holding a weapon out
against its own circle is a pull straight down the arm and into the shoulder, and
leaning against that is what a stance *is*. A hammer thrower does not get dragged
sideways; they lean back.

*Applying the surviving term without a threshold* is unusable for a subtler
reason. A cut accelerates its blade the same way for twenty or forty ticks
running, so every tick of recoil points the same way and they **add**, while
traction can only shed a fixed amount per tick. Swept at 0.25, 0.12, 0.08, 0.04
and 0.02, a duelling Rogue against a naive Fighter scored 41 / 96 / 89 / 94 / 95
percent against a 98 before the change — recoil was either large enough to stop a
fighter closing on anything it was swinging at, or small enough to do nothing.

Static friction is the answer and it is not a fudge: the ground can supply a
bounded counter-impulse, and below that a planted fighter simply does not move.
It is the same `Stats::traction` the feet spend, because it is the same friction.
So a **smooth swing costs nothing**, and a blade *reversed by a shield in a single
tick* is a shove no footing holds — half to one and a half times a walking speed,
depending on the archetype. "Your own attack moves you" turned out to mean "being
stopped moves you", which is a better mechanic than the one that was planned: it
pairs with the punish window instead of taxing every swing.

#### What it cost, and what it did not buy

The matchup matrix moved very little, which is the point — the four couplings are
meant to add depth rather than to rebalance. Duellist-versus-naive across all
sixteen archetype pairings is within a few points everywhere except
Brute-versus-Rogue, which went from **4% to 15%**: the inversion above, fixed.

Two honest negatives:

- **Knockback does not make reach pay.** The tangential shove carries a target
  *around* the attacker at constant range, so a fighter that has crowded inside a
  Brute is dragged along the arc rather than pushed back out of it. That costs
  the crowder its position, which is worth something, but it does not open the
  distance — a long blade whose first third is all anyone ever touches is still
  mostly decoration. The physics is right and the geometry is unhelpful; the
  answer will have to come from somewhere else.
- **The bottom of the difficulty ladder moved up a notch of perception.** The
  rung the ladder test used to sample at, `int 1 / per 2`, went from 53% to 57%
  and stopped being a loss. That is one standard error and mostly noise — what it
  exposed is that `dull.win_rate() < 0.55` was never a calibrated bound, since
  against a true 53% over 96 seeds it had better than a one-in-three chance of
  failing *before* this phase touched anything. The test samples `int 1 / per 1`
  now, at 36%, with three standard errors of daylight under the bound.

#### A rounding bug was deciding mirror matches

`Vec2 * Fx` also had to start truncating toward zero instead of flooring, and it
is the most instructive thing in the phase. Flooring is not odd-symmetric, so
`(-v) * s` and `-(v * s)` land a raw unit apart — and two fighters standing back
to back doing the identical thing in opposite directions drift apart by one unit
per scaled vector per tick until one of them is measurably winning. It cost a
mirrored exchange 62.5671 against 62.5717. `mul_div` and `Hand::track` had already
made the same choice for the same reason; the operator had not.

Fixing it uncovered something the bug had been hiding: **a duellist Rogue mirror
is a stalemate.** Two of them time out at near-full health 58% of the time, where
before the fix they resolved every fight. Verified against the *pre-phase* sim
with only the rounding change applied, so it is not the new physics — it is what
a genuinely fair mirror between two fighters with perception 14 looks like. Their
observations are near-identical reflections, they choose identically, and neither
gains an edge; the raw unit of drift used to break the tie and hand one of them
the fight.

That is worse than a draw, not better, so the rounding change stands. The
stalemate is real and belongs to the policy: eight stances scored off a
near-symmetric read have no tie-breaker in them, and the other three archetypes
resolve only because their perception is poor enough for noise to separate them.
Nothing in the difficulty ladder or the shipped tests goes through a Rogue mirror
— they measure a duellist against a *naive* opponent — so this is recorded rather
than patched, and it is a question for the evolution phase.

*It did not survive to the evolution phase.* The energy damage law below resolved
it without being aimed at it: Rogue mirrors now go 53% / 0% draws at 0.08 health
over 2372 ticks, where they were 17% / 58% at 0.77 health over 8400. The dead
zones a squared law produces are wide enough that spacing decides the fight, and
spacing is the one thing two symmetric reads disagree about as soon as either
fighter moves. The diagnosis above was right about the mechanism and wrong about
which knob reached it.

### Damage is kinetic energy, and weapon mass cancels out of it

`damage = max(0, ½·m·v² − ENERGY_FLOOR) · ENERGY_TO_DAMAGE · power_mult`, where
`v` is the blade's speed at the contact point. The floor is subtracted **in
energy and not in speed**: taking a speed threshold off first and multiplying by
mass after charged a slow heavy weapon twice, once where it is weakest and again
by scaling that shortfall up by the very mass that made it slow. In energy every
weapon pays the same admission fee in whatever currency it has — a Brute's axe
clears the bar at 0.045 units per tick, a Rogue's knife not until 0.072.

**Weapon mass cancels out of damage exactly, and that is a property of the model
rather than an oversight.** A swing is a fixed torque over a fixed arc, so the
work is the same whatever is being swung; and the ceiling that stops a light
weapon short is a grip limit, `sqrt(REFERENCE_GRIP / (mass · lever))`, whose mass
term cancels the `m` in `½mv²`. Both regimes land on

```
energy at the tip = ½ k² · MUSCLE_SPIN² · agility² · REFERENCE_GRIP · tip² / lever
```

in which no weapon mass appears at all. Measured, before any of this was
switched on: blade energy across the roster was 0.0395 / 0.0383 / 0.0393 / 0.0203
— three weapons flat to within 1% across a 2.6× spread of mass.

The plan for this work said to "retune `REFERENCE_GRIP` for a real energy
spread". **That instruction was wrong and worth recording as wrong.** It is a
scalar and it multiplies all four energies equally, so it cannot produce a
spread; and pushed far enough to matter it moves weapons out of the grip-limited
regime into the work-limited one, where the shape becomes `tip²/lever²` instead
of `tip²/lever` and the roster *inverts* — a Rogue's knife becomes the hardest
hitter in the game at 1.68× a Fighter. The constant was left where Phase 3 put
it.

So the damage spread is bought with **reach, balance, agility and power**, and it
is bought: 0.37 / 0.82 / 1.00 / 1.44 across Skitterer, Rogue, Fighter, Brute. It
is narrower than the old law's 0.49 / 0.73 / 1.00 / 1.74, and the narrowing is
carried entirely by the power stat. Mass is paid for elsewhere and paid well — it
is what makes a swing slow to start, slow at the ceiling, and heavy when it lands,
and nothing cancels it in `peak_impulse`. This is what the plan predicted before
any of it was written: *piling mass onto the Brute's axe will not make it hit
harder; it will make it slower for the same energy.*

#### The squared law is what finally made reach pay

Phase 4 set out to make reach pay through knockback and failed — the shove is
tangential, so it carries a crowder *around* the arc at constant range. The
damage curve did it instead, and by accident.

`GRAZE_FRACTION` is a share of a fighter's own best blow, so it did not move. But
*where on the blade* that share falls did. Under a linear law the twelfth-of-peak
point sits a third of the way out; under a squared one it is two fifths, because
`sqrt(0.12)` is a longer walk than `0.12`. Every dead zone in the roster grew by
about a third on that account alone:

| | dead zone, linear | dead zone, energy | tip |
|---|---|---|---|
| Fighter | 0.46 | 0.58 | 1.40 |
| Rogue | 0.27 | 0.37 | 0.90 |
| Brute | 0.86 | 0.88 | 2.15 |
| Skitterer | 0.29 | 0.32 | 0.70 |

Crowding got worse for everybody, which is the effect Phase 4 wanted and did not
get. The difficulty ladder absorbed it without changing shape — 22 / 40 / 56 / 69
/ 91 / 99 / 100 / 100, monotone, zero draws, within two points a rung of the
measurement taken before the law changed.

#### A Phase 3 bug that only became expensive here

Widening the dead zones cost a duellist Rogue its matchup against a naive Fighter,
97% → 18%, and the cause turned out to be neither the damage law nor the dead
zone. A/B'd by running the *new* dead zone against the *old* damage law: the
Rogue fell to 11%, so the collapse is entirely a response to the percept.

`DuelistPolicy::preferred_range` computes two distances as sums —
`own_dead_zone·margin + foe.radius`, and `foe.dead_zone + own.radius` — on the
reading that a blow lands on the nearest surface of the body it strikes, so a
body at distance `D` is struck at `D − r` along the arm. That is not what the sim
bills. `segment_circle` measures to the body's *centre*, and a sweep bills the
first sub-step that connects, which is while the blade is still `arcsin(r/D)` off
the line of centres — so the blow lands at `sqrt(D² − r²)`, capped by the tip.
Measured against the predicate itself, to three decimals: a Rogue crowding a
Fighter strikes at 0.663 and not at 0.350. Both distances are legs of a right
triangle whose hypotenuse is the range, and adding the legs overstates it by up
to a body radius.

**The fix is one line per distance and it makes the roster worse, so it is not
in.** Correcting both rescues the Rogue (18% → 99%) and wrecks everything else:
every mirror runs out the clock untouched and a Rogue mirror draws 100% at full
health. Correcting only the floor costs a Brute half its win rate against a
Fighter. These distances are what the stance scorer's entire tuning sits on and
the genes were evolved against the sums. It is a real bug with a known fix,
blocked on a re-tune and not on a diagnosis, and it belongs to the evolution
phase along with the rest of the policy work. It read as a regression this phase
caused and was a Phase 3 bug the whole time; small dead zones had been hiding it.

*Fixed in the next phase, along with a second bug hiding underneath it — see
"The wrong triangle" below.*

### The wrong triangle, and a second one underneath it

The fix is the one written down above: both distances become hypotenuses.

```rust
let floor = Vec2::new(obs.min_strike_range * STRIKE_MARGIN, foe.radius).length();
let lee   = Vec2::new(foe.min_strike_range, obs.radius).length();
```

Applied on its own it reproduced exactly the wreckage the previous phase
measured — every mirror timing out, a Rogue mirror drawing 100% at full health —
and the reason turned out to be a *second* bug that the sums had been hiding, in
the same way small dead zones had hidden the first one.

`hypot(a, b)` is smaller than `a + b`. For the light end of the roster the
corrected floor comes out **inside body contact**: a Rogue facing a Rogue wants
0.581 between centres, and two Scouts take up 0.700. So both fighters spent every
tick driving into a distance the sim spends every tick undoing, ground against
`World::separate`'s impulse at walking pace, and ran out the clock untouched.
That reads exactly like a policy that will not fight, and it was a policy asking
to stand somewhere that does not exist.

| observer / foe | old sum | hypotenuse | bodies touching | floor now |
|---|---:|---:|---:|---:|
| fighter / brute | 1.419 | 1.004 | 1.150 | 1.150 |
| rogue / rogue | 0.814 | 0.581 | 0.700 | 0.700 |
| brute / skitterer | 1.405 | 1.145 | 1.000 | 1.145 |
| skitterer / brute | 1.105 | 0.809 | 1.000 | 1.000 |

The contact floor binds in eleven of the sixteen pairings and the hypotenuse
binds in the other five, which are exactly the ones where the observer is
carrying a weapon long enough to have a dead zone worth respecting. The old sums
bound in none of them — they were 0.2 to 0.4 units further out than either, which
is up to half a body of standoff nobody chose.

Both corrections together still needed the re-evolution. `standoff` had been
**0.000** across four independent runs, and 0.000 was the right answer to a floor
that was already half a body too far out. Against the corrected geometry it comes
back positive, which is the same fighter making the same trade with the arithmetic
finally telling it the truth.

### Four things a fighter was given to do about weight, of which two survived

The physics went in over five phases and the baseline policy could see almost
none of it. Four capabilities were built, with two new percepts and four genes
behind them. **Two of the four are gone again**, both on measurements rather than
on taste, and the removals are the more interesting half — one because the
percept it needed could not move the decision at any value, and one because it
made an aim that was already fine slightly worse. Both percepts stayed. A gene is
a bet about what to do with a fact; the fact is still true.

**Lead the target — built, measured, and removed for the second time.** A cut is
a plan with a delay in it: the line tracks all the way through the windup and
freezes the instant the strike begins, so the aim that decides whether a blow
lands is the last one commanded before that. This rebuild derived the horizon from
the observation instead of guessing it, and used *relative* velocity so it covered
the fighter's own footwork and recoil as well as the enemy's walk. Four
independent runs returned 0.000, 0.000, 0.059, 0.000. The full account, including
why the first version was removed on the same reasoning four phases earlier, is
under "A measured negative: leading a target does not pay" above.

**Budget its own recoil.** New percept: `Observation::recoil_drift`, how much
ground a fighter's own hardest cut costs it, in its own body radii. It is the one
number a fighter could not work out for itself — recoil goes as
`weapon_mass / body_mass` and neither is a percept, while `weapon_length` and
`radius` are the visible stand-ins and both lie.

| | body mass | weapon mass | own drift, body radii |
|---|---:|---:|---:|
| fighter | 1.00 | 1.24 | 0.197 |
| rogue | 0.60 | 0.86 | 0.370 |
| brute | 2.78 | 2.23 | **0.040** |
| skitterer | 0.36 | 1.25 | **1.634** |

That spread is forty-fold and it points the opposite way to the intuition. **The
heaviest fighter in the game is the one its own weapon moves least**, because
recoil is a ratio and a Brute is a big body swinging a big axe. The Skitterer is a
small body swinging a knife that is dense and hafted well forward, and one
committed cut can cost it 1.6 of its own body radii — four fifths of its own
width. A Skitterer that swings is a Skitterer that is somewhere else afterwards,
and that is most of what is wrong with being a Skitterer.

The policy spends it on spacing. Recoil drags a swinging body along its own arc,
which is *across* the line to the enemy rather than along it — and a lateral step
off a circle of radius `d` lands you at `sqrt(d² + s²)`, which is further out,
never nearer. So a fighter that does not allow for it drifts steadily toward the
far end of its own reach, which is the one place its spacing decision was trying
not to be. `footing` is how much of the drift to set up inside for.

**Body-check — built, measured, and removed.** New percept, new ninth stance, and
the stance is gone again. `Contact::heft` stays: it is what the other body weighs
relative to yours, and `World::separate` splits a collision on the mass ratio and
nothing else. Neither knockback figure would have done, and both were right there
— those are facts about *a weapon meeting a body*, and this is a body meeting a
body; a Skitterer and a Fighter carrying the same sword deal identical knockback
and shoulder each other very differently. Nor is it readable off `radius`, since
mass is `density · radius²` and density is real: a Brute is 15% denser than it
looks and a Skitterer 20% lighter, so a Skitterer sizing up a Brute reads 7.83
where the radius ratio squared says 5.44.

`Stance::Barge` scored `barge · crowded · lighter` — somebody has come inside the
distance you chose, and they weigh less than you. Over 130,000 duellist decisions
across all sixteen pairings it was chosen **0.0%** of the time, and 0.6% with the
gene pinned at the top of its range, changing the roster win rate by nothing.

**The ceiling is algebra, not tuning**, which is why it is a removal rather than a
retune. `crowded` is largest when the two bodies are touching — as close as anyone
can physically get — and even there the best it reaches anywhere in the roster is
0.32, for a Brute with a Skitterer against its chest. `lighter` is zero in nine of
the sixteen pairings, because most of what you meet is not lighter than you. The
best product available anywhere, with the gene at 3.0, is **0.838** against `Trade`
sitting at 1.4. There is no value of the gene at which the stance can win.

What that says about the roster is the useful part: **you cannot be crowded into
uselessness here, because bodies are wider than the gap.** A shoulder beats a
sword only where the sword has stopped working, and the sword never quite stops —
a Brute with a Skitterer pressed against it is still swinging at 1.08 dead zones,
worth a seventh of its best blow rather than nothing. Trading is the right answer
and the score says so. So the Phase 4 gap — a heavy fighter having no way to *take*
the space it wants — is not closed, and now has a reason rather than a to-do: it
is not that the policy lacked the option, it is that taking space is never worth
more than hitting them.

**Brace against knockback.** `BRACE_ANCHOR` has taken seven tenths of the shove
out of a caught blow since the impulse phase, and no policy had a reason to care:
`Guard` scored on `read_ahead` and `guard`, both of which are about a blow that
*hurts*. `anchor` is the second reason to plant, and it needs its own gene because
the roster ranks the two differently on purpose — a Skitterer's knife is among the
least dangerous things in the game and the second heaviest for its speed, so
eating one costs a Fighter almost nothing and moves it further than its own sword
moves anybody. Folding it into `guard` would have said those are the same
decision.

It ships at 0.456, where `Guard` is dominated by `Evade` and therefore never
chosen — so the *shipped* effect of this gene is also nil. Unlike the body-check
that is a choice rather than a ceiling, and the numbers say it is the right one:

```text
  anchor                    0.46    1.0    2.0    3.0
  Guard, % of decisions      0.0    9.4   14.7   17.5
  roster win rate            69%    56%    54%    54%
  dull ladder rung           36%    14%     2%     1%
```

Planting a shield is a losing strategy in this model and has been since the
telegraph existed, for a reason already on the record: the shield is braced every
tick regardless of stance, so `Guard` buys nothing a fighter did not already have
and costs the cut it did not throw. `anchor` is a live knob in a region evolution
correctly refused. The distinction from `barge` is worth keeping straight — one
gene can move behaviour and should not, the other cannot move behaviour at all.

#### A fifth change nobody asked for, which the barge exposed

Working out when a shoulder is worth more than a sword surfaced something that had
been true since the dead zone existed: **`Trade` scored the same whether the blade
could reach past a graze or not.** A fighter standing inside its own dead zone
swinging is doing nothing at all, and it has always had the number that says so.
`Trade` is now damped by how far inside `bite_range` the enemy is standing.

That is a different quantity from the one `Barge` uses and the difference matters:
"my sword is not working" and "this is not where I chose to stand" are separate
facts, and `standoff` puts the chosen distance well outside the dead zone for
anyone who wants reach. Sharing one number between them damped attacks that were
landing perfectly well.

#### What it came to

Sixteen duellist-versus-naive pairings, 240 seeds each, before and after the
phase. Rows are the duellist's archetype, columns the naive opponent's.

|          | vs fighter | vs rogue | vs brute | vs skitterer |
|----------|-----------:|---------:|---------:|-------------:|
| fighter  | 92 → **100** | 100 → 99 | 100 → **100** | 100 → 100 |
| rogue    | **18 → 50** | 63 → **95** | 99 → 76 | 100 → 100 |
| brute    | 56 → **82** | 10 → 13 | 84 → **92** | 100 → 100 |
| skitterer| 0 → 0 | 0 → 0 | 0 → 0 | **19 → 93** |

Mean 59% → 69%. The regression the previous phase shipped knowingly — a duelling
Rogue at 18% against a naive Fighter — is the cell the geometry fix was diagnosed
from and it is repaired. Two cells got worse, and one of them is the Rogue's
matchup against a Brute (99 → 76): a positive `standoff` is worth a great deal
against most things and is the wrong answer to the longest weapon in the game,
which is the same trade the `standoff` sweep has measured every time it has been
run.

Three rows are unchanged in character. A Skitterer still cannot beat anything but
itself, which has been true since the roster existed and is a statement about a
0.36-mass body with a 0.18 tip speed rather than about the policy.

All four mirrors resolve — 51%, 49%, 48%, 49% at 12–14% surviving health, zero
draws anywhere. A fair mirror landing on a coin flip at low health is what one
should look like.

#### The ladder is an anti-objective, and fitness cannot hold both ends

The difficulty range is the product requirement and evolution actively works
against it. Fitness measures *how good the policy is*. The ladder measures *how
much its quality depends on the character's wits* — and the bottom rung is made
entirely of how badly the policy plays with bad reads, so anything that makes it
play well makes it play well dim. Every genome here is better than the one it
replaces and every genome here has a flatter ladder: taken at the fitness maximum
the `int 1 / per 1` rung reads 48% to 74% across the four runs, against a
requirement of "under 55% and falling".

Two genes are set off what evolution returned, against the ladder rather than
against fitness. `resolve` is the lever — hysteresis means committing to a stance
chosen on a read, so a fighter with bad reads commits harder to worse plans:

```text
  standoff 0.25, resolve   0.38   0.55   0.70   0.85   1.00
  roster mean               71%    71%    70%    67%    68%
  dull rung (int 1/per 1)   68%    55%    35%    19%    30%
```

`standoff` 0.25 does the other half: at the evolved 0.49 a Rogue mirror stalls,
drawing one duel in ten at 59% health, climbing to 29% by 0.56. Standing at the
tip of your own arc is where two symmetric fighters stop resolving.

The choice cost nothing measurable — the roster mean at the chosen pair is a point
*above* the raw genome's — but that is luck rather than a general result, and the
honest statement is that this is a two-objective problem being solved by hand on
one of the objectives. A fitness function that could express "and be worse when
dim" would be a real piece of work and is not one this phase attempted.

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

Cost: roughly 180 records/second at thirty agents. An `Command` grew from 12 bytes
to 36 when it gained two hand commands, so a long fight is now closer to a
megabyte than to a few hundred KB before compression. Still worth it: the
alternative is a replay that reproduces the walking and none of the swordplay.

`LimbCommand::strike` is hashed on **both** hands even though only the sword
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
spatial hash is slower and much easier to get subtly wrong, and "revisit when a
scenario actually needs hundreds" now has arithmetic under it rather than a
shrug. `separate` is n(n−1)/2 pairs with one `Vec2::length()` each: n = 64 is
~2,016 pairs and about 1% of a core; n = 200 is ~19,900 pairs and 14%; n = 640
is ~204,480 pairs and a full second of CPU per second of game, which is fatal.
Brute force is therefore not merely tolerable at the stated target of 100–200
units but correct there, and the number that breaks it is 640 rather than 210.
When a scenario does cross that line the hash must produce results identical to
the brute-force version, which is a test worth writing first.

**No physics engine, and Rapier specifically — not now, and not at ten times the
unit count either.** The sim has no rigid bodies, no rotational dynamics, no
joints, no stacking, no restitution, no friction, no contact manifolds and no
sleeping islands. What it has is circle push-apart split by inverse mass, a
swept segment-circle test for a blade, segment tests for arrows, and tile-grid
wall collision against the closest point on a box. Rapier solves a problem this
game does not have.

At two hundred circles it is plausibly *slower*. Island management, manifold
caching, solver iterations and marshalling positions across the boundary all
cost more than twenty thousand integer distance tests, so what you would be
buying is a broad phase to avoid work cheaper than the broad phase. It is also
~1.5–3 MB of float wasm against the current 246,384 bytes, in a workspace with
zero external crates and a hand-rolled C ABI — and Rapier's API is not
C-ABI-friendly, so it drags `wasm-bindgen` in behind it, which is the other
pillar this project deliberately lacks. And it deletes the determinism contract
outright: `enhanced-determinism` buys same-binary-same-platform reproducibility,
not the cross-target bit-exactness `tools/wasm_check.js` exists to assert.

Where it *would* become right is genuine rigid-body dynamics — tumbling thrown
objects, ragdolls, destructible stacks, joints, ropes. Knockback, arcing
projectiles and area effects are all cheaper to keep in fixed point. If that day
arrives the honest move is not to bolt an engine alongside the tick loop but to
accept that it is a different game with a different contract, and rewrite
deliberately. Whatever happens to the physics, one clamp has to survive it:
`rules::agility_multiplier` at 2.00 is what makes swept body-vs-body collision
unnecessary rather than merely omitted — see the entry below.

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

## The floor plan

The level was a `Vec2` and its entire geometry was one `clamp_box`. That is a
rectangle, and a rectangle has exactly one interesting property: you cannot leave
it. A dungeon needs the other one — there are places inside it you cannot reach
without walking round something.

**A grid of bytes, one world unit a tile.** Every question the sim asks of a
level is cheap on a grid and expensive on anything else: "is this body in
masonry" is nine byte reads at any roster radius, "how far to the wall in +x" is
a walk along a row, "which way to the stairs" is a breadth-first search over
integers. A polygon soup answers the first in time proportional to the level and
cannot answer the third at all without a navmesh — a second representation to
keep in step with the first. Bytes rather than bits because a bitset saves 2.7 KB
on a 68×45 level and costs a shift and a mask in the innermost read of the tick,
and because tile *kinds* are a thing this will want: solidity is a predicate on
the byte rather than the byte itself.

**Out of range is solid.** One decision, and it removes the boundary as a special
case from every caller: the clearance walk terminates because it runs into the
edge, the ray terminates for the same reason, and the collision resolver treats
the outer wall as masonry like any other.

### Three-wide corridors

`Body::radius` is Fighter 0.45, Rogue 0.35, Brute 0.70, Skitterer 0.30.

| Width | Brute fits | Brute passes a Fighter | Brute passes a Brute |
|-------|------------|------------------------|----------------------|
| 1.0   | **no**, it needs 1.40 | — | — |
| 2.0   | yes, 0.30 a side | **no** — needs 1.15 of centre separation, has 0.60 of lateral room | **no** |
| 3.0   | yes, 0.80 a side | yes, 1.85 apart | yes, 1.60 apart |

Two-wide corridors *plug*. A Brute walking one way and a Fighter walking the
other cannot get past each other, and with a route field pointing both at the
same goal that is a hard deadlock which reads as the AI being broken. Corridors
are carved as `CORRIDOR`-square **blocks** rather than lines for the same class
of reason: a one-tile corner in a three-wide corridor is where a Brute gets
stuck, and it is invisible until you watch one try.

### Collision

Closest-point-on-the-box, not minimum-penetration-axis and not a per-axis sweep.
Minimum-penetration has to pick x or y, and picking has to break ties — which
makes behaviour at a corner depend on an axis order, and a rule with an axis
order in it behaves differently in a mirrored match. Per-axis gives a cardinal
push at an exposed convex corner where the honest answer is diagonal.
Closest-point has neither problem and degenerates on a flat face to exactly the
cardinal push the arena clamp always made.

**The internal-edge cull is load-bearing.** Two adjacent solid tiles share a face
down their seam, and that seam is not a surface — it is the inside of a wall.
Without the cull a body sliding along a run of masonry is shoved out of every
seam it crosses: a stutter at walking speed, and being flung sideways at any
other.

Moves are **swept** in sub-steps no longer than half a tile, because a wall can
be one tile thick and a knockback is not bounded by walking speed. Each stride
runs from where the last one ended rather than by interpolating the original
line — interpolating is the obvious spelling and it silently defeats the sweep,
since a sub-step the wall stopped is undone by the next one.

A floor plan with nothing carved short-circuits the whole interior pass, which is
what makes every pre-existing scenario *provably* unchanged rather than argued to
be. `Dungeon::clearance` takes the same early return, so `wall_clearance` on a
flat scenario is bit-for-bit the four expressions it used to be.

### Routing, and why the objective is an input

A level with walls makes "walk toward that" and "walk to that" different
questions for the first time. The sim owns the floor plan, so it is the only
thing that can answer the second: `Observation::nav_dir` and `nav_distance` are a
route, handed over rather than left to be reconstructed — the same argument
`Contact::min_strike_range` makes. What stays a decision is whether to follow it.

The field is a multi-source BFS over open tiles, rebuilt only when the cells it
grew from change, sitting beside `refresh_pending` in the tick for the same
reason: both are derivations of the state the caller is about to observe, so
computing them together is what makes an observation describe *one* world.
Four neighbours, not eight — eight at unit cost is simply wrong, a diagonal is
1.414, and correcting it needs a weighted queue. The straight-line shortcut
delivers the diagonals wherever they matter, and on an uncarved plan it fires
every time, which is why an open room behaves exactly as it always did.

Its buffers live on the `World` and never reallocate. That is not tidiness: this
crate compiles to wasm and is driven from a page holding typed-array views into
linear memory. An allocation can grow that memory, and growing it detaches every
view the page holds. **A search that allocates is a search that can blank the
screen.**

**`Objective` is an input channel, shaped exactly like `Order`** — set from
outside, carried without interpretation, hashed, recorded in a replay. The
obvious design is for the sim to notice that monsters want to reach heroes and
route them accordingly; that would change the behaviour of every scenario the lab
runs and with it every recorded run, every measured win rate and every evolved
genome, in exchange for a convenience. Defaulting to `Objective::None` means a
scenario that has not asked for routing is bit-for-bit the scenario it was.

**Monsters that know where you are** is a decision, not an oversight: a dungeon
whose monsters lose you permanently behind one wall reads as broken rather than
as stealthy. `HUNT_RANGE` bounds it to about two rooms and the corridor between,
measured *along the route* rather than in a straight line — without a bound
everything on the level converges on tick one and a floor arrives as a single
brawl, which is not a dungeon but one fight held in a large room. The honest
version is the open question below.

### Sight

`World::observe` filtered candidate contacts on distance and nothing else, so
masonry was something bodies collided with and nothing an agent could stand
behind. That produced the one bug that made a floor unplayable, and no link in
the chain is wrong by itself: two fighters on opposite sides of one tile of rock
each appeared in the other's contact list; a contact list that is not empty is a
fight; a fight owns the feet; both walked the straight line at each other into
the wall, collision stopped them, and nothing re-evaluated. The route field built
for exactly this case was computed on every observation and thrown away. It was
never wrong. It was never asked.

`Dungeon::sees` is **one ray down the line of centres, and deliberately
permissive** — set against `is_walk_clear` immediately above it, which fires
three rays (the centreline and both flanks at `±radius`) and is deliberately
conservative. The asymmetry is correct in both directions, and what decides which
way each one leans is the cost of being wrong. A permissive eye sees through the
corner where four tiles meet, so a fighter notices something a moment early; a
conservative eye cannot see an enemy standing in a doorway, which reads as
broken. A conservative walk sends a body round something it could have squeezed
past; a permissive walk commits it to a line it cannot walk, which is the
deadlock above.

The test sits *after* the range check and *before* `Nearest::offer`. Cheap scalar
first and the ray second is the smaller half of that; the larger half is that
`tracked_contacts` is a fighting stat, and a body that spends its perception
budget on rock has a worse eye than its stats say it has. Occlusion applies to
allies too: `cohesion` steers toward the mean of what is in view, and a body
pulled toward a squadmate through a wall walks into the wall for exactly the
reason a body pulled toward an enemy does.

Note what did *not* have to change with it. `engage` still walks the straight
line at its target, and occlusion is what makes that right rather than merely
tolerable: a target you can see is a target with a clear line of centres. Giving
`engage` a routed approach instead would need an `is_walk_clear` percept, and
therefore a `FEATURE_LAYOUT_VERSION` bump, to buy a case three-wide corridors
mostly rule out. No percept was added or removed here — only which contacts fill
the slots that already existed.

**The `carved` short-circuit is the mechanism, not the claim.** `raycast` does not
bail out early — on an open plan it walks every tile boundary out to `t > 1` and
finds nothing — so `!self.carved ||` is what stops a flat scenario paying a ray
per entity pair per decision, and it is the same early return the interior
collision pass and `Dungeon::clearance` already take. Being a guard on the *plan*
rather than a test on the tiles is what makes flat scenarios bit-identical
mechanically rather than by argument, and the argument is not trusted on its own
either: `on_an_open_floor_plan_every_contact_survives` builds one scenario twice,
once through `Scenario::room()` and once against a hand-built all-open `Dungeon`
of the same extent, and compares the observations field for field.

**"Cannot see it" and "cannot hit it" are different claims, and only the second
one stops a long weapon.** `resolve_swings` raycasts from the swinger's own
centre to the point of impact — the segment the arm actually occupies at the
moment it connects — and that is arithmetic rather than paranoia. A Brute's
`Club`, the two-handed axe and the longest thing in the game at `length` 1.45,
reaches 2.15 from its own centre against a body radius of 0.70; a Brute and a
Skitterer pressed against opposite faces of a one-tile wall are
0.70 + 1.00 + 0.30 = 2.00 apart. It clears the rock by 0.15. A blow that crosses
masonry emits no event at all, which is how `resolve_shots` already treats an
arrow that meets a wall: it simply did not happen.

`Dungeon::visible_tiles` asks the same question about a region instead of a pair,
and the fog of war is what reads it — `web` folds each disc into the floor's
memory and publishes the pair as one byte a tile, 0 never seen, 1 seen earlier on
this floor, 2 in sight now. Two passes, and the second is not a fudge:
an open tile is lit when its centre can be reached by a ray, and a solid tile is
lit when one of its four neighbours is an **open** tile that is. A wall's own
centre fails every time, because that centre is inside the masonry the ray is
looking for. The openness test is what stops a lit rock face lighting the rock
behind it — and without it that leak runs in `+x` and `+y` only, the two
neighbours the scan has already reached, so the boundary would come out one tile
thick on two sides of a room and two tiles thick on the other two. It is also the
rule `rebuildLevelPaths` already uses to decide which rock faces exist to be
drawn, and deriving both edges from one rule is what makes the fog boundary and
the lit-face boundary agree instead of disagreeing by a tile.

### The order channel

**A click is a command, not a suggestion.** The feet obey a live `Order::Goto` or
`Order::Focus`; the hands go on fighting. What obedience *means* has been wrong
twice — first by being absent, then by being total — and both mistakes are below,
because the second one is the more instructive.

**The first mistake was absence**, and it is worth recording why, because for a
while it looked like a pathfinding bug. `Order::Goto` was read in exactly one
place per policy — the `Goto` arm of `march` — and `march` is only reached when
nothing is in sight. In a dungeon there is always something in sight, so the
player's input channel had, in practice, no effect during a fight at all.

`ordered_feet` on both policies answers what a live order wants, or `None` for the
two cases that mean the same thing: the order does not name a place, or there is
no route to the place it names. It is read from two places in each policy —
`march`, where the rule always lived, and `decide`, where it bends `move_dir`
after the branch that produced it and before `limb`. That it was a lift rather
than a new rule is the only reason there is one copy of each braking law instead
of two, and the **laws stay different** on purpose: `UtilityPolicy` solves a
stopping distance, `DuelistPolicy` paces one stride's worth of travel, they were
never the same law, and unifying them here would have been a behaviour change
smuggled in under a refactor.

Only the feet. `Intent` is untouched, so the HUD, the fitness function and target
memory all still see a fighter in a fight — and a retreating duellist goes on
saying it is retreating while the player walks it somewhere, which is honest,
because that *is* what it wanted to do. The blend deliberately covers the
low-health branch too: a player who clicks while the character is hurt is
answering the same question `caution` was about to answer, and the player wins.
Somebody hunting for why a wounded fighter did not bolt will read `disengage`
first, so that is where the line saying so has to be.

**An order names a place to be *near*, and the first version of this made it a
place to be pinned to.** `ordered_feet` replaced `move_dir` outright and declared
arrival with a deadband one tick of travel wide. Both halves of that were wrong,
and the deadband was the bug. A band that thin is not a tolerance; it is a promise
that the next shove re-arms the order — knockback, `World::separate` prising two
bodies apart, a slide along a wall — and a character that had arrived then walked
back to the mark mid-fight with its own footwork suppressed the whole way, because
an override leaves nothing of it. Circling, `station` and `BowMind`'s kiting all
stopped while that was true. The character stood on the mark and took hits, which
is the complaint this began as.

**So the override became a spring.** `leash(order, gap, own)` blends the
brake-scaled order heading against the footwork the fighter wanted anyway: `pull`
is `min(gap / LEASH_ROAM, 1)` squared, and `own` survives at
`1 - pull * (1 - LEASH_LANE)`. `LEASH_ROAM` is 1.5 world units — room enough to
circle in, still visibly standing at the marker — and `LEASH_LANE` is 0.3, which
off a unit heading is some 17 degrees of deviation at full stretch: room to
sidestep a blade and make small corrections, not room to wander off the route.
Quadratic rather than linear because the two ends want opposite things — a soft
interior, where the fight should barely feel the order, and a firm rim, so that
crossing it is a pursuit rather than a slow leak outward.

**Arrival is a limit now rather than an event, and that is the half that actually
fixed the bug.** Nothing declares that the character has got there, so there is
nothing left for a shove to un-declare. `pull` goes as the square of the gap and
it multiplies a brake already proportional to it, so the commanded speed near the
anchor falls as the *cube* of the distance: the last fraction of a unit is a
crawl, always inward and never past.
`the_last_of_the_walk_is_a_crawl_inward_and_never_an_orbit` asserts both halves —
never once away from the mark on any tick, and measurably nearer it after six
hundred more — because the two failures on either side of this rule are an orbit
and a stall, and a one-sided bound waves the second one straight through.

**The hover was very nearly an idle drift, and the idle drift does not work.** The
plan asked that an arrived character with nothing in sight shift its weight rather
than freeze: `open_ground` at half strength, blended in through `march` exactly as
combat footwork is blended in through `decide`. It was built and it was rejected
on measurement. `open_ground` is a *constant* directional bias for the geometry a
body happens to be standing in — it does not shrink as the anchor is approached
and it does not reverse past it, so it does not shift weight, it *leans*. Against
the spring it balances at a fixed offset, measured at 0.50 units short of every
click at baseline and always on the open-ground side of it, and **no strength of
it parks a character on the mark**, because a bias that does not vanish at the
anchor cannot; halving it only chooses which fraction of `LEASH_ROAM` it stops at.
That is the same fixed point recorded under "Braking and an arrival band" below,
reached from the other direction and by a different mechanism, which is what makes
it worth writing down twice. `march` therefore hands the leash a zero, and a
character alone in a room has the order as the only thing steering it. The hover
survives where it was actually wanted — **with a fight on**, where `engage` and
`disengage` have already folded the approach, `cohesion` and `open_ground` into
`command.move_dir` — and where that character comes to rest inside the ring is the
fight's business.

#### Naming the quarry

**`Order::Focus` was fully plumbed and never constructed.** It was in the order
enum, in `state_hash`, in the feature vector and in every replay, and nothing in
the workspace ever built one: a left click was always a `Goto`, whatever it landed
on. Making it mean something took one change in each of three crates, and they are
worth reading as three because each answers a different question.

The **sim** routes to it. `World::refresh_nav` seeds the flow field from the named
body's cell — the search `Objective::Hunt` already runs, narrowed from every enemy
to the one that was pointed at — and `nav_goal_point` reads the same order a
second time for the straight-line shortcut, pulling the quarry out of the masonry
through the same `reachable_point` a click goes through, because a body standing
in a doorway is not somewhere a wider hunter can arrive. Both are silent on a
handle that does not resolve, on a corpse, and on one of your own, and nothing
above has to handle those three cases separately: an empty seed list is an empty
field, `nav_step` reports no route, and no route is a stop — which is already the
answer a `Goto` sealed behind rock gets.

The **policy** obeys it. Both `pick_target`s return the named quarry outright when
it is in sight, skipping the scoring loop entirely rather than entering it with a
thumb on the scale. Only while it is in sight, and that restriction is the
deliberate half: out of sight there is no contact to return, so the fighter reads
whatever blade is in front of it while the feet carry on pursuing, and a hero that
walked past a monster with its hands down because the thing it was told to kill is
round the next corner would be obeying the letter of the order and dying of it.

And the **anchor is a ring rather than the body**: `standoff * FOCUS_SLACK`, with
`FOCUS_SLACK` at 1.5 and `standoff` asked of the weapon actually in hand. That is
the whole of what makes an archer close to bow range and *stop*, kiting instead of
walking onto a club, and it is not a second mechanism — the ring only halts the
pursuit because the spring goes slack inside it. `DuelistPolicy` sizes it off
`obs.held` rather than off the action selector's winner, for the reason `decide`
reads `held` one level up: the two differ for the whole length of a swap, and
pursuing at the range of a weapon that is not yet in hand walks a mid-swap archer
onto a sword.

**`FOCUS_SLACK` of exactly 1.0 is the version that does not work**, and the
failure is not subtle. Keeping station is a two-sided correction — `station`
pushes out inside preferred range and pulls in outside it, and a circling duellist
crosses its own range constantly — so a ring drawn on that line puts the rim
precisely where the footwork is busiest, and every step out to make room re-arms
an order that walks the fighter back in. The band is what lets the two mechanisms
answer different questions: spacing inside it, pursuit outside it, rather than the
two of them fighting over the same tenth of a unit.

**`ActionMind::standoff` is a required trait method and not a defaulted one.** The
ring and the approach have to be the same number, or a focused fighter is hauled
off the spacing it just chose, once per decision, forever — and the two forces
then settle at a distance neither of them asked for. `BowMind`'s `ideal` was
lifted out of `drive` into it so that there is one expression and one reader
instead of two copies free to disagree. Requiring it is the argument `mind_for`'s
exhaustive match is already written for: a fifth mind should fail to compile
rather than silently inherit somebody else's idea of where to stand, which is a
bug that would show up as a character loitering at a strange distance and nowhere
at all as a line of code.

**The hard lock killed the `obedience` gene, and the slot stays exactly where it
is.** `obedience` *was* the thumb on the scale — a bonus added to a named quarry's
score, which left obeying an order a matter of degree for an evolved number to
settle. The early return is unconditional, so nothing reaches that line any more
and the gene has no reader anywhere in the workspace. Deleting it is the tempting
tidy-up and it is not safe: the genome is a *positional* array, and `from_genome`,
`LABELS`, `GENE_RANGES` and `BASELINE_VALUES` all index by slot, so pulling slot 2
out renumbers every gene after it and silently repoints every stored genome in the
repository at the wrong knob. A dead branch is cheap; a genome that means
something other than what it says cannot be recovered by reading it. Giving the
slot a *new* job is a real question and a separate one — the obvious candidate is
scaling how far past its ring a fighter will pursue, which would make a player's
order grip harder or softer depending on an evolved number, and that is the wrong
default to pick as a side effect of this change.

**When the locked quarry dies, the hero holds that ground.** `Sim::expire_focus`
converts the order into a `Goto` at the hero's own feet. Not `Order::Hold`, which
is free will: it puts the character back on `UtilityPolicy`'s search behaviour —
in an empty room a slow drift toward the middle, measured under `clear_order` —
and walks it off the spot it has just spent a fight winning. What the player asked
for by naming that enemy was to be *there*. Not auto-acquiring the next enemy
either; choosing the next fight is the player's move and not the module's. It runs
per *tick*, beside `follow_route` and on that function's argument: one animation
frame is up to `MAX_CATCHUP_TICKS` of catch-up, so a page-side death test would
leave the hero steering at a corpse for eight ticks, visibly, and on exactly the
frame a kill happened. It resolves both halves of the handle, so a quarry whose
slot has already been handed to the next spawn still reads as dead rather than
quietly transferring the lock to whatever walked in.

**No frame layout change, and the reason is worth stating.**
Neither `FRAME_LAYOUT_VERSION` nor `HEADER_LEN` moved for this, because the page already
knows which body it named — it sent the handle — and all it needs back is whether
the lock is still live, which the order discriminant in `frame[2]` already
carries. What changed is a *value* in slots that already existed. `Order::point()`
answers `Vec2::ZERO` for a focus, correctly and permanently, because the payload
is an `EntityId` and there is no point in it to hand back — so left alone the page
would draw its destination marker at the origin. `frame[3]` and `frame[4]` carry
the quarry's live position instead, which is what the page wants to draw and what
only the world can answer. A better number in a slot that already exists is not a
layout change, and that is the whole difference between this and a version bump
that would have made every reader downstream wrong at once. Both constants have
moved *since*, for `art-03`, which appended a header float and a run of unit
columns and therefore was one — which is why neither is written down here as a
value. Read them from `crates/web/src/lib.rs`; this paragraph is about the test,
not about where the counter happens to stand.

**The gate is a live `Goto` or `Focus`, and it is what makes all of this inert in
the lab.** No lab scenario issues either — `policy::runner` orders `Advance`, and
`determinism.rs` uses `Advance`, `Hold` and `Regroup` — and `nav_step` is
additionally silent without an `Objective`, which defaults to `None`. `LAB_HASH`
and `GOLDEN_STATE_HASH` did not move, and that is the real assertion of the change
set. The two pieces that are not *obviously* behind that gate are argued rather
than seen — the hard lock cannot fire without a `Focus` to name anybody, and the
`standoff` lift moved an expression rather than changed one — so they are measured
as well: `lab duel --seeds 400` returns byte-identical win rates either side of
the change. Be precise about what the gate itself proves:
it is a property of the scenarios, not of the code. The day a lab scenario issues
a `Goto` the proof lapses with it, and the comment on the blend in `decide` says
so where whoever writes that scenario will read it.

The browser goldens are the other half of that sentence, and they are where the
plan for this change was wrong — **for the second time, and for the identical
reason.** All four moved for occlusion. `ROOM_HASH` then moved a second time,
alone, when a click became a command, and it has now moved a third time, alone
again, to `0xadae95f2b6b46499`, because the click stopped being an override and
became a leash. Both plans predicted that no browser hash would move, and both
argued it from the *lab*: no lab scenario issues a `Goto`, `Objective` defaults to
`None`, therefore `ordered_feet` is unreachable. That argument is sound, it held
for `LAB_HASH` both times, and it is a fact about `runner.rs`. `ROOM_HASH`'s
script is `init(1); set_goto(20_000, 12_000); step(600)` — the only golden
anywhere in the project that calls `set_goto`, and therefore the only one that
reaches `ordered_feet` at all. `BATTLE_HASH`, `SWAP_HASH` and `BOW_HASH` never set
a destination and held, exactly as they did the first time. The lesson is not
about leashes: **"no golden reaches this code" is a claim about the four browser
scripts every bit as much as about the lab's scenarios, and it has now been made
twice without being checked against them.** Check the scripts before predicting
the hashes.

### What the sim does not know

A portal, a depth, a run. `Scenario::portal` is carried and never acted on; the
rule about what walking into one *means* lives in the browser crate. Putting it
below that line would put progression inside the fight simulator the lab drives
headlessly.

The browser crate no longer takes `Scenario::portal` as *the* portal, either.
Nothing marks the way out while monsters live; the last kill is the exit, and it
opens where that kill landed — read off `Event::Damage`'s `at`, which the sim
carries precisely because `reap_dead` recycles the slot before `step` returns.
The generator's exit room stays behind that as the fallback, for a floor that was
never fought on. That moved *where* the browser decides the portal is, and moved
nothing about who decides.

### The route

A dragged path is the fourth thing on that list. One standing order per faction
is a contract rather than a limitation, so a route is a convenience built over it
and not a second shape of destination: the queue lives on `web`'s `Sim` beside
`depth` and the portal rule, and `route[0]` is whatever is currently expressed as
the world's `Order::Goto`. Three scalar exports drive it, in the style of
`set_goto` rather than a shared buffer, because a queue that never exceeds
`ROUTE_MAX` of 24 entries does not need a second detachable view into linear
memory to fill it.

**It is Rust rather than page script for one reason, and it is the leg test.**
`Sim::follow_route` runs once per *tick*, from `advance`, beside
`hero_is_leaving` and for the same reason: one animation frame pays off up to
eight ticks of backlog (`MAX_CATCHUP_TICKS`), so a page-side arrival test would
overshoot a waypoint by that much, visibly, on every stutter. Drawing the path is
presentation and stays on the page; deciding when a leg is finished does not.

Arrival is `ROUTE_ARRIVE` 0.70 plus the body's own radius, measured against
`World::nearest_walkable(route[0], radius)` rather than against the raw waypoint.
Both halves earn their place. Waypoints are dense samples of a hand-drawn line —
the cap is sized against one every 1.2 world units, some 29 units of path, a
little over half a level's diagonal — so making a character touch each one turns
a smooth gesture into a series of stops with a visible dog-leg wherever the hand
wobbled; and asking about the raw point instead would hang on every leg the hand
cut across a corner of rock. The last leg is deliberately *not* popped: a `Goto`
at the final waypoint is exactly what was asked for, and a queue that popped its
last entry would leave the character holding an order it had no reason to have
finished with.

What stops the character at that final waypoint is no longer an arrival test of
any kind. The policy's deadband is gone — see "The order channel" — and what
replaced it is the leash going slack: the pull tapers as the square of what is
left of the gap and the brake shrinks with it, so the character crawls the last
fraction of a unit onto the mark and settles inside `LEASH_ROAM` of it. Arrival
stopped being something a policy declares and became something it approaches,
which is exactly why nothing downstream of the last leg needs telling when it
happens. Every earlier leg does still need a test, because a queue has to be
moved on by *something*, and that test is the one above — measured in
`ROUTE_ARRIVE` and a body radius rather than in the ring, because the leg test is
about a waypoint being behind you and the ring is about where a fighter is free
to stand.

`ROUTE_STALL` is 90 ticks of moving less than `ROUTE_PROGRESS` 0.05, after which
a leg is abandoned. It is the only thing between a waypoint sealed behind rock and
a route that never finishes — the *last* leg would be fine, since a policy with no
route holds, which is what an unreachable order should do, but every earlier leg
would hang forever and the player would watch a character stop halfway along a
path it was still nominally following. Ninety is three times the slowest decision
period the stat range produces (30 ticks at `intellect 0`), so a slow thinker
mid-thought is never mistaken for a stuck one.

The queue is not simulation state, but **beginning a leg is**: `World::set_order`
rebuilds the faction's flow field, and an order is one of the things `state_hash`
fingerprints, so a route call moves the hash exactly as a click does. The five
golden scripts are unaffected only because not one of them calls a route export —
a fact about the scripts, not a property of the feature, and the reason not to add
one to a golden script. The route is dropped at five sites, because it must not
outlive the click that cancels it (`set_goto`, which is deliberately not
implemented in terms of a one-point route), the button that hands the character
its free will back (`clear_order`), the body that was walking it
(`swap_in_hero`), or the floor plan it was drawn on (`descend`). The fifth is
`set_focus`, and it is the one where a survivor would do visible damage rather
than merely linger: the next leg test would call `begin_leg` and write a `Goto`
straight over the lock, taking the hero off the quarry a moment after the player
named it.

## Performance notes

**The sim is not the bottleneck, and that is now a measurement rather than an
inference.** `lab bench --carved` runs 200 rollouts of a generated depth-5
dungeon, 3,600 ticks each, on one thread: 199,613 ticks/s, against 185–201k for
the uncarved 4v6 skirmish on the same one thread. Carving costs nothing
measurable at these unit counts — which is the whole point of the flag, because
on an open plan `Dungeon::sees` short-circuits and the headline throughput
figure has never paid for a single ray. The browser needs sixty ticks a second
out of one core, and the live `step` phase reads about 0.09 ms of a 16.7 ms
frame.

`Vec2::length` is the hot path and runs a bit-by-bit `isqrt64` (~32 iterations).
That is fine at current entity counts. The obvious optimisation later is that
`f64::sqrt` is exactly specified by IEEE-754 and therefore *is* portable, so a
float square root with an integer correction step would be both fast and
deterministic — the one place a float could be admitted without breaking the
contract. Measure before doing it.

**The cost was on the page, and most of it was work that did not need doing at
all.** At a full room of 64 units the frame is 1,870 floats, and `parseFrame`
spent 0.577 ms on it — 0.380 ms of which was boxing a copy, promoting every f32
to an f64 so that a pure-arithmetic function could read them back one at a time.
Parsing the live `Float32Array` in place into pooled rows took that to 0.011 ms,
and interpolation's `blend` adds 0.044 ms, so parse and blend together are
0.055 ms against the 0.577 ms the parse alone used to cost. `drawLevel` went
0.139 → 0.069 ms. `refreshInsets` was the one that had to be measured before it
could be believed: four `getBoundingClientRect` calls cost 0.018 ms against a
clean layout and 0.666 ms against a dirty one, and the previous frame's
`updateHud` always dirtied it — 4% of a frame to measure four rectangles. It
reads 0.018 ms now, while the rails are still.

**`render` dominates every other phase by an order of magnitude, and almost none
of it is the level.** `drawLevel` is 0.069–0.139 ms of it. What `render` actually
costs is **not known as a duration, and no figure for it should be quoted.**
Canvas2D commands are queued, so a microbenchmark that loops the call times the
rasteriser's back-pressure rather than the drawing: the same call at 5, 20, 50,
150 and 300 iterations gave 6.6, 4.7, 4.4, 23.0 and 7.1 ms — non-monotonic, and
swinging by five times. Reading it as a duration needs a foreground tab and the
frame strip, not a `for` loop.

**But the thing that made a crowded room unplayable was found by counting pixels
rather than milliseconds, and it is worth knowing that no timing would have found
it.** At a full room the game ran at one or two frames a second while the frame
strip read `fps 792` and `render 0.83` — because the page *issues* the commands in
0.83 ms and the rasteriser does the work after the callback has returned, so the
entire cost lands in `idle`. Counting the area of every fill in one frame, against
41 visible bodies on a 6.5-million-pixel canvas: `drawVision` 13.41x the screen,
`drawLantern` 1.74x, `drawLevel` 0.50x, and **`drawCharacter` — the obvious
suspect, and the wrong one — 0.04x.** One translucent sight disc per body, `pi*r^2`
with `r` up to 825 device pixels, is 89.6 million pixels of alpha blending; a
hundred and sixty-four character draws are four hundredths of a screen. The fill is
now spent only on the hero and the locked quarry and every other body keeps its
dashed ring, an outline being circumference-scaled where a fill is area-scaled:
15.69x to 2.60x, same 377 strokes.

**That fix was real and it was not the bottleneck, and the way it was found is the
part worth keeping.** Capping the fill did cut 15.69x of overdraw to 2.60x, but the
page still ran at 11 fps on eight bodies, in the tactical view as well as the
regular one — which already ruled out the flagstone pattern and the vignette, the
two most expensive fills on the page when timed in isolation. What settled it was
bisecting by *removing work* rather than by hiding it, on the machine that was
actually slow: no-op the canvas primitives one at a time on the live context and
measure. Note that hiding an element does **not** test its cost — `visibility:
hidden` on the canvas skips one composite and still rasterises every fill.

The answer was a single primitive:

| | fps |
|---|---|
| baseline, 8 bodies | 11.2 |
| `stroke()` no-op | **54.4** |
| every drawing primitive no-op | 49.9 |
| game loop stopped entirely | 59.5 |

**Killing `stroke` alone recovered as much as killing all drawing**, and fills,
rects, text and images were collectively free. Attributing each stroke to its
function found `drawVision` cutting **3,363 dash sub-paths per frame** at a 792 px
radius — 80% of all the dashing on the page — because the pattern was a fixed
`[7, 9]` pixels while the circumference scales with sight radius *and* zoom. A
dash is tessellated into one sub-path per mark before anything is rasterised, so
that count was unbounded in the two directions the camera moves.

Pausing the sim first — so the body count stops moving under the measurement, which
is what made the earlier sweep unreadable — gave a clean two-round comparison:

| | fps |
|---|---|
| as shipped | 13.7 |
| dash count capped at 12 | 40.5 |
| **sight rings drawn solid** | **53.8** |
| sight rings skipped entirely | 52.3 |
| every stroke in the page suppressed | 59.3 |

Drawing the rings solid is worth as much as not drawing them at all, so a large
solid arc costs nothing and the whole bill was the dashing. Capping the mark count
is the wrong lever — the cost is superlinear, five times the marks cost nearly nine
times the time — so **`drawVision`'s ring is solid**, at a lower alpha because a
continuous line lays down about twice the ink. `drawReach` keeps its dash and needs
no cap: it was measured fully dashed at 567 marks a frame *inside* the 52.3 result,
because the cost is the product of mark count and radius rather than dashing as
such. `arcDash` remains as a ceiling against a radius running away, set to leave
every pattern on the page today looking exactly as it does.

**With the dashing gone, one more cost became measurable that had been hiding under
it.** Live this time, with the world moving, two rounds:

| | fps |
|---|---|
| baseline | 33.2 |
| `updateHud` suppressed — no DOM writes | 33.0 |
| `backdrop-filter` removed from the HUD | 43.0 |
| `stroke` suppressed | 55.5 |
| `render` suppressed — no canvas at all | 55.9 |

The HUD's per-frame DOM writes cost *nothing* — the two rounds disagreed on the sign
— so the `tick` and `fps` chips can keep updating at 60 Hz. But `backdrop-filter`
cost about **7 ms a frame**: seventeen elements each asking the compositor to
re-snapshot and re-blur its slice of a canvas that repaints every frame. They are
now flat, with `--scrim` at 0.88 instead of 0.72 to carry the legibility the blur
was providing; `.rail-inner`'s blur sat behind a 97%-opaque gradient and was buying
3% of anything. And the last two rows are the same number, which says it again from
a third direction: **with the dashed rings fixed, every remaining canvas cost is
stroking, and fills, sprites and text are free.**

So the lesson to carry into the isometric view is the opposite of the one an
earlier draft of this section drew: **fill area was affordable and stroke
tessellation was not.** A richer world made of textured fills is cheap on this
hardware; one made of outlines, dashed overlays and hairlines is not, and a dash
pattern in fixed pixels is a cost that grows every time the camera zooms in. What
does generalise is the method: the phase timings cannot see any of this, a large
`idle` beside a small `render` is the compositor asking to be measured a different
way, and every configuration needs a repeat of the baseline as a control — the run
that first suggested `backdrop-filter` was the culprit failed exactly there.

The page carries the instrument for it now. `P` toggles a ten-phase frame
breakdown and a ticks-per-frame histogram beside the always-on fps chip, and
`?perf=1` turns both on at load. It is deliberately independent of `[dev]`:
`[dev]` lifts the fog, so every body in the room is drawn and the level clips
against different paths, and profiling there measures a renderer nobody is
complaining about.

`[profile.dev] opt-level = 1` is set because a test here is thousands of
simulated ticks. Unoptimised fixed-point math makes `cargo test` slow enough
that people stop running it.

### What the isometric conversion cost

The lesson above was carried into the isometric view and it held in the direction
it predicted, which is the counter-intuitive one: **the conversion deletes a
stroke rather than adding one.** Top-down, rock is one flat tone, so the only way
to say where a mass ends is to draw a line there — `edge`, several hundred
sub-paths, one per exposed rock face, stroked every frame. Under iso a block is a
lit top face standing over shaded sides and the silhouette is exactly where those
two tones meet each other and the floor, so the rim is implied by the fills and the
path is not baked at all. It went in `iso-02` rather than in
`iso-03` where the plan expected it: `edge`'s geometry is axis-aligned tile
corners, so it would have stroked rectangles over diamonds the moment the floor
became diamonds, a session before the walls got their height.

**What that stroke cost was never measured, and an earlier draft of this paragraph
called it "the second-largest stroke on the page" — a ranking nothing above
supports.** This section ranks no strokes. The only attribution it records is
`drawVision` at 80% of all *dashing*, and `edge` is undashed, so it is not in that
accounting at all; and the sight-ring table concludes that a large solid arc costs
nothing, which if anything argues the other way. What is known about `edge` is a
count and a cadence — several hundred sub-paths, every frame, now none — and that
the primitive it spends is the one this section identifies as the scarce resource.
That is the honest form of the claim, and it is enough to justify the direction
without inventing a rank for it.

What the conversion adds is all fills, which this section has already measured as
free:

- **Band fills.** Lit rock is baked per depth row and merged with the depth-sorted
  bodies, so where `drawLevel` spent two `ctx.fill()` calls on all the rock there
  are now two for the remembered rock plus two per visible band for the lit —
  about two dozen bands at default framing, so about four dozen calls a frame.
- **The wall bake grew, though not per frame.** A tile is four diamond segments
  instead of one `rect()`, a boundary tile adds up to two side quads, and a top
  face is emitted for every solid tile the fog has ever shown rather than only for
  the exposed ones. All of it is baked once per map or fog revision, which is where
  the level's 3,060 tiles were always paid for.
- **The body shadow got cheaper**, which was not planned. Top-down it is the
  silhouette dropped down the screen plus the head circle — two fills, because a
  plain ellipse under a rotating Brute wore as a dark crescent out of its chest.
  Nothing rotates in a billboard, so it is one flat ellipse now.

Two numbers deliberately did not move, and both are the point:

- **`drawReach`'s mark count is unchanged — 567 a frame, inside the 52.3 fps
  result above.** `setLineDash` is a user-space pattern and `groundSpace`'s shear is
  applied after it, so the rasteriser cuts the same `TAU * r / 8` sub-paths it cut
  top-down and `arcDash`'s ceiling bites at the same radius. Converting the decals
  to explicit `ctx.ellipse` calls instead — which is the obvious way to draw a
  world circle in an isometric room — would have changed every mark count on the
  page *silently*. That is the exact bug class that cost 40 fps, and avoiding it is
  most of why the projection lives in the coordinates handed to draw calls rather
  than in the matrix.
- **Fill area is unchanged.** `groundSpace`'s shear is unimodular, `det = 1`, so
  every ground fill covers exactly the pixels it covered top-down. The vision
  disc's 13.41x the screen — the number that made a crowded room unplayable — does
  not move under the projection at all. Only the perimeter does, by 9%.

**The conversion changed the top-down page in exactly two places — a hazard fix
and a bug fix — and neither is a change of look.** An earlier draft of this
paragraph counted only the first and said "exactly one place"; the second landed a
session later and the sentence was not revisited.

The hazard fix is **a dash cap**. `drawRoute`'s `[4, 6]` was the last uncapped
pattern left, and the path under the finger is unbounded: `trimPath`'s `ROUTE_MAX`
runs in `endDrag`, on the way out, not during the drag, so 300 sampled points is
3,093 marks. It is capped at `MAX_DASH_SEGMENTS` now — 96, always. `drawRoute` runs
above `render`'s projection branch, so the cap reaches `[tactical]` and `[dev]` too,
which is blessed rather than reverted: an unbounded dash is a hazard the top-down
page had all along, and fixing it in one projection only would leave the A/B control
disagreeing about something the projection had nothing to do with.

The bug fix is **the callout pill's height**, from `iso-05`. `drawCallouts` computed
`let radius = 0.5` and overwrote it from the live row only while the swinger was
still standing, so on the single frame an actor's row left the frame the pill
snapped to the height a 0.5-radius Fighter would have hung at — and 0.5 is not a
radius any body in the roster has. Top-down that was up to 17 px, straight up or
down, mid-fade, over a dying Brute or Skitterer, and it had been there since the
pills were written. Standing bodies up made it six times worse and made it
impossible to miss, which is how it was found. `pushCallout` now records the
`radius` and `kind` the callout was *declared* with and `bodyTopWorld` reads those,
so the height is continuous in both projections. It reaches `[tactical]` and `[dev]`
on the same terms as the dash cap: the defect was never isometric, and leaving the
control mode holding a bug for symmetry's sake would be keeping the wrong thing
constant.

One allocation went on the way past. The facing wedge's three intent alphas are
built once per skin instead of per body per frame; moving the wedge into
`[world]` had quietly doubled that mode's per-body dynamic strings, against a
render path whose standing rule is that it allocates nothing per frame.

**What is not known is the measured `render` mean, before or after, and no figure
for it should be inferred from anything above.** Every number here is a count of
work, which is the instrument this section argues for — and `render`'s cost is the
one thing counting cannot settle, for the reason stated at the top: the commands
are queued, and reading the cost as a duration needs a foreground tab and the frame
strip rather than a `for` loop. **That measurement is outstanding and belongs on
the machine that runs the game.** The prediction the counts support is that an
isometric room is cheaper than the top-down room it replaces, which is not the
direction anybody expects a projection change to move a frame. Whoever takes it
should also say which baseline they are against: measured against `iso-02` the
later sessions only *add* work, because the stroke had already gone by then, so a
`render` mean that fails to fall against `iso-02` is not a regression to chase.

## Art direction

The target is a concept image, and its permanent home is `web/assets/CONCEPT.png`:
commit it there once and never regenerate it. Nothing loads it and it is not an
asset — it belongs in the repository because a mood target that lives in a chat log
is a mood target nobody can check a sprite against six weeks later. It is not in the
tree yet, and that is the one line of this section that is a to-do rather than a
record. Everything below is traceable to something visible in that image, and it is
written here rather than in a plan because plans are deleted when their topic
finishes.

**The room is brown-black, not blue-black — and that cost the channel the contrast
used to live in.** The palette was cold: `#090b10` behind the page, rock at
`#161c28`, flagstones at `rgb(t, t+4, t+12)` where *blue was the channel carrying
the contrast*, and every comment that tuned anything said so. It is umber now. The
three channels hold a fixed warm ratio through every tone, and what separates two
surfaces is **how much light each one is getting** — brightness, not hue.
Two consequences the next person to "fix the contrast" needs before reaching for a
channel that is deliberately empty: a doorway can no longer read by being the only
warm thing in a cold room, so it buys its read with chroma (four times the rock's
span) and with the little brightness umber has left over — 1.23× the rock top on
relative luminance, *down* from the 1.67× the old warm-on-cold pair had, and
`DOOR_TOP`'s comment carries that regression and its knob; and a torch can no longer
read by hue, so the ladder from bracket to flame to core carries it, widened to 4.8×
and 1.63× to compensate.

**`PAL` is a relationship, not fifteen colours.** It lives at the top of the wall
constants in `web/main.js` and it is quoted here once, because this is the copy the
rest of the repository — including `ASSET_SPEC.md` — should cite:

```
void #0b0a08   mortar #100d0a   stoneLo #241e14   stoneHi #2e281e
rockSide #1e1a14   rockTop #3a342c   rockLip #57503f
timberTop #5a3d1c   timberSide #33220f   iron #2a1d10
flame #e8842c   flameCore #fff0c4
bone #c9bfa8   boneDim #8c8474   blood #7a1010   bloodHot #c0392b
cold #3d4f5c
```

The three claims those numbers exist to make: **rock is lighter than distant
floor** (a lit top face standing over ground the light no longer reaches is the
ordinary isometric read, not a regression), **flame is brighter than anything**,
and **blood is the only saturation**. A tone added here that breaks one of those is
a bug even if it looks fine on its own.

**One global light: upper right, warm.** Every asset in the game is lit by it, and
this is the one rule that cannot be rescued by putting an asset next to something
else — two sprites lit from opposite sides are wrong together at every scale and in
every arrangement, which is why it belongs in the durable file and not only in a
generation brief. The procedural bodies already obey it: the rim gradient runs
across the silhouette from the shaded side to the lit one and never rotates with
the body, because the light belongs to the room.

**Light comes from things.** A torch has a fixture, a pool on the floor and warm
bounce on the wall behind it; a character carries a lantern. More than a few units
from one of them the room is *gone*, not dim — the vignette reaches 0.80 at the rim
and the corners of the frame are near-black on purpose. Two bounds on that, and
both are hard:

- **The fog decides what is visible and the lighting is cosmetic within it.**
  `canSee` and the frame's `visible` column are the sim's answer. Never-seen stays
  black; remembered-but-unseen draws dimmed with no dynamic light. **A torch may
  not reveal a body the character's vision has not** — lighting a room you cannot
  see is a wallhack.
- **No `shadowBlur`, ever, and no new dashed strokes.** Soft light is a cached
  radial gradient composited with `lighter`. "Performance notes" above is why:
  strokes are the scarce resource on this page and fills are effectively free, and
  a blur is a per-pixel pass wearing a fill's clothing.

**Chroma is reserved**, and the list is short: the flame, blood, and the two thin
team rings under the feet. Everything else on screen is umber, bone or near-black.
The rings are the one exception and they stay subordinate — desaturated a long way
toward grey, thin, dim, and readable only because everything around them is brown.
If a faction is ever hard to call at a glance the answer is ring alpha on hover and
selection, never chroma on the fill. **All of that is about the room's materials.**
The gameplay readouts drawn over it — health bars, lock marks, the destination
crosshair — are instruments rather than surfaces: they paint in all three view modes,
which makes them part of the A/B control rather than part of the picture, and they
keep their chroma deliberately. **The check is a desaturated screenshot of the room,
not a code review**: drop the saturation to zero and any *material* that stops being
findable was relying on hue it was not allowed to spend.

**Figures are silhouettes with a warm rim.** A body is near-black in its interior
with a bright edge on the side the light is; the detail lives in the *outline*, not
in the fill. That is what makes a body readable at forty pixels, it is what makes a
procedural rig a shipping look rather than a placeholder, and it is the test to run
on any new body: shrink the window until a figure is forty pixels tall and ask
whether you can still name its archetype and its facing. If the answer needs the
interior, the silhouette is wrong.

**The HUD is framed, not floating.** Bone text on near-black behind thin warm-iron
frames — a 1 px border and a 1 px inset bone highlight, which is what reads as
bevelled metal without a gradient or an image. It is styled globally rather than
per view mode, deliberately: there is one DOM and three view modes share it, and a
HUD that repainted itself on `G` would be a mode switch that flashes the whole
page. The canvas is the A/B control; the chrome around it is not. `--scrim` keeps
its 0.88 and its lack of blur, and that is a measurement rather than a taste — see
"Performance notes".

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

**Damage per impact, and the tick limits.** The scaling constant went 60 → 135
when the sword became a phase machine, because a windmill billed a blow every
nine ticks and a measured attack is a windup, a cut and a recovery. It came most
of the way back down, to 60, and the reason was **resolution** rather than pace: at
135 a Brute's blow was worth up to 57 against a Fighter's 84 health, so a duel was
three or four landed blows and "won on half its health" and "won almost
untouched" were one blow apart. That is not enough rungs to hang a difficulty
range on. At 60 a duel was a dozen blows a side, one misread a visible dent
rather than a third of the fight, and both tick limits sit at two and a half
minutes.

Damage became kinetic energy and the constant became `ENERGY_TO_DAMAGE`, first at
384 — set by holding a Fighter's best blow at the 14.3 the old law gave it, so
that what was pinned was that resolution and not the number. Switching laws moved
the roster around that anchor without spreading it out: a Brute went 1.74 → 1.44
of a Fighter and a Skitterer 0.49 → 0.37.

**It is 96 now, and health is `4 + vitality`, and that trade went the other way.**
Both halves moved on purpose and by different amounts: health fell by a factor of
seven, damage by four. A Fighter is 12 health against a best blow of 3.6 — a ratio
of 0.30 where 14.3 against 84 was 0.17 — so a fight is three or four clean
exchanges rather than six. That is the resolution argument above, *overruled
rather than refuted*. What bought it is legibility: at 84 health a point of
vitality is 8, under a tenth of a bar and invisible in the only place a player
reads health, which is the size of the number that just came off it. A ladder
whose rungs cannot be seen from inside the game is a ladder in the source code.
One point of vitality is now exactly one point of health, and one point of power
is a quarter-point of damage that the floaters print. The roster is asserted in
`rules::tests::the_roster_is_the_size_the_design_claims`, not tabulated here,
because a number in a document is a number that rots.

**Braking and an arrival band** for `Order::Goto`. A destination order needs a
rule for *stopping*, and both of the above are actively wrong for arriving — the
wall sweep walks past a destination near an edge, and `open_ground`'s wall-fear
bias is a search heuristic for an agent that has nowhere particular to be, so
against an explicit destination it is fighting the player. Worse, it is added
before `clamp_length`, and `clamp_length` only ever *shortens*: a short sum passes
through untouched, so the bias never shrinks as the approach slows. That is a
stable fixed point roughly 0.2 units short of every click, anywhere in the arena.
The `Goto` arm therefore dropped both and did two things instead, of which only
the first is still standing:

- **Brake by the stride, not the tick.** An action persists until the agent's
  next decision, so the vector is scaled by `distance / (move_speed ×
  decision_period)`. This is the intellect stat again, from the other side: a
  dim character commits to a longer stride and has to creep in, a sharp one
  lands on the point. Without it the hero ping-pongs across the destination
  forever at an amplitude of one tick of travel. That ratio is still
  `DuelistPolicy`'s law; `UtilityPolicy` has since replaced it with a
  stopping-distance solve, which is the same argument carried one step further
  and is set out under "The order channel".
- **~~Stop inside one tick of travel.~~** The band was `move_speed` wide so that
  it scaled with agility, and it could not have been much tighter: a direction
  component below raw 19 multiplies to *zero* displacement, so a band near zero
  never terminates, and below one tick of travel `apply_movement` still updates
  `facing` from a `dir` that moves nothing — leaving the character spinning on
  the spot. Every word of that is still true about *bands*, and it is why there
  is no longer one. A threshold that thin is re-armed by the first shove, which
  is the bug "The order channel" is about. Termination is now a property of the
  approach rather than a test on it: the pull goes as the square of what is left
  of the gap and the brake goes as the gap, so the walk crawls to a stop of its
  own accord, and `nav_step` falls silent when there is no direction left to
  give. The facing problem is real and is answered where it always was:
  `Command::HOLD` short-circuits on a zero direction, so a character ordered to
  the ground it is already standing on holds perfectly still instead of turning
  on the spot.

A click within one body radius of a wall is unreachable, because `clamp_to_arena`
pins bodies to `[radius, arena - radius]`, so the destination has to be pulled
back to somewhere a body of that width can actually stand — otherwise the
character presses into the wall forever, never satisfying anything. This section
used to say that belonged in the AI rather than the renderer, on the grounds that
the renderer would have to reimplement collision rules in float to know it. The
first half of that was right and the second was the whole argument: it belongs
wherever the collision rules already are, which is the sim. `World::reachable_point`
does it now, per body, and generalised from "the arena box" to "the masonry" —
because once there are walls, a policy reconstructing its reachable box out of
`wall_clearance` is describing the corridor it is standing in and not the level.

The general lesson: a fight that cannot end is worse than a fight that ends
badly. A draw scores zero, tells evolution nothing, and costs a full tick limit
of compute — the most expensive possible way to learn nothing.

## Open questions

**A blocked blow has a second number in it, and the event feed does not carry
it.** `Event::Block` reports `absorbed`, which is what the shield ate. The
disturbance to the *guard* is a different figure — `knock`, the second return of
`World::deflect` — and the table above proves it is not a monotone function of
`absorbed`: a Rogue's blade is absorbed hardest and knocks least. It exists only
on the blade path; `resolve_shots` writes no `Impulse` at all, so an arrow has no
such figure and a fourth field would be zero on every arrow row forever. Reaching
it from the emission site needs a `knock` field on `Blow` and a restructure of
`resolve_swings`' first pass, which is why it was left out of the event ABI. If
scaling an impact's brightness or its voice on `absorbed` turns out to read
wrong, `knock` is the number to reach for.

**The difficulty ladder and the fitness function want opposite things, and only
one of them is in the fitness function.** The bottom rung of the range is made of
how badly a policy plays with bad reads, so every improvement to the policy raises
it. Two genes are currently hand-set against the ladder rather than against
fitness, off measured sweeps, and that works and does not scale: it is a
two-objective problem being solved by hand on one objective, and the next
substantial policy change will need doing again. What would actually solve it is a
fitness that scores the *spread* across character sheets rather than the quality
at one — evaluate each candidate on a dim sheet and a sharp one and reward the
gap. That is a real piece of work and this phase did not attempt it.

**Search behaviour.** A patrol is still not search — an agent remembers which way
it is walking and nothing about *where it has already looked*. It is enough that
two fighters in a duel arena reliably find each other again, which is what the
draw rate needed, and it is not enough to spawn a skirmish across the full arena:
those spawns are still confined to a vertical band. Better than papered over,
short of solved.

Occlusion narrowed it rather than moving it again. A monster can no longer fight
what it cannot see: a contact has to survive `Dungeon::sees` before there is
anything to target, so a creature that loses you behind a wall genuinely loses
you. What is *not* bounded by sight is the approach — `march` is reached precisely
when nothing is in view, and under `Objective::Hunt` it walks a route to the
nearest enemy along the floor whether or not the creature has ever laid eyes on
one. So "a monster that knows where you are" now carries two bounds on two
different things: line of sight on what it can fight, and `HUNT_RANGE` — 18
units, measured along the route — on how far it will walk toward what it has not
seen.
Neither of those is knowledge, and that is what is left open.

The honest version is unchanged and now stands on its own: something that picks
up a trail, follows it, loses it, casts about where it last had one and
eventually gives up. It needs the one thing no policy here has — memory of where
it has already looked — and it is also the change that would let `skirmish` spawn
across a whole arena rather than a vertical band, so the two remain the same
piece of work.

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

**~~The duel arena's opponent decides the answer, and the fitness function cannot
tell.~~** Answered, by making fitness look. Evolved against a *duellist* Brute
rather than a naive one, four genuinely independent runs all returned `standoff`
between 0.68 and 0.99 with `evasion` pinned at its ceiling, scoring 100% and 0.76
surviving health. Those same genomes win 19% to 45% against the naive Brute.
Standing off beats an opponent that reads you and hesitates and is suicide against
one that walks in swinging, because the tip of the arc is the worst place on it —
so what evolution found was not a better fighter but a counter to one opponent, at
a fitness score that looked like a clear win over the hand-tuned weights.

`lab evolve --cross` plays the whole seed set twice, once against each opponent,
and returns the **worse** of the two averages. The minimum and not the mean,
because "must clear both" is the claim being made and a mean lets a genome buy a
collapse against one opponent with a rout of the other — which is precisely the
trade that produced the bogus result.

There was a second copy of the same mistake one level up, and it took the same
fix. A policy's weights are *one set of numbers shipped to the whole roster*, and
`--arena duel` scores a single pairing — so a genome tuned on Fighter-versus-Brute
is a counter to one opponent wearing one body. `--arena roster` runs all sixteen
archetype pairings on every seed. That is 32× the rollouts of a single duel with
`--cross` on, which is affordable and was not optional: the change that took a
duelling Rogue against a Fighter from 18% to 99% cost a Brute half its matchup
against the same Fighter, and no single-pairing fitness can see the trade it is
making.

What is *not* answered is self-play, below. Both opponents here are still fixed.

**~~A policy cannot tell an axe from a knife.~~** Answered. `Contact::threat` and
`Contact::frailty` carry what one clean blow is worth in each direction as a
fraction of the bar it comes off, which is the relative form of three absolute
quantities (`power`, `weapon.weight`, `max_hp`) that are correctly kept out of an
observation. The first thing it bought: breaking off is now counted in blows
rather than in health. `hp_frac < caution` was a decision about yourself and not
about the fight — 20% of a Fighter is two more knife cuts or most of one axe blow,
and one number cannot mean both — and it is now `blows_left < caution`, with a
second clause that refuses to run from someone closer to dead than you are.

**~~A fair mirror does not resolve.~~** Answered, by a change aimed at something
else. Two duellist Scouts used to time out at near-full health 58% of the time,
because their perception was good enough that neither got a read the other did
not and the eight-stance score has no tie-breaker in it. Under the energy damage
law they go 53% / 0% draws at 0.08 health, and all four archetypes' mirrors
resolve. The wider dead zones a squared law produces make spacing decide the
fight, and spacing is what two symmetric reads stop agreeing about the moment
either fighter moves. The mechanism in the old diagnosis was right; the knob that
reached it was not one anybody was looking at.

**~~Reach is still mostly decoration, and knockback did not fix it.~~** Mostly
answered, and not by knockback. The shove a blow delivers is tangential — it
carries a crowder *around* the arc rather than back out of it — so it costs the
crowder its position without opening the range. That is the right physics for a
sweeping cut and the wrong geometry for the problem, and pointing the impulse
away from the attacker instead would be describing a thrust.

What made reach pay was the damage curve. `GRAZE_FRACTION` is a share of a
fighter's own best blow and did not move, but where on the blade that share falls
did: a third of the way out under a linear law, two fifths under a squared one,
because `sqrt(0.12)` is a longer walk than `0.12`. Every dead zone in the roster
grew by about a third, so crowding costs more everywhere.

The last piece — a heavy fighter having no way to *take* the space it wants, only
to punish someone standing in it — **is still open, and now has a reason instead of
a to-do.** A body-check was built for it (`Stance::Barge` against `Contact::heft`)
and removed: at the top of its range, with bodies touching, the best it can score
anywhere in the roster is 0.838 against `Trade`'s 1.4. You cannot be crowded into
uselessness here because bodies are wider than the gap between contact and the
dead zone, so trading is always worth more than shoving. The percept stayed. See
"Four things a fighter can now do about weight".

**The difficulty range is measured on one matchup.** Fighter against Brute, which
is the fight the swing model was designed around and the one with the widest
gradient in it. Whether `intellect` and `perception` buy as much against a Rogue
— seven ticks of telegraph, which is under a stock Fighter's reaction time — is
not something the table above answers, and the honest guess is "much less".

**~~One `standoff` gene cannot serve every body.~~** Answered.
`Contact::min_strike_range` carries the threat's dead zone, so preferred range is
chosen from the *threat's* geometry: the larger of "where my own blade starts to
bite" and "where its blade stops biting", with `standoff` spending the distance
out toward arm's length. Sometimes the second is beyond the first and there is a
band in which a fighter can reach and cannot be reached — a Skitterer has about a
twentieth of a unit of it against a Brute and a Fighter has none at all and must
trade, which is a real asymmetry that falls straight out of the geometry.

The gene shipped at **0.000** for two phases, which read like an extreme until you
noticed it no longer meant "how close to its body". Swept directly against a naive
Brute over 240 duels it was not close:

| `standoff` | 0.000 | 0.200 | 0.400 | 0.600 | 0.800 | 1.000 |
|------------|-------|-------|-------|-------|-------|-------|
| win rate   | 98%   | 87%   | 72%   | 40%   | 25%   | 17%   |
| health won | 0.60  | 0.44  | 0.37  | 0.32  | 0.23  | 0.24  |

**And it was 0.000 because the arithmetic was wrong.** Both distances the gene
spends between were computed as sums where the sim bills a hypotenuse, which stood
every fighter up to half a body further out than it meant to — so buying *more*
reach on top of that was buying something it already had too much of. Corrected,
four independent evolution runs return 0.23, 0.33, 0.38 and 0.49, and it ships at
0.25. The sweep above is still true and still says what it said; the fighter it
was measured on was standing somewhere else.

An earlier note here claimed the 0.000 came back in four independent evolution
runs. It did not: `lab evolve` takes `--master-seed` and the runs were launched
with `--seed`, which it ignores, so those were one run reported four times. The
four runs behind the numbers above are genuinely independent. The mistake is worth
leaving on the record, because "four runs agreed" is exactly the kind of statement
that sounds like independent confirmation and can be neither.

The error in that read is asymmetric on purpose, and it is where most of the
difficulty range lives. Guess the enemy's dead zone *low* and a policy's own
floor protects you. Guess it *high* and you stand off a weapon you could have
crowded, which against a Brute is four points a blow against thirty. A dim
fighter respects a big weapon's reach and is killed by it.

**Both of those distances are computed wrong, and the fix makes things worse.**
They are sums — `own_dead_zone·margin + foe.radius` and `foe.dead_zone +
own.radius` — where the sim bills a blow at `sqrt(D² − r²)` and not at `D − r`,
so each is a leg of a right triangle whose hypotenuse is the range. Measured
against `segment_circle` itself: a Rogue crowding a Fighter strikes at 0.663, not
0.350. Correcting both rescues a duellist Rogue against a naive Fighter (18% →
99%) and wrecks the rest of the matrix — every mirror runs out the clock
untouched. The stance scorer's whole tuning sits on these distances and the genes
were evolved against the sums, so this is blocked on a re-evolution rather than
on a diagnosis.

**The side a cut comes from is a decision the player cannot make.** `Strike`
carries three options and the page only ever sends `Nearest`. Choosing the flank
a guard is not on is one of the sharper reads in the model, the AI makes it, and
there is no second mouse button left to spend on it.
