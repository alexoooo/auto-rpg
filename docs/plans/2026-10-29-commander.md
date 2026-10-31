# The general Commander: team options, priced by the life left at the exit

## Why

Option Mind is a general mind: options, each a skill applied to a target, chosen as a set whose claims
do not overlap, each priced in the verdict's unit, by a chooser that is a part. The Commanders are
not general: `mob`, `independent`, `party` and `clearer` (`src/core/command/`) are each a rule
written by hand, and `clearer`'s `POLICY` numbers are first guesses. None weighs one course
against another.

This plan builds one Commander in Option Mind's shape one level up, the **Option Commander**: the members are
its resources, a team option claims members, each option is priced by what it is expected to leave
at the exit, and its chooser is configured. The four kinds stay, as opponents and baselines.

**The owner's decisions** (2026-10-29):

- **The Crypt's score is the life left at the exit, less a price on time**: time and wounds are one
  unit, so every run reads a number, and a Commander's value is a prediction of that score.
- **The price on time is the score's, not the game's**: nothing in a run drains. Life, the senses,
  who is out and every Mind and Commander play as they do in the game; only the evaluation's
  reading and its stopping rule know the price.
- **The player's side is one unit for now**: nothing prices members lost or left behind.

**Decided here, which the owner may reverse**: the price from the level's own route (a walk of it
with no foes keeps half the life); the name.

**What must not move**: every fingerprint case (a run plays as it does; only an evaluation reads
the score); Option Mind's fingerprint through step 2; the Commander contract's boundary
(`tests/core-boundary.test.mjs`, `COMMAND_BARRED`).

## The design

### The score: life at the exit, less time

A run's score is the hero's life at its end less the price of the time it took and the time it
would still take to reach the exit, in shares of full life:

`score = life - price * (elapsed + left / pace)`

- `life`: the pool's bar (`Pool.bar`) at the run's end, 0 for a run lost (`dead`).
- `left`: the route from where the hero ends to the exit (`findPath`, at the hero's radius), 0 at
  the exit; `pace`: the hero's gait's forward pace (`MemberView.gait`). A run lost far from the
  exit reads lower than one lost near it, so lost runs are not all one number.
- `price`: the share of full life a second, from the level: a walk of its route from the start to
  the exit with no foes, at the hero's pace, costs half the life (`price = 0.5 / (route / pace)`).
- **A run stops** at the exit, at the hero's death, or once `life - price * elapsed` reaches 0: no
  run can then score above a lost one. No cap is needed past that.

The score is read by the evaluation from the run as it is; the run, the game's Crypt and every
Mind and Commander are unchanged by it.

### The Option Commander

| Option Mind (one body) | The Option Commander (one team) |
|---|---|
| Resources: legs, trunk, each hand (`Resource`, a string) | Each member, by id |
| An option: a skill applied to a target (`Option`) | A team option: a course applied to a target, its step the orders of the members it claims |
| Rest options (`rest.ts`) | One rest option a member: no orders that move it; its own Mind fights where it stands |
| Its entry (`Readiness`) | A foe seen, a member standing, a frontier or the exit known |
| Its model (`Terms`: time, life dealt and taken, where it leaves the body) | Time, life dealt and taken, where it leaves the team |
| The value of a position (`PositionValue`, `FEW_TERMS`) | The score predicted from a team's place |
| Its chooser, a part (`ChooserPart`: `valued`, `ranked`) | Its chooser, named by its config (`valued`, `ranked`), over the set selection shared with Option Mind |
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

### 1. The score

`crypt-clear`'s protocol (`CRYPT_CLEAR`, `src/evaluation/crypt-clear/cases.ts`) becomes a new
protocol: the hero alone (no companions), its reading the score (`ClearReading.score`) beside the
life at the end, the share cleared and the time; a case stops by the score's rule (above) as well as
by the exit and death, and its route's length and the hero's pace are read once at its start. The
table gains the score's column (`src/evaluation/crypt-clear/index.ts`). Nothing in `src/dungeon/`
or the core changes.

Check: the gate; the fingerprint unchanged; `npm run evaluate -- crypt-clear` with `clearer` and
Option Mind as the hero (8 runs: seeds 10 and 25, two trials, the `mob` and `independent` enemies),
a figure for every run, lost ones below won ones.

Built: the protocol `alone` (`ALONE`, `scoreOf`, `src/evaluation/crypt-clear/cases.ts`).

### 2. The chooser shared: set selection in the toolkit

Option Mind's set selection (`chooser`, `src/core/option/chooser.ts`) reads of its
options their claims, rest mark, targets and aim, entry (`onOffer`), status, begin and end; of the
situation its time and its cue (`eventOf`, Option Mind's); and it prices the other targets'
situations (`others`) and names the target chosen (`Chosen.at`). What an option is worth, the look
past a walk among it (`lookingPast`), is its appraisal's, which stays Option Mind's. Lift the
selection:

- **The toolkit's commit** (`src/core/mind/choice.ts`, beside the readout's types,
  `src/core/mind/engagement.ts`): `Choice<S, T>`, an option's shape without its step, model, exit
  (`at`), engagement or decision; `selectSet<S, T>(choices, appraise, deciding, cue, chance)` with
  `others` and the target chosen; `overlaps`, `NOTHING`, `WHOLE` with it. The terms an appraisal
  reports are its user's type (`T`): a body's (`OfferTerms`) for a mind, a team's for a Commander.
  It reaches no body, skill or tactics module.
- **Option Mind's commit**: `Option` extends `Choice<Situation, OfferTerms>`; its chooser is
  `selectSet` with `eventOf`; `VALUED_CHOOSER` and `RANKED_CHOOSER` unchanged in behaviour.
- Chance: the valued chooser draws only between offers within its `margin`, none by default, and
  the ranked never draws, so a Commander passes none and needs no seed.

Built: `selectSet` over `Choice<S>` (`src/core/mind/choice.ts`), priced as `Priced<T>`, the
readout's `Offer` a body's; one toolkit commit, Option Mind's framework being the toolkit's.

Check: the gate; the fingerprint against the commit before, no case moved; one bout of Option Mind
with `ranked`, its digest equal before and after.

### 3. What the team reads: the exit, routes, foes' life and prospects

- `TeamLevel.exit(): Point | null`, the exit once the team has seen its cell; `TeamLevel.route(from,
  to, radius): number | null`, the length of a route a body of `radius` walks, doors opened on the
  way: the run answers by `findPath`, kept for the look it was asked at (A* is dear a decision); the
  Arena's team by the straight distance.
- `SensedBody.life`: a foe's share of its full life, as its pool's bar (the Arena's `Duel.life`).
- **The toolkit's commit**: `MindReport.prospects: readonly Prospect[] | null`
  (`src/core/mind/report.ts`), each `{ foe, dealt, taken }`: the share of the foe's full life the
  body expects to deal it a second, and of its own it expects to take, at reach;
  `MemberView.prospects` carries it, null where the Mind publishes none. The architecture's Command
  table gains it, `TeamLevel.exit` and `route`, and `SensedBody.life`.
- **Option Mind's commit**: Option Mind writes its prospects into its `state` as its chooser prices
  a foe, read at reach (`Pressure.peak` and its own strikes' best rate within reach, not at the
  range now, which reads nothing out of reach): the focus each decision, and each of `others` as the
  chooser reads them. It reads nothing its valuation does not already, and a forked bout carries
  them. A foe it has not priced has none.
- Where a member has no prospect of a foe, the Option Commander prices the fight by hand
  (`BY_HAND`, its seconds and the life it costs, sourced as the owner's decision), until step 1's
  rows hold enough fights to measure it.

Check: the gate; in a Node stand, Option Mind's prospects against a standing Warrior agree with its
own pressing and pressure at reach that decision (a printout, no test); a forked bout's prospects
equal the original's.

Built: `TeamLevel.exit` and `route` (`routeLength`, `src/dungeon/map.ts`; kept a step),
`SensedBody.life`, `Prospect` and `MindReport.prospects` (`src/core/mind/report.ts`, a decider's
`Decider.prospects`), `MemberView.prospects`; Option Mind keeps them each time its chooser decides
afresh (`Chosen.fresh`), its dealt its strikes' best rate within reach (`StrikeOption.rate`: the
measured peak at the focus's phase, else the prior). `BY_HAND` waits for step 4.

### 4. The Option Commander

`src/core/command/option.ts`, kind `option`, a line in `COMMANDERS`, sides `party`: its options
(above), its place's value (`TeamValue`, its first implementation the terms above), its time price
(`timePrice`, the protocol's `price` rule by default), its chooser named by its config (`chooser:
"valued" | "ranked"`, its entry's `faults` checking it) over `selectSet` with no chance, its memory
in `state`. Its options' orders go through `throughDoors`; its report names the option each member
runs (`MemberReport.task`). It hears no command yet; a person's commands come later as an option of
their own. The generator's means (the route from start to exit in `findPath` metres, encounters a
metre, over seeds 1 to 30) are read once by a script and cited where the value reads them.

Check: the gate, with `tests/command-contract.test.mjs` leading an Arena bout with it as a team of
one, sending its member at the foe, and replaying it from its orders.

### 5. Read against the clearer

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
