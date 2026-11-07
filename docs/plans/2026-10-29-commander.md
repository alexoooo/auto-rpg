# The general Commander: team options, priced by the life left at the exit

## Why

Option Mind is a general mind: options, each a skill applied to a target, chosen as a set whose claims
do not overlap, each priced in the verdict's unit, by a chooser that is a part. The Commanders are
not general: `mob`, `independent`, `party` and `clearer` (`src/minds/command/`) are each a rule
written by hand, and `clearer`'s `POLICY` numbers are first guesses. None weighs one course
against another.

This plan builds one Commander in Option Mind's shape one level up, the **Option Commander**: the members are
its resources, a team option claims members, each option is priced by what it is expected to leave
at the exit, and its chooser is configured. The four kinds stay, as opponents and baselines.

**The owner's decisions**:

- **The Crypt's score is the life left at the exit, less a price on time**: time and wounds are one
  unit, so every run reads a number, and a Commander's value is a prediction of that score.
- **The price on time is the score's, not the game's**: nothing in a run drains. Life, the senses,
  who is out and every Mind and Commander play as they do in the game; only the evaluation's
  reading and its stopping rule know the price.
- **The player's side is one unit for now**: nothing prices members lost or left behind.

**Decided here, which the owner may reverse**: the price from the level's own route (a walk of it
with no foes keeps half the life); the name.

**What must not move**: every fingerprint case (a run plays as it does; only an evaluation reads
the score); the Commander contract's boundary
(`tests/core-boundary.test.mjs`, `COMMAND_BARRED`).

## The design

### The score: life at the exit, less time

`crypt-clear`'s `alone` protocol scores a run as the hero's life at its end less the price of the
time taken and of the route left (`scoreOf`, `src/evaluation/crypt-clear/cases.ts`); the price is
set so a walk of the level's route with no foes costs half the life. The game is unchanged by it.

### The Option Commander

| Option Mind (one body) | The Option Commander (one team) |
|---|---|
| Resources: legs, trunk, each hand (`Resource`, a string) | Each member, by id |
| An option: a skill applied to a target (`Option`) | A team option: a course applied to a target, its step the orders of the members it claims |
| Rest options (`rest.ts`) | One rest option a member: no orders that move it; its own Mind fights where it stands |
| Its entry (`Readiness`) | A foe seen, a member standing, a frontier or the exit known |
| Its model (`Terms`: time, life dealt and taken, where it leaves the body) | Time, life dealt and taken, where it leaves the team |
| The value of a position (`PositionValue`, `FEW_TERMS`) | The score predicted from a team's place |
| Its chooser, a part (`ChooserPart`: `valued`, `tree`) | Its chooser, named by its config (`valued`, `ranked`), over the set selection shared with Option Mind |
| Following orders at `OBEDIENCE` | A person's commands, later, as an option weighted alike |

**The team's options**, for one unit first:

- **go on**: walk to the frontier, or to the exit once it is known (`TeamLevel.exit`), doors on the
  way (`throughDoors`);
- **fight `foe`**, one worth fighting (`worthFighting`): the orders name it and approach it
  (`approach`);
- **pass**: go on with no foe named, striking only what is upon it, as `clearer`'s push;
- **fall back**: walk back along the way come to the latest place clear of the foes seen, as
  `clearer`'s rally;
- **rest**, a member's: no movement ordered.

**The value of a team's place** is the score predicted from it, with the team's time price
(`timePrice`, its config's; the protocol's `price` where it plays one):

`life - price * (elapsed + secondsLeft) - lifeLostAhead`

- `secondsLeft`: the route left to the exit (`TeamLevel.route`) over the member's pace and, while
  the exit is unknown, the generator's mean route from start to exit over seeds 1 to 30 in
  `findPath` metres (measured once by a script) less the way come, at least the route to the
  frontier; plus each fight ahead's seconds.
- Each fight ahead: the foe's life (`SensedBody.life`) over what the member is expected to deal it a
  second, and what it is expected to take meanwhile, both at reach (`MemberView.prospects`). The
  fights ahead are the foes seen in the way, every foe seen that chases (`mob` and `independent`
  chase while they see the team and `ALERT_SECONDS` after), whatever course is taken, and,
  unexplored, the generator's mean encounters a metre of route.
- Left out at first, and read before they are added: time spent down after a fall, and foes woken
  unseen (`WAKE_METRES`).

With no exit (the Arena's team of one), the place's value is the lead the fight leaves, the Arena's
verdict: own life less the foe's, at the prospects' rates.

An option's worth is the value where it leaves the team less the value now: a foe killed shortens
the fights ahead, a metre toward the exit the route, a wound or a slow fight lowers the score.
Falling back costs seconds and pays where the fight it leaves would cost more.

## Steps

Each lands green on its own: `npm run check`, `npm test`; a browser look where it is something to
see. A run is priced on the pool from its first trials before it runs. A step that touches both
the toolkit and Option Mind lands as two commits, the toolkit's first (`node scripts/entrant-check.mjs`).

The score, the shared set selection (`selectSet`) and what the team reads (the exit, routes, foes'
life, members' prospects) are built; the [architecture](../architecture.md#command) describes
them.

### 1. The Option Commander

`src/minds/command/option.ts`, kind `option`, a line in `COMMANDERS`, sides `party`: its options
(above), its place's value (`TeamValue`, its first implementation the terms above), its time price
(`timePrice`, the protocol's `price` rule by default), its chooser named by its config (`chooser:
"valued" | "ranked"`, its entry's `faults` checking it) over `selectSet` with no chance, its memory
in `state`. Its options' orders go through `throughDoors`; its report names the option each member
runs (`MemberReport.task`). It hears no command yet; a person's commands come later as an option of
their own. The generator's means (the route from start to exit in `findPath` metres, encounters a
metre, over seeds 1 to 30) are read once by a script and cited where the value reads them.
Where a member has no prospect of a foe, it prices the fight by hand (`BY_HAND`, its seconds and
the life it costs, sourced as the owner's decision), until `crypt-clear`'s rows hold enough fights
to measure it.

Check: the gate and a team-of-one Arena bout sending its member at the foe, replayed from its
orders.

### 2. Read against the clearer

`npm run evaluate -- crypt-clear` at one commit, the Option Commander and `clearer` each over
Option Mind as the hero, paired by run (`npm run compare`), so the mind and the code are the same
on both sides. The owner watches a run with `&party=option`. An iteration from here is one question
on the Option Commander, one change, paired. Open beside it: whether Option Mind should price time
too (it reads no time in the Crypt, `Senses.ends` absent), so the hero and its Commander pursue the
same score.

## Done when

The Crypt's score is the life left at the exit less the time's price, read by its evaluation with
the game unchanged; the Option Commander, a chooser over team options priced by that score, scores
the hero higher than `clearer` on `crypt-clear`'s protocol, paired, with the same hero mind; and
the owner has watched it play a level.
