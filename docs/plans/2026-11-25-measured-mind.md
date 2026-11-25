# The Option Mind, measured for every body

**Begun 2026-11-25, by the owner's order**, after the rat's work ([the rat plan](2026-11-24-rat.md))
found the Option Mind keeping the rat at the edge of the Warrior's reach, and an audit of
`src/minds/option/` found that wait made by guesses written in by hand.

The numbers plan (bodies and what they hold as numbers, begun 2026-11-18) is folded in here: its
open work is in this plan, and what it found is in [the approaches](../approaches.md#minds).

## The goal, in the owner's words

**General, not ad hoc** (2026-11-25): "Since it's broken for every character (regardless of we
only notice it on some but not others), then what we need is a general fix." And: "I want a
comprehensive plan to fix all of these ad-hoc hacks with general and simple mechanisms." And on
the action prior: "I want action prior for PUCT and other uses in the plan. My guess is that the
agent didn't seriously try it and just gave up, we need it for scalability."

**At the game's scale** (2026-11-25): "This game will have dozens of bodies and items, with
hundreds of skills. Will the plan allow us to scale up to this while maintaining fast development
velocity?" And: "the entire point of the measured-mind plan is to scalability and development
velocity". Of the numbers plan (2026-11-18): "doing step 6 is necessary because N^2 doesn't
scale"; "we can't have a game with O(N^2 ) scaling, that will never work"; "do the numbers plan
-- we can't have N^2 anywhere"; "i don't want anything in this game to be N^2 (or worse)";
"remove all N^2 (or worse) bottlenecks from the game -- this is what i think the numbers plan is
doing".

**Without measuring again what is not in hand.** Of the testbed (2026-11-17): "I want to avoid
have to re-calculate things, the goal is development velocity so we want to gracefully fall back
to stale data. If we need to do a lot of re-calculation, that will result in weaker fighting due
to fewer iterations vs accepting some degree of staleness." Of the numbers plan (2026-11-18): "re
the back step on other bodies, we can just focus on the empty-handed Warrior for now (it's a
proof-of-concept)"; "you told the worker to spend time on different load outs, when i explicitly
asked you to focus on the empty-handed warrior first as a proof-of-concept?"; "i don't want to
waste time on re-training or re-measuring stuff for different body/loadout -- we are just
starting with the empty-handed warrior as a proof-of-concept". Of this plan (2026-11-25): "when
I'm developing the empty-handed warrior, i don't want to waste time on calculations that are
unrelated to the empty-handed warrior. in other cases (e.g. working on the rat), i might want it
vs the empty-handed warrior. there is no single type of measurement that holds up in general, it
purely depends on what we're working on. we've had a lot of problems with wasting days upon days
on pointless re-calculation -- i don't want to bring that back."

**Done meaning done** (2026-11-25): "we've had a repeated pattern: I ask for a general and
scalable implementation, the agent tells me it's done, and later i learn that what was done is an
ad-hoc hard-coded hack that doesn't scale." Of the numbers step built for a body's stature alone,
the rest written down as not built (2026-11-18): "you decided to not build that, even though I
explicitly told you that it's a must-have?" And of a skill searched for days with no one looking
at it (2026-11-25, [the kick's plan](2026-11-25-kicker-falls.md)): "i don't want to waste
multiple days again, how do we change teh skill development process to force you to follow the
instructions?"

So three things at once. Every number the Option Mind predicts with comes from fights the game's
bodies have played, read by a few mechanisms that are the same for every body. What the game
needs measured grows with the bodies, items and skills added, never with their pairings. And
work on one body never waits on another, and never measures another again.

## The rules every mechanism keeps

The wording is the agent's, from the owner's words above; the owner's to change. A mechanism that
breaks one is not done, whatever it reads.

Each rule is held by something that refuses, as a skill's search is held by its look
(`requireLook`, `research/look-gate.mjs`). A rule kept only in a document is how the pattern
above happened.

1. **No name is a key, and nothing has to be measured a pairing.** What the Mind reads is found
   by numbers: a body by its stature, mass and reach; what it holds by the mass and reach it
   adds; a skill by its kind and what its model says. A measurement is rows of one body doing one
   thing, the other body written on each row as numbers. Any pairing fights on what each body has
   of its own. Rows from a pairing that has been played make that pairing read better; none is
   needed for the game to play it, and none is a table to keep. (Put to the owner on 2026-11-18
   as how the trials' square goes, trials coming from fights so the pairs that meet read well
   from play: "your recommendation makes sense".)
   *Held by* the inventory's check, which fails on a name or a pairing that finds a reading and
   is not on its list. The list is this plan's two tables, and it only shrinks.
2. **A reading is taken from the rows nearest in the numbers.** Those are the body's own where
   it has any, holding what it holds, against the foe nearest the one it faces. Measuring is
   adding: rows to a profile, or one more fit beside those already there. So adding rows moves
   only what was borrowed there. A body with its own rows, against a foe it had measured, reads
   as it did. A reading that pools every row does not keep this (the written form does so today,
   below). A reading borrowed from the nearest body is coarse (the approaches: three measured
   bodies do not price a fourth as its own trials do). It is there so a new body fights on the
   day it is added, not so it fights well.
   *Held by* the measuring command: it reads every body and foe that had their own rows before
   it adds and after, and writes nothing if one moved. It plays nothing to do so.
3. **Every reading says where it came from**, of the body and of the foe: its own, borrowed
   (from which, and how far off in the numbers), stale (what has changed since it was measured),
   or by hand. The game plays on borrowed and stale readings. Nothing waits on a measurement.
   Today a strike profile says when it was measured at other settings (`staleness`) and when it
   is read for another body (`ProfileReading.scaled`), and keeps digests of the body and skill
   it was measured on (`from`) that nothing compares; the fitted value keeps one line of where
   it came from (`origin`). Step 1 builds the rest.
   *Held by* a reading's type: none is built without its source. Every number set by hand is in
   one registry and read through it alone, so the inventory lists them from the code that reads
   them, never from a search of the source.
4. **Nothing is measured again unless it is asked for.** A measuring command is given what is in
   hand (a body, a skill, a foe) and measures that alone. No command looks for what is stale and
   refits it. A change to the Mind makes the fitted value and the action prior stale, since both
   are fitted to how the Mind played; they stay in use, marked stale, until a reading on the
   body in hand says a refit is worth its cost.
   *Held by* the measuring command: it has no way to run on everything, refuses to start without
   what is in hand, and says its price from its first chunk before it plays the rest.
5. **A step is read on what it is about, and reported so.** Each step names the bodies it is read
   on before it runs. Its report gives those readings, and names what it moved and did not read.
   "General" is never said of a reading taken on one body. Of a mechanism it is said only with
   the inventory clean for every body and one body shown fighting on borrowed readings (the
   procedure's step 5).
   *Held by* the report being the tools' own output: the inventory's and the fingerprint's
   comparisons (`--compare`), in the commit message as they print.

## The inventory

A script that plays nothing. For each body, empty-handed and as the game arms it, and for the
Mind named (the body's default, or the general Mind), it lists each thing that Mind reads and
where the reading comes from: its own, borrowed (from which body), stale, by hand, or a table
that had to be measured for the pairing. What depends on the foe is listed against each foe
named, the empty-handed man where none is. It is built from the assets, the registry of numbers
set by hand, and the lookups the Mind itself uses.

It is used as the fingerprint is: written before a change (`--json`), compared after
(`--compare`), each row that changed named. Its check fails where a body reads by hand, by a
name or by a pairing something that is not on its list of those known today.

This is what catches a mechanism called general that was built for one body. On the general
Mind every body's rows must say "its own" or "borrowed"; one that says "by hand" or "none" is
the hack, found without a bout played. It is what is looked at first when work starts on a
body. It replaces any reading taken across every body.

## What a new thing costs

| Added | It fights at once by | Measuring it asks | It never asks |
| --- | --- | --- | --- |
| A body | the general Mind, on the nearest body's profiles, value and prior, each marked borrowed | its own skills' drills, and its bouts against the foes in hand | another body measured again; a table for each foe |
| An item | its mass and reach, read from its spec; the trials nearest in those numbers | trials holding it, of the skills that use it | a table for each loadout |
| A skill | its kind and its model, which the action prior reads; its outcomes by hand, listed, until its drill | its drill, on the body that has it | another skill measured again |

Each count is checked against the code when its mechanism lands, and stated in the step's report.

## The mechanisms

The Mind imagines lines of Options and prices each by the life it deals and the life it takes. The
guesses all sit in what it imagines: how long an Option takes, what it deals and takes, where it
leaves the body, where the foe goes meanwhile, and what the place a line ends in is worth. And
with many Options, the search has to know which to look at first. Five mechanisms answer these
for every body.

1. **The fight record.** Every bout and drill played for the work in hand writes rows in one
   format: the state, the Option chosen, and what followed (the life dealt and taken, falls, the
   posture each body ended in, where the foe went), both bodies as numbers on each row. Each fit
   and each profile is read from rows. Nothing is played to fill the record: it holds what the
   work in hand played, so a pairing reads better the more it has been worked on. It grows from
   what exists: `research/minds/fitted-value.mjs collect` (decision states),
   `research/skills/strikes/strike-bouts.mjs --save` (a bout's decisions, each with its offers,
   and its strikes as trials), `research/skills/strikes/bout-profiles.mjs` (profiles from those
   trials) and `research/minds/foe-placement.mjs collect` (where the foe went).
2. **What each Option does, measured.** The strike profiles already price a strike by the nearest
   measured trials (`src/skills/framework/profile/`), the struck body as numbers on each trial.
   The same reading is used for every kind of Option: walks, holds, the ways up, the brace, the
   cover. Each kind's profile holds how long it took, what it dealt and took, and how it left the
   body. What has to be measured grows with the skills each body has.
3. **Where the foe goes, and what he deals, measured.** The foe does what the action prior (5)
   says a body like him does in his place: his Options, built from his own body, each weighted by
   its chance, each moving him as its measured model says. What he deals a second is his
   strikes' measured outcomes on a body of the struck one's numbers, each weighted by the chance
   he throws it from there, whether the struck body is standing or lying. This is to stand where
   the pressure tables do, which must be measured a pairing (three today for two bodies), and
   where the strikes' rate does, which overprices. A direct fit of where the foe is a moment
   later (`research/minds/foe-placement.mjs`) is read beside it, and kept only if better.
4. **What the end of a line is worth, measured.** The fitted value
   (`src/minds/option/fitted-value.ts`) prices what follows a state from what followed such states
   in fights. It prices the end of every line, including one the horizon cuts and an open Option
   (a hold, a guard). A fit names the bodies and foes whose bouts it was fitted on, as numbers. A
   state is read by the fit nearest in both, marked borrowed on the side that is not its own:
   today the man's fit is of a man against a man, and against any other foe it stands aside
   (`fittedOn`). A fit from one more collection is one more entry beside the others. What has to
   be fitted grows with the bodies worked on.
5. **What a body does here, learned: the action prior.** For a state and each Option on offer, the
   chance a body takes it. It reads an Option by what it is and what its model says (its kind,
   whether it is open, its seconds, what it deals and takes, its price), never by its name, so a
   new skill has a prior the day it is added. It is used four ways: to guide the search (PUCT), to
   predict the foe (3), to narrow a wide body's Options before the search, and to decide alone,
   with no search, for a body that cannot afford one. A fit names its bodies, as the fitted
   value's does, and is read by the same rule.

Whether one fit over several bodies reads a new body better than the nearest body's own fit is
read when a body is added that has neither, not before.

## What is guessed now, and what replaces it

From the audit, checked in the code. Each guess shapes every body's choices, though so far only
the rat's fights have shown it.

| Now | Where | What it does | Replaced by |
| --- | --- | --- | --- |
| The end of a line is not priced | `objective.ts` `fewTermsWorth` never reads `path.end`; `chooser.ts` `cutWorth` | A line cut at the horizon, and every hold or guard, is worth the same ending on its back as on its feet | 4 |
| The fitted value reads only the man | `assets/minds/fitted-value.json` fitted on man against man; `fittedOn` | Every other body, and the man against any other, falls back to the tail's leaf | 1, 4 |
| A second down is priced at the foe's peak | `percepts.ts` `downRateOf` (`Pressure.peak`) | Lying 5 m away costs as much as lying at his feet: 0.075 of the rat's life a second, where its time down in fights cost about 0.004 | 3 |
| The foe stands still in imagined lines, or carries on as he was | `carry` 0 by default, 0.5 s on `option-lean`; `option.ts` | Waiting near a foe who would close looks free, or is priced by where his velocity takes him | 3, 5 |
| The foe's replies are searched only against the same body | `chooser.ts` `repliedSearch` (`bodyOf(focus.spec) !== searched.body`) | Against any other body, replies are never searched | 3, 5: the foe's Options built from his own body, weighted by the prior |
| A walk never falls outside a clinch | `places.ts` `walkTerms` | Walks look safer than strikes, whose falls are measured | 2 |
| The clinch | `value.ts` `CLINCH`: 0.65 m centre to centre, 0.2 falls a second, every body | Holds and walks near the foe fall at one rate, rat or Warrior | 2 |
| Ways up and recoveries not measured | `rise.ts` `WAY_PRIOR` (5 s, 7 in 10), `REGAIN_PRIOR` (9 in 10), `SETTLE_PRIOR` (0.25 s), `BRACED` (1 s) | Getting up is priced by hand for any body without a drill | 2 |
| Blows not measured | `value.ts` record prior (0.3 lands, 0.6 s, weight 3), `BLOW_SPEED` 5 m/s; `percepts.ts` `LANDS` 0.3, `RATE` 1 a second | A foe's limb with no profile is priced by hand | 2 |
| The cover | `cover.ts` `STOPS` 0.6 | A cover keeps off six tenths of any blow | 2 |
| Where a fall leaves the body | `value.ts` `FALLEN` "back" | Every fall is priced as landing on the back | 2 |
| A foe with no turning measured turns at once | `percepts.ts` `turnOf` (Infinity) | Going round a foe is worth nothing | 3, 5 |
| The search weighs every Option evenly | `chooser.ts` `treeSearch`: UCT, no prior | With dozens of Options, 50 runs spread too thin to find the strong line | 5 |
| Stances read by the model's name | `gaitStance`, `carriageOf` (`places.ts`, `back-step.ts`, `percepts.ts`) | A model with no entry gets no stance and no back step | 2, its stance measured like any Option's |
| The rat's own Mind | `option-presses`: best line, aggression 5 | Pushes past the wrong prices for one body | Retired once the rest stands (the owner's word) |

Outside the Mind's prices, the same audit found the trunk opening's aim (`kinds.ts`,
`TRUNK_OPENING`) copied from the Warrior's punch to the sword's thrust. That belongs to the skill
recipe's tuning search, and goes there.

**Not guesses.** The objective's settings are preferences, not predictions: the aggression, the
initiative, the margin, the draw and the reach (`objective.ts`). So are the search's: the horizon
and the runs. They stay as settings a player picks, each default chosen by measuring it.

## What a name, a pairing or a pooled reading still finds

The numbers plan's census, as the code stands. Rules 1 and 2 ask each of these mended.

| What the Mind reads | Found by | Today | What the rules ask |
| --- | --- | --- | --- |
| The foe's pressure (`pressure-profiles.json`, `pressureTable`) | both bodies' numbers, near within a span; a table for each pairing measured, and a pairing near none by the strikes' rate | 3: a man on a man, a man on a rat, a rat on a man | mechanism 3, which needs no table of a pairing |
| A strike's outcomes (`strike-profiles.json`, `profilesFor`, `profileAgainst`) | the striker's model (`Measured.body`), across bodies by stature alone (`acrossBodies`); the struck body by its numbers | 18, one a striker's body, skill and limb | the striker by its numbers as the struck body is, its own trials first |
| The foe's strikes (`profilesOn`) | the foe's model, never across bodies; a foe with none is priced as the reader's own strikes, else by hand | the same asset | a foe with none reads the nearest body's, marked borrowed |
| The back step's sways (`step-profiles.json`, `backStepping`) | the stepping body's model | 1, the man's | by numbers, as a strike's |
| How a body stands in a gait (`GAIT_STANCES`, `gaitStance`, `carriageOf`; the back step's `SWAYS_FROM`) | the gait and the model, typed in source | the man's | measured as any Option's (the table above) |
| The edges a body gets up by (`edge-profiles.json`) | the model | 17: the man's 5 techniques, the woman's and the skeleton's 6 | by numbers, as a strike's |
| A profile's written form (`src/skills/framework/form.ts`) | least squares over all of a profile's trials in a phase, what was held among its terms | the edges' forms fit every loadout's falls at once | read from the rows nearest in the numbers, so rows of one loadout do not move another that has its own (rule 2) |
| The fitted value (`fitted-value.json`) | the names of the body and of its foe (`bodyOf`, `fittedOn`) | 1, the empty-handed man against himself | mechanism 4 |
| A body's default Mind (`DEFAULT_MINDS`, `DEFAULT_BODIES`, `src/app/catalog.ts`) | the model, and the body's name | the empty-handed man `option-lean`, the rat `option-presses`, every other `option-tail` | a body with no entry plays the general Mind; an entry is an exception, gone when that body is read on it (step 12 for the rat) |

What a body holds is already numbers on a trial (the mass held and its reach past the hand,
`Start.held`), and no loadout finds a profile. But no trial crosses a loadout with a skill
measured without it, so a body holding a sword reads its punches' and its stomp's empty-handed
trials, coarse. Of the weapons' own strikes only the bonk with a club has a profile.

Outside the Mind, and one a body, not a pairing: each skill controller's record by model
(`dataOf(...)[model]`) and the mind notes by model.

## The procedure every mechanism follows

One procedure, as a skill has ([the skill recipe](../recipes/skill.md#the-procedure)). Each
step's output is the next step's input. A step that fails goes back to step 1, never on.

1. **Name it.** 2. **Build it as a kind.** 3. **Look at its prices.** 4. **Read it on its
scope.** 5. **Install and confirm.**

### 1. Name it

- **The row it replaces**, from the two tables above, and the numbers that will find it.
- **What one more body, item or skill costs to measure**, as a count.
- **Its scope**: the bodies it will be read on, which is what the work is on. Today that is the
  empty-handed Warrior, and the rat against him where the step is about what the rat showed.
  Nothing is played for another body or loadout unless the work is on it or the owner asks.

### 2. Build it as a kind

- **A kind a person can pick**, by the config path the kinds already there take. What it stands
  in for stays pickable, and leaves the game only on the owner's word.
- **The game unmoved where it is unset**, on every commit that changes what a Mind reads: the
  fingerprint, each case it moves named. Where the empty-handed Warrior is claimed unmoved, his
  mirror is played to the bit as well, saved before and compared after
  (`research/skills/strikes/strike-bouts.mjs --models man --held empty --seconds 120 --save`, at
  the scorecard's 24 gaps, 2.65 to 5.41 m by 0.12, given to `--gaps`; about 80 s). The
  fingerprint alone once missed a move there: its empty-handed cases end before a fall's price
  matters (the approaches).

### 3. Look at its prices

- **Before any bout, fit or collection is run for it.** At a few traced decisions of the body in
  hand, the price of each Option on offer before and after, and where each price came from.
- **The price moves for the reason the row names**, and by about what was measured. One that
  does not goes back to step 1.
- The rat's wait at the edge of reach was found by tracing one bout, after three `gaps` readings
  had not shown why (the rat plan).

### 4. Read it on its scope

- **The Warrior**, where he is in scope: a match of 288 warrior-drawn bouts against the game's
  Mind as it stands (`option-lean`), and his knockouts within 60 s on the scorecard beside it.
- **The rat**, where it is in scope: `gaps` against `option-lean` on the man, 1 HP or more by 60 s
  and killed within 60 s, of 48. Before the work, on the rat's Minds at steadiness 25:
  `option-lean` 34 and 19; `option-lean` at best line and aggression 5, 42 and 22;
  `option-presses` 42 and 24. Where a step has changed the man's own Mind, these are read once
  again against it, and the report says so.
- **The thinking**: the Mind's time per simulated second beside `option-lean`'s 135 ms.
- **A run whose readings already answer it is stopped at once** (the skill recipe).

### 5. Install and confirm

- **It joins the general Mind**, and becomes the default of the bodies it was read on where it
  does not make them worse, as `option-lean` became the empty-handed man's. A body not read
  keeps the Mind it has until it is read or the owner says to move it.
- **The inventory clean on the general Mind for every body**: with the kind set, no body reads
  what this mechanism prices by hand, by a name, or from a table of a pairing. It plays nothing.
- **Shown once on a body with nothing of its own**: one body that has no measurement for this
  mechanism plays a few bouts with the kind set, and must close and throw on readings the
  inventory lists as borrowed. This shows that it fights, not how well, and costs the same
  however many bodies the game has.
- **A headless look at the Arena** with the mind editor open, where a config changes.
- **The report** (rule 5): its scope, its readings with their spreads, the fingerprint's and the
  inventory's comparisons as they print, and each case moved and not read.
- A mechanism that reads flat is still kept if it removes a guess and makes no body in its scope
  worse. That is the goal: the same Mind, priced from measurement.

## What done is

The agent's bar, from the owner's words above; the owner's to change.

1. **Each row of the two tables above**: on the general Mind its mechanism stands in its place,
   under the five rules, or the owner has struck the row by name. A row written down as not
   built is not met. What a row's mechanism stood in for is listed for the owner's word to
   remove.
2. **On the general Mind, the inventory is clean for every body**: nothing read by hand, by a
   name, or from a table that had to be measured for a pairing. Borrowed is allowed, and listed.
3. **Each mechanism was shown once on a body with nothing of its own** (the procedure's step 5).
4. **The bodies read play the general Mind by default.** Every other body is listed with the
   Mind it keeps. Reading them is not a bar of this plan: each is read when the work is on it.
5. **The counts in "What a new thing costs"** hold in the code: a sixth body, a new weapon and a
   new skill each ask what the table says, and nothing of a pairing.
6. **The action prior** is read each way "tried properly" lists, each variant pickable.
7. **The rat fights on the Mind every body uses** (step 12).
8. **The five rules are each held by what refuses** (their "held by"), not by this document.
9. **A step's report** is the procedure's step 5. A step is called done only with it, and only
   of the bodies it was read on.

The plan is deleted when each of 1 to 8 is met or struck by the owner by name. What was found
moves into the approaches; the rules and the procedure move into a recipe, so they bind the work
after this plan is gone.

## The action prior, tried properly

**What was tried before.** PUCT below the root, guided by a prior learned from where searches'
runs went (`7f7b33aff`, `research/minds/move-prior.mjs`): boosted trees over the root's state
and each Option's kind and model, 2.482 nats a root held out against 2.629 for a softmax of the
price. On the man at 50 runs it scored 0.496 against the old game Mind where the same Mind without
it scored 0.646; an even prior read the same, and on the best-line backup PUCT and UCT tied
(0.503). The cause was named: under the mean backup, a state is worth the mean of its lines
weighted by their runs, so PUCT's uneven runs bias that mean toward what the prior likes. It was
removed in the settings' tidy-up (`dca2ce824`).

**What was not tried.** The cause's fix; fewer runs, where a prior earns its keep; a body with
many Options; a prior refitted on the guided search's own runs; the prior at the root; and every
use but PUCT. It was read once, on the one body where a prior can help least, at the one run count
where it is needed least.

**What is tried now, and kept pickable in the game whatever it reads**:

- **The mean weighted by the prior, not by the runs.** A state is worth its lines' worths weighted
  by the prior's chances (as the prior says the body will play), so where the runs go no longer
  moves the mean. With the best-line backup as well.
- **Strength for thinking, not strength at 50 runs.** Each variant at 10, 25 and 50 runs against
  the game's Mind at 50: the point is to play as well for less, so a curve, not one reading.
- **Wide bodies.** The man offered every Option registered that fits him empty-handed, so the
  reading is where scale will be. The body with the most Options the game offers is armed, and
  is read on the owner's word (parked, below).
- **Two targets.** Fitted to where the search's runs went (the search taught by itself, refitted on
  the guided search's runs for two or three rounds), and fitted to what bodies did in the record.
- **The bound.** Exploration 0.5 to 8; an untried Option valued at its prior's chance of its
  parent's worth, at the floor, or at the mean; the prior at the root as well as below it.
- **Its other uses, each read on its own**: the foe predicted by it (step 7), a wide body's Options
  narrowed to those carrying most of its chance before the search, and a body deciding by it alone,
  its strength and its thinking against `option-lean`'s.

A variant that reads flat stays pickable, its reading in its note. It leaves the game only on the
owner's word.

## Steps

Each names its scope and follows the procedure. A step measures nothing outside its scope.

1. **The inventory, and what holds rules 1 and 3.** The registry of numbers set by hand, each
   read through it; a reading's source in its type, of the body and of the foe; each asset
   naming what it was measured from (the body, the skill, the Mind that played), compared when
   the inventory runs; the script, its check, and its first listing for the five bodies. It
   plays nothing. The baselines are those in the procedure's step 4, read before this plan.
2. **The fight record and the measuring command, which holds rules 2 and 4.** One row format
   that each fit and profile reads: the decision states `fitted-value.mjs` keeps, with every
   Option on offer and its model (as `move-prior.mjs` keeps them), the share of the search's
   runs each took, the Option run, what followed, and where the foe went. The measuring command
   is given what is in hand, plays that, adds its rows and fits that body's entries, and refuses
   as rules 2 and 4 say. Scope: the empty-handed Warrior's mirror. Its first rows are a new
   collection, its price said from its first chunk: the fitted value's 1044 bouts are in
   `research/runs/`, outside Git and not on every machine, and were not `option-lean`'s.
3. **The end of every line priced** (mechanism 4): the fitted value read at cut lines and open
   Options, through the fitted leaf the man already uses. Scope: the empty-handed Warrior.
4. **The fitted value by the nearest-fit rule** (mechanism 4), as a kind beside `fittedOn`'s
   standing aside: a fit naming its bodies and foes, a state read by the nearest. With it set,
   the Warrior against the rat reads his mirror's fit, marked borrowed, where he read the tail's
   leaf. Then a fit from the rat's bouts against the Warrior, both sides' decisions in it, its
   cost said first against the man's 1044 bouts. Scope: the rat against the Warrior; the
   Warrior's mirror shown unmoved.
5. **The action prior** (mechanism 5): fitted on the record, both targets; read in the game as an
   asset, as the fitted value is. Its held-out nats against the price's softmax, by how many
   Options were on offer. Scope: the empty-handed Warrior's record, step 2's.
6. **PUCT with the prior**, tried as the section above says: the prior-weighted mean first, then
   the run counts, the wide body, the refits on its own runs and the bound. Each variant
   pickable. Kept as a body's search if it plays as well for less thinking, or better. Scope: the
   empty-handed Warrior, and him offered every Option that fits him.
7. **Where the foe goes** (mechanism 3): the foe's Options built from his own body and weighted by
   the prior, read along every line where `carry` and the same-body reply search are read now;
   the direct placement fit beside it; the foe's turning from the same where nothing else
   measured it. Scope: the rat against the Warrior. It may read flat on the Warrior's mirror
   (below), which is read only before it becomes his default.
8. **What the foe deals** (mechanism 3): his strikes' measured outcomes on the struck body's
   numbers, weighted by the prior, standing or lying, where the pressure tables, `Pressure.peak`
   for a second down, and the rate are read now. Read first against the three tables there are,
   on the pairings they measured, with nothing new played. The tables stay pickable
   (`pressure: "measured"`). Scope: the rat against the Warrior, then the Warrior's mirror before
   it becomes his default.
9. **What each Option does** (mechanism 2), one kind at a time, each its own commit and its own
   scope: the walks' falls and the clinch together (where `CLINCH` and the walk's no-fall are
   read now); then the ways up, the regain, the settle and the brace; then the cover; then where
   a fall leaves the body; then the unmeasured blows; then the stances.
10. **The prior's other uses at scale**: a wide body's Options narrowed by the prior before the
    search, and a body deciding by the prior alone, each read for strength and thinking. Scope:
    the empty-handed Warrior offered every Option that fits him. A Crypt room of many is armed
    bodies, read on the owner's word (parked, below).
11. **What a name or a pooled reading still finds** (its table above): the striker's side, the
    foe's strikes across bodies, the sways and the edges found by numbers, and the written form
    read from the rows nearest in the numbers. This is code, and it plays nothing new; the
    struck body held out is read again over the assets' trials
    (`research/skills/strikes/struck-held-out.mjs`), which plays nothing either. Scope: the
    empty-handed Warrior, read where the form's change moves him.
12. **The rat on the general Mind.** The general Mind on the rat, against `option-presses`, by
    the rat's reading. If it is as good, the rat's default becomes the general Mind, and retiring
    `option-presses` waits on the owner's word.

## Parked by the owner

Measured when the work is on them, on the owner's word, and not before (the goal). Rules 1 to 3
hold for them meanwhile: they fight on what they borrow, and the inventory lists it.

- **Trials that cross what is held.** The design kept from the numbers plan: a sparring rung of
  its own, `sparring-held`, as `sparring-stances` draws stances, a Warrior on a Warrior, each
  side's loadout taken by turns from the game's (empty; a sword; a club; a buckler and a sword),
  the limbs that hold nothing striking, its price said from its first chunk. A cover's own
  number (its face's size) only where the buckler's trials read apart from what mass and reach
  say.
- **Those trials read held out**: the held trials taken away and priced from the empty-handed,
  against their own; then by bouts, a Warrior holding a sword against one holding a sword.
- **A match set that is not the empty-handed Warrior alone**, bodies and the club crossed. It
  does not exist, and is this plan's to make when it is unparked.
- **The 13 fingerprint cases where a body holds an item** (the arenas' sword and club bouts,
  the reptile against a sword, both Crypt fights), moved by `93f128cab` on no bout's reading.
  They stay unread.
- **The sword thrust's and the club blow's profiles.**
- **The back step's sways and the gait stances on bodies other than the man.**
- **The body with the most Options the game offers, and a Crypt room of many**, for the action
  prior's readings.

**Not a bar of every fit.** The numbers plan's bar 4 read each body by leaving it out. Over the
trials in the assets it was read once and not met (the approaches), and it is read again when a
body's trials are added (step 11); by bouts it was parked with what is held. A reading of every
body left out in turn was put to the owner as the bar for every fit on 2026-11-25 and refused
(the goal: "there is no single type of measurement that holds up in general").

## What is known before it starts

- **Borrowed readings are coarse.** Held out over the trials in the assets, a struck body read as
  the nearest measured body lost much of what its own trials give (landed: squared error 0.313
  against 0.170). Pooling the others with the body's numbers among the terms read little better
  (0.278). Three measured bodies do not price a fourth
  ([the approaches](../approaches.md#minds)).
- **A reading merged across loadouts moves a body that had its own.** The edges of every loadout
  read together moved the empty-handed mirror in 5 of 24 bouts, and the fingerprint did not show
  it. Its mend, a loadout's own trials first, was deleted in a cleanup, and the written form
  fits every loadout's falls at once again (the approaches). Hence rule 2, its row above, and
  the mirror played to the bit.
- **Modelling the foe changed nothing between two Warriors.** A searched reply, the foe carried on
  for half a second, and a learned model of the foe's strike onset each scored 0.47 to 0.50
  against the game's Mind (`3a7341cb5`, `42690292f`; the approaches' Minds). Between two bodies
  of the same reach, waiting at the edge of reach is about as safe for both, so pricing it better
  moves little. The rat's reach is far shorter than his.
- **The fitted value took 1044 bouts and 623767 states of the man** (fit at `33be0e76f`). A fit
  for another body must reach figures like the man's for far fewer bouts, or its cost is put to
  the owner before it is paid.
- **Measured today**: 18 strike profiles, by body, skill and limb; 3 pressure tables, one a
  pairing; 17 edge profiles; the man's back-step sways; the fitted value, the empty-handed man's.
- **The rat's time down, measured**: up 0.997 of its time at steadiness 25, its downs in fights
  costing about 0.004 of its life a second (the rat plan).
